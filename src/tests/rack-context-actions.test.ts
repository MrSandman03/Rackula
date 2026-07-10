import { beforeEach, describe, expect, it } from "vitest";
import { createContextMenuActions } from "$lib/utils/rack-context-actions";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import type { DeviceType } from "$lib/types";

const carrierType: DeviceType = {
  slug: "context-carrier",
  model: "Context Carrier",
  category: "shelf",
  colour: "#555555",
  u_height: 1,
  slots: [
    {
      id: "main",
      position: { row: 0, col: 0 },
      width_fraction: 1,
      height_units: 1,
    },
  ],
};

const childType: DeviceType = {
  slug: "context-child",
  model: "Context Child",
  category: "network",
  colour: "#336699",
  u_height: 1,
};

describe("rack context actions", () => {
  beforeEach(() => {
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
    dialogStore.close();
  });

  it("routes occupied-carrier deletion through the shared confirmation", () => {
    const layoutStore = getLayoutStore();
    const selectionStore = getSelectionStore();
    layoutStore.addDeviceTypeRaw(carrierType);
    layoutStore.addDeviceTypeRaw(childType);
    const rack = layoutStore.addRack("Context rack", 8)!;
    expect(layoutStore.placeDevice(rack.id, carrierType.slug, 1)).toBe(true);
    const carrier = layoutStore.getRackById(rack.id)!.devices[0]!;
    expect(
      layoutStore.placeInContainer(
        rack.id,
        childType.slug,
        carrier.id,
        "main",
        0,
      ),
    ).toBe(true);
    const actions = createContextMenuActions(
      layoutStore,
      selectionStore,
      getToastStore(),
    );
    const beforeRoster = layoutStore
      .getRackById(rack.id)!
      .devices.map((device) => device.id);

    actions.handleDelete({
      rackId: rack.id,
      deviceIndex: 0,
      x: 0,
      y: 0,
    });

    expect(dialogStore.isOpen("confirmDelete")).toBe(true);
    expect(dialogStore.deleteTarget).toMatchObject({
      type: "device",
      name: "Context Carrier",
    });
    expect(selectionStore.selectedDeviceId).toBe(carrier.id);
    expect(
      layoutStore.getRackById(rack.id)?.devices.map((device) => device.id),
    ).toEqual(beforeRoster);
  });
});
