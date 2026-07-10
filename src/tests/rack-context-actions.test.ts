import { beforeEach, describe, expect, it } from "vitest";
import { createContextMenuActions } from "$lib/utils/rack-context-actions";
import { dialogStore } from "$lib/stores/dialogs.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { getToastStore, resetToastStore } from "$lib/stores/toast.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
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
      width_fraction: 0.5,
      height_units: 1,
    },
    {
      id: "secondary",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
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
  slot_width: 1,
};

const leadingType: DeviceType = {
  slug: "context-leading",
  model: "Context Leading Device",
  category: "server",
  colour: "#884422",
  u_height: 1,
};

function setupContextAssembly({ withLeadingDevice = false } = {}) {
  const layoutStore = getLayoutStore();
  const selectionStore = getSelectionStore();
  layoutStore.addDeviceTypeRaw(carrierType);
  layoutStore.addDeviceTypeRaw(childType);
  layoutStore.addDeviceTypeRaw(leadingType);
  const rack = layoutStore.addRack("Context rack", 8)!;
  if (withLeadingDevice) {
    expect(layoutStore.placeDevice(rack.id, leadingType.slug, 8)).toBe(true);
  }
  expect(layoutStore.placeDevice(rack.id, carrierType.slug, 1)).toBe(true);
  const carrier = layoutStore
    .getRackById(rack.id)!
    .devices.find((device) => device.device_type === carrierType.slug)!;
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

  return { actions, carrier, layoutStore, rack, selectionStore };
}

describe("rack context actions", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetToastStore();
    dialogStore.close();
  });

  it("routes occupied-carrier deletion through the shared confirmation", () => {
    const { actions, carrier, layoutStore, rack, selectionStore } =
      setupContextAssembly();
    const beforeRoster = layoutStore
      .getRackById(rack.id)!
      .devices.map((device) => device.id);

    actions.handleDelete({
      rackId: rack.id,
      deviceIndex: 0,
      deviceId: carrier.id,
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

  it("moves a child to the next cell without detaching it and records undo", () => {
    const { actions, carrier, layoutStore, rack } = setupContextAssembly();
    const childIndex = layoutStore
      .getRackById(rack.id)!
      .devices.findIndex((device) => device.container_id === carrier.id);
    const beforeRack = layoutStore.getRackById(rack.id)!;
    const beforeChild = beforeRack.devices[childIndex]!;
    const beforeRoster = beforeRack.devices.map((device) => device.id);
    const target = {
      rackId: rack.id,
      deviceIndex: childIndex,
      deviceId: beforeChild.id,
      x: 0,
      y: 0,
    };

    expect(
      actions.getCanMoveToNextSlot(
        beforeRack,
        layoutStore.device_types,
        target,
      ),
    ).toBe(true);
    actions.handleMoveToNextSlot(target);

    const movedRack = layoutStore.getRackById(rack.id)!;
    const movedChild = movedRack.devices.find(
      (device) => device.id === beforeChild.id,
    )!;
    expect(movedRack.devices.map((device) => device.id)).toEqual(beforeRoster);
    expect(movedChild.container_id).toBe(carrier.id);
    expect(movedChild.slot_id).toBe("secondary");
    expect(layoutStore.undo()).toBe(true);

    const restoredChild = layoutStore
      .getRackById(rack.id)!
      .devices.find((device) => device.id === beforeChild.id)!;
    expect(restoredChild.container_id).toBe(carrier.id);
    expect(restoredChild.slot_id).toBe("main");
  });

  it("resolves a context target by device ID after the rack roster shifts", () => {
    const { actions, carrier, layoutStore, rack } = setupContextAssembly({
      withLeadingDevice: true,
    });
    const beforeRack = layoutStore.getRackById(rack.id)!;
    const childIndex = beforeRack.devices.findIndex(
      (device) => device.container_id === carrier.id,
    );
    const child = beforeRack.devices[childIndex]!;
    const target = {
      rackId: rack.id,
      deviceIndex: childIndex,
      deviceId: child.id,
      x: 0,
      y: 0,
    };

    layoutStore.removeDeviceFromRack(rack.id, 0);
    expect(layoutStore.placeDevice(rack.id, leadingType.slug, 8)).toBe(true);
    expect(
      layoutStore.getRackById(rack.id)!.devices[target.deviceIndex]?.id,
    ).not.toBe(child.id);

    actions.handleMoveToNextSlot(target);

    const movedChild = layoutStore
      .getRackById(rack.id)!
      .devices.find((device) => device.id === child.id)!;
    expect(movedChild.container_id).toBe(carrier.id);
    expect(movedChild.slot_id).toBe("secondary");
  });

  it("makes every action and capability a no-op when the target was removed", () => {
    const { actions, layoutStore, rack, selectionStore } = setupContextAssembly(
      { withLeadingDevice: true },
    );
    const removed = layoutStore.getRackById(rack.id)!.devices[0]!;
    const target = {
      rackId: rack.id,
      deviceIndex: 0,
      deviceId: removed.id,
      x: 0,
      y: 0,
    };

    layoutStore.removeDeviceFromRack(rack.id, target.deviceIndex);
    const liveRack = layoutStore.getRackById(rack.id)!;
    const snapshot = liveRack.devices.map((device) => ({
      id: device.id,
      position: device.position,
      face: device.face,
      containerId: device.container_id,
      slotId: device.slot_id,
    }));

    actions.handleEdit(liveRack, target);
    actions.handleDuplicate(liveRack, target);
    actions.handleMoveUp(liveRack, layoutStore.device_types, target);
    actions.handleMoveDown(liveRack, target);
    actions.handleFlip(liveRack, target);
    actions.handleMoveToNextSlot(target);
    actions.handleDelete(target);

    expect(
      layoutStore.getRackById(rack.id)!.devices.map((device) => ({
        id: device.id,
        position: device.position,
        face: device.face,
        containerId: device.container_id,
        slotId: device.slot_id,
      })),
    ).toEqual(snapshot);
    expect(selectionStore.selectedDeviceId).toBeNull();
    expect(dialogStore.isOpen("confirmDelete")).toBe(false);
    expect(
      actions.getCanMoveUp(liveRack, layoutStore.device_types, target),
    ).toBe(false);
    expect(
      actions.getCanMoveDown(liveRack, layoutStore.device_types, target),
    ).toBe(false);
    expect(
      actions.getCanMoveToNextSlot(liveRack, layoutStore.device_types, target),
    ).toBe(false);
  });
});
