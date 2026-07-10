/** Shared filesystem path validation and discovery helpers. */

import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { extractUuidFromFolderName, isUuid } from "../schemas/layout";

export function getDataDir(): string {
  return process.env.DATA_DIR ?? "./data";
}

export function isSafeLegacySlug(id: string): boolean {
  if (!id || id.includes("/") || id.includes("\\") || id.includes(".")) {
    return false;
  }

  for (let index = 0; index < id.length; index += 1) {
    const code = id.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return false;
  }

  return true;
}

/** Ensure the configured data directory exists. */
export async function ensureDataDir(): Promise<void> {
  await mkdir(getDataDir(), { recursive: true });
}

/** Find a folder whose suffix is the requested layout UUID. */
export async function findFolderByUuid(
  uuid: string,
  customDataDir?: string,
): Promise<string | null> {
  if (!isUuid(uuid)) return null;

  const dataDir = customDataDir ?? getDataDir();
  await mkdir(dataDir, { recursive: true });
  const entries = await readdir(dataDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const extractedUuid = extractUuidFromFolderName(entry.name);
    if (extractedUuid?.toLowerCase() === uuid.toLowerCase()) {
      return join(dataDir, entry.name);
    }
  }
  return null;
}

/** Find the Rackula YAML filename inside a layout folder. */
export async function findYamlInFolder(
  folderPath: string,
): Promise<string | null> {
  const files = await readdir(folderPath);
  return files.find((file) => file.endsWith(".rackula.yaml")) ?? null;
}
