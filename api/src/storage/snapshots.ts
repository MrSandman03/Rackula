/** Filesystem snapshot and durable migration-backup operations. */

import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { SNAPSHOT_NAME_PATTERN } from "./snapshot-name";
import { findFolderByUuid, findYamlInFolder } from "./filesystem-paths";

const SNAPSHOTS_DIR = "snapshots";
const MAX_SNAPSHOTS_PER_LAYOUT = 5;

/** Durable one-time backup stored outside the pruned snapshots directory. */
export const PRE_CARRIER_BACKUP_FILENAME = "pre-carrier-backup.yaml";

/** Snapshot entry returned by {@link listSnapshots}. */
export interface SnapshotListItem {
  filename: string;
  timestamp: string;
  size: number;
}

function formatSnapshotTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

// eslint-disable-next-line no-control-regex -- intentionally matching controls
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;

function compareSnapshotNamesDesc(a: string, b: string): number {
  const matchA = SNAPSHOT_NAME_PATTERN.exec(a);
  const matchB = SNAPSHOT_NAME_PATTERN.exec(b);
  if (!matchA || !matchB) return b.localeCompare(a);

  const [, timestampA = "", suffixA] = matchA;
  const [, timestampB = "", suffixB] = matchB;
  return (
    timestampB.localeCompare(timestampA) ||
    Number(suffixB ?? 0) - Number(suffixA ?? 0)
  );
}

async function pruneSnapshots(snapshotsDir: string): Promise<void> {
  const entries = await readdir(snapshotsDir, { withFileTypes: true });
  const files: Array<{ name: string; mtimeMs: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const stats = await stat(join(snapshotsDir, entry.name));
    files.push({ name: entry.name, mtimeMs: stats.mtimeMs });
  }

  files.sort(
    (a, b) => b.mtimeMs - a.mtimeMs || compareSnapshotNamesDesc(a.name, b.name),
  );
  for (const file of files.slice(MAX_SNAPSHOTS_PER_LAYOUT)) {
    await rm(join(snapshotsDir, file.name), { force: true });
  }
}

/** Write and prune a snapshot for a known layout folder. */
export async function writeSnapshot(
  folderPath: string,
  yamlContent: string,
): Promise<string> {
  const yamlFilename = await findYamlInFolder(folderPath);
  const baseName = yamlFilename
    ? yamlFilename.replace(/\.rackula\.yaml$/i, "")
    : "untitled";
  const snapshotsDir = join(folderPath, SNAPSHOTS_DIR);
  await mkdir(snapshotsDir, { recursive: true });

  const timestamp = formatSnapshotTimestamp(new Date());
  let filename = `${baseName}~${timestamp}.yaml`;
  let suffix = 1;
  for (;;) {
    try {
      await writeFile(join(snapshotsDir, filename), yamlContent, {
        encoding: "utf-8",
        flag: "wx",
      });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      filename = `${baseName}~${timestamp}-${suffix}.yaml`;
      suffix += 1;
    }
  }

  await pruneSnapshots(snapshotsDir);
  return filename;
}

export async function listSnapshots(
  uuid: string,
): Promise<SnapshotListItem[] | null> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) return null;

  const snapshotsDir = join(folder, SNAPSHOTS_DIR);
  let entries;
  try {
    entries = await readdir(snapshotsDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const snapshots: SnapshotListItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const stats = await stat(join(snapshotsDir, entry.name));
    snapshots.push({
      filename: entry.name,
      timestamp: stats.mtime.toISOString(),
      size: stats.size,
    });
  }
  return snapshots.sort(
    (a, b) =>
      b.timestamp.localeCompare(a.timestamp) ||
      compareSnapshotNamesDesc(a.filename, b.filename),
  );
}

function isSafeSnapshotFilename(filename: string): boolean {
  return (
    !filename.includes("/") &&
    !filename.includes("\\") &&
    !CONTROL_CHAR_PATTERN.test(filename) &&
    SNAPSHOT_NAME_PATTERN.test(filename)
  );
}

export async function getSnapshot(
  uuid: string,
  filename: string,
): Promise<string | null> {
  if (!isSafeSnapshotFilename(filename)) return null;
  const folder = await findFolderByUuid(uuid);
  if (!folder) return null;

  try {
    return await readFile(join(folder, SNAPSHOTS_DIR, filename), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getPreCarrierBackup(
  uuid: string,
): Promise<string | null> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) return null;

  try {
    return await readFile(join(folder, PRE_CARRIER_BACKUP_FILENAME), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveSnapshot(
  uuid: string,
  yamlContent: string,
): Promise<{ filename: string } | null> {
  const folder = await findFolderByUuid(uuid);
  if (!folder) return null;
  return { filename: await writeSnapshot(folder, yamlContent) };
}
