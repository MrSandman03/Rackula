/**
 * Bundled image manifest for tp-link.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run: npm run generate-bundled-images
 */

import type { BundledImageManifest } from "./types";
import tpLinkArcherAx1800Front from "$lib/assets/device-images/tp-link/tp-link-archer-ax1800.front.webp";
import tpLinkArcherAx1800Rear from "$lib/assets/device-images/tp-link/tp-link-archer-ax1800.rear.webp";
import tpLinkTlSg105Front from "$lib/assets/device-images/tp-link/tp-link-tl-sg105.front.webp";
import tpLinkTlSg105Rear from "$lib/assets/device-images/tp-link/tp-link-tl-sg105.rear.webp";
import tpLinkTlSg105eFront from "$lib/assets/device-images/tp-link/tp-link-tl-sg105e.front.webp";

export const tpLinkBundledImages = {
  "tp-link-archer-ax1800": {
    front: tpLinkArcherAx1800Front,
    rear: tpLinkArcherAx1800Rear,
  },
  "tp-link-tl-sg105": { front: tpLinkTlSg105Front, rear: tpLinkTlSg105Rear },
  "tp-link-tl-sg105e": { front: tpLinkTlSg105eFront },
} satisfies BundledImageManifest;
