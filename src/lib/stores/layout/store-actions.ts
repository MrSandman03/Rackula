/** Bound public layout actions that do not own reactive state. */

import type {
  DeviceFace,
  DeviceType,
  FormFactor,
  Layout,
  LayoutPreset,
  PlacedDevice,
  Rack,
  RackGroup,
  RackView,
} from "$lib/types";
import type { CreateDeviceTypeInput } from "$lib/stores/layout-helpers";
import type { LayoutStateAccess } from "./types";
import {
  createNewLayout as createNewLayoutImpl,
  loadLayout as loadLayoutImpl,
} from "./layout-lifecycle";
import {
  addRack as addRackImpl,
  addBayedRackGroup as addBayedRackGroupImpl,
  updateRack as updateRackImpl,
  deleteRack as deleteRackImpl,
  reorderRacks as reorderRacksImpl,
  moveRackInRow as moveRackInRowImpl,
  duplicateRack as duplicateRackImpl,
  getRackById as getRackByIdImpl,
  setActiveRack as setActiveRackImpl,
} from "./rack-actions";
import {
  createRackGroup as createRackGroupImpl,
  updateRackGroup as updateRackGroupImpl,
  deleteRackGroup as deleteRackGroupImpl,
  addRackToGroup as addRackToGroupImpl,
  removeRackFromGroup as removeRackFromGroupImpl,
  addBayToGroup as addBayToGroupImpl,
  removeBayFromGroup as removeBayFromGroupImpl,
  setBayCount as setBayCountImpl,
  getRackGroupById as getRackGroupByIdImpl,
  getRackGroupForRack as getRackGroupForRackImpl,
  reorderRacksInGroup as reorderRacksInGroupImpl,
  createRackGroupRaw as createRackGroupRawImpl,
  updateRackGroupRaw as updateRackGroupRawImpl,
  deleteRackGroupRaw as deleteRackGroupRawImpl,
  createBayedRack as createBayedRackImpl,
  resizeBayedGroupHeight as resizeBayedGroupHeightImpl,
  removeRackFromBay as removeRackFromBayImpl,
} from "./rack-groups";
import {
  addDeviceTypeRecorded as addDeviceTypeRecordedImpl,
  updateDeviceTypeRecorded as updateDeviceTypeRecordedImpl,
  deleteDeviceTypeRecorded as deleteDeviceTypeRecordedImpl,
  deleteMultipleDeviceTypesRecorded as deleteMultipleDeviceTypesRecordedImpl,
} from "./recorded-device-type-actions";
import {
  placeDeviceRecorded as placeDeviceRecordedImpl,
  moveDeviceRecorded as moveDeviceRecordedImpl,
  removeDeviceRecorded as removeDeviceRecordedImpl,
  updateDeviceFaceRecorded as updateDeviceFaceRecordedImpl,
  updateDeviceNameRecorded as updateDeviceNameRecordedImpl,
  updateDevicePlacementImageRecorded as updateDevicePlacementImageRecordedImpl,
  updateDeviceColourRecorded as updateDeviceColourRecordedImpl,
  updateDeviceNotesRecorded as updateDeviceNotesRecordedImpl,
  updateDeviceIpRecorded as updateDeviceIpRecordedImpl,
} from "./recorded-device-actions";
import {
  updateRackRecorded as updateRackRecordedImpl,
  updateRacksBatchRecorded as updateRacksBatchRecordedImpl,
  clearRackRecorded as clearRackRecordedImpl,
} from "./recorded-rack-actions";
import {
  duplicateDevice as duplicateDeviceImpl,
  placeInContainer as placeInContainerImpl,
  placeDeviceSmart as placeDeviceSmartImpl,
  moveDeviceIntoContainer as moveDeviceIntoContainerImpl,
  moveDeviceWithSmartCarrier as moveDeviceWithSmartCarrierImpl,
  moveDeviceToRack as moveDeviceToRackImpl,
  moveDeviceToSlot as moveDeviceToSlotImpl,
  type SnapshotDeviceFn,
} from "./device-actions";

export function createLayoutStoreActions(
  stateAccess: LayoutStateAccess,
  snapshotDevice: SnapshotDeviceFn,
) {
  // Layout Actions — delegated to layout/layout-lifecycle.ts
  // =============================================================================
  function createNewLayout(name: string): void {
    createNewLayoutImpl(stateAccess, name);
  }
  function loadLayout(
    layoutData: Layout,
    reservedDeviceIds?: ReadonlySet<string>,
  ): void {
    loadLayoutImpl(stateAccess, layoutData, reservedDeviceIds);
  }
  // =============================================================================
  // Rack Actions — delegated to layout/rack-actions.ts
  // =============================================================================
  function addRack(
    name: string,
    height: number,
    width?: Rack["width"],
    form_factor?: FormFactor,
    desc_units?: boolean,
    starting_unit?: number,
    profile?: Rack["profile"],
  ) {
    return addRackImpl(
      stateAccess,
      name,
      height,
      width,
      form_factor,
      desc_units,
      starting_unit,
      profile,
    );
  }
  function addBayedRackGroup(
    groupName: string,
    bayCount: 2 | 3,
    height: number,
    width: Rack["width"] = 19,
  ) {
    return addBayedRackGroupImpl(
      stateAccess,
      groupName,
      bayCount,
      height,
      width,
    );
  }
  function updateRack(id: string, updates: Partial<Rack>): void {
    updateRackImpl(
      stateAccess,
      id,
      updates,
      updateRackRecorded,
      updateRacksBatchRecorded,
    );
  }
  /**
   * Update a rack's view (front/rear)
   * @param id - Rack ID
   * @param view - New view
   */
  function updateRackView(id: string, view: RackView): void {
    updateRack(id, { view });
  }
  function deleteRack(id: string): void {
    deleteRackImpl(stateAccess, id);
  }
  function reorderRacks(fromIndex: number, toIndex: number): void {
    reorderRacksImpl(stateAccess, fromIndex, toIndex);
  }
  function moveRackInRow(rackId: string, direction: "left" | "right"): boolean {
    return moveRackInRowImpl(
      stateAccess,
      rackId,
      direction,
      updateRacksBatchRecorded,
    );
  }
  function duplicateRack(id: string) {
    return duplicateRackImpl(stateAccess, id);
  }
  // =============================================================================
  // Rack Group Actions — delegated to layout/rack-groups.ts
  // =============================================================================
  function createRackGroup(
    name: string,
    rackIds: string[],
    preset?: LayoutPreset,
  ) {
    return createRackGroupImpl(stateAccess, name, rackIds, preset);
  }
  function updateRackGroup(id: string, updates: Partial<RackGroup>) {
    return updateRackGroupImpl(stateAccess, id, updates);
  }
  function deleteRackGroup(id: string): void {
    deleteRackGroupImpl(stateAccess, id);
  }
  function addRackToGroup(groupId: string, rackId: string) {
    return addRackToGroupImpl(stateAccess, groupId, rackId);
  }
  function removeRackFromGroup(groupId: string, rackId: string): void {
    removeRackFromGroupImpl(stateAccess, groupId, rackId);
  }
  function addBayToGroup(groupId: string) {
    return addBayToGroupImpl(stateAccess, groupId);
  }
  function removeBayFromGroup(groupId: string) {
    return removeBayFromGroupImpl(stateAccess, groupId, deleteRack);
  }
  function setBayCount(groupId: string, targetCount: number) {
    return setBayCountImpl(stateAccess, groupId, targetCount, deleteRack);
  }
  function getRackGroupById(id: string): RackGroup | undefined {
    return getRackGroupByIdImpl(stateAccess, id);
  }
  function getRackGroupForRack(rackId: string): RackGroup | undefined {
    return getRackGroupForRackImpl(stateAccess, rackId);
  }
  function reorderRacksInGroup(groupId: string, newOrder: string[]) {
    return reorderRacksInGroupImpl(stateAccess, groupId, newOrder);
  }
  function createBayedRack(sourceRackId: string) {
    return createBayedRackImpl(stateAccess, sourceRackId);
  }
  function removeRackFromBay(rackId: string) {
    return removeRackFromBayImpl(stateAccess, rackId);
  }
  function resizeBayedGroupHeight(groupId: string, newHeight: number) {
    return resizeBayedGroupHeightImpl(
      stateAccess,
      groupId,
      newHeight,
      updateRacksBatchRecorded,
    );
  }
  // Rack group raw actions (for undo/redo system)
  function createRackGroupRaw(group: RackGroup): void {
    createRackGroupRawImpl(stateAccess, group);
  }
  function updateRackGroupRaw(id: string, updates: Partial<RackGroup>): void {
    updateRackGroupRawImpl(stateAccess, id, updates);
  }
  function deleteRackGroupRaw(id: string): RackGroup | undefined {
    return deleteRackGroupRawImpl(stateAccess, id);
  }
  // =============================================================================
  // Device Actions — delegated to layout/device-actions.ts
  // =============================================================================
  /**
   * Duplicate a placed device within a rack
   * @param rackId - Rack ID containing the device
   * @param deviceIndex - Index of the device in rack's devices array
   * @returns The duplicated device or error message
   */
  function duplicateDevice(
    rackId: string,
    deviceIndex: number,
  ): { error?: string; device?: PlacedDevice } {
    // snapshotDevice() is a Svelte rune — must be called from this .svelte.ts file
    return duplicateDeviceImpl(stateAccess, rackId, deviceIndex, (device) =>
      snapshotDevice(device),
    );
  }
  function getRackById(id: string): Rack | undefined {
    return getRackByIdImpl(stateAccess, id);
  }
  function setActiveRack(id: string | null): void {
    setActiveRackImpl(stateAccess, id);
  }
  // =============================================================================
  // Device Type Actions
  // =============================================================================
  /**
   * Add a device type to the library
   * Uses undo/redo support via addDeviceTypeRecorded
   */
  function addDeviceType(data: CreateDeviceTypeInput): DeviceType {
    return addDeviceTypeRecorded(data);
  }
  /**
   * Update a device type in the library
   * Uses undo/redo support via updateDeviceTypeRecorded
   */
  function updateDeviceType(slug: string, updates: Partial<DeviceType>): void {
    updateDeviceTypeRecorded(slug, updates);
  }
  /**
   * Delete a device type from the library
   * Also removes all placed devices referencing it
   * Uses undo/redo support via deleteDeviceTypeRecorded
   */
  function deleteDeviceType(slug: string): void {
    deleteDeviceTypeRecorded(slug);
  }
  // =============================================================================
  // Placement Actions
  // =============================================================================
  /**
   * Place a device from the library into a rack
   * Uses undo/redo support via placeDeviceRecorded
   */
  function placeDevice(
    rackId: string,
    deviceTypeSlug: string,
    position: number,
    face?: DeviceFace,
  ): boolean {
    return placeDeviceRecorded(rackId, deviceTypeSlug, position, face);
  }
  /**
   * Place a device inside a container slot
   * Uses undo/redo support via command pattern
   */
  function placeInContainer(
    rackId: string,
    deviceTypeSlug: string,
    containerId: string,
    slotId: string,
    position: number,
  ): boolean {
    return placeInContainerImpl(
      stateAccess,
      rackId,
      deviceTypeSlug,
      containerId,
      slotId,
      position,
    );
  }
  /**
   * Place a device carrier-first. Sub-U / half-width gear is wrapped in a
   * synthesised carrier (or fills an existing one); whole-U full-width gear
   * mounts directly to the rails.
   */
  function placeDeviceSmart(
    rackId: string,
    deviceTypeSlug: string,
    position: number,
    face?: DeviceFace,
  ): boolean {
    return placeDeviceSmartImpl(
      stateAccess,
      rackId,
      deviceTypeSlug,
      position,
      face,
    );
  }
  /** Move an existing placement into a container while preserving its identity. */
  function moveDeviceIntoContainer(
    fromRackId: string,
    sourceIndex: number,
    targetRackId: string,
    containerId: string,
    slotId: string,
    position: number,
  ): boolean {
    return moveDeviceIntoContainerImpl(
      stateAccess,
      fromRackId,
      sourceIndex,
      targetRackId,
      containerId,
      slotId,
      position,
      (device) => snapshotDevice(device),
    );
  }
  /** Move an existing carried device via a synthesized rail carrier. */
  function moveDeviceWithSmartCarrier(
    fromRackId: string,
    sourceIndex: number,
    targetRackId: string,
    position: number,
    face?: DeviceFace,
  ): boolean {
    return moveDeviceWithSmartCarrierImpl(
      stateAccess,
      fromRackId,
      sourceIndex,
      targetRackId,
      position,
      face,
      (device) => snapshotDevice(device),
    );
  }
  /**
   * Move a device within a rack
   * Uses undo/redo support via moveDeviceRecorded
   */
  function moveDevice(
    rackId: string,
    deviceIndex: number,
    newPosition: number,
    face?: DeviceFace,
  ): boolean {
    return moveDeviceRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      newPosition,
      face,
      (device) => snapshotDevice(device),
    );
  }
  /**
   * Move a device from one rack to another
   * Supports both within-rack moves (delegates to moveDevice) and cross-rack moves.
   */
  function moveDeviceToRack(
    fromRackId: string,
    deviceIndex: number,
    toRackId: string,
    newPosition: number,
    face?: DeviceFace,
  ): boolean {
    // snapshotDevice() is a Svelte rune — must be called from this .svelte.ts file
    return moveDeviceToRackImpl(
      stateAccess,
      fromRackId,
      deviceIndex,
      toRackId,
      newPosition,
      face,
      (device) => snapshotDevice(device),
    );
  }
  /**
   * Move a contained child to the next free cell of its own carrier.
   * Cycles through cells without ejecting the child (#2322).
   */
  function moveDeviceToSlot(rackId: string, deviceIndex: number): boolean {
    return moveDeviceToSlotImpl(stateAccess, rackId, deviceIndex);
  }
  /**
   * Remove a device from a rack
   * Uses undo/redo support via removeDeviceRecorded
   */
  function removeDeviceFromRack(rackId: string, deviceIndex: number): void {
    removeDeviceRecorded(rackId, deviceIndex);
  }
  /**
   * Update a device's face property
   */
  function updateDeviceFace(
    rackId: string,
    deviceIndex: number,
    face: DeviceFace,
  ): void {
    updateDeviceFaceRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      face,
      (device) => snapshotDevice(device),
    );
  }
  /**
   * Update a device's custom display name
   */
  function updateDeviceName(
    rackId: string,
    deviceIndex: number,
    name: string | undefined,
  ): void {
    updateDeviceNameRecorded(rackId, deviceIndex, name);
  }
  /**
   * Update a device's placement image filename
   */
  function updateDevicePlacementImage(
    rackId: string,
    deviceIndex: number,
    face: "front" | "rear",
    filename: string | undefined,
  ): void {
    updateDevicePlacementImageRecorded(rackId, deviceIndex, face, filename);
  }
  /**
   * Update a device's colour override
   */
  function updateDeviceColour(
    rackId: string,
    deviceIndex: number,
    colour: string | undefined,
  ): void {
    updateDeviceColourRecorded(rackId, deviceIndex, colour);
  }
  /**
   * Update a device's notes
   */
  function updateDeviceNotes(
    rackId: string,
    deviceIndex: number,
    notes: string | undefined,
  ): void {
    updateDeviceNotesRecorded(rackId, deviceIndex, notes);
  }
  /**
   * Update a device's IP address/hostname
   */
  function updateDeviceIp(
    rackId: string,
    deviceIndex: number,
    ip: string | undefined,
  ): void {
    updateDeviceIpRecorded(rackId, deviceIndex, ip);
  }
  /**
   * Set the layout name explicitly
   * @param name - New layout name (whitespace-trimmed, empty strings ignored)
   */
  function setLayoutName(name: string): void {
    const trimmed = name.trim();
    const layout = stateAccess.getLayout();
    if (trimmed && trimmed !== layout.name) {
      stateAccess.setLayout({
        ...layout,
        name: trimmed,
        metadata: layout.metadata
          ? { ...layout.metadata, name: trimmed }
          : layout.metadata,
      });
      stateAccess.markDirty();
    }
  }
  // =============================================================================
  // Recorded Actions — delegated to layout/recorded-device-type-actions.ts,
  // layout/recorded-device-actions.ts, and layout/recorded-rack-actions.ts
  // =============================================================================
  function addDeviceTypeRecorded(data: CreateDeviceTypeInput): DeviceType {
    return addDeviceTypeRecordedImpl(stateAccess, data);
  }
  function updateDeviceTypeRecorded(
    slug: string,
    updates: Partial<DeviceType>,
  ): void {
    updateDeviceTypeRecordedImpl(stateAccess, slug, updates);
  }
  function deleteDeviceTypeRecorded(slug: string): void {
    deleteDeviceTypeRecordedImpl(stateAccess, slug);
  }
  function deleteMultipleDeviceTypesRecorded(slugs: string[]): number {
    return deleteMultipleDeviceTypesRecordedImpl(stateAccess, slugs);
  }
  function placeDeviceRecorded(
    rackId: string,
    deviceTypeSlug: string,
    positionU: number,
    face?: DeviceFace,
  ): boolean {
    return placeDeviceRecordedImpl(
      stateAccess,
      rackId,
      deviceTypeSlug,
      positionU,
      face,
    );
  }
  function moveDeviceRecorded(
    rackId: string,
    deviceIndex: number,
    newPositionU: number,
    newFace?: DeviceFace,
  ): boolean {
    return moveDeviceRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      newPositionU,
      newFace,
      (device) => snapshotDevice(device),
    );
  }
  function removeDeviceRecorded(rackId: string, deviceIndex: number): void {
    // snapshotDevice() is a Svelte rune — must be called from this .svelte.ts file
    removeDeviceRecordedImpl(stateAccess, rackId, deviceIndex, (device) =>
      snapshotDevice(device),
    );
  }
  function updateDeviceFaceRecorded(
    rackId: string,
    deviceIndex: number,
    face: DeviceFace,
  ): void {
    updateDeviceFaceRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      face,
      (device) => snapshotDevice(device),
    );
  }
  function updateDeviceNameRecorded(
    rackId: string,
    deviceIndex: number,
    name: string | undefined,
  ): void {
    updateDeviceNameRecordedImpl(stateAccess, rackId, deviceIndex, name);
  }
  function updateDevicePlacementImageRecorded(
    rackId: string,
    deviceIndex: number,
    face: "front" | "rear",
    filename: string | undefined,
  ): void {
    updateDevicePlacementImageRecordedImpl(
      stateAccess,
      rackId,
      deviceIndex,
      face,
      filename,
    );
  }
  function updateDeviceColourRecorded(
    rackId: string,
    deviceIndex: number,
    colour: string | undefined,
  ): void {
    updateDeviceColourRecordedImpl(stateAccess, rackId, deviceIndex, colour);
  }
  function updateDeviceNotesRecorded(
    rackId: string,
    deviceIndex: number,
    notes: string | undefined,
  ): void {
    updateDeviceNotesRecordedImpl(stateAccess, rackId, deviceIndex, notes);
  }
  function updateDeviceIpRecorded(
    rackId: string,
    deviceIndex: number,
    ip: string | undefined,
  ): void {
    updateDeviceIpRecordedImpl(stateAccess, rackId, deviceIndex, ip);
  }
  function updateRackRecorded(
    rackId: string,
    updates: Partial<Omit<Rack, "devices" | "view">>,
  ): void {
    updateRackRecordedImpl(stateAccess, rackId, updates);
  }
  function updateRacksBatchRecorded(
    targets: {
      rackId: string;
      updates: Partial<Omit<Rack, "devices" | "view">>;
    }[],
    description: string,
  ): void {
    updateRacksBatchRecordedImpl(stateAccess, targets, description);
  }
  function clearRackRecorded(rackId?: string): void {
    clearRackRecordedImpl(stateAccess, rackId);
  }
  // =============================================================================

  return {
    createNewLayout,
    loadLayout,
    setLayoutName,
    addRack,
    addBayedRackGroup,
    updateRack,
    updateRackView,
    deleteRack,
    reorderRacks,
    moveRackInRow,
    duplicateRack,
    getRackById,
    setActiveRack,
    createRackGroup,
    updateRackGroup,
    deleteRackGroup,
    addRackToGroup,
    removeRackFromGroup,
    addBayToGroup,
    removeBayFromGroup,
    setBayCount,
    getRackGroupById,
    getRackGroupForRack,
    reorderRacksInGroup,
    createBayedRack,
    removeRackFromBay,
    resizeBayedGroupHeight,
    createRackGroupRaw,
    updateRackGroupRaw,
    deleteRackGroupRaw,
    duplicateDevice,
    addDeviceType,
    updateDeviceType,
    deleteDeviceType,
    placeDevice,
    placeInContainer,
    placeDeviceSmart,
    moveDeviceIntoContainer,
    moveDeviceWithSmartCarrier,
    moveDevice,
    moveDeviceToRack,
    moveDeviceToSlot,
    removeDeviceFromRack,
    updateDeviceFace,
    updateDeviceName,
    updateDevicePlacementImage,
    updateDeviceColour,
    updateDeviceNotes,
    updateDeviceIp,
    addDeviceTypeRecorded,
    updateDeviceTypeRecorded,
    deleteDeviceTypeRecorded,
    deleteMultipleDeviceTypesRecorded,
    placeDeviceRecorded,
    moveDeviceRecorded,
    removeDeviceRecorded,
    updateDeviceFaceRecorded,
    updateDeviceNameRecorded,
    updateDevicePlacementImageRecorded,
    updateDeviceColourRecorded,
    updateRackRecorded,
    clearRackRecorded,
  };
}
