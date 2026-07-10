/**
 * Filesystem storage layer for layouts
 * Uses folder-per-layout structure: {DATA_DIR}/{Name}-{UUID}/{name}.rackula.yaml
 */
import {
  readdir,
  readFile,
  writeFile,
  stat,
  mkdir,
  open,
  rm,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import * as yaml from "js-yaml";
import { countLayoutsInDir, countAssetsInDir } from "./quota";
import {
  LayoutFileSchema,
  isUuid,
  extractUuidFromFolderName,
  buildFolderName,
  buildYamlFilename,
  slugify,
  type LayoutListItem,
} from "../schemas/layout";
import { logger } from "../logger";
import {
  ensureDataDir,
  findFolderByUuid,
  findYamlInFolder,
  getDataDir,
  isSafeLegacySlug,
} from "./filesystem-paths";
import { PRE_CARRIER_BACKUP_FILENAME, writeSnapshot } from "./snapshots";

export { ensureDataDir, findFolderByUuid } from "./filesystem-paths";
export {
  PRE_CARRIER_BACKUP_FILENAME,
  getPreCarrierBackup,
  getSnapshot,
  listSnapshots,
  saveSnapshot,
  type SnapshotListItem,
} from "./snapshots";

/**
 * Per-layout in-process write locks, keyed by layout uuid.
 *
 * The API is a single-process Bun container, so a chained promise per uuid
 * fully serializes the snapshot-check-through-write critical section for the
 * same layout while leaving different layouts concurrent. This closes the
 * TOCTOU window where a concurrent write landing between the snapshot stat
 * and the overwrite would be lost without being snapshotted.
 */
const layoutWriteLocks = new Map<string, Promise<void>>();

async function withLayoutLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = layoutWriteLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(() => next);
  layoutWriteLocks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    // Drop the entry once this link is the tail of the chain, so the map
    // does not grow unbounded across distinct layouts over the process life.
    if (layoutWriteLocks.get(key) === chained) {
      layoutWriteLocks.delete(key);
    }
  }
}

/**
 * Count devices across all racks in a layout
 */
function countDevices(racks: Array<{ devices?: unknown[] }>): number {
  return racks.reduce((sum, rack) => sum + (rack.devices?.length ?? 0), 0);
}

/**
 * Read a legacy flat YAML file (old format: {name}.yaml directly in DATA_DIR)
 * Returns LayoutListItem with slug as ID (will become UUID on save)
 */
async function readLegacyLayout(
  filename: string,
): Promise<LayoutListItem | null> {
  const filepath = join(getDataDir(), filename);
  try {
    const content = await readFile(filepath, "utf-8");
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as unknown;
    const metadata = LayoutFileSchema.safeParse(parsed);
    const stats = await stat(filepath);

    // Generate slug from filename (strip extension)
    const slug = filename.replace(/\.ya?ml$/i, "");

    if (metadata.success) {
      return {
        // Use slug as ID for legacy layouts (will become UUID on save)
        id: slug,
        name: metadata.data.name,
        version: metadata.data.version,
        updatedAt: stats.mtime.toISOString(),
        rackCount: metadata.data.racks?.length ?? 0,
        deviceCount: countDevices(metadata.data.racks ?? []),
        valid: true,
      };
    } else {
      return {
        id: slug,
        name: slug,
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      };
    }
  } catch (e) {
    const slug = filename.replace(/\.ya?ml$/i, "");
    const stats = await stat(filepath).catch(() => ({ mtime: new Date() }));
    logger.warn({ err: e }, `Failed to read legacy layout: ${filename}`);
    return {
      id: slug,
      name: slug,
      version: "unknown",
      updatedAt: stats.mtime.toISOString(),
      rackCount: 0,
      deviceCount: 0,
      valid: false,
    };
  }
}

/**
 * Read a layout from a folder structure
 */
async function readLayoutFromFolder(
  folderName: string,
  yamlFilenameFromList?: string,
): Promise<LayoutListItem | null> {
  const folderPath = join(getDataDir(), folderName);
  const uuid = extractUuidFromFolderName(folderName);
  if (!uuid) return null;

  const yamlFilename =
    yamlFilenameFromList ?? (await findYamlInFolder(folderPath));
  if (!yamlFilename) return null;

  const yamlPath = join(folderPath, yamlFilename);

  try {
    const content = await readFile(yamlPath, "utf-8");
    // Use JSON_SCHEMA to prevent JavaScript tag execution (security)
    const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as unknown;
    const metadata = LayoutFileSchema.safeParse(parsed);
    const stats = await stat(yamlPath);

    if (metadata.success) {
      const racks = metadata.data.racks ?? [];
      return {
        id: uuid,
        name: metadata.data.name,
        version: metadata.data.version,
        updatedAt: stats.mtime.toISOString(),
        rackCount: racks.length,
        deviceCount: countDevices(racks),
        valid: true,
      };
    } else {
      // Invalid YAML structure - include with error flag
      return {
        id: uuid,
        name: folderName.replace(`-${uuid}`, ""), // Extract human name from folder
        version: "unknown",
        updatedAt: stats.mtime.toISOString(),
        rackCount: 0,
        deviceCount: 0,
        valid: false,
      };
    }
  } catch (e) {
    // File read/parse error - include with error flag
    const stats = await stat(folderPath).catch(() => ({ mtime: new Date() }));
    logger.warn({ err: e }, `Failed to read layout from folder: ${folderName}`);
    return {
      id: uuid,
      name: folderName.replace(`-${uuid}`, ""),
      version: "unknown",
      updatedAt: stats.mtime.toISOString(),
      rackCount: 0,
      deviceCount: 0,
      valid: false,
    };
  }
}

/**
 * List all layouts in the data directory
 * Scans for folder-per-layout structure (folders ending with UUID)
 * Also includes legacy flat YAML files for backwards compatibility
 * Returns invalid files with valid: false so UI can show error badge
 */
export async function listLayouts(): Promise<LayoutListItem[]> {
  await ensureDataDir();

  const dataDir = getDataDir();
  const entries = await readdir(dataDir, { withFileTypes: true });
  const layouts: LayoutListItem[] = [];
  const migratedLegacySlugs = new Set<string>();

  // Scan for folders with UUID suffix (new folder-per-layout format)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const uuid = extractUuidFromFolderName(entry.name);
      if (uuid) {
        const folderPath = join(dataDir, entry.name);
        const yamlFilename = await findYamlInFolder(folderPath);
        if (yamlFilename) {
          migratedLegacySlugs.add(
            yamlFilename.replace(/\.rackula\.yaml$/i, ""),
          );
        }

        const layout = await readLayoutFromFolder(
          entry.name,
          yamlFilename ?? undefined,
        );
        if (layout) {
          layouts.push(layout);
        }
      }
    }
  }

  // Also scan for old flat .yaml/.yml files (backwards compatibility)
  for (const entry of entries) {
    if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
      const legacySlug = entry.name.replace(/\.ya?ml$/i, "");
      if (migratedLegacySlugs.has(legacySlug)) {
        continue;
      }

      const layout = await readLegacyLayout(entry.name);
      if (layout) {
        layouts.push(layout);
      }
    }
  }

  // Sort by most recently updated
  return layouts.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

/**
 * Check if a layout with the given UUID exists
 */
export async function layoutExists(uuid: string): Promise<boolean> {
  const folder = await findFolderByUuid(uuid);
  return folder !== null;
}

/**
 * Get a single layout by UUID or legacy slug
 * Returns the YAML content and its updatedAt (file mtime, ISO 8601),
 * or null if not found
 */
export async function getLayout(
  id: string,
): Promise<{ content: string; updatedAt: string } | null> {
  // First try UUID lookup (new format)
  if (isUuid(id)) {
    const folder = await findFolderByUuid(id);
    if (folder) {
      const yamlFilename = await findYamlInFolder(folder);
      if (yamlFilename) {
        try {
          const yamlPath = join(folder, yamlFilename);
          const handle = await open(yamlPath, "r");
          try {
            // Stat before read on the same descriptor: a write landing
            // between the two leaves the content newer than the reported
            // updatedAt, so the next echoed PUT mismatches and snapshots
            // instead of silently masking the concurrent write.
            const stats = await handle.stat();
            const content = await handle.readFile("utf-8");
            return { content, updatedAt: stats.mtime.toISOString() };
          } finally {
            await handle.close();
          }
        } catch {
          return null;
        }
      }
    }
  }

  // Fallback: try reading legacy flat file by slug
  // Validate slug to prevent path traversal (no slashes, dots, etc.)
  if (!isSafeLegacySlug(id)) {
    return null;
  }

  const dataDir = getDataDir();
  const legacyPaths = [join(dataDir, `${id}.yaml`), join(dataDir, `${id}.yml`)];

  for (const path of legacyPaths) {
    try {
      const content = await readFile(path, "utf-8");
      const stats = await stat(path);
      return { content, updatedAt: stats.mtime.toISOString() };
    } catch {
      // Continue to next
    }
  }

  return null;
}

/**
 * Migrate a legacy flat YAML file to the new folder-per-layout structure
 * Moves {slug}.yaml to {Name}-{UUID}/{name}.rackula.yaml
 */
async function migrateLegacyLayout(
  oldSlug: string,
  yamlContent: string,
): Promise<{ id: string; isNew: boolean; updatedAt: string }> {
  if (!isSafeLegacySlug(oldSlug)) {
    throw new Error("Invalid legacy layout id");
  }

  const dataDir = getDataDir();
  // Parse YAML
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : e}`, {
      cause: e,
    });
  }

  const layout = LayoutFileSchema.safeParse(parsed);
  if (!layout.success) {
    const issues = layout.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    // Same prefix as the non-migration save path so the route maps both to 400.
    throw new Error(`Invalid layout metadata: ${issues}`);
  }

  // Generate UUID (use metadata.id if valid, else generate new)
  const metadataId = layout.data.metadata?.id;
  const uuid =
    metadataId && isUuid(metadataId) ? metadataId : crypto.randomUUID();

  const layoutName = layout.data.metadata?.name ?? layout.data.name;
  const folderName = buildFolderName(layoutName, uuid);
  const folderPath = join(dataDir, folderName);
  const yamlFilename = buildYamlFilename(layoutName);
  const oldAssetsDir = join(dataDir, "assets", oldSlug);
  const newAssetsDir = join(folderPath, "assets");
  let assetsMoved = false;

  try {
    // Create new folder
    await mkdir(folderPath, { recursive: true });

    // Write YAML to new location
    const yamlPath = join(folderPath, yamlFilename);
    await writeFile(yamlPath, yamlContent, "utf-8");
    const stats = await stat(yamlPath);

    // Move assets if they exist in old location
    try {
      await stat(oldAssetsDir);
      await rename(oldAssetsDir, newAssetsDir);
      assetsMoved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      // No old assets, that's fine
    }

    // Delete old flat file(s)
    for (const ext of [".yaml", ".yml"]) {
      try {
        await rm(join(dataDir, `${oldSlug}${ext}`));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        // File doesn't exist, that's fine
      }
    }

    return { id: uuid, isNew: false, updatedAt: stats.mtime.toISOString() };
  } catch (error) {
    if (assetsMoved) {
      try {
        await mkdir(join(dataDir, "assets"), { recursive: true });
        await rename(newAssetsDir, oldAssetsDir);
      } catch (restoreError) {
        logger.warn(
          { err: restoreError },
          `Failed to restore legacy assets for ${oldSlug}`,
        );
      }
    }

    // Rollback: remove new folder
    try {
      await rm(folderPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
    throw error;
  }
}

/**
 * Check if a legacy flat YAML file exists for the given slug
 */
async function legacyLayoutExists(slug: string): Promise<boolean> {
  if (!isSafeLegacySlug(slug)) {
    return false;
  }

  const dataDir = getDataDir();
  for (const ext of [".yaml", ".yml"]) {
    try {
      await stat(join(dataDir, `${slug}${ext}`));
      return true;
    } catch {
      // Continue
    }
  }
  return false;
}

/**
 * Save a layout (create or update)
 * Creates folder structure: /data/{Name}-{UUID}/{name}.rackula.yaml
 * Also handles migration from legacy flat YAML format
 *
 * When `echoedUpdatedAt` (the updatedAt the client last received from the
 * server) differs from the stored copy's current updatedAt, the existing
 * YAML is copied into the layout's snapshots folder before the write.
 * Last write wins; the save is never rejected.
 *
 * When `options.preCarrierMigration` is set and the layout already exists, the
 * current on-disk YAML is also copied once to a durable pre-carrier-migration
 * backup ({@link PRE_CARRIER_BACKUP_FILENAME}) before the overwrite. The backup
 * is written with exclusive create, so a later migrating save never clobbers
 * it (idempotent), and it lives outside snapshots/ so it is never pruned.
 *
 * Returns the layout UUID, whether it was a new layout, and the stored
 * file's updatedAt (mtime, ISO 8601) for clients to echo on the next save
 */
export async function saveLayout(
  yamlContent: string,
  existingId?: string,
  echoedUpdatedAt?: string,
  options?: { preCarrierMigration?: boolean },
): Promise<{ id: string; isNew: boolean; updatedAt: string }> {
  await ensureDataDir();

  const existingUuid =
    existingId && isUuid(existingId) ? existingId : undefined;
  const legacySlug =
    existingId && !existingUuid && isSafeLegacySlug(existingId)
      ? existingId
      : undefined;
  const isLegacyMigration = legacySlug
    ? await legacyLayoutExists(legacySlug)
    : false;

  if (isLegacyMigration && legacySlug) {
    return await migrateLegacyLayout(legacySlug, yamlContent);
  }

  // Parse YAML content with error handling
  // Use JSON_SCHEMA to prevent JavaScript tag execution (security)
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid YAML: ${message}`, { cause: e });
  }

  // Validate layout schema
  const layout = LayoutFileSchema.safeParse(parsed);
  if (!layout.success) {
    const issues = layout.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid layout metadata: ${issues}`);
  }

  // Determine UUID: prefer existingId (from URL) > validated metadata.id > generate new.
  // The URL uuid is authoritative; metadata.id is used only for new layouts
  // where no URL uuid is available yet.
  const metadataId = layout.data.metadata?.id;
  const validMetadataId = metadataId && isUuid(metadataId) ? metadataId : null;
  const uuid = existingUuid ?? validMetadataId ?? crypto.randomUUID();
  const layoutName = layout.data.metadata?.name ?? layout.data.name;

  const folderName = buildFolderName(layoutName, uuid);
  const yamlFilename = buildYamlFilename(layoutName);
  const folderPath = join(getDataDir(), folderName);

  // Serialize the snapshot-check-through-write critical section per layout.
  // The existing-folder lookup, snapshot decision, optional rename, and the
  // overwrite all run under one lock so a concurrent write to the same layout
  // cannot land between the snapshot stat and the overwrite (TOCTOU).
  //
  // UUIDs are matched case-insensitively (isUuid and findFolderByUuid both
  // accept any casing), so the lock key is lowercased. Without this, two
  // concurrent PUTs for the same logical layout but different UUID casing
  // (e.g. "550E8400-..." vs "550e8400-...") would acquire distinct mutex
  // entries and run concurrently, reopening the snapshot TOCTOU.
  return await withLayoutLock(uuid.toLowerCase(), async () => {
    // Check if this is a new layout
    const existingFolder = await findFolderByUuid(uuid);
    let isNew = existingFolder === null;

    // mtime of the copy this save overwrites. updatedAt is derived from the
    // file mtime, but mtime resolution is coarse (often 1ms), so two writes
    // can land on the same tick. The new write must report an mtime strictly
    // greater than the copy it replaces; otherwise the next echoed updatedAt
    // (the overwritten copy's mtime) could equal the now-stored copy's mtime,
    // making the divergence check below read the two copies as identical and
    // overwrite a diverged copy without snapshotting it.
    let overwrittenMtimeMs: number | undefined;

    // Pre-overwrite snapshot: when the client's echoed updatedAt does not
    // match the stored copy, the copies diverged. Capture the stored YAML
    // before overwriting it.
    if (existingFolder) {
      const existingYamlFilename = await findYamlInFolder(existingFolder);
      if (existingYamlFilename) {
        const existingYamlPath = join(existingFolder, existingYamlFilename);
        // A concurrent delete between the listing and this open leaves no copy
        // to snapshot or to outrank, so a missing file degrades to "no prior
        // copy" rather than failing the save.
        let handle;
        try {
          handle = await open(existingYamlPath, "r");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
          }
          handle = undefined;
        }
        if (handle) {
          try {
            const existingStats = await handle.stat();
            overwrittenMtimeMs = existingStats.mtime.getTime();
            const diverged =
              echoedUpdatedAt !== undefined &&
              existingStats.mtime.toISOString() !== echoedUpdatedAt;
            // Read the prior bytes once when either the rolling snapshot
            // (echo divergence) or the durable pre-carrier backup needs them.
            let existingContent: string | undefined;
            if (diverged || options?.preCarrierMigration) {
              existingContent = await handle.readFile("utf-8");
            }
            if (diverged && existingContent !== undefined) {
              await writeSnapshot(existingFolder, existingContent);
            }
            // Durable one-time pre-carrier-migration backup. Runs against the
            // pre-rename folder (existingFolder), with exclusive create so a
            // second migrating save never clobbers the original backup; an
            // EEXIST is the idempotent no-op for "already backed up".
            if (options?.preCarrierMigration && existingContent !== undefined) {
              try {
                await writeFile(
                  join(existingFolder, PRE_CARRIER_BACKUP_FILENAME),
                  existingContent,
                  { encoding: "utf-8", flag: "wx" },
                );
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
                  throw error;
                }
              }
            }
          } finally {
            await handle.close();
          }
        }
      }
    }

    // Handle rename: if the folder name changed (name change), rename the folder
    if (existingFolder && existingFolder !== folderPath) {
      // Handle concurrent folder changes gracefully.
      try {
        await rename(existingFolder, folderPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
        isNew = true;
      }

      // Delete old yaml file if it has a different name
      const oldYamlFilename = await findYamlInFolder(folderPath).catch(
        () => null,
      );
      if (oldYamlFilename && oldYamlFilename !== yamlFilename) {
        try {
          await rm(join(folderPath, oldYamlFilename));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            logger.warn(
              { err: error },
              `Failed to delete stale YAML file "${oldYamlFilename}" in "${folderPath}"`,
            );
          }
        }
      }
    }

    // Create folder if it doesn't exist
    await mkdir(folderPath, { recursive: true });

    // Write the YAML file. Stat the same descriptor so the returned
    // updatedAt belongs to this write, not to a concurrent writer's file.
    const yamlPath = join(folderPath, yamlFilename);
    const handle = await open(yamlPath, "w");
    try {
      await handle.writeFile(yamlContent, "utf-8");
      let stats = await handle.stat();
      let mtime = stats.mtime;
      // Guarantee a strictly newer mtime than the copy this write replaced, so
      // updatedAt is monotonic per layout even when the filesystem clock has
      // not advanced since the previous write. This keeps the echoed-updatedAt
      // divergence check honest under coarse mtime resolution. Only mtime is
      // bumped; atime is preserved since storage never reads it.
      if (
        overwrittenMtimeMs !== undefined &&
        mtime.getTime() <= overwrittenMtimeMs
      ) {
        const bumped = new Date(overwrittenMtimeMs + 1);
        await handle.utimes(stats.atime, bumped);
        stats = await handle.stat();
        mtime = stats.mtime;
      }
      return { id: uuid, isNew, updatedAt: mtime.toISOString() };
    } finally {
      await handle.close();
    }
  });
}

/**
 * Delete a layout by UUID
 * Removes the entire folder including assets
 */
export async function deleteLayout(uuid: string): Promise<boolean> {
  // Validate UUID to prevent path traversal attacks
  if (!isUuid(uuid)) {
    return false;
  }

  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return false;
  }

  try {
    await rm(folder, { recursive: true });
    return true;
  } catch (error) {
    // Ignore ENOENT (folder doesn't exist), rethrow other errors
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    return false;
  }
}

/**
 * Get assets directory path for a layout by UUID
 * Returns the path to the assets folder inside the layout folder
 * Returns null if the layout folder doesn't exist
 */
export async function getLayoutAssetsDir(uuid: string): Promise<string | null> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return null;
  }
  return join(folder, "assets");
}

/**
 * Count stored layouts for the layout-count quota (#2625).
 * Delegates to the shared counter so the count rule lives in one place.
 */
export async function countLayouts(): Promise<number> {
  return countLayoutsInDir(getDataDir());
}

/**
 * Count image assets stored for a layout for the per-layout asset quota (#2625).
 * A missing layout counts as zero.
 */
export async function countAssets(uuid: string): Promise<number> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) {
    return 0;
  }
  return countAssetsInDir(folder);
}

// Re-export slugify from schemas for backwards compatibility
export { slugify };
