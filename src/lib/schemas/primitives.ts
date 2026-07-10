/** Primitive and enum Zod schemas shared by Rackula schemas. */

import { z } from "../zod";

export const DeviceCategorySchema = z.enum([
  "server",
  "network",
  "firewall",
  "patch-panel",
  "power",
  "storage",
  "kvm",
  "av-media",
  "cooling",
  "shelf",
  "blank",
  "cable-management",
  "chassis",
  "other",
]);

/**
 * Rack form factor enum
 */
export const FormFactorSchema = z.enum([
  "2-post",
  "4-post",
  "4-post-cabinet",
  "wall-mount",
  "open-frame",
]);

/**
 * Device face in rack
 */
export const DeviceFaceSchema = z.enum(["front", "rear", "both"]);

/**
 * Weight unit enum
 */
export const WeightUnitSchema = z.enum(["kg", "lb"]);

/**
 * Display mode enum
 */
export const DisplayModeSchema = z.enum(["label", "image", "image-label"]);

/**
 * Airflow direction enum (NetBox-compatible)
 */
export const AirflowSchema = z.enum([
  "passive",
  "front-to-rear",
  "rear-to-front",
  "left-to-right",
  "right-to-left",
  "side-to-rear",
  "mixed",
]);

/**
 * Subdevice role enum
 */
export const SubdeviceRoleSchema = z.enum(["parent", "child"]);

/**
 * Slot width enum for device width in slots
 */
export const SlotWidthSchema = z.union([z.literal(1), z.literal(2)]);

/**
 * Rack width in inches (physical rack standard widths).
 * Rackula-specific extension (not in NetBox DeviceType schema).
 */
export const RackWidthSchema = z.union([
  z.literal(10),
  z.literal(19),
  z.literal(21),
  z.literal(23),
]);

/**
 * Network interface type enum (NetBox-compatible subset)
 */
export const InterfaceTypeSchema = z.enum([
  // Copper Ethernet
  "100base-tx",
  "1000base-t",
  "2.5gbase-t",
  "5gbase-t",
  "10gbase-t",
  // Modular - SFP/SFP+/SFP28
  "1000base-x-sfp",
  "10gbase-x-sfpp",
  "25gbase-x-sfp28",
  // Modular - QSFP/QSFP28/QSFP-DD
  "40gbase-x-qsfpp",
  "100gbase-x-qsfp28",
  "100gbase-x-qsfpdd",
  "200gbase-x-qsfp56",
  "200gbase-x-qsfpdd",
  "400gbase-x-qsfpdd",
  // Console & Management
  "console",
  "usb-a",
  "usb-b",
  "usb-c",
  "usb-mini-b",
  "usb-micro-b",
  // Virtual
  "virtual",
  "lag",
  // Other
  "other",
]);

/**
 * PoE type enum (NetBox-compatible)
 */
export const PoETypeSchema = z.enum([
  "type1-ieee802.3af",
  "type2-ieee802.3at",
  "type3-ieee802.3bt",
  "type4-ieee802.3bt",
  "passive-24v-1pair",
  "passive-24v-2pair",
  "passive-48v-1pair",
  "passive-48v-2pair",
  "passive-56v-4pair",
]);

/**
 * PoE mode enum
 */
export const PoEModeSchema = z.enum(["pd", "pse"]);

/**
 * Interface position enum
 */
export const InterfacePositionSchema = z.enum(["front", "rear"]);

/**
 * Cable type enum (NetBox-compatible)
 */
export const CableTypeSchema = z.enum([
  // Copper Ethernet
  "cat5e",
  "cat6",
  "cat6a",
  "cat7",
  "cat8",
  // Direct Attach Copper
  "dac-passive",
  "dac-active",
  // Fiber - Multi-mode
  "mmf-om3",
  "mmf-om4",
  // Fiber - Single-mode
  "smf-os2",
  // Active Optical Cable
  "aoc",
  // Power & Serial
  "power",
  "serial",
]);

/**
 * Cable status enum (NetBox-compatible)
 */
export const CableStatusSchema = z.enum([
  "connected",
  "planned",
  "decommissioning",
]);

/**
 * Length unit enum for cable measurements
 */
export const LengthUnitSchema = z.enum(["m", "cm", "ft", "in"]);

/**
 * Validates that all slugs in an array are unique
 * @param device_types - Array of objects with slug property
 * @returns Array of duplicate slugs (empty if all unique)
 */
export function validateSlugUniqueness(
  device_types: { slug: string }[],
): string[] {
  const slugCounts = new Map<string, number>();

  for (const dt of device_types) {
    slugCounts.set(dt.slug, (slugCounts.get(dt.slug) ?? 0) + 1);
  }

  const duplicates: string[] = [];
  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      duplicates.push(slug);
    }
  }

  return duplicates;
}
