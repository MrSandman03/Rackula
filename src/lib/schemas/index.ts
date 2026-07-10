/**
 * Layout Zod Validation Schemas
 * v0.7.0+ uses internal position units (1/6U)
 */

import { z } from "../zod";
import type { RefinementCtx } from "zod";
import { nanoid } from "nanoid";
import { DEFAULT_RACK_BASE_WEIGHT } from "$lib/types/constants";
import { VERSION } from "$lib/version";
import {
  SCHEMA_VERSION,
  assertSchemaVersionSupported,
  needsPositionMigration,
  migrateDevicePositions,
  clampOverRackPositions,
} from "./migrations";
import {
  withLegacyRackProfileDefaults,
  withRackProfileDefaults,
} from "$lib/utils/rack-profile";
import { validateSlotTopology } from "$lib/utils/slot-fit";
import { findBuiltInDeviceType } from "$lib/utils/built-in-device";
import type { DeviceType } from "$lib/types";
import { addLayoutRefinementIssues } from "./layout-refinements";
import {
  AirflowSchema,
  CableStatusSchema,
  CableTypeSchema,
  DeviceCategorySchema,
  DeviceFaceSchema,
  DisplayModeSchema,
  FormFactorSchema,
  InterfacePositionSchema,
  InterfaceTypeSchema,
  LengthUnitSchema,
  PoEModeSchema,
  PoETypeSchema,
  RackWidthSchema,
  SlotWidthSchema,
  SubdeviceRoleSchema,
  WeightUnitSchema,
} from "./primitives";

export {
  AirflowSchema,
  CableStatusSchema,
  CableTypeSchema,
  DeviceCategorySchema,
  DeviceFaceSchema,
  DisplayModeSchema,
  FormFactorSchema,
  InterfacePositionSchema,
  InterfaceTypeSchema,
  LengthUnitSchema,
  PoEModeSchema,
  PoETypeSchema,
  RackWidthSchema,
  SlotWidthSchema,
  SubdeviceRoleSchema,
  WeightUnitSchema,
  validateSlugUniqueness,
} from "./primitives";

// Re-export the version-migration cluster so consumers importing from
// "$lib/schemas" keep their import paths unchanged (the cluster moved to
// ./migrations).
export { SCHEMA_VERSION, assertSchemaVersionSupported };

/**
 * Slug pattern: lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Hex colour pattern: 6-character hex with # prefix
 */
const HEX_COLOUR_PATTERN = /^#[0-9a-fA-F]{6}$/;

// ============================================================================
// Basic Schemas
// ============================================================================

/**
 * Slug schema for device identification
 */
export const SlugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(100, "Slug must be 100 characters or less")
  .regex(
    SLUG_PATTERN,
    "Slug must be lowercase with hyphens only (no leading/trailing/consecutive)",
  );

/** Position within a container's slot grid. */
export const SlotPosition2DSchema = z.object({
  row: z.number().int().min(0, "Row must be non-negative"),
  col: z.number().int().min(0, "Column must be non-negative"),
});

/**
 * Slot definition for container devices
 * A DeviceType with slots[] is a container that can hold child devices
 */
export const SlotSchema = z
  .object({
    id: z.string().min(1, "Slot ID is required"),
    name: z.string().max(100).optional(),
    position: SlotPosition2DSchema,
    width_fraction: z
      .number()
      .positive("Width fraction must be positive")
      .max(1, "Width fraction cannot exceed 1")
      .optional(),
    height_units: z
      .number()
      .positive("Height units must be positive")
      .max(50, "Height units cannot exceed 50U")
      .optional(),
    accepts: z.array(DeviceCategorySchema).optional(),
  })
  .passthrough();

// ============================================================================
// Utility Functions
// ============================================================================

// ============================================================================
// Component Schemas (NetBox-compatible)
// ============================================================================

/**
 * Network interface template schema (NetBox-compatible with Rackula extensions)
 */
export const InterfaceTemplateSchema = z
  .object({
    name: z.string().min(1, "Interface name is required"),
    type: InterfaceTypeSchema,
    label: z.string().max(64).optional(),
    mgmt_only: z.boolean().optional(),
    position: InterfacePositionSchema.optional(),
    poe_mode: PoEModeSchema.optional(),
    poe_type: PoETypeSchema.optional(),
  })
  .passthrough();

/**
 * Power port (input) schema
 */
export const PowerPortSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().optional(),
    maximum_draw: z.number().positive().optional(),
    allocated_draw: z.number().positive().optional(),
  })
  .passthrough();

/**
 * Power outlet (output) schema
 */
export const PowerOutletSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().optional(),
    power_port: z.string().optional(),
    feed_leg: z.enum(["A", "B", "C"]).optional(),
  })
  .passthrough();

/**
 * Device bay schema (for blade chassis, modular switches)
 */
export const DeviceBaySchema = z
  .object({
    name: z.string().min(1),
    position: z.string().optional(),
  })
  .passthrough();

/**
 * Inventory item schema
 */
export const InventoryItemSchema = z
  .object({
    name: z.string().min(1),
    manufacturer: z.string().optional(),
    part_id: z.string().optional(),
    serial: z.string().optional(),
    asset_tag: z.string().optional(),
  })
  .passthrough();

/**
 * Device link schema
 */
export const DeviceLinkSchema = z
  .object({
    label: z.string().min(1),
    url: z.string().url(),
  })
  .passthrough();

// ============================================================================
// PlacedPort Schema
// ============================================================================

/**
 * PlacedPort schema - instantiated port with stable UUID
 * Created when a device is placed in a rack
 */
export const PlacedPortSchema = z
  .object({
    id: z.string().min(1, "Port ID is required"),
    template_name: z.string().min(1, "Template name is required"),
    template_index: z
      .number()
      .int()
      .min(0, "Template index must be non-negative"),
    type: InterfaceTypeSchema,
    label: z.string().max(64).optional(),
  })
  .passthrough();

// ============================================================================
// Connection Schema (Port-based - MVP)
// ============================================================================

/**
 * Connection schema - port-to-port connection (MVP model)
 * Uses PlacedPort.id for stable references
 */
export const ConnectionSchema = z
  .object({
    id: z.string().min(1, "Connection ID is required"),
    a_port_id: z.string().min(1, "A-side port ID is required"),
    b_port_id: z.string().min(1, "B-side port ID is required"),
    label: z.string().max(100).optional(),
    color: z
      .string()
      .regex(
        HEX_COLOUR_PATTERN,
        "Color must be a valid hex color (e.g., #FF5500)",
      )
      .optional(),
  })
  .passthrough()
  .refine((data) => data.a_port_id !== data.b_port_id, {
    message: "Cannot connect a port to itself",
    path: ["b_port_id"],
  });

// ============================================================================
// Cable Schemas (NetBox-compatible) - DEPRECATED
// ============================================================================

/**
 * @deprecated Use ConnectionSchema instead - Cable uses fragile device+interface references
 */
export const CableSchema = z
  .object({
    // Unique identifier
    id: z.string().min(1, "Cable ID is required"),

    // A-side termination
    a_device_id: z.string().min(1, "A-side device ID is required"),
    a_interface: z.string().min(1, "A-side interface is required"),

    // B-side termination
    b_device_id: z.string().min(1, "B-side device ID is required"),
    b_interface: z.string().min(1, "B-side interface is required"),

    // Cable properties
    type: CableTypeSchema.optional(),
    color: z
      .string()
      .regex(
        HEX_COLOUR_PATTERN,
        "Color must be a valid hex color (e.g., #FF5500)",
      )
      .optional(),
    label: z.string().max(100).optional(),
    length: z.number().positive().optional(),
    length_unit: LengthUnitSchema.optional(),
    status: CableStatusSchema.optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // If length is provided, length_unit must also be provided
      if (data.length !== undefined && data.length_unit === undefined) {
        return false;
      }
      return true;
    },
    {
      message: "length_unit is required when length is specified",
      path: ["length_unit"],
    },
  );

// ============================================================================
// Composite Schemas
// ============================================================================

/**
 * Device Type schema - library template definition
 * Schema v1.0.0: Flat structure with NetBox-compatible fields
 */
const DeviceTypeSchemaBase = z
  .object({
    // --- Core Identity ---
    slug: SlugSchema,
    manufacturer: z.string().max(100).optional(),
    model: z.string().max(100).optional(),
    part_number: z.string().max(100).optional(),

    // --- Physical Properties ---
    u_height: z
      .number()
      .min(0.5, "Height must be at least 0.5U")
      .max(50, "Height cannot exceed 50U")
      .refine((val) => val % 0.5 === 0, "Height must be a multiple of 0.5U"),
    slot_width: SlotWidthSchema.optional(),
    rack_widths: z.array(RackWidthSchema).optional(),
    is_full_depth: z.boolean().optional(),
    is_powered: z.boolean().optional(),
    weight: z.number().positive().optional(),
    weight_unit: WeightUnitSchema.optional(),
    airflow: AirflowSchema.optional(),

    // --- Image Flags ---
    front_image: z.boolean().optional(),
    rear_image: z.boolean().optional(),

    // --- Rackula Fields (flat, not nested) ---
    colour: z
      .string()
      .regex(HEX_COLOUR_PATTERN, "Colour must be a valid 6-character hex code"),
    category: DeviceCategorySchema,
    tags: z.array(z.string()).optional(),

    // --- Extension Fields ---
    notes: z.string().max(1000).optional(),
    serial_number: z.string().max(100).optional(),
    asset_tag: z.string().max(100).optional(),
    links: z.array(DeviceLinkSchema).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),

    // --- Component Arrays ---
    interfaces: z.array(InterfaceTemplateSchema).optional(),
    power_ports: z.array(PowerPortSchema).optional(),
    power_outlets: z.array(PowerOutletSchema).optional(),
    device_bays: z.array(DeviceBaySchema).optional(),
    inventory_items: z.array(InventoryItemSchema).optional(),

    // --- Subdevice Support ---
    subdevice_role: SubdeviceRoleSchema.optional(),

    // --- Power Device Properties ---
    va_rating: z
      .number()
      .int()
      .positive("VA rating must be a positive integer")
      .optional(),

    // --- Container Support (v0.6.0) ---
    /**
     * Slot definitions for container devices.
     * Presence of slots[] with length > 0 indicates this is a container device.
     */
    slots: z.array(SlotSchema).optional(),
  })
  .passthrough();

function addDeviceTypeRefinementIssues(
  data: z.infer<typeof DeviceTypeSchemaBase>,
  ctx: RefinementCtx,
  allowPriorReleaseMultirowHeightOverflow: boolean,
): void {
  if (data.slots && data.slots.length > 0) {
    const hasMultipleRows =
      new Set(data.slots.map((slot) => slot.position.row)).size > 1;
    for (const issue of validateSlotTopology(data.slots, data.u_height)) {
      // Height accounting was added after saved layouts could already contain
      // multirow explicit grids whose rows exceed the container. Only the
      // saved-layout boundary waives that one topology issue; authoring/import
      // through DeviceTypeSchema remains strict, as do all other topology rules.
      if (
        allowPriorReleaseMultirowHeightOverflow &&
        hasMultipleRows &&
        issue.code === "height_overflow"
      ) {
        continue;
      }

      const slotIndex =
        issue.slotId !== undefined
          ? data.slots.findIndex((slot) => slot.id === issue.slotId)
          : -1;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: slotIndex >= 0 ? ["slots", slotIndex] : ["slots"],
      });
    }
  }

  // Half-depth devices have one physical face; interfaces cannot span both.
  // Unspecified position defaults to 'front', so implicit-front + explicit-rear is also invalid.
  if (
    data.is_full_depth === false &&
    data.interfaces &&
    data.interfaces.length > 0
  ) {
    const positions = data.interfaces.map(
      (iface: { position?: string }) => iface.position ?? "front",
    );
    const uniquePositions = new Set(positions);
    if (uniquePositions.size > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Half-depth device cannot have interfaces on both front and rear faces",
        path: ["interfaces"],
      });
    }
  }
}

/** Canonical device contract for authoring and standalone device imports. */
export const DeviceTypeSchema = DeviceTypeSchemaBase.superRefine((data, ctx) =>
  addDeviceTypeRefinementIssues(data, ctx, false),
);

/**
 * Saved layouts predate slot-row height accounting. Keep only that historical
 * load exception here so the canonical DeviceTypeSchema stays strict.
 */
const LegacySavedDeviceTypeSchema = DeviceTypeSchemaBase.superRefine(
  (data, ctx) => addDeviceTypeRefinementIssues(data, ctx, true),
);

/**
 * Placed device schema - instance in rack
 * Position semantics:
 * - Rack-level devices: position is 1-indexed U position
 * - Container children (container_id set): position is 0-indexed relative to container
 */
export const PlacedDeviceSchema = z
  .object({
    id: z.string().min(1, "ID is required"),
    device_type: SlugSchema,
    name: z.string().max(100, "Name must be 100 characters or less").optional(),
    // Position accepts decimals on input for legacy migration (pre-0.7.0 files use U-values like 1.5)
    // Migration in LayoutSchemaBase.transform converts to internal units using Math.round()
    // Container children use 0-indexed positions, rack-level must be >= 0.5 (validated by refine)
    position: z.number().min(0, "Position must be non-negative"),
    face: DeviceFaceSchema,

    // --- Port Instances ---
    ports: z.array(PlacedPortSchema).default([]),

    // --- Placement Image Override ---
    front_image: z.string().optional(),
    rear_image: z.string().optional(),

    // --- Placement Colour Override ---
    colour_override: z
      .string()
      .regex(
        /^#[0-9A-Fa-f]{6}$/,
        "Colour must be a valid hex colour (e.g., #FF5555)",
      )
      .optional(),

    // --- Subdevice Placement ---
    parent_device: z.string().optional(),
    device_bay: z.string().optional(),

    // --- Container Child Placement (v0.6.0) ---
    /** UUID of parent PlacedDevice if nested in a container */
    container_id: z.string().optional(),
    /** Which slot in parent container (references Slot.id) */
    slot_id: z.string().optional(),

    // --- Auto-Created Placement ---
    /** True when synthesized automatically (e.g. a carrier for a sub-U device) */
    auto_created: z.boolean().default(false),

    // --- Extension Fields ---
    notes: z.string().max(1000).optional(),
    custom_fields: z.record(z.string(), z.any()).optional(),
  })
  .passthrough()
  .refine(
    (data) => {
      // If container_id is set, slot_id should also be set
      if (data.container_id && !data.slot_id) {
        return false;
      }
      return true;
    },
    {
      message: "slot_id is required when container_id is set",
      path: ["slot_id"],
    },
  )
  .refine(
    (data) => {
      // Rack-level devices (no container_id) must have position >= 0.5
      // (allows half-U positions at bottom of rack in legacy files)
      // After migration, positions become internal units (>= 3 for 0.5U)
      if (!data.container_id && data.position < 0.5) {
        return false;
      }
      return true;
    },
    {
      message: "Rack-level device position must be at least 0.5",
      path: ["position"],
    },
  );

/**
 * Rack schema base (without id requirement for legacy migration)
 * Used internally - LayoutSchema transform ensures id is always present in output
 */
const RackSchemaInput = z
  .object({
    id: z.string().min(1).optional(), // Optional for legacy migration
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    height: z
      .number()
      .int()
      .min(1, "Height must be at least 1U")
      .max(100, "Height cannot exceed 100U"),
    width: z.union([
      z.literal(10),
      z.literal(19),
      z.literal(21),
      z.literal(23),
    ]),
    profile: z.enum(["generic", "rackmate-t1-plus"]).optional(),
    desc_units: z.boolean(),
    show_rear: z.boolean().default(true),
    form_factor: FormFactorSchema,
    starting_unit: z.number().int().min(1),
    position: z.number().int().min(0),
    devices: z.array(PlacedDeviceSchema),
    notes: z.string().max(1000).optional(),
    depth_mm: z.number().positive().finite().optional(),
    base_weight: z
      .number()
      .nonnegative()
      .finite()
      .default(DEFAULT_RACK_BASE_WEIGHT),
  })
  .passthrough();

/**
 * Rack schema (id is required for multi-rack support)
 * After migration transform, id is always present
 */
export const RackSchema = z
  .object({
    id: z.string().min(1, "Rack ID is required"),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    height: z
      .number()
      .int()
      .min(1, "Height must be at least 1U")
      .max(100, "Height cannot exceed 100U"),
    width: z.union([
      z.literal(10),
      z.literal(19),
      z.literal(21),
      z.literal(23),
    ]),
    profile: z.enum(["generic", "rackmate-t1-plus"]).optional(),
    desc_units: z.boolean(),
    show_rear: z.boolean().default(true),
    form_factor: FormFactorSchema,
    starting_unit: z.number().int().min(1),
    position: z.number().int().min(0),
    devices: z.array(PlacedDeviceSchema),
    notes: z.string().max(1000).optional(),
    depth_mm: z.number().positive().finite().optional(),
    base_weight: z
      .number()
      .nonnegative()
      .finite()
      .default(DEFAULT_RACK_BASE_WEIGHT),
  })
  .passthrough()
  .transform((rack) => withRackProfileDefaults(rack));

/**
 * Layout preset for rack groups
 */
export const RackGroupLayoutPresetSchema = z.enum(["bayed", "row"]);

/**
 * Rack group schema for touring/bayed rack configurations
 */
export const RackGroupSchema = z
  .object({
    id: z.string().min(1, "Group ID is required"),
    name: z.string().max(100).optional(),
    rack_ids: z
      .array(z.string().min(1, "Rack ID cannot be empty"))
      .min(1, "At least one rack ID is required"),
    layout_preset: RackGroupLayoutPresetSchema.optional(),
  })
  .passthrough();

/**
 * UUID pattern for layout metadata.id
 * Standard UUID format: 8-4-4-4-12 hex characters with hyphens
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Layout metadata schema for YAML file headers.
 * Part of the data directory refactor (#570).
 *
 * @see docs/plans/2026-01-22-data-directory-refactor-design.md
 */
export const LayoutMetadataSchema = z
  .object({
    /** UUID - stable identity across renames/moves */
    id: z
      .string()
      .min(1, "Metadata ID is required")
      .regex(UUID_PATTERN, "Metadata ID must be a valid UUID format"),
    /** Human-readable layout name */
    name: z
      .string()
      .min(1, "Metadata name is required")
      .max(100, "Metadata name must be 100 characters or less"),
    /** Format version for future migrations (e.g., "1.0") */
    schema_version: z.string().min(1, "Schema version is required"),
    /** Optional notes about the layout */
    description: z
      .string()
      .max(1000, "Description must be 1000 characters or less")
      .optional(),
  })
  .passthrough();

/**
 * Layout settings schema
 */
export const LayoutSettingsSchema = z
  .object({
    display_mode: DisplayModeSchema,
    show_labels_on_images: z.boolean(),
  })
  .passthrough();

/**
 * Layout schema input (accepts legacy format)
 * Handles migration from Layout.rack → Layout.racks[]
 * Version is optional to support very old layouts without version field
 */
const LayoutSchemaInput = z
  .object({
    version: z.string().optional(),
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less"),
    /** Optional metadata section for new YAML format (#570) */
    metadata: LayoutMetadataSchema.optional(),
    // Modern format: racks array (optional in input for legacy migration)
    racks: z.array(RackSchemaInput).optional(),
    // Legacy format: single rack (optional, converted by transform)
    rack: RackSchemaInput.optional(),
    rack_groups: z.array(RackGroupSchema).optional(),
    device_types: z.array(DeviceTypeSchema),
    settings: LayoutSettingsSchema,
    connections: z.array(ConnectionSchema).optional(),
    /** @deprecated Use connections instead */
    cables: z.array(CableSchema).optional(),
  })
  .passthrough();

/** Prior-release file/object ingestion with its narrow slot-topology waiver. */
const LegacySavedLayoutSchemaInput = LayoutSchemaInput.extend({
  device_types: z.array(LegacySavedDeviceTypeSchema),
});

/**
 * Complete layout schema (base, with migration transform)
 * Uses racks array for multi-rack support
 * Transform handles:
 * - Legacy rack → racks[0] migration
 * - Generating nanoid for racks missing id field
 * - Position migration from U values to internal units (v0.7.0)
 */
function transformLayoutSchemaInput(
  data: z.infer<typeof LegacySavedLayoutSchemaInput>,
  allowLegacyProfileInference: boolean,
) {
  // Determine the racks array
  let racks: z.infer<typeof RackSchemaInput>[];

  if (data.racks && data.racks.length > 0) {
    // Modern format: use racks array (ignore legacy rack if both present)
    racks = data.racks;
  } else if (data.rack) {
    // Legacy format: wrap single rack in array
    racks = [data.rack];
  } else {
    // Neither present - let validation fail naturally
    racks = [];
  }

  // An explicit saved definition is authoritative, even when its slug shadows
  // a built-in. Add canonical definitions only for referenced built-in slugs
  // that are genuinely absent from the document.
  const deviceTypes: DeviceType[] = data.device_types.map(
    (deviceType) => ({ ...deviceType }) as DeviceType,
  );
  const knownDeviceTypes = new Set(
    deviceTypes.map((deviceType) => deviceType.slug),
  );
  for (const rack of racks) {
    for (const device of rack.devices) {
      if (knownDeviceTypes.has(device.device_type)) continue;
      const builtIn = findBuiltInDeviceType(device.device_type);
      if (!builtIn) continue;
      deviceTypes.push(builtIn);
      knownDeviceTypes.add(builtIn.slug);
    }
  }

  // Collect all devices across all racks for heuristic check
  const allDevices = racks.flatMap((r) => r.devices);

  // Check if positions need migration (pre-0.7.0 format)
  const migratePositions = needsPositionMigration(data.version, allDevices);

  // Resolve device-type u_height for the over-rack clamp (#2661). Built once per
  // load; an unknown slug falls back to 1U inside clampOverRackPositions.
  const uHeightBySlug = new Map(deviceTypes.map((t) => [t.slug, t.u_height]));

  // Generate IDs for racks missing them, deduplicate device IDs, and migrate positions if needed.
  const racksWithIds = racks.map((rack) => {
    // Deduplicate device IDs to prevent Svelte each_key_duplicate errors (#1363)
    const seenDeviceIds = new Set<string>();
    const idRemap = new Map<string, string>();
    const deduplicatedDevices = rack.devices.map((d) => {
      let nextId = d.id;
      if (seenDeviceIds.has(nextId)) {
        const oldId = nextId;
        do {
          nextId = nanoid();
        } while (seenDeviceIds.has(nextId));
        idRemap.set(oldId, nextId);
      }
      seenDeviceIds.add(nextId);
      const nextContainerId =
        d.container_id && idRemap.has(d.container_id)
          ? idRemap.get(d.container_id)!
          : d.container_id;
      return nextId === d.id && nextContainerId === d.container_id
        ? d
        : { ...d, id: nextId, container_id: nextContainerId };
    });

    const migratedDevices = migratePositions
      ? migrateDevicePositions(deduplicatedDevices)
      : deduplicatedDevices;

    const rackWithProfileDefaults = allowLegacyProfileInference
      ? withLegacyRackProfileDefaults({
          ...rack,
          id: rack.id ?? nanoid(),
        })
      : withRackProfileDefaults({
          ...rack,
          id: rack.id ?? nanoid(),
        });
    const wasLegacyProfileInferred =
      allowLegacyProfileInference &&
      rack.profile === undefined &&
      rackWithProfileDefaults.profile === "rackmate-t1-plus";
    const hasFixedRackProfile =
      rackWithProfileDefaults.profile === "rackmate-t1-plus" &&
      !wasLegacyProfileInferred;

    return {
      ...rackWithProfileDefaults,
      // Positions are in internal units here; clamp any rail device whose top
      // extends above the rack down to the highest within-rack whole-U (#2661).
      // Current fixed profiles preserve saved positions so strict refinement
      // can reject incompatible contents. A profile inferred only at the
      // prior-release boundary retains the historical over-rack clamp.
      devices: hasFixedRackProfile
        ? migratedDevices
        : clampOverRackPositions(
            migratedDevices,
            rackWithProfileDefaults.height,
            uHeightBySlug,
          ),
    };
  });

  // Build the output without the legacy 'rack' field
  const { rack: _legacyRack, racks: _inputRacks, ...rest } = data;
  void _legacyRack; // Explicitly ignore legacy field
  void _inputRacks; // Explicitly ignore input racks (using racksWithIds instead)

  return {
    ...rest,
    // After migration, stamp with current app version
    version: migratePositions ? VERSION : data.version,
    racks: racksWithIds,
    device_types: deviceTypes,
  };
}

/** Strict current authoring and validation boundary. */
export const LayoutSchemaBase = LayoutSchemaInput.transform((data) =>
  transformLayoutSchemaInput(data, false),
);

/** Structural migration boundary for prior-release saved files and objects. */
export const LegacySavedLayoutSchemaBase =
  LegacySavedLayoutSchemaInput.transform((data) =>
    transformLayoutSchemaInput(data, true),
  );

/** Legacy compact shares need saved-data waivers, but infer profiles explicitly. */
export const LegacyShareLayoutSchemaBase =
  LegacySavedLayoutSchemaInput.transform((data) =>
    transformLayoutSchemaInput(data, false),
  );

/** Complete strict layout schema for current authoring and untrusted shares. */
export const LayoutSchema = LayoutSchemaBase.superRefine((data, ctx) =>
  addLayoutRefinementIssues(data, ctx, false),
);

/** Complete prior-release ingestion schema with narrow compatibility waivers. */
export const LegacySavedLayoutSchema = LegacySavedLayoutSchemaBase.superRefine(
  (data, ctx) => addLayoutRefinementIssues(data, ctx, true),
);

export const LegacyShareLayoutSchema = LegacyShareLayoutSchemaBase.superRefine(
  (data, ctx) => addLayoutRefinementIssues(data, ctx, true),
);

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type Slug = z.infer<typeof SlugSchema>;
export type DeviceCategory = z.infer<typeof DeviceCategorySchema>;
export type FormFactor = z.infer<typeof FormFactorSchema>;
export type DeviceFace = z.infer<typeof DeviceFaceSchema>;
export type WeightUnit = z.infer<typeof WeightUnitSchema>;
export type DisplayMode = z.infer<typeof DisplayModeSchema>;
export type Airflow = z.infer<typeof AirflowSchema>;
export type SubdeviceRole = z.infer<typeof SubdeviceRoleSchema>;
export type SlotWidth = z.infer<typeof SlotWidthSchema>;
export type RackWidth = z.infer<typeof RackWidthSchema>;
export type InterfaceType = z.infer<typeof InterfaceTypeSchema>;
export type PoEType = z.infer<typeof PoETypeSchema>;
export type PoEMode = z.infer<typeof PoEModeSchema>;
export type InterfacePosition = z.infer<typeof InterfacePositionSchema>;
export type InterfaceTemplate = z.infer<typeof InterfaceTemplateSchema>;
export type PowerPort = z.infer<typeof PowerPortSchema>;
export type PowerOutlet = z.infer<typeof PowerOutletSchema>;
export type DeviceBay = z.infer<typeof DeviceBaySchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type DeviceLink = z.infer<typeof DeviceLinkSchema>;
export type PlacedPortZod = z.infer<typeof PlacedPortSchema>;
export type ConnectionZod = z.infer<typeof ConnectionSchema>;
export type DeviceTypeZod = z.infer<typeof DeviceTypeSchema>;
export type PlacedDeviceZod = z.infer<typeof PlacedDeviceSchema>;
export type RackZod = z.infer<typeof RackSchema>;
export type RackGroupLayoutPreset = z.infer<typeof RackGroupLayoutPresetSchema>;
export type RackGroupZod = z.infer<typeof RackGroupSchema>;
export type LayoutSettingsZod = z.infer<typeof LayoutSettingsSchema>;
export type LayoutMetadataZod = z.infer<typeof LayoutMetadataSchema>;
export type LayoutZod = z.infer<typeof LayoutSchema>;
export type CableType = z.infer<typeof CableTypeSchema>;
export type CableStatus = z.infer<typeof CableStatusSchema>;
export type LengthUnit = z.infer<typeof LengthUnitSchema>;
export type CableZod = z.infer<typeof CableSchema>;
/** Validated slot position - row/col are non-negative integers (unlike plain SlotPosition2D interface which accepts any number) */
export type SlotPosition2DZod = z.infer<typeof SlotPosition2DSchema>;
export type SlotZod = z.infer<typeof SlotSchema>;
