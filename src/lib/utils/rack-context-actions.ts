/**
 * Rack Context Menu Actions
 * Factory for context menu handlers, extracted from Rack.svelte.
 */

import type { Rack as RackType, DeviceType } from "$lib/types";
import type { getLayoutStore } from "$lib/stores/layout.svelte";
import type { getSelectionStore } from "$lib/stores/selection.svelte";
import type { getToastStore } from "$lib/stores/toast.svelte";
import { toHumanUnits, toInternalUnits } from "$lib/utils/position";
import { canPlaceDevice } from "$lib/utils/collision";
import { effectiveFace } from "$lib/utils/effective-face";
import {
  canMoveDeviceToNextSlot,
  flipDeviceFaceAt,
} from "$lib/actions/selection-actions";
import { handleDelete as openDeleteConfirmation } from "$lib/utils/dialog-actions";

/** Identifies a right-clicked device and the screen position for the context menu. */
export interface ContextMenuTarget {
  rackId: string;
  /** Stable placement identity captured when the menu opens. */
  deviceId: string;
  /** Roster index at menu-open time; actions resolve the live index by ID. */
  deviceIndex: number;
  /** Screen X coordinate for menu positioning. */
  x: number;
  /** Screen Y coordinate for menu positioning. */
  y: number;
}

/** Actions available from the rack device context menu. */
export interface RackContextActions {
  /** Select the device for editing in the side panel. */
  handleEdit(rack: RackType, target: ContextMenuTarget): void;
  /** Duplicate the device at the next available position. */
  handleDuplicate(rack: RackType, target: ContextMenuTarget): void;
  /** Move the device one U-position upward. */
  handleMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): void;
  /** Move the device one U-position downward. */
  handleMoveDown(rack: RackType, target: ContextMenuTarget): void;
  /** Toggle the device's mounting face between front and rear. */
  handleFlip(rack: RackType, target: ContextMenuTarget): void;
  /** Move a contained device to the next fitting cell in its carrier. */
  handleMoveToNextSlot(target: ContextMenuTarget): void;
  /** Remove the device from the rack. */
  handleDelete(target: ContextMenuTarget): void;
  /** Whether the device can move up (checks bounds and collisions). */
  getCanMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean;
  /** Whether the device can move down (checks bounds and collisions). */
  getCanMoveDown(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean;
  /** Whether a contained device has another fitting carrier cell. */
  getCanMoveToNextSlot(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean;
}

/**
 * Create context menu action handlers bound to the given stores.
 * Returns an object implementing {@link RackContextActions}.
 */
export function createContextMenuActions(
  layoutStore: ReturnType<typeof getLayoutStore>,
  selectionStore: ReturnType<typeof getSelectionStore>,
  toastStore: ReturnType<typeof getToastStore>,
): RackContextActions {
  function resolveTargetInRack(rack: RackType, target: ContextMenuTarget) {
    if (rack.id !== target.rackId) return undefined;
    const deviceIndex = rack.devices.findIndex(
      (device) => device.id === target.deviceId,
    );
    if (deviceIndex === -1) return undefined;
    return { rack, device: rack.devices[deviceIndex]!, deviceIndex };
  }

  function resolveLiveTarget(target: ContextMenuTarget) {
    const rack = layoutStore.getRackById(target.rackId);
    if (!rack) return undefined;
    return resolveTargetInRack(rack, target);
  }

  function handleEdit(_rack: RackType, target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    selectionStore.selectDevice(target.rackId, liveTarget.device.id);
  }

  function handleDuplicate(_rack: RackType, target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    const { rackId } = target;
    const { deviceIndex } = liveTarget;
    const result = layoutStore.duplicateDevice(rackId, deviceIndex);
    if (result.error) {
      toastStore.showToast(result.error, "error");
    } else if (result.device) {
      selectionStore.selectDevice(rackId, result.device.id);
      toastStore.showToast("Device duplicated", "success");
    }
  }

  function handleMoveUp(
    _rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    const { device, deviceIndex, rack: targetRack } = liveTarget;

    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return;

    const currentPositionU = toHumanUnits(device.position);
    const newPositionU = currentPositionU + 1;
    layoutStore.moveDevice(targetRack.id, deviceIndex, newPositionU);
  }

  function handleMoveDown(_rack: RackType, target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    const { device, deviceIndex, rack: targetRack } = liveTarget;

    const currentPositionU = toHumanUnits(device.position);
    const newPositionU = currentPositionU - 1;
    if (newPositionU >= 1) {
      layoutStore.moveDevice(targetRack.id, deviceIndex, newPositionU);
    }
  }

  function handleFlip(_rack: RackType, target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    flipDeviceFaceAt(
      layoutStore,
      toastStore,
      liveTarget.rack.id,
      liveTarget.deviceIndex,
    );
  }

  function handleMoveToNextSlot(target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;
    layoutStore.moveDeviceToSlot(target.rackId, liveTarget.deviceIndex);
  }

  function handleDelete(target: ContextMenuTarget): void {
    const liveTarget = resolveLiveTarget(target);
    if (!liveTarget) return;

    selectionStore.selectDevice(target.rackId, liveTarget.device.id);
    openDeleteConfirmation();
  }

  function getCanMoveUp(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean {
    const liveTarget = resolveTargetInRack(rack, target);
    if (!liveTarget) return false;
    const { device, deviceIndex, rack: targetRack } = liveTarget;
    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return false;
    const currentPositionU = toHumanUnits(device.position);
    const targetPositionInternal = toInternalUnits(currentPositionU + 1);
    return canPlaceDevice(
      targetRack,
      deviceLibrary,
      deviceType.u_height,
      targetPositionInternal,
      deviceIndex,
      effectiveFace(device, deviceType),
      undefined,
      deviceType,
    );
  }

  function getCanMoveDown(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean {
    const liveTarget = resolveTargetInRack(rack, target);
    if (!liveTarget) return false;
    const { device, deviceIndex, rack: targetRack } = liveTarget;
    const deviceType = deviceLibrary.find((d) => d.slug === device.device_type);
    if (!deviceType) return false;
    const currentPositionU = toHumanUnits(device.position);
    const targetPositionInternal = toInternalUnits(currentPositionU - 1);
    return canPlaceDevice(
      targetRack,
      deviceLibrary,
      deviceType.u_height,
      targetPositionInternal,
      deviceIndex,
      effectiveFace(device, deviceType),
      undefined,
      deviceType,
    );
  }

  function getCanMoveToNextSlot(
    rack: RackType,
    deviceLibrary: DeviceType[],
    target: ContextMenuTarget,
  ): boolean {
    const liveTarget = resolveTargetInRack(rack, target);
    if (!liveTarget) return false;
    return canMoveDeviceToNextSlot(
      liveTarget.rack,
      deviceLibrary,
      liveTarget.deviceIndex,
    );
  }

  return {
    handleEdit,
    handleDuplicate,
    handleMoveUp,
    handleMoveDown,
    handleFlip,
    handleMoveToNextSlot,
    handleDelete,
    getCanMoveUp,
    getCanMoveDown,
    getCanMoveToNextSlot,
  };
}
