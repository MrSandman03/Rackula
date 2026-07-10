/**
 * Bundled image manifest for apple.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

import type { BundledImageManifest } from "./types";
import appleXserveFront from "$lib/assets/device-images/apple/apple-xserve.front.webp";
import appleXserveRaidFront from "$lib/assets/device-images/apple/apple-xserve-raid.front.webp";

export const appleBundledImages = {
  "apple-xserve": { front: appleXserveFront },
  "apple-xserve-raid": { front: appleXserveRaidFront },
} satisfies BundledImageManifest;
