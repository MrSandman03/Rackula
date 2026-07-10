#!/usr/bin/env npx tsx
/**
 * Bundled Images Generator Script
 *
 * Scans processed device images and generates a public manifest facade plus
 * per-vendor modules that stay below the repository line limit.
 *
 * Usage: npm run generate-bundled-images
 */

import { mkdir, readdir, rm, writeFile } from "fs/promises";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { format } from "prettier";
import estreePlugin from "prettier/plugins/estree";
import typescriptPlugin from "prettier/plugins/typescript";
import {
  parseImagePath,
  generateImportName,
  generateImportStatement,
  generateManifestEntry,
  groupImagesBySlug,
  type GroupedImages,
  type ParsedImage,
} from "../src/lib/utils/generate-bundled-images";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..");
const DATA_DIR = join(REPO_ROOT, "src", "lib", "data");
const MAX_GENERATED_FILE_LINES = 1000;

// Generic starter-library buckets are maintained in the facade template below.
const GENERIC_LIBRARY_DIR = "_generic";

type GroupedImage = GroupedImages[string];
type VendorEntries = Map<string, Array<[string, GroupedImage]>>;

export interface BundledImageGeneratorPaths {
  repoRoot: string;
  imagesDir: string;
  outputFile: string;
  generatedDir: string;
}

export interface BundledImageGeneratorOptions {
  paths?: BundledImageGeneratorPaths;
  maxGeneratedFileLines?: number;
  log?: (message?: string) => void;
}

export interface BundledImageGeneratorResult {
  imageFileCount: number;
  parsedImageCount: number;
  deviceCount: number;
  vendorCount: number;
}

export const DEFAULT_BUNDLED_IMAGE_GENERATOR_PATHS: BundledImageGeneratorPaths =
  {
    repoRoot: REPO_ROOT,
    imagesDir: join(REPO_ROOT, "src", "lib", "assets", "device-images"),
    outputFile: join(DATA_DIR, "bundledImages.ts"),
    generatedDir: join(DATA_DIR, "bundledImages.generated"),
  };

async function getImageFiles(
  dir: string,
  basePath: string = "",
): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (!basePath && entry.name === GENERIC_LIBRARY_DIR) {
          continue;
        }
        files.push(...(await getImageFiles(fullPath, relativePath)));
      } else if (entry.isFile() && entry.name.endsWith(".webp")) {
        files.push(relativePath);
      }
    }
  } catch {
    // A missing image directory produces an empty generated manifest.
  }

  return files;
}

function getVendorExportName(vendor: string): string {
  const parts = vendor.split("-");
  return (
    parts[0] +
    parts
      .slice(1)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") +
    "BundledImages"
  );
}

function groupEntriesByVendor(groupedImages: GroupedImages): VendorEntries {
  const entries = Object.entries(groupedImages).sort(
    ([slugA, imageA], [slugB, imageB]) =>
      imageA.vendor.localeCompare(imageB.vendor) || slugA.localeCompare(slugB),
  );
  const byVendor: VendorEntries = new Map();

  for (const [slug, image] of entries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(image.vendor)) {
      throw new Error(`Unsupported vendor directory name: ${image.vendor}`);
    }
    const vendorEntries = byVendor.get(image.vendor) ?? [];
    vendorEntries.push([slug, image]);
    byVendor.set(image.vendor, vendorEntries);
  }

  const exportNames = new Set<string>();
  for (const vendor of byVendor.keys()) {
    const exportName = getVendorExportName(vendor);
    if (exportNames.has(exportName)) {
      throw new Error(`Generated vendor export collision: ${exportName}`);
    }
    exportNames.add(exportName);
  }

  return byVendor;
}

function renderVendorModule(
  vendor: string,
  entries: Array<[string, GroupedImage]>,
): string {
  const imports: string[] = [];
  const manifestEntries: string[] = [];

  for (const [slug, { front, rear }] of entries) {
    const importNames: { front?: string; rear?: string } = {};

    if (front) {
      importNames.front = generateImportName(slug, "front");
      imports.push(generateImportStatement(vendor, slug, "front"));
    }
    if (rear) {
      importNames.rear = generateImportName(slug, "rear");
      imports.push(generateImportStatement(vendor, slug, "rear"));
    }

    manifestEntries.push(`  ${generateManifestEntry(slug, importNames)},`);
  }

  return `/**
 * Bundled image manifest for ${vendor}.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

import type { BundledImageManifest } from "./types";
${imports.join("\n")}

export const ${getVendorExportName(vendor)} = {
${manifestEntries.join("\n")}
} satisfies BundledImageManifest;
`;
}

function renderGeneratedIndex(vendors: string[]): string {
  const imports = vendors.map(
    (vendor) => `import { ${getVendorExportName(vendor)} } from "./${vendor}";`,
  );
  const spreads = vendors.map(
    (vendor) => `  ...${getVendorExportName(vendor)},`,
  );

  return `/**
 * Aggregated brand image manifest.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

import type { BundledImageManifest } from "./types";
${imports.join("\n")}

export const BRAND_BUNDLED_IMAGES: BundledImageManifest = {
${spreads.join("\n")}
};
`;
}

function renderGeneratedTypes(): string {
  return `/**
 * Types shared by generated bundled-image modules.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

export interface BundledImageSet {
  front?: string;
  rear?: string;
}

export type BundledImageManifest = Record<string, BundledImageSet>;
`;
}

function renderFacade(): string {
  return `/**
 * Bundled Device Images Manifest
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 *
 * Maps device slugs to bundled WebP images using Vite's static asset imports.
 * These images are pre-bundled with the app for immediate display.
 *
 * Images sourced from NetBox Device Type Library (CC0 licensed)
 * https://github.com/netbox-community/devicetype-library
 */

import { BRAND_BUNDLED_IMAGES } from "./bundledImages.generated";
import type {
  BundledImageManifest,
  BundledImageSet,
} from "./bundledImages.generated/types";

// ============================================
// Starter Library (Generic Devices) - Manual
// ============================================

// Server images
import server1uFront from "$lib/assets/device-images/_generic/server/1u-server.front.webp";
import server2uFront from "$lib/assets/device-images/_generic/server/2u-server.front.webp";
import server4uFront from "$lib/assets/device-images/_generic/server/4u-server.front.webp";

// Network images
import switch24portFront from "$lib/assets/device-images/_generic/network/24-port-switch.front.webp";
import switch48portFront from "$lib/assets/device-images/_generic/network/48-port-switch.front.webp";
import routerFirewallFront from "$lib/assets/device-images/_generic/network/1u-router-firewall.front.webp";

// Storage images
import storage1uFront from "$lib/assets/device-images/_generic/storage/1u-storage.front.webp";
import storage2uFront from "$lib/assets/device-images/_generic/storage/2u-storage.front.webp";
import storage4uFront from "$lib/assets/device-images/_generic/storage/4u-storage.front.webp";

// Power images
import ups2uFront from "$lib/assets/device-images/_generic/power/2u-ups.front.webp";

// KVM images
import consoleDrawerFront from "$lib/assets/device-images/_generic/kvm/1u-console-drawer.front.webp";

const GENERIC_BUNDLED_IMAGES: BundledImageManifest = {
  // Servers
  "1u-server": { front: server1uFront },
  "2u-server": { front: server2uFront },
  "4u-server": { front: server4uFront },

  // Network
  "24-port-switch": { front: switch24portFront },
  "48-port-switch": { front: switch48portFront },
  "1u-router-firewall": { front: routerFirewallFront },

  // Storage
  "1u-storage": { front: storage1uFront },
  "2u-storage": { front: storage2uFront },
  "4u-storage": { front: storage4uFront },

  // Power
  "2u-ups": { front: ups2uFront },

  // KVM
  "1u-console-drawer": { front: consoleDrawerFront },
};

const BUNDLED_IMAGES: Record<string, BundledImageSet> = {
  ...GENERIC_BUNDLED_IMAGES,
  ...BRAND_BUNDLED_IMAGES,
};

/**
 * Get a bundled image URL for a device slug and face.
 */
export function getBundledImage(
  slug: string,
  face: "front" | "rear",
): string | undefined {
  const imageSet = BUNDLED_IMAGES[slug];
  if (!imageSet) return undefined;
  return imageSet[face];
}

/**
 * Get the device slugs that have bundled images.
 */
export function getBundledImageSlugs(): string[] {
  return Object.keys(BUNDLED_IMAGES);
}

/**
 * Check whether a device slug has at least one bundled image.
 */
export function hasBundledImage(slug: string): boolean {
  return slug in BUNDLED_IMAGES;
}
`;
}

async function formatTypeScript(
  path: string,
  source: string,
  repoRoot: string,
  maxGeneratedFileLines: number,
): Promise<readonly [string, string]> {
  const formatted = await format(source, {
    parser: "typescript",
    plugins: [typescriptPlugin, estreePlugin],
  });
  const lineCount = formatted.trimEnd().split(/\r?\n/).length;
  if (lineCount > maxGeneratedFileLines) {
    throw new Error(
      `Generated file ${relative(repoRoot, path)} has ${lineCount} lines; split the vendor before writing it.`,
    );
  }
  return [path, formatted];
}

async function writeGeneratedManifest(
  groupedImages: GroupedImages,
  paths: BundledImageGeneratorPaths,
  maxGeneratedFileLines: number,
): Promise<void> {
  const byVendor = groupEntriesByVendor(groupedImages);
  const vendors = [...byVendor.keys()];

  const sources: Array<readonly [string, string]> = [
    [paths.outputFile, renderFacade()],
    [join(paths.generatedDir, "types.ts"), renderGeneratedTypes()],
    [join(paths.generatedDir, "index.ts"), renderGeneratedIndex(vendors)],
    ...vendors.map(
      (vendor) =>
        [
          join(paths.generatedDir, `${vendor}.ts`),
          renderVendorModule(vendor, byVendor.get(vendor) ?? []),
        ] as const,
    ),
  ];
  const outputs = await Promise.all(
    sources.map(([path, source]) =>
      formatTypeScript(path, source, paths.repoRoot, maxGeneratedFileLines),
    ),
  );

  await rm(paths.generatedDir, { recursive: true, force: true });
  await mkdir(paths.generatedDir, { recursive: true });
  await mkdir(dirname(paths.outputFile), { recursive: true });
  await Promise.all(
    outputs.map(([path, formatted]) => writeFile(path, formatted, "utf-8")),
  );
}

export async function generateBundledImages(
  options: BundledImageGeneratorOptions = {},
): Promise<BundledImageGeneratorResult> {
  const paths = options.paths ?? DEFAULT_BUNDLED_IMAGE_GENERATOR_PATHS;
  const maxGeneratedFileLines =
    options.maxGeneratedFileLines ?? MAX_GENERATED_FILE_LINES;
  const log = options.log ?? console.log;

  log("Bundled Images Generator");
  log("========================\n");

  const imageFiles = await getImageFiles(paths.imagesDir);
  log(`Found ${imageFiles.length} device images\n`);

  const parsedImages: ParsedImage[] = [];
  for (const file of imageFiles) {
    const parsed = parseImagePath(file);
    if (parsed) {
      parsedImages.push(parsed);
    }
  }
  log(`Parsed ${parsedImages.length} valid images\n`);

  const grouped = groupImagesBySlug(parsedImages);
  const byVendor = groupEntriesByVendor(grouped);
  const deviceCount = Object.keys(grouped).length;
  log(`Grouped into ${deviceCount} device entries\n`);
  log("By vendor:");
  for (const [vendor, entries] of byVendor) {
    log(`  ${vendor}: ${entries.length} devices`);
  }
  log();

  await writeGeneratedManifest(grouped, paths, maxGeneratedFileLines);
  log(`Generated: ${relative(process.cwd(), paths.outputFile)}`);
  log(
    `Generated vendor modules: ${relative(process.cwd(), paths.generatedDir)}`,
  );

  return {
    imageFileCount: imageFiles.length,
    parsedImageCount: parsedImages.length,
    deviceCount,
    vendorCount: byVendor.size,
  };
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return (
    entrypoint !== undefined && resolve(entrypoint) === resolve(__filename)
  );
}

if (isDirectExecution()) {
  generateBundledImages().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
