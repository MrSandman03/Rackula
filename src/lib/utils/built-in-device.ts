import type { DeviceType, Slot } from "$lib/types";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { findRegisteredBrandDevice } from "$lib/data/brandPacks/registry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findBuiltInDeviceType(slug: string): DeviceType | undefined {
  return findStarterDevice(slug) ?? findRegisteredBrandDevice(slug);
}

function hydrateSlots(
  embedded: Slot[] | undefined,
  canonical: Slot[] | undefined,
): Slot[] | undefined {
  if (!embedded) return canonical;
  if (!canonical) return embedded;

  const canonicalById = new Map(canonical.map((slot) => [slot.id, slot]));
  return embedded.map((slot) => {
    const builtInSlot = canonicalById.get(slot.id);
    if (!builtInSlot) return slot;
    return {
      ...builtInSlot,
      ...slot,
      position: { ...builtInSlot.position, ...slot.position },
      accepts: slot.accepts ?? builtInSlot.accepts,
    };
  });
}

function hydrateCustomFields(
  embedded: DeviceType["custom_fields"],
  canonical: DeviceType["custom_fields"],
): DeviceType["custom_fields"] {
  if (!embedded) return canonical;
  if (!canonical) return embedded;

  const canonicalFit = canonical.rackula_fit;
  const embeddedFit = embedded.rackula_fit;
  const mergedFit = isRecord(canonicalFit)
    ? isRecord(embeddedFit)
      ? { ...canonicalFit, ...embeddedFit }
      : canonicalFit
    : embeddedFit;

  return {
    ...canonical,
    ...embedded,
    ...(mergedFit !== undefined ? { rackula_fit: mergedFit } : {}),
  };
}

/**
 * Restore fields omitted by compact share/device snapshots without replacing
 * explicit embedded values. This keeps custom display overrides intact while
 * retaining canonical fit, width, depth, and slot-acceptance constraints.
 */
export function hydrateBuiltInDeviceType(embedded: DeviceType): DeviceType {
  const canonical = findBuiltInDeviceType(embedded.slug);
  if (!canonical) return embedded;

  return {
    ...canonical,
    ...embedded,
    rack_widths: embedded.rack_widths ?? canonical.rack_widths,
    is_full_depth: embedded.is_full_depth ?? canonical.is_full_depth,
    slot_width: embedded.slot_width ?? canonical.slot_width,
    subdevice_role: embedded.subdevice_role ?? canonical.subdevice_role,
    slots: hydrateSlots(embedded.slots, canonical.slots),
    custom_fields: hydrateCustomFields(
      embedded.custom_fields,
      canonical.custom_fields,
    ),
  };
}
