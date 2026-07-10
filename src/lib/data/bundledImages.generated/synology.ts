/**
 * Bundled image manifest for synology.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

import type { BundledImageManifest } from "./types";
import synologyFs6400Front from "$lib/assets/device-images/synology/synology-fs6400.front.webp";
import synologyFs6400Rear from "$lib/assets/device-images/synology/synology-fs6400.rear.webp";
import synologyRs2416rpPlusFront from "$lib/assets/device-images/synology/synology-rs2416rp-plus.front.webp";
import synologyRs2416rpPlusRear from "$lib/assets/device-images/synology/synology-rs2416rp-plus.rear.webp";
import synologyRs3614xsPlusFront from "$lib/assets/device-images/synology/synology-rs3614xs-plus.front.webp";
import synologyRs3614xsPlusRear from "$lib/assets/device-images/synology/synology-rs3614xs-plus.rear.webp";
import synologyRs3621xsPlusFront from "$lib/assets/device-images/synology/synology-rs3621xs-plus.front.webp";
import synologyRs3621xsPlusRear from "$lib/assets/device-images/synology/synology-rs3621xs-plus.rear.webp";
import synologyRs819Front from "$lib/assets/device-images/synology/synology-rs819.front.webp";
import synologyRs819Rear from "$lib/assets/device-images/synology/synology-rs819.rear.webp";

export const synologyBundledImages = {
  "synology-fs6400": { front: synologyFs6400Front, rear: synologyFs6400Rear },
  "synology-rs2416rp-plus": {
    front: synologyRs2416rpPlusFront,
    rear: synologyRs2416rpPlusRear,
  },
  "synology-rs3614xs-plus": {
    front: synologyRs3614xsPlusFront,
    rear: synologyRs3614xsPlusRear,
  },
  "synology-rs3621xs-plus": {
    front: synologyRs3621xsPlusFront,
    rear: synologyRs3621xsPlusRear,
  },
  "synology-rs819": { front: synologyRs819Front, rear: synologyRs819Rear },
} satisfies BundledImageManifest;
