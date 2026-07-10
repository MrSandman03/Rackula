/** Stable facade over the active workspace layout store. */

import { getWorkspaceStore } from "../workspace.svelte";
import type { LayoutStore } from "./store-instance.svelte";

/**
 * Stable facade over the active tab's layout store.
 *
 * Every consumer reads `getLayoutStore()` once and then accesses reactive
 * getters/methods off it. The multi-layout workspace swaps which underlying
 * store is active when the user switches tabs, so the facade resolves the active
 * store on every getter and method call. This deliberately uses explicit getters
 * rather than a Proxy: Svelte tracks the getter reads in component markup and
 * invalidates the canvas/inspector when the active workspace tab changes.
 *
 * The workspace owns the first tab and binds it to the app-session history
 * singleton (getHistoryStore()), so getLayoutStore() and getHistoryStore()
 * stay consistent with one layout open.
 */
function activeLayoutStore(): LayoutStore {
  const workspace = getWorkspaceStore();
  // Track the active tab and tab set before resolving activeStore. Reading these
  // here makes component-level derived values invalidate on tab switches even
  // when the forwarded property on the newly active store has not changed yet.
  void workspace.activeId;
  void workspace.tabs;
  return workspace.activeStore;
}

function delegate<K extends keyof LayoutStore>(key: K): LayoutStore[K] {
  return ((...args: unknown[]) => {
    const fn = activeLayoutStore()[key] as (...args: unknown[]) => unknown;
    return fn(...args);
  }) as LayoutStore[K];
}

const layoutStoreFacade: LayoutStore = {
  get layout() {
    return activeLayoutStore().layout;
  },
  get isDirty() {
    return activeLayoutStore().isDirty;
  },
  get changesSinceExport() {
    return activeLayoutStore().changesSinceExport;
  },
  get hasEverExported() {
    return activeLayoutStore().hasEverExported;
  },
  get lastExportedAt() {
    return activeLayoutStore().lastExportedAt;
  },
  get rack() {
    return activeLayoutStore().rack;
  },
  get racks() {
    return activeLayoutStore().racks;
  },
  get activeRack() {
    return activeLayoutStore().activeRack;
  },
  get activeRackId() {
    return activeLayoutStore().activeRackId;
  },
  get rack_groups() {
    return activeLayoutStore().rack_groups;
  },
  get device_types() {
    return activeLayoutStore().device_types;
  },
  get hasRack() {
    return activeLayoutStore().hasRack;
  },
  get rackCount() {
    return activeLayoutStore().rackCount;
  },
  get canAddRack() {
    return activeLayoutStore().canAddRack;
  },
  get totalDeviceCount() {
    return activeLayoutStore().totalDeviceCount;
  },
  get hasStarted() {
    return activeLayoutStore().hasStarted;
  },
  createNewLayout: delegate("createNewLayout"),
  loadLayout: delegate("loadLayout"),
  resetLayout: delegate("resetLayout"),
  setLayoutName: delegate("setLayoutName"),
  addRack: delegate("addRack"),
  addBayedRackGroup: delegate("addBayedRackGroup"),
  updateRack: delegate("updateRack"),
  updateRackView: delegate("updateRackView"),
  deleteRack: delegate("deleteRack"),
  reorderRacks: delegate("reorderRacks"),
  moveRackInRow: delegate("moveRackInRow"),
  duplicateRack: delegate("duplicateRack"),
  getRackById: delegate("getRackById"),
  setActiveRack: delegate("setActiveRack"),
  createRackGroup: delegate("createRackGroup"),
  updateRackGroup: delegate("updateRackGroup"),
  deleteRackGroup: delegate("deleteRackGroup"),
  addRackToGroup: delegate("addRackToGroup"),
  removeRackFromGroup: delegate("removeRackFromGroup"),
  addBayToGroup: delegate("addBayToGroup"),
  removeBayFromGroup: delegate("removeBayFromGroup"),
  setBayCount: delegate("setBayCount"),
  getRackGroupById: delegate("getRackGroupById"),
  getRackGroupForRack: delegate("getRackGroupForRack"),
  reorderRacksInGroup: delegate("reorderRacksInGroup"),
  createBayedRack: delegate("createBayedRack"),
  removeRackFromBay: delegate("removeRackFromBay"),
  resizeBayedGroupHeight: delegate("resizeBayedGroupHeight"),
  createRackGroupRaw: delegate("createRackGroupRaw"),
  updateRackGroupRaw: delegate("updateRackGroupRaw"),
  deleteRackGroupRaw: delegate("deleteRackGroupRaw"),
  duplicateDevice: delegate("duplicateDevice"),
  addDeviceType: delegate("addDeviceType"),
  updateDeviceType: delegate("updateDeviceType"),
  deleteDeviceType: delegate("deleteDeviceType"),
  placeDevice: delegate("placeDevice"),
  placeInContainer: delegate("placeInContainer"),
  placeDeviceSmart: delegate("placeDeviceSmart"),
  moveDeviceIntoContainer: delegate("moveDeviceIntoContainer"),
  moveDeviceWithSmartCarrier: delegate("moveDeviceWithSmartCarrier"),
  moveDevice: delegate("moveDevice"),
  moveDeviceToRack: delegate("moveDeviceToRack"),
  moveDeviceToSlot: delegate("moveDeviceToSlot"),
  removeDeviceFromRack: delegate("removeDeviceFromRack"),
  updateDeviceFace: delegate("updateDeviceFace"),
  updateDeviceName: delegate("updateDeviceName"),
  updateDevicePlacementImage: delegate("updateDevicePlacementImage"),
  updateDeviceColour: delegate("updateDeviceColour"),
  updateDeviceNotes: delegate("updateDeviceNotes"),
  updateDeviceIp: delegate("updateDeviceIp"),
  updateDisplayMode: delegate("updateDisplayMode"),
  updateShowLabelsOnImages: delegate("updateShowLabelsOnImages"),
  markDirty: delegate("markDirty"),
  markClean: delegate("markClean"),
  markExported: delegate("markExported"),
  restoreBackupState: delegate("restoreBackupState"),
  markStarted: delegate("markStarted"),
  addDeviceTypeRaw: delegate("addDeviceTypeRaw"),
  removeDeviceTypeRaw: delegate("removeDeviceTypeRaw"),
  updateDeviceTypeRaw: delegate("updateDeviceTypeRaw"),
  placeDeviceRaw: delegate("placeDeviceRaw"),
  removeDeviceAtIndexRaw: delegate("removeDeviceAtIndexRaw"),
  moveDeviceRaw: delegate("moveDeviceRaw"),
  updateDeviceFaceRaw: delegate("updateDeviceFaceRaw"),
  updateDeviceNameRaw: delegate("updateDeviceNameRaw"),
  updateDevicePlacementImageRaw: delegate("updateDevicePlacementImageRaw"),
  updateDeviceColourRaw: delegate("updateDeviceColourRaw"),
  getDeviceAtIndex: delegate("getDeviceAtIndex"),
  getPlacedDevicesForType: delegate("getPlacedDevicesForType"),
  updateRackRaw: delegate("updateRackRaw"),
  replaceRackRaw: delegate("replaceRackRaw"),
  clearRackDevicesRaw: delegate("clearRackDevicesRaw"),
  restoreRackDevicesRaw: delegate("restoreRackDevicesRaw"),
  addCableRaw: delegate("addCableRaw"),
  updateCableRaw: delegate("updateCableRaw"),
  removeCableRaw: delegate("removeCableRaw"),
  removeCablesRaw: delegate("removeCablesRaw"),
  getUsedDeviceTypeSlugs: delegate("getUsedDeviceTypeSlugs"),
  getUnusedCustomDeviceTypes: delegate("getUnusedCustomDeviceTypes"),
  isCustomDeviceType: delegate("isCustomDeviceType"),
  hasDeviceTypePlacements: delegate("hasDeviceTypePlacements"),
  addDeviceTypeRecorded: delegate("addDeviceTypeRecorded"),
  updateDeviceTypeRecorded: delegate("updateDeviceTypeRecorded"),
  deleteDeviceTypeRecorded: delegate("deleteDeviceTypeRecorded"),
  deleteMultipleDeviceTypesRecorded: delegate(
    "deleteMultipleDeviceTypesRecorded",
  ),
  placeDeviceRecorded: delegate("placeDeviceRecorded"),
  moveDeviceRecorded: delegate("moveDeviceRecorded"),
  removeDeviceRecorded: delegate("removeDeviceRecorded"),
  updateDeviceFaceRecorded: delegate("updateDeviceFaceRecorded"),
  updateDeviceNameRecorded: delegate("updateDeviceNameRecorded"),
  updateDevicePlacementImageRecorded: delegate(
    "updateDevicePlacementImageRecorded",
  ),
  updateDeviceColourRecorded: delegate("updateDeviceColourRecorded"),
  updateRackRecorded: delegate("updateRackRecorded"),
  clearRackRecorded: delegate("clearRackRecorded"),
  undo: delegate("undo"),
  redo: delegate("redo"),
  clearHistory: delegate("clearHistory"),
  get canUndo() {
    return activeLayoutStore().canUndo;
  },
  get canRedo() {
    return activeLayoutStore().canRedo;
  },
  get undoDescription() {
    return activeLayoutStore().undoDescription;
  },
  get redoDescription() {
    return activeLayoutStore().redoDescription;
  },
};

/**
 * Get access to the active layout store.
 * @returns Store facade forwarding to the active tab's state and actions
 */
export function getLayoutStore(): LayoutStore {
  return layoutStoreFacade;
}

/**
 * Reset the active layout store to initial state (primarily for testing).
 * @param clearStarted - If true, also clears the hasStarted flag (default: true)
 */
export function resetLayoutStore(clearStarted: boolean = true): void {
  getWorkspaceStore().activeStore.resetLayout(clearStarted);
}
