/**
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
