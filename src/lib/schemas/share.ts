/**
 * Minimal Share Format Schema
 * Abbreviated keys for URL efficiency
 *
 * Full Layout -> Minimal key mapping:
 * - version -> v
 * - name -> n
 * - rack.name -> r.n
 * - rack.height -> r.h
 * - rack.width -> r.w
 * - rack.devices -> r.d
 * - device.device_type -> t (slug)
 * - device.position -> p
 * - device.face -> f
 * - device.name -> n (optional custom name)
 * - device_types -> dt
 * - deviceType.slug -> s
 * - deviceType.u_height -> h
 * - deviceType.manufacturer -> mf (optional)
 * - deviceType.model -> m (optional)
 * - deviceType.colour -> c
 * - deviceType.category -> x (single char abbreviation)
 */

import { z } from "../zod";
import type { RefinementCtx } from "zod";
import type { DeviceCategory } from "$lib/types";
import {
  RACKMATE_T1_PLUS_DEPTH_MM,
  RACKMATE_T1_PLUS_HEIGHT,
} from "$lib/types/constants";

/**
 * Share format version. Version 2 added carrier-first container encoding.
 * Version 3 marks compact device definitions authoritative (`o: 1`) so
 * decoding never depends on how a later app version classifies a slug.
 */
export const SHARE_FORMAT_VERSION = 3;

// Compact links are untrusted and reach richer layout validation after
// decompression. These ceilings preserve the documented 100-rack/4200-device
// extreme while bounding all attacker-controlled collections first.
export const MAX_SHARE_RACKS = 100;
export const MAX_SHARE_TOTAL_DEVICES = 4200;
export const MAX_SHARE_DEVICES_PER_RACK = 1024;
export const MAX_SHARE_DEVICE_TYPES = 4200;
export const MAX_SHARE_SLOTS_PER_DEVICE_TYPE = 256;
export const MAX_SHARE_TOTAL_SLOTS = 16_384;
export const MAX_SHARE_RACK_GROUPS = 100;
export const MAX_SHARE_RACK_REFS_PER_GROUP = 100;
export const MAX_SHARE_TOTAL_GROUP_REFERENCES = 10_000;

const ShareFormatVersionSchema = z
  .number()
  .int()
  .min(1)
  .max(SHARE_FORMAT_VERSION, "Share format version is newer than this app");

// =============================================================================
// Category Abbreviation Maps
// =============================================================================

/**
 * Category to single-char abbreviation for compression
 */
export const CATEGORY_TO_ABBREV: Record<DeviceCategory, string> = {
  server: "s",
  network: "n",
  firewall: "r",
  "patch-panel": "p",
  power: "w",
  storage: "t",
  kvm: "k",
  "av-media": "a",
  cooling: "l",
  shelf: "f",
  blank: "b",
  "cable-management": "c",
  chassis: "h",
  other: "o",
};

/**
 * Single-char abbreviation back to category
 */
export const ABBREV_TO_CATEGORY: Record<string, DeviceCategory> =
  Object.fromEntries(
    Object.entries(CATEGORY_TO_ABBREV).map(([k, v]) => [
      v,
      k as DeviceCategory,
    ]),
  ) as Record<string, DeviceCategory>;

export const MAX_SHARE_ACCEPTED_CATEGORIES =
  Object.keys(CATEGORY_TO_ABBREV).length;
export const MAX_SHARE_RACK_WIDTHS_PER_DEVICE_TYPE = 4;
export const MAX_SHARE_FIT_LIST_ITEMS = 256;

function isKnownShareCategoryAbbreviation(value: string): boolean {
  return value in ABBREV_TO_CATEGORY;
}

const ShareCategoryAbbreviationSchema = z.string().length(1);

function hasUniqueItems(values: readonly unknown[]): boolean {
  return new Set(values).size === values.length;
}

const MinimalFitDimensionsShape = {
  width: z.number().finite().optional(),
  depth: z.number().finite().optional(),
  height: z.number().finite().optional(),
  length: z.number().finite().optional(),
};
const MinimalFitDimensionsProjectionSchema = z.object(
  MinimalFitDimensionsShape,
);
const MinimalFitDimensionsSchema = z.object(MinimalFitDimensionsShape).strict();
const MinimalFitSlugListSchema = z
  .array(z.string().min(1))
  .max(MAX_SHARE_FIT_LIST_ITEMS);

const MinimalRackulaFitObjectSchema = z.object({
  status: z.string().optional(),
  mount_type: z.string().optional(),
  recommended_tray_u: z.number().finite().optional(),
  rackmate_t1_plus_depth_mm: z.number().finite().optional(),
  rackmate_t1_plus_depth_clearance_mm: z.number().finite().optional(),
  rack_internal_depth_mm: z.number().finite().optional(),
  max_planned_child_u: z.number().finite().optional(),
  dimensions_mm: MinimalFitDimensionsSchema.optional(),
  reported_dimensions_mm: MinimalFitDimensionsSchema.optional(),
  recommended_mount_slugs: MinimalFitSlugListSchema.optional(),
  recommended_tray_slugs: MinimalFitSlugListSchema.optional(),
  open_checks: z.array(z.string()).max(MAX_SHARE_FIT_LIST_ITEMS).optional(),
});
const MinimalRackulaFitProjectionSchema = MinimalRackulaFitObjectSchema.extend({
  dimensions_mm: MinimalFitDimensionsProjectionSchema.optional(),
  reported_dimensions_mm: MinimalFitDimensionsProjectionSchema.optional(),
});
export const MinimalRackulaFitSchema = MinimalRackulaFitObjectSchema.strict();
export function projectMinimalRackulaFit(
  value: unknown,
): z.infer<typeof MinimalRackulaFitSchema> | undefined {
  const result = MinimalRackulaFitProjectionSchema.safeParse(value);
  return result.success && Object.keys(result.data).length > 0
    ? result.data
    : undefined;
}

// =============================================================================
// Minimal Format Schemas
// =============================================================================

/**
 * Minimal device placement schema
 * Position accepts decimals for legacy share links (pre-0.7.0 used U-values like 1.5)
 * Modern share links use U-values for human readability, converted on encode/decode.
 *
 * Container children (carrier-first model): a child carries `ci` (the index of
 * its parent carrier within the same rack's device list) and `si` (the parent
 * slot id), and its `p` is the raw 0-indexed slot position (>= 0), not a human-U
 * rail value. Synthesized carriers carry `a` (auto_created).
 */
export const MinimalDeviceSchema = z.object({
  /** device_type slug */
  t: z.string(),
  /** position: rack-level = U (>= 0.5); container child = raw slot index (>= 0) */
  p: z.number().min(0),
  /** face */
  f: z.enum(["front", "rear", "both"]),
  /** custom name (optional) */
  n: z.string().optional(),
  /** container parent index within this rack's device list (container child) */
  ci: z.number().int().min(0).optional(),
  /** parent slot id (container child) */
  si: z.string().optional(),
  /** auto_created flag (synthesized carrier) */
  a: z.literal(1).optional(),
});

/**
 * Minimal slot schema (container device types). Carries the slot grid so a
 * container's children resolve to real slots after a share round-trip.
 */
export const MinimalSlotSchema = z.object({
  /** slot id */
  id: z.string(),
  /** row index */
  r: z.number().int().min(0),
  /** column index */
  cl: z.number().int().min(0),
  /** width fraction (optional) */
  wf: z.number().optional(),
  /** height units (optional) */
  hu: z.number().optional(),
  /** accepted device category abbreviations (optional) */
  a: z
    .array(ShareCategoryAbbreviationSchema)
    .max(MAX_SHARE_ACCEPTED_CATEGORIES)
    .optional(),
});

/**
 * Minimal device type schema.
 *
 * Container device types (carriers, shelves, chassis) carry their slot grid
 * (`sl`), slot width (`sw`), and subdevice role (`sr`) so a shared layout's
 * container children round-trip to real slots. `h` allows sub-U heights (>= 0)
 * because the carrier-first model wraps gear under 0.5U.
 */
export const MinimalDeviceTypeSchema = z.object({
  /** slug */
  s: z.string(),
  /** u_height */
  h: z.number().min(0),
  /** manufacturer (optional) */
  mf: z.string().optional(),
  /** model (optional) */
  m: z.string().optional(),
  /** colour (hex) */
  c: z.string(),
  /** category abbreviation */
  x: z.string().length(1),
  /** slots (container device types) */
  sl: z
    .array(MinimalSlotSchema)
    .max(MAX_SHARE_SLOTS_PER_DEVICE_TYPE)
    .optional(),
  /** slot_width (1 = half-width, 2 = full-width) */
  sw: z.union([z.literal(1), z.literal(2)]).optional(),
  /** subdevice_role */
  sr: z.enum(["parent", "child"]).optional(),
  /** compatible rack widths */
  rw: z
    .array(
      z.union([z.literal(10), z.literal(19), z.literal(21), z.literal(23)]),
    )
    .max(MAX_SHARE_RACK_WIDTHS_PER_DEVICE_TYPE)
    .optional(),
  /** full-depth collision behavior */
  fd: z.boolean().optional(),
  /** front/rear image availability */
  fi: z.literal(1).optional(),
  ri: z.literal(1).optional(),
  /** fit metadata needed for physical placement checks */
  // Legacy links treated this extension as unknown; v3 validates it at root.
  rf: z.unknown().optional(),
  /** compact definition is authoritative (required by format v3) */
  o: z.literal(1).optional(),
});

/**
 * Minimal rack schema
 */
const MinimalRackSchemaBase = z.object({
  /** name */
  n: z.string(),
  /** height */
  h: z.number().int().min(1).max(100),
  /** width (all supported physical rack standards) */
  w: z.union([z.literal(10), z.literal(19), z.literal(21), z.literal(23)]),
  /** persisted profile selection; generic explicitly opts out of inference */
  pf: z.enum(["generic", "rackmate-t1-plus"]).optional(),
  /** rack depth in millimetres */
  dp: z.number().positive().finite().optional(),
  /** devices */
  d: z.array(MinimalDeviceSchema).max(MAX_SHARE_DEVICES_PER_RACK),
});

function addRackMateTupleIssues(
  rack: z.infer<typeof MinimalRackSchemaBase>,
  ctx: RefinementCtx,
): void {
  if (rack.pf !== "rackmate-t1-plus") return;

  if (rack.h !== RACKMATE_T1_PLUS_HEIGHT) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `RackMate T1 Plus height must be ${RACKMATE_T1_PLUS_HEIGHT}U`,
      path: ["h"],
    });
  }
  if (rack.w !== 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RackMate T1 Plus width must be 10 inches",
      path: ["w"],
    });
  }
  if (rack.dp !== undefined && rack.dp !== RACKMATE_T1_PLUS_DEPTH_MM) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `RackMate T1 Plus depth must be ${RACKMATE_T1_PLUS_DEPTH_MM}mm`,
      path: ["dp"],
    });
  }
}

export const MinimalRackSchema = MinimalRackSchemaBase.superRefine(
  addRackMateTupleIssues,
);

/**
 * Minimal layout schema (root)
 */
function compactSlotCount(
  deviceTypes: Array<z.infer<typeof MinimalDeviceTypeSchema>>,
): number {
  return deviceTypes.reduce(
    (total, deviceType) => total + (deviceType.sl?.length ?? 0),
    0,
  );
}

export const MinimalLayoutSchema = z
  .object({
    /** version */
    v: z.string(),
    /** v1 is legacy-only; current strict semantics require the multi-rack shape */
    fv: z.number().int().min(1).max(2).optional(),
    /** name */
    n: z.string(),
    /** rack */
    r: MinimalRackSchema,
    /** device_types (only used ones) */
    dt: z.array(MinimalDeviceTypeSchema).max(MAX_SHARE_DEVICE_TYPES),
  })
  .superRefine((layout, ctx) => {
    if (compactSlotCount(layout.dt) > MAX_SHARE_TOTAL_SLOTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        origin: "array",
        maximum: MAX_SHARE_TOTAL_SLOTS,
        inclusive: true,
        message: "Share contains too many device slots",
        path: ["dt"],
      });
    }
  });

// =============================================================================
// V2 Multi-Rack Schemas
// =============================================================================

/**
 * Minimal rack schema with short ID for multi-rack support
 */
export const MinimalRackV2Schema = MinimalRackSchemaBase.extend({
  /** Short sequential rack ID (e.g., "0", "1", "2") */
  i: z.string(),
}).superRefine(addRackMateTupleIssues);

/**
 * Minimal rack group schema for bayed/linked rack configurations
 */
export const MinimalRackGroupSchema = z.object({
  /** Short rack IDs referencing MinimalRackV2.i values */
  rs: z.array(z.string()).max(MAX_SHARE_RACK_REFS_PER_GROUP),
  /** Optional group name */
  n: z.string().optional(),
  /** Layout preset */
  p: z.enum(["bayed", "row"]).optional(),
});

/**
 * Minimal layout schema v2 (multi-rack)
 * Detected by presence of `rs` field (vs `r` for v1)
 */
export const MinimalLayoutV2Schema = z
  .object({
    /** version */
    v: z.string(),
    /** absent/1/2 are legacy; 3 is the current strict format */
    fv: ShareFormatVersionSchema.optional(),
    /** name */
    n: z.string(),
    /** racks array (v2) */
    rs: z.array(MinimalRackV2Schema).max(MAX_SHARE_RACKS),
    /** rack groups (optional) */
    rg: z.array(MinimalRackGroupSchema).max(MAX_SHARE_RACK_GROUPS).optional(),
    /** device_types (only used ones) */
    dt: z.array(MinimalDeviceTypeSchema).max(MAX_SHARE_DEVICE_TYPES),
  })
  .superRefine((layout, ctx) => {
    const seenRackIds = new Set<string>();
    for (let rackIndex = 0; rackIndex < layout.rs.length; rackIndex++) {
      const rackId = layout.rs[rackIndex]!.i;
      if (seenRackIds.has(rackId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate compact rack ID: ${rackId}`,
          path: ["rs", rackIndex, "i"],
        });
      }
      seenRackIds.add(rackId);
    }

    // Legacy formats keep their historical stripping and fallback behavior. In
    // v3, compact definitions and references are authoritative, so ambiguous or
    // unknown nested data is corruption rather than something to repair.
    if (layout.fv === SHARE_FORMAT_VERSION) {
      for (
        let deviceTypeIndex = 0;
        deviceTypeIndex < layout.dt.length;
        deviceTypeIndex++
      ) {
        const category = layout.dt[deviceTypeIndex]!.x;
        if (!isKnownShareCategoryAbbreviation(category)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Unknown authoritative device category abbreviation",
            path: ["dt", deviceTypeIndex, "x"],
          });
        }

        const deviceType = layout.dt[deviceTypeIndex]!;
        if (deviceType.rw && !hasUniqueItems(deviceType.rw)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Compatible rack widths must be unique",
            path: ["dt", deviceTypeIndex, "rw"],
          });
        }
        if (
          deviceType.rf !== undefined &&
          !MinimalRackulaFitSchema.safeParse(deviceType.rf).success
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Fit metadata must use the public compact schema",
            path: ["dt", deviceTypeIndex, "rf"],
          });
        }

        for (
          let slotIndex = 0;
          slotIndex < (deviceType.sl?.length ?? 0);
          slotIndex++
        ) {
          const categories = deviceType.sl![slotIndex]!.a;
          if (!categories) continue;

          if (!hasUniqueItems(categories)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Accepted device categories must be unique",
              path: ["dt", deviceTypeIndex, "sl", slotIndex, "a"],
            });
          }
          for (
            let categoryIndex = 0;
            categoryIndex < categories.length;
            categoryIndex++
          ) {
            if (!isKnownShareCategoryAbbreviation(categories[categoryIndex]!)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Unknown accepted device category abbreviation",
                path: [
                  "dt",
                  deviceTypeIndex,
                  "sl",
                  slotIndex,
                  "a",
                  categoryIndex,
                ],
              });
            }
          }
        }
      }

      for (let rackIndex = 0; rackIndex < layout.rs.length; rackIndex++) {
        const devices = layout.rs[rackIndex]!.d;
        for (let deviceIndex = 0; deviceIndex < devices.length; deviceIndex++) {
          const device = devices[deviceIndex]!;
          const hasParent = device.ci !== undefined;
          const hasSlot = device.si !== undefined;

          if (hasParent !== hasSlot) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Container parent and slot references must be paired",
              path: ["rs", rackIndex, "d", deviceIndex],
            });
            continue;
          }
          if (!hasParent) continue;

          const parentIndex = device.ci!;
          const parent = devices[parentIndex];
          if (
            parentIndex === deviceIndex ||
            parent === undefined ||
            parent.ci !== undefined ||
            parent.si !== undefined
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Container parent reference is invalid",
              path: ["rs", rackIndex, "d", deviceIndex, "ci"],
            });
          }
        }
      }

      const assignedGroupRackIds = new Set<string>();
      for (
        let groupIndex = 0;
        groupIndex < (layout.rg?.length ?? 0);
        groupIndex++
      ) {
        const groupRackIds = new Set<string>();
        const group = layout.rg![groupIndex]!;
        for (
          let referenceIndex = 0;
          referenceIndex < group.rs.length;
          referenceIndex++
        ) {
          const rackId = group.rs[referenceIndex]!;
          if (!seenRackIds.has(rackId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Rack group references unknown compact rack ID: ${rackId}`,
              path: ["rg", groupIndex, "rs", referenceIndex],
            });
          }
          if (groupRackIds.has(rackId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Rack group contains duplicate compact rack ID: ${rackId}`,
              path: ["rg", groupIndex, "rs", referenceIndex],
            });
          } else if (assignedGroupRackIds.has(rackId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Compact rack belongs to more than one group: ${rackId}`,
              path: ["rg", groupIndex, "rs", referenceIndex],
            });
          }
          groupRackIds.add(rackId);
          assignedGroupRackIds.add(rackId);
        }
      }
    }

    const totalDevices = layout.rs.reduce(
      (total, rack) => total + rack.d.length,
      0,
    );
    if (totalDevices > MAX_SHARE_TOTAL_DEVICES) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        origin: "array",
        maximum: MAX_SHARE_TOTAL_DEVICES,
        inclusive: true,
        message: "Share contains too many placed devices",
        path: ["rs"],
      });
    }

    if (compactSlotCount(layout.dt) > MAX_SHARE_TOTAL_SLOTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        origin: "array",
        maximum: MAX_SHARE_TOTAL_SLOTS,
        inclusive: true,
        message: "Share contains too many device slots",
        path: ["dt"],
      });
    }

    const totalGroupReferences =
      layout.rg?.reduce((total, group) => total + group.rs.length, 0) ?? 0;
    if (totalGroupReferences > MAX_SHARE_TOTAL_GROUP_REFERENCES) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        origin: "array",
        maximum: MAX_SHARE_TOTAL_GROUP_REFERENCES,
        inclusive: true,
        message: "Share contains too many rack group references",
        path: ["rg"],
      });
    }
  });

// =============================================================================
// Type Exports
// =============================================================================

export type MinimalLayout = z.infer<typeof MinimalLayoutSchema>;
export type MinimalDevice = z.infer<typeof MinimalDeviceSchema>;
export type MinimalDeviceType = z.infer<typeof MinimalDeviceTypeSchema>;
export type MinimalRack = z.infer<typeof MinimalRackSchema>;
export type MinimalRackV2 = z.infer<typeof MinimalRackV2Schema>;
export type MinimalRackGroup = z.infer<typeof MinimalRackGroupSchema>;
export type MinimalLayoutV2 = z.infer<typeof MinimalLayoutV2Schema>;
export type MinimalRackulaFit = z.infer<typeof MinimalRackulaFitSchema>;
