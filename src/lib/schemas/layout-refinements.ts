/** Cross-layout refinement rules kept separate from schema construction. */

import { z } from "../zod";
import type { RefinementCtx } from "zod";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  allowsFractionalRailPosition,
  requiresCarrier,
} from "$lib/utils/carrier-rules";
import {
  effectiveSlotHeightUnits,
  getDeviceDimensionsMm,
  getSlotFitIssues,
  SLOT_DIMENSION_TOLERANCE_MM,
} from "$lib/utils/slot-fit";
import { findBuiltInDeviceType } from "$lib/utils/built-in-device";
import { isDeviceCompatibleWithRackWidth } from "$lib/utils/rack-width";
import type { DeviceType, Layout, Slot } from "$lib/types";
import { validateSlugUniqueness } from "./primitives";

type LayoutRefinementData = Omit<Layout, "version"> & {
  version?: string;
};

/**
 * Prior releases treated every omitted-height slot as the full container
 * height, including mixed explicit/omitted grids. Keep that interpretation
 * only while validating children already present in a saved layout; runtime
 * placement and geometry continue to use the corrected row heights.
 */
function slotForPriorReleaseOmittedHeightLayoutValidation(
  slot: Slot,
  containerType: Pick<DeviceType, "u_height" | "slots">,
): Slot {
  if (slot.height_units !== undefined) return slot;

  return { ...slot, height_units: containerType.u_height };
}

export function addLayoutRefinementIssues(
  data: LayoutRefinementData,
  ctx: RefinementCtx,
  allowPriorReleaseFit: boolean,
): void {
  // Validate at least one rack is present
  if (!data.racks || data.racks.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one rack is required",
      path: ["racks"],
    });
    return; // Can't continue validation without racks
  }

  // === Rack ID uniqueness validation (#472) ===
  const rackIdCounts = new Map<string, number>();
  for (const rack of data.racks) {
    rackIdCounts.set(rack.id, (rackIdCounts.get(rack.id) ?? 0) + 1);
  }
  const duplicateRackIds = [...rackIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  if (duplicateRackIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate rack IDs: ${duplicateRackIds.join(", ")}`,
      path: ["racks"],
    });
  }

  // Validate device type slug uniqueness
  const duplicates = validateSlugUniqueness(data.device_types);
  if (duplicates.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Duplicate device type slugs: ${duplicates.join(", ")}`,
      path: ["device_types"],
    });
  }

  // Build rack lookup for group validations
  const rackById = new Map(data.racks.map((r) => [r.id, r]));

  // Validate rack_groups reference existing racks
  if (data.rack_groups && data.rack_groups.length > 0) {
    const validRackIds = new Set(data.racks.map((r) => r.id));
    for (
      let groupIndex = 0;
      groupIndex < data.rack_groups.length;
      groupIndex++
    ) {
      const group = data.rack_groups[groupIndex]!;
      const invalidIds = group.rack_ids.filter((id) => !validRackIds.has(id));
      if (invalidIds.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Rack group "${group.name ?? group.id}" references non-existent rack IDs: ${invalidIds.join(", ")}`,
          path: ["rack_groups", groupIndex, "rack_ids"],
        });
        continue; // Skip height validation for groups with invalid refs
      }

      // === Bayed group height validation (#472) ===
      // Bayed groups require all racks to have the same height
      if (group.layout_preset === "bayed") {
        const rackHeights = group.rack_ids.map(
          (id) => rackById.get(id)?.height,
        );
        const firstHeight = rackHeights[0];
        const mixedHeights = rackHeights.some((h) => h !== firstHeight);

        if (mixedHeights) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Bayed rack group "${group.name ?? group.id}" requires all racks to have the same height`,
            path: ["rack_groups", groupIndex],
          });
        }
      }
    }
  }

  // === Container validation (v0.6.0) ===
  // Build lookup maps for efficient validation
  const deviceTypeBySlug = new Map(
    data.device_types.map((dt) => [dt.slug, dt]),
  );
  const resolveDeviceType = (slug: string) =>
    deviceTypeBySlug.get(slug) ?? findBuiltInDeviceType(slug);

  // Check each rack's devices for container relationships
  for (let rackIndex = 0; rackIndex < data.racks.length; rackIndex++) {
    const rack = data.racks[rackIndex]!;
    const deviceById = new Map(rack.devices.map((d) => [d.id, d]));

    // Track which (container_id, slot_id) cells are already claimed so two
    // children cannot share one cell.
    const claimedCells = new Set<string>();

    for (
      let deviceIndex = 0;
      deviceIndex < rack.devices.length;
      deviceIndex++
    ) {
      const device = rack.devices[deviceIndex]!;
      const placedType = resolveDeviceType(device.device_type);
      if (!placedType) {
        if (!allowPriorReleaseFit) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Device "${device.name ?? device.id}" has no device type definition for "${device.device_type}".`,
            path: ["racks", rackIndex, "devices", deviceIndex, "device_type"],
          });
        }
        continue;
      }

      // === Carrier-first rail enforcement (rack-level devices, #2158/C4) ===
      // A device that registers directly to the rails must mount at a whole-U
      // boundary, and only full-width whole-U gear may do so. Sub-U,
      // non-integer-height, or half-width gear must sit inside a carrier. Blank
      // filler panels are exempt: a blank may rail-mount at any height.
      if (!device.container_id) {
        const railType = placedType;
        const canUseFractionalRail =
          railType &&
          allowsFractionalRailPosition(railType, rack.width) &&
          device.position % Math.round(railType.u_height * UNITS_PER_U) === 0;

        // Rail positions are stored in internal units (U * UNITS_PER_U).
        if (device.position % UNITS_PER_U !== 0 && !canUseFractionalRail) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Device "${device.name ?? device.id}" is at a fractional rail position. Rail-mounted devices must sit at a whole-U boundary.`,
            path: ["racks", rackIndex, "devices", deviceIndex, "position"],
          });
        }

        if (railType) {
          if (requiresCarrier(railType, rack.width)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" is sub-U or half-width and cannot mount directly to the rails. It must be a child of a carrier (set container_id and slot_id).`,
              path: [
                "racks",
                rackIndex,
                "devices",
                deviceIndex,
                "container_id",
              ],
            });
          }
        }
        continue;
      }

      // 1. Validate container_id references an existing device in this rack
      const container = deviceById.get(device.container_id);
      if (!container) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" references non-existent container "${device.container_id}"`,
          path: ["racks", rackIndex, "devices", deviceIndex, "container_id"],
        });
        continue; // Skip further container validation for this device
      }

      // 2. Validate the container's DeviceType has slots
      const containerType = resolveDeviceType(container.device_type);
      if (!containerType) {
        // DeviceType doesn't exist - this would be caught by other validation
        continue;
      }

      if (!containerType.slots || containerType.slots.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" is placed in container "${container.name ?? container.id}" but container's device type "${container.device_type}" has no slots`,
          path: ["racks", rackIndex, "devices", deviceIndex, "container_id"],
        });
        continue;
      }

      // 3. Validate slot_id exists in the container's DeviceType.slots
      const slotById = new Map(containerType.slots.map((s) => [s.id, s]));
      if (!device.slot_id || !slotById.has(device.slot_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" references invalid slot "${device.slot_id}" in container "${container.name ?? container.id}". Valid slots: ${[...slotById.keys()].join(", ")}`,
          path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
        });
      } else {
        // 3a. One child per cell: a (container, slot) pair holds at most one child.
        const cellKey = `${device.container_id}::${device.slot_id}`;
        if (claimedCells.has(cellKey)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Slot "${device.slot_id}" in container "${container.name ?? container.id}" is already occupied. Each cell holds one child.`,
            path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
          });
        } else {
          claimedCells.add(cellKey);
        }

        // 3b. Child must fit its cell (height_units / width_fraction).
        const slot = slotById.get(device.slot_id)!;
        const slotForLayoutValidation = allowPriorReleaseFit
          ? slotForPriorReleaseOmittedHeightLayoutValidation(
              slot,
              containerType,
            )
          : slot;
        const childForFit = placedType;
        if (childForFit) {
          if (
            !allowPriorReleaseFit &&
            !isDeviceCompatibleWithRackWidth(childForFit, rack.width)
          ) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" is not compatible with a ${rack.width}-inch rack.`,
              path: ["racks", rackIndex, "devices", deviceIndex, "device_type"],
            });
          }

          for (const issue of getSlotFitIssues(
            childForFit,
            slotForLayoutValidation,
            {
              rackWidth: rack.width,
              containerHeightUnits: containerType.u_height,
              containerSlots: containerType.slots,
            },
          )) {
            // Physical-height enforcement was added after v26.6.6. Keep the
            // baseline-era category, logical height/width, and physical-width
            // checks at saved-data ingress, while current authoring stays strict.
            if (allowPriorReleaseFit && issue.code === "physical_height") {
              continue;
            }
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" does not fit slot "${device.slot_id}": ${issue.message}`,
              path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
            });
          }

          const slotHeight = effectiveSlotHeightUnits(slotForLayoutValidation, {
            containerHeightUnits: containerType.u_height,
            containerSlots: containerType.slots,
          });
          if (device.position + childForFit.u_height > slotHeight) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Device "${device.name ?? device.id}" extends outside slot "${device.slot_id}" (${device.position}U + ${childForFit.u_height}U > ${slotHeight}U cell).`,
              path: ["racks", rackIndex, "devices", deviceIndex, "slot_id"],
            });
          }
        }
      }

      // 4. Validate no nested containers (single-level nesting only)
      const childType = placedType;
      if (childType && childType.slots && childType.slots.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" is a container (has slots) but is placed inside another container. Single-level nesting only.`,
          path: ["racks", rackIndex, "devices", deviceIndex, "device_type"],
        });
      }
    }

    if (rack.profile === "rackmate-t1-plus" && !allowPriorReleaseFit) {
      const invalidDeviceIndexes = new Set<number>();
      const assemblyDepth = (
        device: (typeof rack.devices)[number],
        visited = new Set<string>(),
      ): number | undefined => {
        if (visited.has(device.id)) return undefined;
        visited.add(device.id);
        const type = resolveDeviceType(device.device_type);
        let depth = type ? getDeviceDimensionsMm(type)?.depth : undefined;
        for (const child of rack.devices) {
          if (child.container_id !== device.id) continue;
          const childDepth = assemblyDepth(child, visited);
          if (childDepth !== undefined) {
            depth =
              depth === undefined ? childDepth : Math.max(depth, childDepth);
          }
        }
        return depth;
      };
      const rootDevices = rack.devices
        .map((device, index) => ({ device, index }))
        .filter(({ device }) => !device.container_id);
      const maxRackTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);

      for (const { device, index } of rootDevices) {
        const type = resolveDeviceType(device.device_type);
        if (!type) continue;
        const dimensions = getDeviceDimensionsMm(type);
        const top =
          device.position + Math.round(type.u_height * UNITS_PER_U) - 1;
        const depth = assemblyDepth(device);
        if (
          !isDeviceCompatibleWithRackWidth(type, rack.width) ||
          (dimensions?.width !== undefined &&
            dimensions.width >
              rack.width * 25.4 + SLOT_DIMENSION_TOLERANCE_MM) ||
          top > maxRackTop ||
          (depth !== undefined &&
            rack.depth_mm !== undefined &&
            depth > rack.depth_mm)
        ) {
          invalidDeviceIndexes.add(index);
        }
      }

      for (let left = 0; left < rootDevices.length; left++) {
        const a = rootDevices[left]!;
        const typeA = resolveDeviceType(a.device.device_type);
        if (!typeA) continue;
        const bottomA = a.device.position;
        const topA = bottomA + Math.round(typeA.u_height * UNITS_PER_U) - 1;
        const faceA = typeA.is_full_depth !== false ? "both" : a.device.face;

        for (let right = left + 1; right < rootDevices.length; right++) {
          const b = rootDevices[right]!;
          const typeB = resolveDeviceType(b.device.device_type);
          if (!typeB) continue;
          const bottomB = b.device.position;
          const topB = bottomB + Math.round(typeB.u_height * UNITS_PER_U) - 1;
          if (bottomA > topB || bottomB > topA) continue;

          const faceB = typeB.is_full_depth !== false ? "both" : b.device.face;
          const facesCollide =
            faceA === "both" || faceB === "both" || faceA === faceB;
          const depthA = assemblyDepth(a.device);
          const depthB = assemblyDepth(b.device);
          const depthsCollide =
            !facesCollide &&
            depthA !== undefined &&
            depthB !== undefined &&
            rack.depth_mm !== undefined &&
            depthA + depthB > rack.depth_mm;
          if (facesCollide || depthsCollide) {
            invalidDeviceIndexes.add(a.index);
            invalidDeviceIndexes.add(b.index);
          }
        }
      }

      for (const deviceIndex of invalidDeviceIndexes) {
        const device = rack.devices[deviceIndex]!;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Device "${device.name ?? device.id}" does not fit the RackMate T1 Plus profile at its saved position.`,
          path: ["racks", rackIndex, "devices", deviceIndex],
        });
      }
    }
  }
}
