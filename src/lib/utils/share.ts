/**
 * Share URL Encoding/Decoding
 * Converts Layout <-> MinimalLayout <-> compressed base64url string
 *
 * Position handling:
 * - Internal state uses internal units (1/6U): position 9 = U1.5
 * - Share links use human U-values for readability: position 1.5 = U1.5
 * - Conversion happens on encode (internal→U) and decode (U→internal)
 *
 * Schema versions:
 * - v1: Single rack (`r` field) — legacy, decode-only
 * - v2: Multi-rack (`rs` field) with optional rack groups (`rg`)
 *
 * Encoding formats:
 * - New (default): lz-string compressToEncodedURIComponent
 * - Legacy (decode-only): pako gzip + base64url
 */

import * as pako from "pako";
import LZString from "lz-string";
import type { Layout, DeviceType, PlacedDevice, RackGroup } from "$lib/types";
import {
  MinimalLayoutSchema,
  MinimalLayoutV2Schema,
  CATEGORY_TO_ABBREV,
  ABBREV_TO_CATEGORY,
  SHARE_FORMAT_VERSION,
  type MinimalLayout,
  type MinimalLayoutV2,
  type MinimalDeviceType,
  type MinimalDevice,
  type MinimalRackV2,
  type MinimalRackGroup,
  type MinimalRackulaFit,
} from "$lib/schemas/share";
import { LayoutSchema, LegacyShareLayoutSchema } from "$lib/schemas";
import { clampOverRackPositions } from "$lib/schemas/migrations";
import { VERSION } from "$lib/version";
import { generateId } from "./device";
import { createDefaultRack } from "./serialization";
import { toHumanUnits, toInternalUnits } from "./position";
import { hydrateBuiltInDeviceType } from "./built-in-device";
import { adaptLegacyLayout } from "$lib/storage";
import {
  RACKMATE_T1_PLUS_NAME,
  RACKMATE_T1_PLUS_PROFILE,
  RACKMATE_T1_PLUS_WIDTH,
} from "./rack-profile";
import { RACKMATE_T1_PLUS_HEIGHT } from "$lib/types/constants";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Preserve every supported rack width in the share format. The fallback keeps
 * malformed in-memory data from escaping the encoder, although decoded links
 * are already constrained by the share schema.
 */
function normalizeRackWidth(width: number): 10 | 19 | 21 | 23 {
  return width === 10 || width === 19 || width === 21 || width === 23
    ? width
    : 19;
}

/** Only JSON-style records are safe to project into the compact share shape. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter(
    (item): item is string => typeof item === "string",
  );
  return strings.length > 0 ? strings : undefined;
}

function shareDimensions(
  value: unknown,
): MinimalRackulaFit["dimensions_mm"] | undefined {
  if (!isPlainRecord(value)) return undefined;
  const dimensions = Object.fromEntries(
    ["width", "depth", "height", "length"]
      .map((key) => [key, finiteNumber(value[key])] as const)
      .filter((entry): entry is readonly [string, number] =>
        Number.isFinite(entry[1]),
      ),
  );
  return Object.keys(dimensions).length > 0 ? dimensions : undefined;
}

/** Keep only public fit fields needed to render and validate shared hardware. */
function shareSafeRackulaFit(
  deviceType: DeviceType,
): MinimalRackulaFit | undefined {
  const fit = deviceType.custom_fields?.rackula_fit;
  if (!isPlainRecord(fit)) return undefined;

  const result: MinimalRackulaFit = {};
  for (const key of ["status", "mount_type"] as const) {
    if (typeof fit[key] === "string") result[key] = fit[key];
  }
  for (const key of [
    "recommended_tray_u",
    "rackmate_t1_plus_depth_mm",
    "rackmate_t1_plus_depth_clearance_mm",
    "rack_internal_depth_mm",
    "max_planned_child_u",
  ] as const) {
    const value = finiteNumber(fit[key]);
    if (value !== undefined) result[key] = value;
  }
  for (const key of ["dimensions_mm", "reported_dimensions_mm"] as const) {
    const value = shareDimensions(fit[key]);
    if (value) result[key] = value;
  }
  for (const key of [
    "recommended_mount_slugs",
    "recommended_tray_slugs",
    "open_checks",
  ] as const) {
    const value = stringList(fit[key]);
    if (value) result[key] = value;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Pre-profile share links omitted both `pf` and `dp`. Recover RackMate identity
 * only for the exact tuple emitted by those releases, so ordinary 10-inch
 * racks and links with explicit physical data retain their original meaning.
 */
function resolveSharedRackProfile(
  rack: Pick<MinimalRackV2, "n" | "h" | "w" | "pf" | "dp">,
  allowLegacyInference: boolean,
): MinimalRackV2["pf"] {
  if (rack.pf !== undefined || rack.dp !== undefined) return rack.pf;
  if (!allowLegacyInference) return undefined;

  return rack.n === RACKMATE_T1_PLUS_NAME &&
    rack.h === RACKMATE_T1_PLUS_HEIGHT &&
    rack.w === RACKMATE_T1_PLUS_WIDTH
    ? RACKMATE_T1_PLUS_PROFILE
    : undefined;
}

interface ConvertedShareLayout {
  layout: Layout;
  legacyInferredRackMateRackIds: Set<string>;
}

function wasLegacyRackMateProfileInferred(
  rack: Pick<MinimalRackV2, "pf" | "dp">,
  profile: MinimalRackV2["pf"],
): boolean {
  return (
    profile === RACKMATE_T1_PLUS_PROFILE &&
    rack.pf === undefined &&
    rack.dp === undefined
  );
}

/**
 * Convert a rack's devices to minimal format.
 *
 * Container children (carrier-first) are encoded with `ci` (the parent
 * carrier's index in this same array), `si` (the parent slot id), and a raw
 * 0-indexed slot position (not a human-U rail value). Synthesized carriers
 * carry `a: 1`. The array order is preserved so `ci` indices stay valid on
 * decode.
 */
function convertDevices(devices: PlacedDevice[]): MinimalDevice[] {
  // Map each device id to its index so a child can reference its parent
  // carrier positionally (ids are regenerated on decode).
  const indexById = new Map<string, number>();
  devices.forEach((d, index) => indexById.set(d.id, index));

  return devices.map((d) => {
    // Encode as a child only when the parent carrier actually resolves in this
    // same array AND a slot is set. An orphaned child (dangling container_id,
    // or parent in another rack) falls back to a rack-level encoding so its
    // human-U position is preserved instead of leaking a raw 0-index.
    const parentIndex =
      d.container_id !== undefined ? indexById.get(d.container_id) : undefined;
    const isChild = parentIndex !== undefined && d.slot_id !== undefined;
    return {
      t: d.device_type,
      // Children use their raw 0-indexed slot position; rack-level devices use
      // human-U for readability.
      p: isChild ? d.position : toHumanUnits(d.position),
      f: d.face,
      ...(d.name ? { n: d.name } : {}),
      ...(isChild ? { ci: parentIndex } : {}),
      ...(isChild ? { si: d.slot_id } : {}),
      ...(d.auto_created ? { a: 1 as const } : {}),
    };
  });
}

/**
 * Convert minimal device types back to full DeviceType[]. Container types carry
 * their slot grid / slot_width / subdevice_role so their children resolve to
 * real slots after a round trip.
 */
function convertDeviceTypes(
  dt: MinimalDeviceType[],
  useAuthoritativeSnapshots: boolean,
): DeviceType[] {
  return dt.map((item) => {
    if (useAuthoritativeSnapshots && !item.o) {
      throw new Error(
        `Current share is missing the authoritative snapshot for device type: ${item.s}`,
      );
    }

    const projected: DeviceType = {
      slug: item.s,
      u_height: item.h,
      ...(item.mf ? { manufacturer: item.mf } : {}),
      ...(item.m ? { model: item.m } : {}),
      colour: item.c,
      category: ABBREV_TO_CATEGORY[item.x] ?? "other",
      ...(item.sl
        ? {
            slots: item.sl.map((s) => ({
              id: s.id,
              position: { row: s.r, col: s.cl },
              ...(s.wf !== undefined ? { width_fraction: s.wf } : {}),
              ...(s.hu !== undefined ? { height_units: s.hu } : {}),
              ...(s.a
                ? {
                    accepts: s.a.map(
                      (category) => ABBREV_TO_CATEGORY[category] ?? "other",
                    ),
                  }
                : {}),
            })),
          }
        : {}),
      ...(item.sw !== undefined ? { slot_width: item.sw } : {}),
      ...(item.sr ? { subdevice_role: item.sr } : {}),
      ...(item.rw ? { rack_widths: item.rw } : {}),
      ...(item.fd !== undefined ? { is_full_depth: item.fd } : {}),
      ...(item.fi ? { front_image: true } : {}),
      ...(item.ri ? { rear_image: true } : {}),
      ...(item.rf ? { custom_fields: { rackula_fit: item.rf } } : {}),
    };
    return useAuthoritativeSnapshots
      ? projected
      : hydrateBuiltInDeviceType(projected);
  });
}

/**
 * Convert minimal devices back to full PlacedDevice[].
 *
 * Container children (`ci` set) get a fresh container_id resolved from the
 * parent carrier's index, their slot_id from `si`, and a raw 0-indexed
 * position. A `ci` pointing outside the array, or at a non-carrier, is dropped
 * to a bare rack-level placement rather than trusted (untrusted share input).
 */
function convertMinimalDevices(devices: MinimalDevice[]): PlacedDevice[] {
  // Pre-generate an id per index so children can resolve their parent before
  // the parent itself is converted (order-independent).
  const idByIndex = devices.map(() => generateId());

  return devices.map((d, index) => {
    const base: PlacedDevice = {
      id: idByIndex[index]!,
      device_type: d.t,
      position: 0,
      face: d.f,
    };
    if (d.n) base.name = d.n;
    if (d.a) base.auto_created = true;

    // Trust a parent reference only when it points at a real, in-range
    // container device that is not itself a child. This preserves any container
    // (user-placed shelf/chassis as well as synthesized carriers) while
    // rejecting untrusted input that attaches a child to another child.
    const parent =
      d.ci !== undefined && d.ci >= 0 && d.ci < devices.length && d.ci !== index
        ? devices[d.ci]
        : undefined;
    const hasValidParent =
      parent !== undefined && d.si !== undefined && parent.ci === undefined;

    if (hasValidParent) {
      // Child: raw 0-indexed slot position, container/slot references.
      base.position = d.p;
      base.container_id = idByIndex[d.ci!]!;
      base.slot_id = d.si;
    } else {
      // Rack-level: human-U -> internal units.
      base.position = toInternalUnits(d.p);
    }
    return base;
  });
}

// =============================================================================
// Layout Conversion Functions
// =============================================================================

/**
 * Convert Layout to MinimalLayoutV2 (multi-rack)
 * Always encodes as v2 format, even for single-rack layouts.
 * Only includes device types that are actually placed in racks.
 */
export function toMinimalLayout(layout: Layout): MinimalLayoutV2 {
  if (layout.racks.length === 0) {
    throw new Error("Layout must have at least one rack");
  }

  // Build rack ID map: real UUID -> short sequential ID
  const rackIdMap = new Map<string, string>();
  layout.racks.forEach((rack, index) => {
    rackIdMap.set(rack.id, String(index));
  });

  // Collect used device type slugs from ALL racks (deduplicated)
  const usedSlugs = new Set<string>();
  for (const rack of layout.racks) {
    for (const device of rack.devices) {
      usedSlugs.add(device.device_type);
    }
  }

  // Validate all used slugs exist in device_types
  const availableSlugs = new Set(layout.device_types.map((t) => t.slug));
  const missingSlugs = [...usedSlugs].filter((s) => !availableSlugs.has(s));
  if (missingSlugs.length > 0) {
    throw new Error(
      `Cannot share layout: missing device types: ${missingSlugs.join(", ")}`,
    );
  }

  // Filter and convert device types (only used ones, deduplicated by slug)
  const dt: MinimalDeviceType[] = layout.device_types
    .filter((deviceType) => usedSlugs.has(deviceType.slug))
    .map((deviceType) => {
      const shareFit = shareSafeRackulaFit(deviceType);
      return {
        s: deviceType.slug,
        h: deviceType.u_height,
        ...(deviceType.manufacturer ? { mf: deviceType.manufacturer } : {}),
        ...(deviceType.model ? { m: deviceType.model } : {}),
        c: deviceType.colour,
        x: CATEGORY_TO_ABBREV[deviceType.category] ?? "o",
        // Container types carry their slot grid so children round-trip to real
        // slots (a child references slot_id, which must exist on the parent type).
        ...(deviceType.slots && deviceType.slots.length > 0
          ? {
              sl: deviceType.slots.map((s) => ({
                id: s.id,
                r: s.position.row,
                cl: s.position.col,
                ...(s.width_fraction !== undefined
                  ? { wf: s.width_fraction }
                  : {}),
                ...(s.height_units !== undefined ? { hu: s.height_units } : {}),
                ...(s.accepts && s.accepts.length > 0
                  ? {
                      a: s.accepts.map(
                        (category) => CATEGORY_TO_ABBREV[category],
                      ),
                    }
                  : {}),
              })),
            }
          : {}),
        ...(deviceType.slot_width !== undefined
          ? { sw: deviceType.slot_width }
          : {}),
        ...(deviceType.subdevice_role ? { sr: deviceType.subdevice_role } : {}),
        ...(deviceType.rack_widths ? { rw: deviceType.rack_widths } : {}),
        ...(deviceType.is_full_depth !== undefined
          ? { fd: deviceType.is_full_depth }
          : {}),
        ...(deviceType.front_image ? { fi: 1 as const } : {}),
        ...(deviceType.rear_image ? { ri: 1 as const } : {}),
        ...(shareFit ? { rf: shareFit } : {}),
        // V3 is self-contained: compact fields are authoritative, so a later
        // built-in registry change cannot alter or invalidate this link.
        o: 1 as const,
      };
    });

  // Convert all racks to MinimalRackV2
  const rs: MinimalRackV2[] = layout.racks.map((rack) => ({
    i: rackIdMap.get(rack.id)!,
    n: rack.name,
    h: rack.height,
    w: normalizeRackWidth(rack.width),
    ...(rack.profile ? { pf: rack.profile } : {}),
    ...(rack.profile !== RACKMATE_T1_PLUS_PROFILE && rack.depth_mm !== undefined
      ? { dp: rack.depth_mm }
      : {}),
    d: convertDevices(rack.devices),
  }));

  // Convert rack groups (if present)
  const rg: MinimalRackGroup[] | undefined =
    layout.rack_groups && layout.rack_groups.length > 0
      ? layout.rack_groups.map((group, groupIndex) => {
          const missingIds = group.rack_ids.filter((id) => !rackIdMap.has(id));
          if (missingIds.length > 0) {
            console.warn(
              `Share encode: rack group ${group.name ?? `#${groupIndex}`} references unknown rack IDs: ${missingIds.join(", ")}`,
            );
          }
          return {
            rs: group.rack_ids
              .map((id) => rackIdMap.get(id))
              .filter((id): id is string => id !== undefined),
            ...(group.name ? { n: group.name } : {}),
            ...(group.layout_preset ? { p: group.layout_preset } : {}),
          };
        })
      : undefined;

  return {
    v: layout.version,
    fv: SHARE_FORMAT_VERSION,
    n: layout.name,
    rs,
    ...(rg ? { rg } : {}),
    dt,
  };
}

/**
 * Convert v1 MinimalLayout (single rack) back to full Layout
 */
function fromMinimalLayoutV1(minimal: MinimalLayout): ConvertedShareLayout {
  const device_types = convertDeviceTypes(minimal.dt, false);
  const devices = convertMinimalDevices(minimal.r.d);
  const profile = resolveSharedRackProfile(minimal.r, true);

  const rack = createDefaultRack(
    minimal.r.n,
    minimal.r.h,
    normalizeRackWidth(minimal.r.w),
    "4-post-cabinet",
    false,
    1,
    true,
    generateId(),
    profile,
  );
  if (profile !== RACKMATE_T1_PLUS_PROFILE && minimal.r.dp !== undefined) {
    rack.depth_mm = minimal.r.dp;
  }
  rack.devices = devices;

  return {
    layout: {
      version: minimal.v,
      name: minimal.n,
      racks: [rack],
      device_types,
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    },
    legacyInferredRackMateRackIds: new Set(
      wasLegacyRackMateProfileInferred(minimal.r, profile) ? [rack.id] : [],
    ),
  };
}

/**
 * Convert v2 MinimalLayoutV2 (multi-rack) back to full Layout
 */
function fromMinimalLayoutV2(minimal: MinimalLayoutV2): ConvertedShareLayout {
  const isLegacyFormat = (minimal.fv ?? 1) < SHARE_FORMAT_VERSION;
  if (!isLegacyFormat) {
    const definedSlugs = new Set(minimal.dt.map((deviceType) => deviceType.s));
    const missingSlugs = new Set<string>();
    for (const rack of minimal.rs) {
      for (const device of rack.d) {
        if (!definedSlugs.has(device.t)) missingSlugs.add(device.t);
      }
    }
    if (missingSlugs.size > 0) {
      throw new Error(
        `Current share is missing device type definitions: ${[...missingSlugs].join(", ")}`,
      );
    }
  }
  const device_types = convertDeviceTypes(minimal.dt, !isLegacyFormat);

  // Build reverse map: shortId -> generated UUID
  const shortIdToUuid = new Map<string, string>();
  const legacyInferredRackMateRackIds = new Set<string>();

  const racks = minimal.rs.map((minRack) => {
    const rackId = generateId();
    shortIdToUuid.set(minRack.i, rackId);
    const profile = resolveSharedRackProfile(minRack, isLegacyFormat);
    if (wasLegacyRackMateProfileInferred(minRack, profile)) {
      legacyInferredRackMateRackIds.add(rackId);
    }

    const rack = createDefaultRack(
      minRack.n,
      minRack.h,
      normalizeRackWidth(minRack.w),
      "4-post-cabinet",
      false,
      1,
      true,
      rackId,
      profile,
    );
    if (profile !== RACKMATE_T1_PLUS_PROFILE && minRack.dp !== undefined) {
      rack.depth_mm = minRack.dp;
    }
    rack.devices = convertMinimalDevices(minRack.d);
    return rack;
  });

  // Convert rack groups (translate short IDs back to UUIDs)
  const rack_groups: RackGroup[] | undefined =
    minimal.rg && minimal.rg.length > 0
      ? minimal.rg.map((group, groupIndex) => {
          const unknownIds = group.rs.filter(
            (shortId) => !shortIdToUuid.has(shortId),
          );
          if (unknownIds.length > 0) {
            console.warn(
              `Share decode: rack group ${group.n ?? `#${groupIndex}`} references unknown short IDs: ${unknownIds.join(", ")}`,
            );
          }
          return {
            id: generateId(),
            rack_ids: group.rs
              .map((shortId) => shortIdToUuid.get(shortId))
              .filter((id): id is string => id !== undefined),
            ...(group.n ? { name: group.n } : {}),
            ...(group.p ? { layout_preset: group.p } : {}),
          };
        })
      : undefined;

  return {
    layout: {
      version: minimal.v,
      name: minimal.n,
      racks,
      ...(rack_groups ? { rack_groups } : {}),
      device_types,
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    },
    legacyInferredRackMateRackIds,
  };
}

// =============================================================================
// Encoding/Decoding Functions
// =============================================================================

/**
 * Base64url encode (URL-safe base64)
 */
export function base64UrlEncode(data: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize));
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Encode Layout to URL-safe compressed string
 * Always encodes as v2 format.
 * Returns null if encoding fails (e.g., empty racks, missing device types)
 */
export function encodeLayout(layout: Layout): string | null {
  try {
    // Sharing is a current-format authoring path. Validate the source at the
    // strict boundary before projecting it into the compact representation so
    // the encoder cannot publish legacy-only structures its decoder rejects.
    // Workspace identity metadata is intentionally partial and is never shared;
    // exclude it so an unsaved/browser-backed layout remains shareable.
    const { metadata: _metadata, ...shareableLayout } = layout;
    const currentLayout = LayoutSchema.parse(shareableLayout) as Layout;
    const minimal = toMinimalLayout(currentLayout);
    // Apply the same untrusted-collection bounds before publishing the link so
    // the app never generates a compact payload its own decoder will reject.
    const bounded = MinimalLayoutV2Schema.parse(minimal);
    const json = JSON.stringify(bounded);
    if (new TextEncoder().encode(json).length > MAX_DECOMPRESSED_BYTES) {
      throw new Error("Share link exceeds the decompressed size limit");
    }

    const encoded = LZString.compressToEncodedURIComponent(json);
    if (encoded.length > MAX_ENCODED_LENGTH) {
      throw new Error("Share link exceeds the encoded size limit");
    }
    return encoded;
  } catch (error) {
    console.warn("Share link encode failed:", error);
    return null;
  }
}

export interface DecodeResult {
  layout: Layout | null;
  error?: string;
}

function validateDecodedLayout(
  converted: ConvertedShareLayout,
  legacyFormat: boolean,
): DecodeResult {
  // Conversion already moved human-U positions into current internal units.
  // Legacy formats still need carrier adaptation and saved-data waivers. V3 is
  // authoritative current data and must pass strict validation unchanged.
  let candidate: Layout = { ...converted.layout, version: VERSION };
  if (legacyFormat) {
    candidate = adaptLegacyLayout(candidate);

    if (converted.legacyInferredRackMateRackIds.size > 0) {
      const uHeightBySlug = new Map(
        candidate.device_types.map((deviceType) => [
          deviceType.slug,
          deviceType.u_height,
        ]),
      );
      candidate = {
        ...candidate,
        racks: candidate.racks.map((rack) =>
          converted.legacyInferredRackMateRackIds.has(rack.id)
            ? {
                ...rack,
                devices: clampOverRackPositions(
                  rack.devices,
                  rack.height,
                  uHeightBySlug,
                ),
              }
            : rack,
        ),
      };
    }
  }

  const result = legacyFormat
    ? LegacyShareLayoutSchema.safeParse(candidate)
    : LayoutSchema.safeParse(candidate);
  if (!result.success) {
    console.warn("Share link layout validation failed:", result.error);
    return { layout: null, error: "Layout format is invalid or outdated" };
  }

  return { layout: result.data as Layout };
}

/**
 * Maximum length of an encoded `?l=` value accepted by decodeLayout, in
 * characters. Checked before any base64 decode or decompression so a crafted
 * link cannot spend CPU/memory inflating before being rejected.
 *
 * Kept small on purpose: lz-string (the primary format) has no streaming decode,
 * so it fully materializes its output before we can measure it. Capping the
 * input is the only way to bound that transient, and lz-string's ratio against
 * crafted repetitive input climbs past 2000:1. 64 KB stays well above the
 * largest realistic layout (an extreme 100-rack/4200-device layout encodes to
 * ~35 KB; normal links are a few KB) while keeping the worst-case lz-string
 * transient far below the unbounded status quo.
 */
export const MAX_ENCODED_LENGTH = 64 * 1024;

/**
 * Maximum number of decompressed bytes accepted by decodeLayout. Bounds the
 * decompression-bomb surface: inflation aborts once output exceeds this. Chosen
 * comfortably above any real layout (which serialize to well under 1 MB).
 */
export const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;

/**
 * Inflate a pako/gzip payload to a string, aborting if output exceeds
 * MAX_DECOMPRESSED_BYTES. Uses an incremental Inflate instance so a high-ratio
 * payload cannot buffer its entire output before the cap is enforced.
 * Throws on malformed input or when the size ceiling is exceeded.
 */
function inflateBounded(compressed: Uint8Array): string {
  const inflator = new pako.Inflate();
  // pako 3.x emits Uint8Array chunks. Count decompressed bytes directly (the
  // chunk's byte length) so the ceiling is enforced in the same unit as
  // MAX_DECOMPRESSED_BYTES; a character count would under-measure multi-byte
  // UTF-8. Decode with a single streaming TextDecoder so a multi-byte sequence
  // split across a chunk boundary is reassembled correctly.
  const decoder = new TextDecoder();
  let result = "";
  let byteLength = 0;

  inflator.onData = (chunk: Uint8Array) => {
    byteLength += chunk.length;
    if (byteLength > MAX_DECOMPRESSED_BYTES) {
      // Throw from the chunk callback to abort pako's inflate loop early, so a
      // high-ratio payload cannot finish inflating its full output.
      throw new Error("Decompressed share link exceeds size limit");
    }
    result += decoder.decode(chunk, { stream: true });
  };

  inflator.push(compressed, true);

  if (inflator.err) {
    throw new Error(inflator.msg || "Failed to inflate share link");
  }
  // Flush any bytes the streaming decoder buffered from a trailing partial
  // sequence. Those bytes were already counted above, so no further check.
  result += decoder.decode();
  return result;
}

/**
 * Decode URL-safe compressed string to Layout
 * Supports both v1 (single rack) and v2 (multi-rack) formats.
 * Detects version by field presence: `r` = v1, `rs` = v2.
 * Returns DecodeResult with layout and optional error context.
 */
export function decodeLayout(encoded: string): DecodeResult {
  try {
    // Reject over-length input before any base64 decode or decompression so a
    // crafted link cannot spend CPU/memory inflating before being rejected.
    if (encoded.length > MAX_ENCODED_LENGTH) {
      return { layout: null, error: "Share link is too large" };
    }

    // Try lz-string first (new format); returns null for legacy pako-encoded URLs
    let json = LZString.decompressFromEncodedURIComponent(encoded);

    if (json) {
      // Guard the lz-string output too: it is also attacker-controlled.
      if (new TextEncoder().encode(json).length > MAX_DECOMPRESSED_BYTES) {
        return { layout: null, error: "Share link is too large" };
      }
    } else {
      // Fall back to pako for URLs encoded before the lz-string migration.
      // inflateBounded aborts if output exceeds the decompressed ceiling.
      const compressed = base64UrlDecode(encoded);
      json = inflateBounded(compressed);
    }
    const parsed = JSON.parse(json);

    // Detect v1 vs v2 by field presence
    if ("rs" in parsed) {
      const result = MinimalLayoutV2Schema.safeParse(parsed);
      if (!result.success) {
        console.warn("Share link v2 validation failed:", result.error);
        return { layout: null, error: "Layout format is invalid or outdated" };
      }
      const legacyFormat = (result.data.fv ?? 1) < SHARE_FORMAT_VERSION;
      return validateDecodedLayout(
        fromMinimalLayoutV2(result.data),
        legacyFormat,
      );
    }

    // v1 fallback
    const result = MinimalLayoutSchema.safeParse(parsed);
    if (!result.success) {
      console.warn("Share link v1 validation failed:", result.error);
      return { layout: null, error: "Layout format is invalid or outdated" };
    }
    return validateDecodedLayout(fromMinimalLayoutV1(result.data), true);
  } catch (error) {
    console.warn("Share link decode failed:", error);
    return { layout: null, error: "Could not decode share link" };
  }
}

// =============================================================================
// URL Helper Functions
// =============================================================================

/**
 * Generate full share URL for a layout
 * Returns null if encoding fails
 */
export function generateShareUrl(layout: Layout): string | null {
  const encoded = encodeLayout(layout);
  if (!encoded) return null;

  const baseUrl =
    typeof window !== "undefined"
      ? window.location.origin + window.location.pathname
      : "https://app.racku.la/";
  return `${baseUrl}?l=${encoded}`;
}

/**
 * Get share parameter from current URL
 * Returns null if not present
 */
export function getShareParam(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("l");
}

/**
 * Clear share parameter from URL without reload
 * Uses history.replaceState to update URL cleanly
 */
export function clearShareParam(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("l");
  window.history.replaceState({}, "", url.toString());
}
