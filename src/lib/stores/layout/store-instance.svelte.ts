/**
 * Layout Store
 * Central state management for the application using Svelte 5 runes
 *
 * This is the facade that owns the reactive $state and delegates to
 * extracted domain modules via the LayoutStateAccess bridge pattern.
 */

import type {
  Layout,
  Rack,
  DeviceType,
  PlacedDevice,
  DeviceFace,
  DisplayMode,
  Cable,
} from "$lib/types";
import { MAX_RACKS } from "$lib/types/constants";
import { createLayout } from "$lib/utils/serialization";
import { debug } from "$lib/utils/debug";
import { createHistoryStore, type HistoryStore } from "../history.svelte";
import type { LayoutStateAccess } from "./types";
import {
  type BackupState,
  HAS_STARTED_KEY,
  loadHasStarted,
  saveHasStarted,
} from "./persistence";
import {
  getUsedDeviceTypeSlugs as getUsedDeviceTypeSlugsImpl,
  getUnusedCustomDeviceTypes as getUnusedCustomDeviceTypesImpl,
  isCustomDeviceType as isCustomDeviceTypeImpl,
  hasDeviceTypePlacements as hasDeviceTypePlacementsImpl,
} from "./queries";
import { getTargetRack as getTargetRackImpl } from "./rack-actions";
import {
  addDeviceTypeRaw as addDeviceTypeRawImpl,
  removeDeviceTypeRaw as removeDeviceTypeRawImpl,
  updateDeviceTypeRaw as updateDeviceTypeRawImpl,
  placeDeviceRaw as placeDeviceRawImpl,
  removeDeviceAtIndexRaw as removeDeviceAtIndexRawImpl,
  moveDeviceRaw as moveDeviceRawImpl,
  updateDeviceFaceRaw as updateDeviceFaceRawImpl,
  updateDeviceNameRaw as updateDeviceNameRawImpl,
  updateDevicePlacementImageRaw as updateDevicePlacementImageRawImpl,
  updateDeviceColourRaw as updateDeviceColourRawImpl,
  getDeviceAtIndex as getDeviceAtIndexImpl,
  getPlacedDevicesForType as getPlacedDevicesForTypeImpl,
  updateRackRaw as updateRackRawImpl,
  replaceRackRaw as replaceRackRawImpl,
  clearRackDevicesRaw as clearRackDevicesRawImpl,
  restoreRackDevicesRaw as restoreRackDevicesRawImpl,
  addCableRaw as addCableRawImpl,
  updateCableRaw as updateCableRawImpl,
  removeCableRaw as removeCableRawImpl,
  removeCablesRaw as removeCablesRawImpl,
} from "./mutators";
import { createLayoutStoreActions } from "./store-actions";

export { type BackupState, HAS_STARTED_KEY };

/**
 * Create a layout store instance with its own reactive state and undo/redo
 * history.
 *
 * The module keeps an active instance (see getLayoutStore) so existing call
 * sites keep working against one layout per app session. Independent instances
 * each own their state and history, which the multi-layout workspace (#2017)
 * will use to open layouts as tabs.
 */
export function createLayoutStore(
  history: HistoryStore = createHistoryStore(),
) {
  // Instance state (using $state rune)
  let layout = $state<Layout>(createLayout());
  let isDirty = $state(false);
  let changesSinceExport = $state(0);
  let hasEverExported = $state(false);
  let lastExportedAt = $state<string | null>(null);
  let hasStarted = $state(loadHasStarted());
  let activeRackId = $state<string | null>(null);

  // Derived values (using $derived rune)
  const racks = $derived(layout.racks);
  const device_types = $derived(layout.device_types);
  const rack_groups = $derived(layout.rack_groups ?? []);

  /**
   * State access bridge for extracted domain modules.
   * Provides read/write access to this instance's reactive state and history
   * without exposing the $state variables directly to the extracted modules.
   */
  const stateAccess: LayoutStateAccess = {
    getLayout: () => layout,
    setLayout: (l: Layout) => {
      layout = l;
    },
    getActiveRackId: () => activeRackId,
    setActiveRackId: (id: string | null) => {
      activeRackId = id;
    },
    markDirty,
    markStarted: () => {
      hasStarted = true;
      saveHasStarted(true);
    },
    resetBackupTracking: () => {
      isDirty = false;
      changesSinceExport = 0;
      hasEverExported = false;
      lastExportedAt = null;
    },
    getRackGroups: () => rack_groups,
    findRack: (id: string) => layout.racks.find((r) => r.id === id),
    findRackIndex: (id: string) => layout.racks.findIndex((r) => r.id === id),
    getHistory: () => history,
  };
  const actions = createLayoutStoreActions(stateAccess, (device) =>
    $state.snapshot(device),
  );

  // Active rack: the rack currently being edited (falls back to first rack if not set)
  const activeRack = $derived.by(() => {
    if (activeRackId) {
      const found = layout.racks.find((r) => r.id === activeRackId);
      if (found) return found;
    }
    return layout.racks[0] ?? null;
  });

  // Legacy alias for backward compatibility
  const rack = $derived(activeRack);

  const hasRack = $derived(
    layout.racks.length > 0 && layout.racks[0]?.devices !== undefined,
  );

  // rackCount returns actual count when user has started
  const rackCount = $derived(hasStarted ? layout.racks.length : 0);
  const canAddRack = $derived(layout.racks.length < MAX_RACKS);
  // Total devices across all racks
  const totalDeviceCount = $derived(
    layout.racks.reduce((sum, r) => sum + r.devices.length, 0),
  );

  /**
   * Reset this instance to initial state: a fresh layout with an empty
   * undo/redo history. The history is this instance's own, so resetting the
   * layout discards the commands that referenced the old one.
   * @param clearStarted - If true, also clears the hasStarted flag (default: true)
   */
  function resetLayout(clearStarted: boolean = true): void {
    layout = createLayout();
    isDirty = false;
    changesSinceExport = 0;
    hasEverExported = false;
    lastExportedAt = null;
    activeRackId = null;
    history.clear();
    if (clearStarted) {
      hasStarted = false;
      saveHasStarted(false);
    }
  }

  // Public store surface: getters over reactive state + bound actions.
  return {
    // State getters
    get layout() {
      return layout;
    },
    get isDirty() {
      return isDirty;
    },
    get changesSinceExport() {
      return changesSinceExport;
    },
    get hasEverExported() {
      return hasEverExported;
    },
    get lastExportedAt() {
      return lastExportedAt;
    },
    get rack() {
      return rack;
    },
    get racks() {
      return racks;
    },
    get activeRack() {
      return activeRack;
    },
    get activeRackId() {
      return activeRackId;
    },
    get rack_groups() {
      return rack_groups;
    },
    get device_types() {
      return device_types;
    },
    get hasRack() {
      return hasRack;
    },
    get rackCount() {
      return rackCount;
    },
    get canAddRack() {
      return canAddRack;
    },
    get totalDeviceCount() {
      return totalDeviceCount;
    },
    get hasStarted() {
      return hasStarted;
    },

    // Bound domain actions
    ...actions,

    // Instance-local layout actions
    resetLayout,

    // Settings actions
    updateDisplayMode,
    updateShowLabelsOnImages,

    // Dirty tracking
    markDirty,
    markClean,
    markExported,
    restoreBackupState,

    // Start tracking (whether the user has begun a layout)
    markStarted,

    // Raw actions for undo/redo system (bypass dirty tracking)
    addDeviceTypeRaw,
    removeDeviceTypeRaw,
    updateDeviceTypeRaw,
    placeDeviceRaw,
    removeDeviceAtIndexRaw,
    moveDeviceRaw,
    updateDeviceFaceRaw,
    updateDeviceNameRaw,
    updateDevicePlacementImageRaw,
    updateDeviceColourRaw,
    getDeviceAtIndex,
    getPlacedDevicesForType,
    updateRackRaw,
    replaceRackRaw,
    clearRackDevicesRaw,
    restoreRackDevicesRaw,

    // Cable raw actions
    addCableRaw,
    updateCableRaw,
    removeCableRaw,
    removeCablesRaw,

    // Utility
    getUsedDeviceTypeSlugs,
    getUnusedCustomDeviceTypes,
    isCustomDeviceType,
    hasDeviceTypePlacements,

    // Undo/Redo
    undo,
    redo,
    clearHistory,
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get undoDescription() {
      return history.undoDescription;
    },
    get redoDescription() {
      return history.redoDescription;
    },
  };

  // =============================================================================
  // Settings Actions
  // =============================================================================

  function markDirty(): void {
    isDirty = true;
    changesSinceExport += 1;
  }

  /**
   * Mark the layout as having unsaved changes without incrementing the
   * changes-since-export counter. The counter tracks edit operations made
   * since the last export; undo/redo revert or re-apply edits that were
   * already counted, so they do not add to it.
   */
  function markDirtyWithoutCounting(): void {
    isDirty = true;
  }

  function markClean(): void {
    isDirty = false;
  }

  /**
   * Record a successful file export: the working copy now matches a file
   * backup, so the changes-since-export counter resets.
   */
  function markExported(): void {
    changesSinceExport = 0;
    hasEverExported = true;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient ISO timestamp, not a stored reactive Date
    lastExportedAt = new Date().toISOString();
  }

  /**
   * Restore backup state persisted in the session blob (used when a
   * localStorage session is restored on startup).
   */
  function restoreBackupState(state: BackupState): void {
    changesSinceExport = state.changesSinceExport;
    hasEverExported = state.hasEverExported;
    lastExportedAt = state.lastExportedAt ?? null;
  }

  function markStarted(): void {
    hasStarted = true;
    saveHasStarted(true);
  }

  /**
   * Update the display mode in layout settings
   */
  function updateDisplayMode(mode: DisplayMode): void {
    if (layout.settings.display_mode === mode) return;
    layout = {
      ...layout,
      settings: { ...layout.settings, display_mode: mode },
    };
    markDirty();
  }

  /**
   * Update the showLabelsOnImages setting
   */
  function updateShowLabelsOnImages(value: boolean): void {
    if (layout.settings.show_labels_on_images === value) return;
    layout = {
      ...layout,
      settings: { ...layout.settings, show_labels_on_images: value },
    };
    markDirty();
  }

  // =============================================================================
  // Raw Actions — delegated to layout/mutators.ts
  // These bypass dirty tracking and validation - used by the command pattern
  // =============================================================================

  function addDeviceTypeRaw(deviceType: DeviceType): void {
    addDeviceTypeRawImpl(stateAccess, deviceType);
  }

  function removeDeviceTypeRaw(slug: string): void {
    removeDeviceTypeRawImpl(stateAccess, slug);
  }

  function updateDeviceTypeRaw(
    slug: string,
    updates: Partial<DeviceType>,
  ): void {
    updateDeviceTypeRawImpl(stateAccess, slug, updates);
  }

  function placeDeviceRaw(device: PlacedDevice): number {
    return placeDeviceRawImpl(stateAccess, device);
  }

  function removeDeviceAtIndexRaw(index: number): PlacedDevice | undefined {
    return removeDeviceAtIndexRawImpl(stateAccess, index);
  }

  function moveDeviceRaw(index: number, newPosition: number): boolean {
    return moveDeviceRawImpl(stateAccess, index, newPosition);
  }

  function updateDeviceFaceRaw(index: number, face: DeviceFace): void {
    updateDeviceFaceRawImpl(stateAccess, index, face);
  }

  function updateDeviceNameRaw(index: number, name: string | undefined): void {
    updateDeviceNameRawImpl(stateAccess, index, name);
  }

  function updateDevicePlacementImageRaw(
    index: number,
    face: "front" | "rear",
    filename: string | undefined,
  ): void {
    // Resolve rack ID: use active rack, fall back to first rack
    const rackId = activeRackId ?? getTargetRackImpl(stateAccess)?.rack.id;
    if (!rackId) {
      debug.log("updateDevicePlacementImageRaw: No rack available");
      return;
    }
    updateDevicePlacementImageRawImpl(
      stateAccess,
      rackId,
      index,
      face,
      filename,
    );
  }

  function updateDeviceColourRaw(
    index: number,
    colour: string | undefined,
  ): void {
    // Resolve rack ID: use active rack, fall back to first rack
    const rackId = activeRackId ?? getTargetRackImpl(stateAccess)?.rack.id;
    if (!rackId) {
      debug.log("updateDeviceColourRaw: No rack available");
      return;
    }
    updateDeviceColourRawImpl(stateAccess, rackId, index, colour);
  }

  function getDeviceAtIndex(index: number): PlacedDevice | undefined {
    return getDeviceAtIndexImpl(stateAccess, index);
  }

  function getPlacedDevicesForType(slug: string): PlacedDevice[] {
    return getPlacedDevicesForTypeImpl(stateAccess, slug);
  }

  function updateRackRaw(
    updates: Partial<Omit<Rack, "devices" | "view">>,
    rackId?: string,
  ): void {
    updateRackRawImpl(stateAccess, updates, rackId);
  }

  function replaceRackRaw(newRack: Rack): void {
    replaceRackRawImpl(stateAccess, newRack);
  }

  function clearRackDevicesRaw(): PlacedDevice[] {
    return clearRackDevicesRawImpl(stateAccess);
  }

  function restoreRackDevicesRaw(devices: PlacedDevice[]): void {
    restoreRackDevicesRawImpl(stateAccess, devices);
  }

  // Cable raw actions

  function addCableRaw(cable: Cable): void {
    addCableRawImpl(stateAccess, cable);
  }

  function updateCableRaw(
    id: string,
    updates: Partial<Omit<Cable, "id">>,
  ): void {
    updateCableRawImpl(stateAccess, id, updates);
  }

  function removeCableRaw(id: string): void {
    removeCableRawImpl(stateAccess, id);
  }

  function removeCablesRaw(ids: Set<string>): void {
    removeCablesRawImpl(stateAccess, ids);
  }

  // =============================================================================
  // Utility Functions — delegated to layout/queries.ts
  // =============================================================================

  function getUsedDeviceTypeSlugs(): Set<string> {
    return getUsedDeviceTypeSlugsImpl(stateAccess);
  }

  function getUnusedCustomDeviceTypes(): DeviceType[] {
    return getUnusedCustomDeviceTypesImpl(stateAccess);
  }

  function isCustomDeviceType(slug: string): boolean {
    return isCustomDeviceTypeImpl(slug);
  }

  function hasDeviceTypePlacements(slug: string): boolean {
    return hasDeviceTypePlacementsImpl(stateAccess, slug);
  }

  // =============================================================================
  // Undo/Redo Functions
  // =============================================================================

  /**
   * Undo the last action
   * @returns true if undo was performed
   */
  function undo(): boolean {
    const result = history.undo();
    if (result) {
      markDirtyWithoutCounting();
    }
    return result;
  }

  /**
   * Redo the last undone action
   * @returns true if redo was performed
   */
  function redo(): boolean {
    const result = history.redo();
    if (result) {
      markDirtyWithoutCounting();
    }
    return result;
  }

  /**
   * Clear all undo/redo history
   */
  function clearHistory(): void {
    history.clear();
  }

  // Close createLayoutStore.
}

/** Layout-store instance contract inferred from the rune-backed factory. */
export type LayoutStore = ReturnType<typeof createLayoutStore>;
