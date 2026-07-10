/**
 * Public Device Action Flows for Layout Store
 *
 * Extracted from layout.svelte.ts — multi-step device flows that build
 * commands directly (rather than delegating to a single recorded action):
 * duplication, container placement, and cross-rack moves.
 *
 * Snapshot functions are injected because $state.snapshot() is a Svelte
 * rune that must be called from a .svelte.ts file (the facade).
 */

import type { DeviceFace, PlacedDevice } from "$lib/types";
import { UNITS_PER_U } from "$lib/types/constants";
import {
  canPlaceDevice,
  canPlaceInContainer,
  canMoveRackAssemblyToRack,
  findEmptyAutoCarrierAfterChildMove,
  findExistingContainerPlacement,
  findValidDropPositions,
  findNextSlotForChild,
  getPlacedAssemblyDepthMm,
  getProspectiveRackAfterDeviceMove,
  isContainerChild,
  requiresCarrier,
  resolveSynthesizedCarrierPlacement,
  synthesizeCarrierForDevice,
} from "$lib/utils/collision";
import { findDeviceType as findDeviceTypeInArray } from "$lib/stores/layout-helpers";
import { findDeviceType } from "$lib/utils/device-lookup";
import { isDeviceCompatibleWithRackWidth } from "$lib/utils/deviceFilters";
import { generateId } from "$lib/utils/device";
import { toInternalUnits } from "$lib/utils/position";
import { instantiatePorts } from "$lib/utils/port-utils";
import {
  createPlaceDeviceCommand,
  createAddDeviceTypeCommand,
  createBatchCommand,
  createCrossRackDevicesTransitionCommand,
  createDuplicateDeviceAssemblyCommand,
  createMoveToSlotCommand,
  createRackDevicesTransitionCommand,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getRackById } from "./rack-actions";
import {
  moveDeviceRecorded,
  placeDeviceRecorded,
} from "./recorded-device-actions";

/** Snapshot function injected by the facade ($state.snapshot is a rune). */
export type SnapshotDeviceFn = (device: PlacedDevice) => PlacedDevice;

function clonePortsWithFreshIds(
  device: PlacedDevice,
  deviceType: ReturnType<typeof findDeviceType>,
): PlacedDevice["ports"] {
  return device.ports
    ? device.ports.map((port) => ({ ...port, id: generateId() }))
    : deviceType
      ? instantiatePorts(deviceType)
      : undefined;
}

function withoutDeviceIds(
  devices: PlacedDevice[],
  ids: ReadonlySet<string>,
): PlacedDevice[] {
  return devices.filter((device) => !ids.has(device.id));
}

/**
 * Duplicate a placed device within a rack
 * Places the duplicate in the next available slot on the same face
 * Inherits all properties (custom label, image overrides, colour)
 * Uses undo/redo system for reverting the operation
 * @param ctx - Layout state access
 * @param rackId - Rack ID containing the device
 * @param deviceIndex - Index of the device in rack's devices array
 * @param snapshotDevice - Snapshot function (deep-clones the reactive proxy)
 * @returns The duplicated device or error message
 */
export function duplicateDevice(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
  snapshotDevice: SnapshotDeviceFn,
): { error?: string; device?: PlacedDevice } {
  const layout = ctx.getLayout();
  const sourceRack = layout.racks.find((r) => r.id === rackId);
  if (!sourceRack) {
    return { error: "Rack not found" };
  }

  if (deviceIndex < 0 || deviceIndex >= sourceRack.devices.length) {
    return { error: "Device not found" };
  }

  const sourceDevice = sourceRack.devices[deviceIndex]!;
  if (isContainerChild(sourceDevice)) {
    return {
      error: "Contained devices must be duplicated through their carrier",
    };
  }

  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    sourceDevice.device_type,
  );
  if (!deviceType) {
    return { error: "Device type not found" };
  }

  const children = sourceRack.devices.filter(
    (candidate) => candidate.container_id === sourceDevice.id,
  );
  const assemblyDepth = getPlacedAssemblyDepthMm(
    sourceRack,
    layout.device_types,
    sourceDevice,
  );
  const validPositions = findValidDropPositions(
    sourceRack,
    layout.device_types,
    deviceType.u_height,
    sourceDevice.face,
    deviceType,
  ).filter((position) =>
    canPlaceDevice(
      sourceRack,
      layout.device_types,
      deviceType.u_height,
      position,
      undefined,
      sourceDevice.face,
      undefined,
      deviceType,
      assemblyDepth,
    ),
  );

  if (validPositions.length === 0) {
    return { error: "Cannot duplicate: no available space in rack" };
  }

  // Prefer adjacent slot (above or below the source device)
  // Device positions and heights are in internal units
  const heightInternal = toInternalUnits(deviceType.u_height);
  const adjacentAbove = sourceDevice.position + heightInternal;
  const adjacentBelow = sourceDevice.position - heightInternal;

  let targetPosition: number;

  // Check if adjacent above is valid
  if (validPositions.includes(adjacentAbove)) {
    targetPosition = adjacentAbove;
  } else if (
    adjacentBelow >= UNITS_PER_U &&
    validPositions.includes(adjacentBelow)
  ) {
    // Check if adjacent below is valid (and within rack bounds - U1 = UNITS_PER_U)
    targetPosition = adjacentBelow;
  } else {
    // Fall back to first available position
    targetPosition = validPositions[0]!;
  }

  // Create the duplicate device with new ID but inherited properties
  // Use the injected snapshot to deep-clone the reactive proxy and avoid linked state
  const duplicatedDevice: PlacedDevice = {
    ...snapshotDevice(sourceDevice),
    id: generateId(),
    position: targetPosition,
    ports: clonePortsWithFreshIds(sourceDevice, deviceType),
    // Don't copy container_id - duplicates are independent rack-level devices
    container_id: undefined,
    slot_id: undefined,
  };

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Use the undo/redo system via placeDeviceRaw and history
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = deviceType.model ?? deviceType.slug;
  const duplicatedChildren = children.map((child) => {
    const childType = findDeviceType(child.device_type, layout.device_types);
    return {
      ...snapshotDevice(child),
      id: generateId(),
      container_id: duplicatedDevice.id,
      ports: clonePortsWithFreshIds(child, childType),
    };
  });
  const beforeDevices = sourceRack.devices.map(snapshotDevice);
  const command = createDuplicateDeviceAssemblyCommand(
    rackId,
    beforeDevices,
    [...beforeDevices, duplicatedDevice, ...duplicatedChildren],
    [
      { sourceId: sourceDevice.id, targetId: duplicatedDevice.id },
      ...children.map((child, index) => ({
        sourceId: child.id,
        targetId: duplicatedChildren[index]!.id,
      })),
    ],
    adapter,
    deviceName,
    layout.metadata?.id ?? "",
  );
  history.execute(command);
  ctx.markDirty();

  return { device: duplicatedDevice };
}

/**
 * Place a device inside a container slot
 * Uses undo/redo support via command pattern
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug
 * @param containerId - ID of the container device
 * @param slotId - Slot within the container
 * @param position - 0-indexed position within the container
 * @returns true if placed successfully
 */
export function placeInContainer(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  containerId: string,
  slotId: string,
  position: number,
): boolean {
  // Validate rack exists
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;

  // Set active rack so Raw functions target the correct rack
  ctx.setActiveRackId(rackId);

  // Find container device
  const container = targetRack.devices.find((d) => d.id === containerId);
  if (!container) return false;

  const layout = ctx.getLayout();

  // Find device types
  const containerType = findDeviceType(
    container.device_type,
    layout.device_types,
  );
  const childType = findDeviceType(deviceTypeSlug, layout.device_types);

  if (!containerType || !childType) return false;

  // Check collision within container
  if (
    !canPlaceInContainer(
      targetRack,
      layout.device_types,
      container,
      containerType,
      childType,
      slotId,
      position,
    )
  ) {
    return false;
  }

  // Create placed device with container reference
  const placedDevice: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position, // 0-indexed within container
    face: container.face, // Inherit parent face
    container_id: containerId,
    slot_id: slotId,
    ports: instantiatePorts(childType),
  };

  // Use command for undo/redo
  const deviceName = childType.model ?? childType.slug;
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const autoImport =
    childType && !layout.device_types.find((dt) => dt.slug === deviceTypeSlug)
      ? childType
      : undefined;
  const placeCommand = createPlaceDeviceCommand(
    placedDevice,
    adapter,
    deviceName,
  );

  if (autoImport) {
    const importCommand = createAddDeviceTypeCommand(autoImport, adapter);
    const batch = createBatchCommand(`Place ${deviceName}`, [
      importCommand,
      placeCommand,
    ]);
    history.execute(batch);
  } else {
    history.execute(placeCommand);
  }
  ctx.markDirty();

  return true;
}

/**
 * Move a contained child to the next free, fitting cell of its own carrier.
 *
 * Cycles the child through the carrier's cells (wrapping around) without ever
 * detaching it: container_id is preserved and only slot_id changes, so the
 * contained-device guard (#2146) holds by construction. No-op (returns false)
 * when the device is not a carrier child or the carrier has no other reachable
 * cell.
 *
 * @param ctx - Layout state access
 * @param rackId - Rack containing the child and its carrier
 * @param deviceIndex - Index of the child in the rack's devices array
 * @returns true if the child moved to a new cell
 */
export function moveDeviceToSlot(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceIndex: number,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= targetRack.devices.length) return false;

  const child = targetRack.devices[deviceIndex]!;
  if (!child.container_id || !child.slot_id) return false;

  const layout = ctx.getLayout();
  const childType = findDeviceType(child.device_type, layout.device_types);
  if (!childType) return false;

  const container = targetRack.devices.find((d) => d.id === child.container_id);
  if (!container) return false;
  const containerType = findDeviceType(
    container.device_type,
    layout.device_types,
  );
  if (!containerType) return false;

  const siblings = targetRack.devices.filter(
    (d) => d.container_id === container.id && d.id !== child.id,
  );

  const next = findNextSlotForChild(
    containerType,
    childType,
    child.slot_id,
    siblings,
    { rackWidth: targetRack.width },
  );
  if (!next) return false;

  ctx.setActiveRackId(rackId);
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = childType.model ?? childType.slug;

  history.execute(
    createMoveToSlotCommand(
      deviceIndex,
      container.id,
      child.slot_id,
      next.slotId,
      adapter,
      deviceName,
    ),
  );
  ctx.markDirty();
  return true;
}

/**
 * Place a device carrier-first.
 *
 * Half-width gear cannot register to the rails directly. This flow:
 * 1. Devices with no applicable carrier (full-width) fall through to a normal
 *    rail placement.
 * 2. Otherwise it prefers an existing carrier of the right kind at the target U
 *    that has a free cell, and fills that cell.
 * 3. Failing that, it synthesises a carrier (marked auto_created) at the target
 *    U and places the device in its first cell, as a single undo entry.
 *
 * @param ctx - Layout state access
 * @param rackId - Target rack ID
 * @param deviceTypeSlug - Device type slug being placed
 * @param positionU - U position (human-readable)
 * @param face - Optional face assignment for the rail-placement fall-through
 * @returns true if placed successfully
 */
export function placeDeviceSmart(
  ctx: LayoutStateAccess,
  rackId: string,
  deviceTypeSlug: string,
  positionU: number,
  face?: DeviceFace,
): boolean {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return false;

  const layout = ctx.getLayout();
  const deviceType = findDeviceType(deviceTypeSlug, layout.device_types);
  if (!deviceType) return false;
  if (!isDeviceCompatibleWithRackWidth(deviceType, targetRack.width)) {
    return false;
  }

  const positionInternal = toInternalUnits(positionU);
  const needsContainer = requiresCarrier(deviceType, targetRack.width);
  const existingPlacement = needsContainer
    ? findExistingContainerPlacement(
        targetRack,
        layout.device_types,
        deviceType,
        positionInternal,
        face,
      )
    : null;
  if (existingPlacement) {
    return placeInContainer(
      ctx,
      rackId,
      deviceTypeSlug,
      existingPlacement.containerId,
      existingPlacement.slotId,
      existingPlacement.position,
    );
  }

  const carrierSlug = synthesizeCarrierForDevice(deviceType, targetRack.width);

  // Whole-U full-width devices mount directly to the rails.
  if (!carrierSlug) {
    return placeDeviceRecorded(ctx, rackId, deviceTypeSlug, positionU, face);
  }

  ctx.setActiveRackId(rackId);

  // Synthesise a new carrier and place the child inside it.
  const carrierType = findDeviceType(carrierSlug, layout.device_types);
  if (!carrierType) return false;
  const free = resolveSynthesizedCarrierPlacement(
    targetRack,
    layout.device_types,
    deviceType,
    carrierType,
    positionInternal,
  );
  if (!free) return false;

  const carrierDevice: PlacedDevice = {
    id: generateId(),
    device_type: carrierSlug,
    position: positionInternal,
    face: "both",
    auto_created: true,
    ports: instantiatePorts(carrierType),
  };

  const childDevice: PlacedDevice = {
    id: generateId(),
    device_type: deviceTypeSlug,
    position: free.position,
    face: carrierDevice.face,
    container_id: carrierDevice.id,
    slot_id: free.slotId,
    ports: instantiatePorts(deviceType),
  };

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const childName = deviceType.model ?? deviceType.slug;

  const commands = [];

  // Auto-import the carrier and child types if not already in the layout.
  const carrierImport = !layout.device_types.find(
    (dt) => dt.slug === carrierSlug,
  )
    ? createAddDeviceTypeCommand(carrierType, adapter)
    : undefined;
  if (carrierImport) commands.push(carrierImport);

  const childImport = !layout.device_types.find(
    (dt) => dt.slug === deviceTypeSlug,
  )
    ? createAddDeviceTypeCommand(deviceType, adapter)
    : undefined;
  if (childImport) commands.push(childImport);

  commands.push(createPlaceDeviceCommand(carrierDevice, adapter, "Carrier"));
  commands.push(createPlaceDeviceCommand(childDevice, adapter, childName));

  history.execute(createBatchCommand(`Place ${childName}`, commands));
  ctx.markDirty();

  return true;
}

/** Move an existing placement into a container without changing its identity. */
export function moveDeviceIntoContainer(
  ctx: LayoutStateAccess,
  fromRackId: string,
  sourceIndex: number,
  targetRackId: string,
  containerId: string,
  slotId: string,
  position: number,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, targetRackId);
  if (!sourceRack || !targetRack) return false;
  const sourceDevice = sourceRack.devices[sourceIndex];
  if (!sourceDevice) return false;

  const layout = ctx.getLayout();
  const childType = findDeviceType(
    sourceDevice.device_type,
    layout.device_types,
  );
  const container = targetRack.devices.find(
    (device) => device.id === containerId,
  );
  const containerType = container
    ? findDeviceType(container.device_type, layout.device_types)
    : undefined;
  if (!childType || !container || !containerType) return false;
  if (
    !canPlaceInContainer(
      targetRack,
      layout.device_types,
      container,
      containerType,
      childType,
      slotId,
      position,
      fromRackId === targetRackId ? sourceDevice.id : undefined,
    )
  ) {
    return false;
  }
  if (
    fromRackId !== targetRackId &&
    targetRack.devices.some((device) => device.id === sourceDevice.id)
  ) {
    return false;
  }

  const movedDevice: PlacedDevice = {
    ...snapshotDevice(sourceDevice),
    position,
    face: container.face,
    container_id: container.id,
    slot_id: slotId,
  };
  if (
    fromRackId === targetRackId &&
    sourceDevice.container_id === movedDevice.container_id &&
    sourceDevice.slot_id === movedDevice.slot_id &&
    sourceDevice.position === movedDevice.position &&
    sourceDevice.face === movedDevice.face
  ) {
    return true;
  }

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);
  const deviceName = childType.model ?? childType.slug;
  const emptySourceCarrier = findEmptyAutoCarrierAfterChildMove(
    sourceRack,
    sourceDevice,
    container.id,
  );
  const removedSourceIds = new Set([
    sourceDevice.id,
    ...(emptySourceCarrier ? [emptySourceCarrier.id] : []),
  ]);
  const transitionOptions = emptySourceCarrier
    ? {
        removedImageDevices: [snapshotDevice(emptySourceCarrier)],
        layoutId: layout.metadata?.id ?? "",
      }
    : undefined;
  let command;

  if (fromRackId === targetRackId) {
    const beforeDevices = sourceRack.devices.map(snapshotDevice);
    const afterDevices = beforeDevices
      .filter((device) => device.id !== emptySourceCarrier?.id)
      .map((device) => (device.id === sourceDevice.id ? movedDevice : device));
    command = createRackDevicesTransitionCommand(
      sourceRack.id,
      beforeDevices,
      afterDevices,
      adapter,
      `Move ${deviceName} into carrier`,
      "MOVE_DEVICE",
      transitionOptions,
    );
  } else {
    const sourceBefore = sourceRack.devices.map(snapshotDevice);
    const targetBefore = targetRack.devices.map(snapshotDevice);
    command = createCrossRackDevicesTransitionCommand(
      sourceRack.id,
      sourceBefore,
      withoutDeviceIds(sourceBefore, removedSourceIds),
      targetRack.id,
      targetBefore,
      [...targetBefore, movedDevice],
      adapter,
      `Move ${deviceName} into carrier`,
      transitionOptions,
    );
  }

  history.execute(command);
  ctx.markDirty();
  return true;
}

/** Move an existing carried device onto rails via a new synthesized carrier. */
export function moveDeviceWithSmartCarrier(
  ctx: LayoutStateAccess,
  fromRackId: string,
  sourceIndex: number,
  targetRackId: string,
  positionU: number,
  face: DeviceFace | undefined,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, targetRackId);
  const sourceDevice = sourceRack?.devices[sourceIndex];
  if (!sourceRack || !targetRack || !sourceDevice) return false;

  const layout = ctx.getLayout();
  const childType = findDeviceType(
    sourceDevice.device_type,
    layout.device_types,
  );
  if (!childType || childType.slots?.length) return false;
  const targetPosition = toInternalUnits(positionU);
  const existing = findExistingContainerPlacement(
    targetRack,
    layout.device_types,
    childType,
    targetPosition,
    face,
    fromRackId === targetRackId ? sourceDevice.id : undefined,
  );
  if (existing) {
    return moveDeviceIntoContainer(
      ctx,
      fromRackId,
      sourceIndex,
      targetRackId,
      existing.containerId,
      existing.slotId,
      existing.position,
      snapshotDevice,
    );
  }

  const carrierSlug = synthesizeCarrierForDevice(childType, targetRack.width);
  const carrierType = carrierSlug
    ? findDeviceType(carrierSlug, layout.device_types)
    : undefined;
  if (!carrierSlug || !carrierType) return false;
  const prospectiveTargetRack =
    fromRackId === targetRackId
      ? getProspectiveRackAfterDeviceMove(targetRack, sourceDevice.id)
      : targetRack;
  const placement = resolveSynthesizedCarrierPlacement(
    prospectiveTargetRack,
    layout.device_types,
    childType,
    carrierType,
    targetPosition,
    undefined,
  );
  if (!placement) return false;

  const carrier: PlacedDevice = {
    id: generateId(),
    device_type: carrierSlug,
    position: targetPosition,
    face: "both",
    auto_created: true,
    ports: instantiatePorts(carrierType),
  };
  const movedChild: PlacedDevice = {
    ...snapshotDevice(sourceDevice),
    position: placement.position,
    face: carrier.face,
    container_id: carrier.id,
    slot_id: placement.slotId,
  };

  const adapter = getCommandStoreAdapter(ctx);
  const childName = childType.model ?? childType.slug;
  const emptySourceCarrier = findEmptyAutoCarrierAfterChildMove(
    sourceRack,
    sourceDevice,
    carrier.id,
  );
  const removedSourceIds = new Set([
    sourceDevice.id,
    ...(emptySourceCarrier ? [emptySourceCarrier.id] : []),
  ]);
  const transitionOptions = emptySourceCarrier
    ? {
        removedImageDevices: [snapshotDevice(emptySourceCarrier)],
        layoutId: layout.metadata?.id ?? "",
      }
    : undefined;
  let moveCommand;
  if (sourceRack.id === targetRack.id) {
    const before = sourceRack.devices.map(snapshotDevice);
    moveCommand = createRackDevicesTransitionCommand(
      sourceRack.id,
      before,
      [...withoutDeviceIds(before, removedSourceIds), carrier, movedChild],
      adapter,
      `Move ${childName} into carrier`,
      "MOVE_DEVICE",
      transitionOptions,
    );
  } else {
    const sourceBefore = sourceRack.devices.map(snapshotDevice);
    const targetBefore = targetRack.devices.map(snapshotDevice);
    if (targetBefore.some((device) => device.id === sourceDevice.id)) {
      return false;
    }
    moveCommand = createCrossRackDevicesTransitionCommand(
      sourceRack.id,
      sourceBefore,
      withoutDeviceIds(sourceBefore, removedSourceIds),
      targetRack.id,
      targetBefore,
      [...targetBefore, carrier, movedChild],
      adapter,
      `Move ${childName} into carrier`,
      transitionOptions,
    );
  }

  const carrierImport = !layout.device_types.some(
    (deviceType) => deviceType.slug === carrierSlug,
  )
    ? createAddDeviceTypeCommand(carrierType, adapter)
    : undefined;
  ctx
    .getHistory()
    .execute(
      carrierImport
        ? createBatchCommand(`Move ${childName} into carrier`, [
            carrierImport,
            moveCommand,
          ])
        : moveCommand,
    );
  ctx.markDirty();
  return true;
}

/**
 * Move a device from one rack to another
 * Supports both within-rack moves (delegates to moveDeviceRecorded) and cross-rack moves.
 * @param ctx - Layout state access
 * @param fromRackId - Source rack ID
 * @param deviceIndex - Device index in the source rack
 * @param toRackId - Target rack ID
 * @param newPosition - New position in U (human-readable)
 * @param face - Optional face assignment
 * @param snapshotDevice - Snapshot function (deep-clones the reactive proxy)
 * @returns true if moved successfully
 */
export function moveDeviceToRack(
  ctx: LayoutStateAccess,
  fromRackId: string,
  deviceIndex: number,
  toRackId: string,
  newPosition: number,
  face: DeviceFace | undefined,
  snapshotDevice: SnapshotDeviceFn,
): boolean {
  // Same-rack move — delegate to existing function (face bundled into single undo entry)
  if (fromRackId === toRackId) {
    return moveDeviceRecorded(
      ctx,
      fromRackId,
      deviceIndex,
      newPosition,
      face,
      snapshotDevice,
    );
  }

  // Cross-rack move
  const sourceRack = getRackById(ctx, fromRackId);
  const targetRack = getRackById(ctx, toRackId);
  if (!sourceRack || !targetRack) return false;
  if (deviceIndex < 0 || deviceIndex >= sourceRack.devices.length) return false;

  const layout = ctx.getLayout();
  const device = sourceRack.devices[deviceIndex]!;
  const deviceType = findDeviceTypeInArray(
    layout.device_types,
    device.device_type,
  );
  if (!deviceType) return false;

  // Resolve face: use provided face, or infer from device type
  const effectiveFace: DeviceFace =
    face ??
    (deviceType.is_full_depth !== false ? "both" : (device.face ?? "front"));
  const positionInternal = toInternalUnits(newPosition);

  if (
    !canMoveRackAssemblyToRack(
      sourceRack,
      targetRack,
      layout.device_types,
      deviceIndex,
      newPosition,
      effectiveFace,
    )
  ) {
    return false;
  }

  const children = sourceRack.devices.filter(
    (child) => child.container_id === device.id,
  );
  const deviceName = deviceType.model ?? deviceType.slug;
  const sourceBefore = sourceRack.devices.map(snapshotDevice);
  const targetBefore = targetRack.devices.map(snapshotDevice);
  const parentSnapshot = snapshotDevice(device);
  const childrenSnapshots = children.map(snapshotDevice);
  const movedParent: PlacedDevice = {
    ...parentSnapshot,
    position: positionInternal,
    face: effectiveFace,
    container_id: undefined,
    slot_id: undefined,
  };
  const movedChildren = childrenSnapshots.map((child) => ({
    ...child,
    face: effectiveFace,
  }));
  const movingIds = new Set([
    movedParent.id,
    ...movedChildren.map((child) => child.id),
  ]);
  if (targetBefore.some((candidate) => movingIds.has(candidate.id))) {
    return false;
  }

  const emptySourceCarrier = findEmptyAutoCarrierAfterChildMove(
    sourceRack,
    device,
  );
  const sourceRemovalIds = new Set([
    ...movingIds,
    ...(emptySourceCarrier ? [emptySourceCarrier.id] : []),
  ]);
  const adapter = getCommandStoreAdapter(ctx);
  const command = createCrossRackDevicesTransitionCommand(
    sourceRack.id,
    sourceBefore,
    withoutDeviceIds(sourceBefore, sourceRemovalIds),
    targetRack.id,
    targetBefore,
    [...targetBefore, movedParent, ...movedChildren],
    adapter,
    `Move ${deviceName} to another rack`,
    emptySourceCarrier
      ? {
          removedImageDevices: [snapshotDevice(emptySourceCarrier)],
          layoutId: layout.metadata?.id ?? "",
        }
      : undefined,
  );

  ctx.getHistory().execute(command);
  ctx.markDirty();
  return true;
}
