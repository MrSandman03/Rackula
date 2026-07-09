/**
 * Collision Detection System
 * Functions for device placement validation
 *
 * Container Hierarchy Rules:
 * - Container devices collide at rack level (they occupy space)
 * - Child devices (container_id set) are EXCLUDED from rack-level collision
 * - Child devices collide ONLY within their container (same container_id)
 * - Child position is 0-indexed relative to container bottom
 */

import type {
  DeviceType,
  DeviceFace,
  PlacedDevice,
  Rack,
  Slot,
} from "$lib/types";
import {
  UNITS_PER_U,
  heightToInternalUnits,
  toInternalUnits,
} from "$lib/utils/position";
import { findDeviceType } from "$lib/utils/device-lookup";
import { effectiveFace } from "./effective-face";
import {
  allowsFractionalRailPosition,
  requiresCarrier as deviceRequiresCarrier,
} from "./carrier-rules";
import {
  getDeviceDimensionsMm,
  getDeviceDepthMm,
  getSlotFitIssues,
  effectiveSlotHeightUnits,
  rackWidthToMillimetres,
  SLOT_DIMENSION_TOLERANCE_MM,
  type SlotFitContext,
} from "./slot-fit";
import { isDeviceCompatibleWithRackWidth } from "./deviceFilters";
export {
  allowsFractionalRailPosition,
  CARRIER_2COL_SLUG,
  CARRIER_2X2_SLUG,
  CARRIER_2U_2COL_SLUG,
  isNativeRackWidthDevice,
  requiresCarrier,
  synthesizeCarrierForDevice,
  requiresChassisBay,
} from "./carrier-rules";

function isDeviceType(value: unknown): value is DeviceType {
  return (
    !!value &&
    typeof value === "object" &&
    "slug" in value &&
    "u_height" in value &&
    "category" in value
  );
}

/**
 * Check if a placed device is a container child
 * Container children have container_id set and are excluded from rack-level collision
 */
export function isContainerChild(device: PlacedDevice): boolean {
  return device.container_id !== undefined;
}

/**
 * Range of U positions occupied by a device
 */
export interface URange {
  bottom: number;
  top: number;
}

/**
 * Get the range occupied by a device at a given position in internal units.
 * For rack-level devices, position is in internal units (6 = U1).
 * For container children, use getContainerChildRange instead.
 *
 * @param position - Bottom position in internal units (e.g., 6 for U1)
 * @param heightU - Device height in U (e.g., 2 for a 2U device)
 * @returns Range of internal unit positions {bottom, top}
 */
export function getDeviceURange(position: number, heightU: number): URange {
  const heightInternal = heightToInternalUnits(heightU);
  return {
    bottom: position,
    top: position + heightInternal - 1,
  };
}

/**
 * Get the range occupied by a container child device.
 * Container children use 0-indexed positions relative to the container,
 * and do NOT use the internal unit system.
 *
 * @param position - 0-indexed position from container bottom
 * @param heightU - Device height in U
 * @returns Range of positions {bottom, top}
 */
function getContainerChildRange(position: number, heightU: number): URange {
  return {
    bottom: position,
    top: position + heightU - 1,
  };
}

/**
 * Check if two U ranges overlap
 * @param rangeA - First range
 * @param rangeB - Second range
 * @returns true if ranges overlap (including edge touch)
 */
export function doRangesOverlap(rangeA: URange, rangeB: URange): boolean {
  // Ranges overlap if one starts before or at the other's end
  // and ends after or at the other's start
  return rangeA.bottom <= rangeB.top && rangeA.top >= rangeB.bottom;
}

/**
 * Check if two device faces would collide
 *
 * Face is authoritative for collision detection:
 * - 'both' always collides with everything
 * - Same face always collides
 * - Opposite explicit faces (front/rear) never collide
 *
 * @param faceA - First device face ('front', 'rear', or 'both')
 * @param faceB - Second device face ('front', 'rear', or 'both')
 * @returns true if devices on these faces would collide
 */
export function doFacesCollide(faceA: DeviceFace, faceB: DeviceFace): boolean {
  // 'both' collides with everything
  if (faceA === "both" || faceB === "both") {
    return true;
  }
  // Same face always collides
  if (faceA === faceB) {
    return true;
  }
  // Opposite explicit faces never collide (face is authoritative)
  return false;
}

function doDepthsCollide(
  rackDepthMm: number | undefined,
  depthA: number | undefined,
  depthB: number | undefined,
): boolean {
  if (depthA === undefined || depthB === undefined) return false;
  if (rackDepthMm === undefined) return false;
  return depthA + depthB > rackDepthMm;
}

/** Resolve the deepest known member of a placed parent/child assembly. */
export function getPlacedAssemblyDepthMm(
  rack: Rack,
  deviceLibrary: DeviceType[],
  placedDevice: PlacedDevice,
  visited = new Set<string>(),
): number | undefined {
  if (visited.has(placedDevice.id)) return undefined;
  visited.add(placedDevice.id);

  const placedType = findDeviceType(placedDevice.device_type, deviceLibrary);
  let depth = placedType ? getDeviceDepthMm(placedType) : undefined;

  for (const child of rack.devices) {
    if (child.container_id !== placedDevice.id) continue;
    const childDepth = getPlacedAssemblyDepthMm(
      rack,
      deviceLibrary,
      child,
      visited,
    );
    if (childDepth !== undefined) {
      depth = depth === undefined ? childDepth : Math.max(depth, childDepth);
    }
  }

  return depth;
}

/**
 * Validate a rail-level cross-rack move, including every direct child carried
 * by the selected device. The drag preview and the store both use this helper
 * so they cannot disagree about target width, slot fit, or assembly depth.
 */
export function canMoveRackAssemblyToRack(
  sourceRack: Rack,
  targetRack: Rack,
  deviceLibrary: DeviceType[],
  deviceIndex: number,
  newPositionU: number,
  face?: DeviceFace,
): boolean {
  const device = sourceRack.devices[deviceIndex];
  if (!device) return false;

  const deviceType = findDeviceType(device.device_type, deviceLibrary);
  if (!deviceType || deviceRequiresCarrier(deviceType, targetRack.width)) {
    return false;
  }

  const targetFace: DeviceFace =
    face ??
    (deviceType.is_full_depth !== false ? "both" : (device.face ?? "front"));
  const children = sourceRack.devices.filter(
    (child) => child.container_id === device.id,
  );

  for (const child of children) {
    const childType = findDeviceType(child.device_type, deviceLibrary);
    if (
      !childType ||
      !isDeviceCompatibleWithRackWidth(childType, targetRack.width)
    ) {
      return false;
    }

    const declaredSlot = child.slot_id
      ? deviceType.slots?.find((slot) => slot.id === child.slot_id)
      : undefined;
    const destinationSlot: Slot = declaredSlot ?? {
      id: "assembly-width",
      position: { row: 0, col: 0 },
      width_fraction: 1,
      height_units: deviceType.u_height,
    };
    const slotContext: SlotFitContext = {
      rackWidth: targetRack.width,
      containerHeightUnits: deviceType.u_height,
      containerSlots: deviceType.slots,
    };

    if (!canPlaceInSlot(childType, destinationSlot, slotContext)) {
      return false;
    }
    if (
      declaredSlot &&
      child.position + childType.u_height >
        effectiveSlotHeightUnits(declaredSlot, slotContext)
    ) {
      return false;
    }
  }

  return canPlaceDevice(
    targetRack,
    deviceLibrary,
    deviceType.u_height,
    toInternalUnits(newPositionU),
    undefined,
    targetFace,
    undefined,
    deviceType,
    getPlacedAssemblyDepthMm(sourceRack, deviceLibrary, device),
  );
}

function getTargetAssemblyDepthMm(
  rack: Rack,
  deviceLibrary: DeviceType[],
  targetDeviceType: DeviceType | undefined,
  excludeIndex?: number,
): number | undefined {
  if (!targetDeviceType) return undefined;

  const ownDepth = getDeviceDepthMm(targetDeviceType);
  const placedTarget =
    excludeIndex !== undefined ? rack.devices[excludeIndex] : undefined;
  if (!placedTarget || placedTarget.device_type !== targetDeviceType.slug) {
    return ownDepth;
  }

  const assemblyDepth = getPlacedAssemblyDepthMm(
    rack,
    deviceLibrary,
    placedTarget,
  );
  if (assemblyDepth === undefined) return ownDepth;
  return ownDepth === undefined
    ? assemblyDepth
    : Math.max(ownDepth, assemblyDepth);
}

function doPlacedDevicesCollideByFaceAndDepth(
  rack: Rack,
  faceA: DeviceFace,
  deviceA: DeviceType | undefined,
  depthA: number | undefined,
  faceB: DeviceFace,
  deviceB: DeviceType | undefined,
  depthB: number | undefined,
): boolean {
  const effectiveA = deviceA ? effectiveFace({ face: faceA }, deviceA) : faceA;
  const effectiveB = deviceB ? effectiveFace({ face: faceB }, deviceB) : faceB;
  if (doFacesCollide(effectiveA, effectiveB)) return true;
  return doDepthsCollide(rack.depth_mm, depthA, depthB);
}

/**
 * Check if a device can be placed at a given position (rack-level placement)
 *
 * Container children (devices with container_id set) are excluded from rack-level
 * collision detection. They exist in a separate collision space within their container.
 *
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetPosition - Target bottom position in internal units (e.g., 6 for U1)
 * @param excludeIndex - Optional index in rack.devices to exclude (for move operations)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @returns true if placement is valid
 */
export function canPlaceDevice(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetPosition: number,
  excludeIndex?: number,
  targetFace: DeviceFace = "front",
  legacyDepthOrDeviceType?: unknown,
  deviceTypeArg?: DeviceType,
  targetAssemblyDepthMm?: number,
): boolean {
  const targetDeviceType = isDeviceType(legacyDepthOrDeviceType)
    ? legacyDepthOrDeviceType
    : deviceTypeArg;

  if (
    targetDeviceType &&
    !isDeviceCompatibleWithRackWidth(targetDeviceType, rack.width)
  ) {
    return false;
  }

  const targetWidthMm = targetDeviceType
    ? getDeviceDimensionsMm(targetDeviceType)?.width
    : undefined;
  const rackWidthMm = rackWidthToMillimetres(rack.width);
  if (
    targetWidthMm !== undefined &&
    rackWidthMm !== undefined &&
    targetWidthMm > rackWidthMm + SLOT_DIMENSION_TOLERANCE_MM
  ) {
    return false;
  }

  const targetDepthMm =
    targetAssemblyDepthMm ??
    getTargetAssemblyDepthMm(
      rack,
      deviceLibrary,
      targetDeviceType,
      excludeIndex,
    );
  if (
    targetDepthMm !== undefined &&
    rack.depth_mm !== undefined &&
    targetDepthMm > rack.depth_mm
  ) {
    return false;
  }

  // Position must be >= UNITS_PER_U (U1 in internal units)
  if (targetPosition < UNITS_PER_U) {
    return false;
  }

  // Rail-mounted devices normally register on a whole-U boundary
  // (carrier-first, #2158). Native 0.5U RackMate accessories are physical rack
  // parts and may sit on half-U rail positions in a 10-inch RackMate.
  const canUseFractionalRail =
    targetDeviceType &&
    allowsFractionalRailPosition(targetDeviceType, rack.width) &&
    targetPosition % heightToInternalUnits(targetDeviceType.u_height) === 0;
  if (!isWholeURailPosition(targetPosition) && !canUseFractionalRail) {
    return false;
  }

  // Device must fit within rack height (convert rack height to internal units)
  // A device at position P with height H occupies P to P + H*UNITS_PER_U - 1
  // For a rack of height N, the max valid top is the top of UN = N*UNITS_PER_U + (UNITS_PER_U - 1)
  const topPosition = targetPosition + heightToInternalUnits(deviceHeight) - 1;
  const maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);
  if (topPosition > maxValidTop) {
    return false;
  }

  // Check for collisions with existing devices
  const newRange = getDeviceURange(targetPosition, deviceHeight);

  for (let i = 0; i < rack.devices.length; i++) {
    // Skip the excluded device (for move operations)
    if (excludeIndex !== undefined && i === excludeIndex) {
      continue;
    }

    const placedDevice = rack.devices[i]!;

    // Skip container children - they don't participate in rack-level collision
    if (isContainerChild(placedDevice)) {
      continue;
    }

    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (device) {
      const existingRange = getDeviceURange(
        placedDevice.position,
        device.u_height,
      );
      // Check U range overlap AND face collision.
      // Use effectiveFace so full-depth devices collide on both faces.
      if (
        doRangesOverlap(newRange, existingRange) &&
        doPlacedDevicesCollideByFaceAndDepth(
          rack,
          targetFace,
          targetDeviceType,
          targetDepthMm,
          placedDevice.face,
          device,
          getPlacedAssemblyDepthMm(rack, deviceLibrary, placedDevice),
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Find devices that would collide with a new device at given position (rack-level)
 *
 * Container children are excluded from rack-level collision detection.
 *
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param newDeviceHeight - Height of new device
 * @param newPosition - Target position
 * @param excludeIndex - Optional index in rack.devices to exclude (for move operations)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @returns Array of colliding PlacedDevices (only rack-level devices, not container children)
 */
export function findCollisions(
  rack: Rack,
  deviceLibrary: DeviceType[],
  newDeviceHeight: number,
  newPosition: number,
  excludeIndex?: number,
  targetFace: DeviceFace = "front",
  targetDeviceType?: DeviceType,
): PlacedDevice[] {
  const collisions: PlacedDevice[] = [];
  const newRange = getDeviceURange(newPosition, newDeviceHeight);
  const targetDepthMm = getTargetAssemblyDepthMm(
    rack,
    deviceLibrary,
    targetDeviceType,
    excludeIndex,
  );

  rack.devices.forEach((placedDevice, index) => {
    // Skip the excluded device (for move operations)
    if (excludeIndex !== undefined && index === excludeIndex) {
      return;
    }

    // Skip container children - they don't participate in rack-level collision
    if (isContainerChild(placedDevice)) {
      return;
    }

    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (device) {
      const existingRange = getDeviceURange(
        placedDevice.position,
        device.u_height,
      );
      // Check U range overlap AND face collision.
      // Use effectiveFace so full-depth devices collide on both faces.
      if (
        doRangesOverlap(newRange, existingRange) &&
        doPlacedDevicesCollideByFaceAndDepth(
          rack,
          targetFace,
          targetDeviceType,
          targetDepthMm,
          placedDevice.face,
          device,
          getPlacedAssemblyDepthMm(rack, deviceLibrary, placedDevice),
        )
      ) {
        collisions.push(placedDevice);
      }
    }
  });

  return collisions;
}

/**
 * Find all valid positions where a device of given height can be placed
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetFace - Optional face to place device on (default: 'front')
 * @returns Array of valid bottom positions in internal units, sorted ascending
 */
export function findValidDropPositions(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetFace: DeviceFace = "front",
  deviceType?: DeviceType,
): number[] {
  const validPositions: number[] = [];

  // Check each possible position in internal units
  // Start at U1 (UNITS_PER_U) and go up to the max position where device fits
  // Max valid top = rack.height * UNITS_PER_U + (UNITS_PER_U - 1)
  // Max valid bottom = maxValidTop - deviceHeightInternal + 1
  const deviceHeightInternal = heightToInternalUnits(deviceHeight);
  const maxValidTop = rack.height * UNITS_PER_U + (UNITS_PER_U - 1);
  const maxPosition = maxValidTop - deviceHeightInternal + 1;

  for (let position = UNITS_PER_U; position <= maxPosition; position++) {
    if (
      canPlaceDevice(
        rack,
        deviceLibrary,
        deviceHeight,
        position,
        undefined,
        targetFace,
        undefined,
        deviceType,
      )
    ) {
      validPositions.push(position);
    }
  }

  return validPositions;
}

/**
 * Convert Y coordinate to internal unit position
 * @param y - Y coordinate (0 at top of rack SVG)
 * @param rackHeight - Total rack height in U
 * @param uHeight - Height of one U in pixels
 * @returns Position in internal units (e.g., 6 for U1)
 */
function yToInternalPosition(
  y: number,
  rackHeight: number,
  uHeight: number,
): number {
  // SVG has y=0 at top, U=1 at bottom
  // First get U position, then convert to internal units
  const uPosition = rackHeight - Math.floor(y / uHeight);
  return uPosition * UNITS_PER_U;
}

/**
 * Snap to the nearest valid drop position
 * @param rack - The rack to check
 * @param deviceLibrary - The device library
 * @param deviceHeight - Height of device to place (in U)
 * @param targetY - Target Y coordinate in pixels
 * @param uHeight - Height of one U in pixels
 * @returns Nearest valid position in internal units, or null if no valid positions
 */
export function snapToNearestValidPosition(
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetY: number,
  uHeight: number,
): number | null {
  const validPositions = findValidDropPositions(
    rack,
    deviceLibrary,
    deviceHeight,
  );

  if (validPositions.length === 0) {
    return null;
  }

  // Convert target Y to approximate internal unit position
  const targetPosition = yToInternalPosition(targetY, rack.height, uHeight);

  // Find the closest valid position
  let closestPosition = validPositions[0]!;
  let closestDistance = Math.abs(targetPosition - closestPosition);

  for (const position of validPositions) {
    const distance = Math.abs(targetPosition - position);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestPosition = position;
    }
  }

  return closestPosition;
}

/**
 * Check if a device type fits within a slot's dimensions and category restrictions.
 * Validates that the child device's width and height fit within the slot,
 * and that the device category is allowed by the slot (if slot.accepts is defined).
 *
 * slot_width mapping:
 * - 1 = half-width device (requires width_fraction >= 0.5)
 * - 2 = full-width device (requires width_fraction >= 1.0)
 * - Default (2) = full width device
 *
 * @param childType - The device type to place
 * @param slot - The target slot
 * @returns true if device fits and is allowed, false otherwise
 */
export function canPlaceInSlot(
  childType: DeviceType,
  slot: Slot,
  context: SlotFitContext = {},
): boolean {
  return getSlotFitIssues(childType, slot, context).length === 0;
}

/**
 * Whether an internal-unit position sits on a whole-U rail boundary. Rails
 * register equipment at whole-U boundaries only, so a rail position is always a
 * multiple of UNITS_PER_U (carrier-first, #2158). This mirrors the schema rule
 * (LayoutSchema.superRefine) so the store rejects a fractional rail position at
 * the place/move chokepoint rather than letting it through to an opaque
 * save-time failure. Container (sub-U) children use 0-indexed positions and are
 * checked through canPlaceInContainer, never this predicate.
 *
 * @param positionInternal - Rail position in internal units (e.g., 6 for U1)
 * @returns true when the position is a whole-U boundary
 */
export function isWholeURailPosition(positionInternal: number): boolean {
  return positionInternal % UNITS_PER_U === 0;
}

/**
 * The first free cell in a container, scanning slots in definition order.
 * Slots are listed bottom-row-first in the starter library, so iterating in
 * order fills the bottom row before the upper row of a 2x2 carrier. Each cell
 * holds at most one child, so a slot with any child is considered occupied.
 *
 * @param containerType - The container DeviceType (with slots[])
 * @param children - Placed children already in this container
 * @returns The first free { slotId, position } or null when every cell is full
 */
export function findNextFreeChildPosition(
  containerType: DeviceType,
  children: PlacedDevice[],
): { slotId: string; position: number } | null {
  const slots = containerType.slots ?? [];
  const occupied = new Set(
    children.map((child) => child.slot_id).filter((id): id is string => !!id),
  );

  for (const slot of slots) {
    if (!occupied.has(slot.id)) {
      return { slotId: slot.id, position: 0 };
    }
  }

  return null;
}

/**
 * The next cell a contained child can move to within its own carrier, scanning
 * forward from the child's current slot and wrapping around. Skips cells the
 * child does not fit (width/height/category) and cells already taken by a
 * sibling. Returns null when no other reachable cell exists, so the caller can
 * hide the control rather than run a no-op.
 *
 * The child stays inside the same carrier (container_id is unchanged): this is
 * a cell shuffle, never an eject, so the contained-device guard (#2146) is
 * honoured by construction. Each cell holds one child, so position is always 0.
 *
 * @param containerType - The carrier DeviceType (with slots[])
 * @param childType - The DeviceType of the contained child
 * @param currentSlotId - The slot the child currently occupies
 * @param siblings - Other children already in this carrier (excluding the child)
 * @returns The next free, fitting { slotId } or null when none is reachable
 */
export function findNextSlotForChild(
  containerType: DeviceType,
  childType: DeviceType,
  currentSlotId: string,
  siblings: PlacedDevice[],
  context: SlotFitContext = {},
): { slotId: string } | null {
  const slots = containerType.slots ?? [];
  const currentIndex = slots.findIndex((s) => s.id === currentSlotId);
  if (currentIndex === -1) return null;

  const occupied = new Set(
    siblings.map((s) => s.slot_id).filter((id): id is string => !!id),
  );

  // Scan forward from the slot after the current one, wrapping around. The
  // current slot is excluded (it is the cell the child already sits in).
  for (let offset = 1; offset < slots.length; offset++) {
    const slot = slots[(currentIndex + offset) % slots.length]!;
    if (occupied.has(slot.id)) continue;
    if (
      !canPlaceInSlot(childType, slot, {
        ...context,
        containerHeightUnits: containerType.u_height,
        containerSlots: slots,
      })
    ) {
      continue;
    }
    return { slotId: slot.id };
  }

  return null;
}

/**
 * Check if a device can be placed inside a container at a specific slot and position
 *
 * Container children:
 * - Position is 0-indexed relative to container bottom
 * - Must fit within container height
 * - Only collide with siblings in the same container AND same slot
 * - Inherit face from parent container
 *
 * @param rack - The rack containing the container
 * @param deviceLibrary - The layout's device types; sibling types are resolved
 *   through the global lookup path (layout, starter pack, brand packs)
 * @param container - The parent container PlacedDevice
 * @param containerType - The DeviceType of the container
 * @param childType - The DeviceType of the child device to place
 * @param targetSlotId - The slot ID within the container
 * @param targetPosition - Target position (0-indexed from container bottom)
 * @param excludeDeviceId - Optional device ID to exclude (for move operations)
 * @returns true if placement is valid
 */
export function canPlaceInContainer(
  rack: Rack,
  deviceLibrary: DeviceType[],
  container: PlacedDevice,
  containerType: DeviceType,
  childType: DeviceType,
  targetSlotId: string,
  targetPosition: number,
  excludeDeviceId?: string,
): boolean {
  // Position must be >= 0 (0-indexed within container)
  if (targetPosition < 0) {
    return false;
  }

  // Validate target slot exists and check dimension fit
  const targetSlot = containerType.slots?.find((s) => s.id === targetSlotId);
  if (!targetSlot) {
    return false;
  }

  if (!isDeviceCompatibleWithRackWidth(childType, rack.width)) {
    return false;
  }

  // Child position is relative to the selected slot. It may start above the
  // slot bottom only if the full device remains inside that cell.
  if (
    targetPosition + childType.u_height >
    effectiveSlotHeightUnits(targetSlot, {
      containerHeightUnits: containerType.u_height,
      containerSlots: containerType.slots,
    })
  ) {
    return false;
  }

  // Check if child device dimensions fit within the slot
  if (
    !canPlaceInSlot(childType, targetSlot, {
      rackWidth: rack.width,
      containerHeightUnits: containerType.u_height,
      containerSlots: containerType.slots,
    })
  ) {
    return false;
  }

  const containerIndex = rack.devices.findIndex(
    (device) => device.id === container.id,
  );
  if (containerIndex === -1) return false;

  const existingAssemblyDepth = getPlacedAssemblyDepthMm(
    rack,
    deviceLibrary,
    container,
  );
  const childDepth = getDeviceDepthMm(childType);
  const targetAssemblyDepth =
    existingAssemblyDepth === undefined
      ? childDepth
      : childDepth === undefined
        ? existingAssemblyDepth
        : Math.max(existingAssemblyDepth, childDepth);

  // Revalidate the parent at its rail position using the prospective assembly
  // depth. This rejects a child that is too deep by itself or that would make a
  // front/rear pair exceed the rack depth.
  if (
    !canPlaceDevice(
      rack,
      deviceLibrary,
      containerType.u_height,
      container.position,
      containerIndex,
      container.face,
      undefined,
      containerType,
      targetAssemblyDepth,
    )
  ) {
    return false;
  }

  // Find all sibling devices in the same container and slot
  // Container children use 0-indexed positions, not internal units
  const newRange = getContainerChildRange(targetPosition, childType.u_height);

  for (const device of rack.devices) {
    // Only check devices in the same container
    if (device.container_id !== container.id) {
      continue;
    }

    // Skip the device being moved
    if (excludeDeviceId !== undefined && device.id === excludeDeviceId) {
      continue;
    }

    // Only check devices in the same slot
    if (device.slot_id !== targetSlotId) {
      continue;
    }

    // Get the sibling's device type for height. Resolve through the global
    // lookup path so siblings whose types live only in the starter pack or
    // brand packs (for example a loaded layout without embedded types) are
    // still checked. Fail closed if the type cannot be resolved at all.
    const siblingType = findDeviceType(device.device_type, deviceLibrary);
    if (!siblingType) {
      return false;
    }

    // Container children use 0-indexed positions, not internal units
    const existingRange = getContainerChildRange(
      device.position,
      siblingType.u_height,
    );

    // Check for U range overlap within the slot
    if (doRangesOverlap(newRange, existingRange)) {
      return false;
    }
  }

  return true;
}
