import { beforeEach, describe, expect, it } from "vitest";
import { getImageStore } from "$lib/stores/images.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import type { Cable } from "$lib/types";
import {
  addTypes,
  childType,
  placeCarrier,
  plain,
  rackById,
} from "./helpers/carrier-assembly";

function setupCableAssembly() {
  const store = addTypes();
  const rack = store.addRack("Rack", 12)!;
  const assembly = placeCarrier(store, rack.id, 2);
  store.placeInContainer(rack.id, childType.slug, assembly.id, "left", 0);
  const outsideA = placeCarrier(store, rack.id, 6);
  const outsideB = placeCarrier(store, rack.id, 9);
  const beforeDevices = plain(rackById(store, rack.id).devices);
  const child = beforeDevices.find(
    (device) => device.container_id === assembly.id,
  )!;
  const cables: Cable[] = [
    {
      id: "carrier-cable",
      a_device_id: assembly.id,
      a_interface: "eth0",
      b_device_id: outsideA.id,
      b_interface: "eth0",
    },
    {
      id: "unrelated-cable",
      a_device_id: outsideA.id,
      a_interface: "eth1",
      b_device_id: outsideB.id,
      b_interface: "eth1",
    },
    {
      id: "child-cable",
      a_device_id: outsideB.id,
      a_interface: "eth0",
      b_device_id: child.id,
      b_interface: "eth0",
    },
    {
      id: "unrelated-cable-2",
      a_device_id: outsideA.id,
      a_interface: "eth2",
      b_device_id: outsideB.id,
      b_interface: "eth2",
    },
  ];
  for (const cable of cables) store.addCableRaw(cable);
  store.clearHistory();

  return {
    store,
    rack,
    assembly,
    outsideA,
    outsideB,
    beforeDevices,
    cables,
  };
}

describe("carrier assembly cable history", () => {
  beforeEach(() => {
    resetLayoutStore();
    getImageStore().clearAllImages();
  });

  it("removes and restores cables for every deleted assembly member", () => {
    const { store, rack, outsideA, outsideB, beforeDevices, cables } =
      setupCableAssembly();

    store.removeDeviceFromRack(rack.id, 0);

    expect(rackById(store, rack.id).devices.map((device) => device.id)).toEqual(
      [outsideA.id, outsideB.id],
    );
    expect(store.layout.cables).toEqual([cables[1], cables[3]]);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(beforeDevices);
    expect(store.layout.cables).toEqual(cables);

    store.redo();
    expect(rackById(store, rack.id).devices.map((device) => device.id)).toEqual(
      [outsideA.id, outsideB.id],
    );
    expect(store.layout.cables).toEqual([cables[1], cables[3]]);
  });

  it("preserves unrelated cable edits across undo and redo", () => {
    const { store, rack, cables } = setupCableAssembly();
    store.removeDeviceFromRack(rack.id, 0);

    store.updateCableRaw("unrelated-cable", { label: "after deletion" });
    store.undo();
    expect(store.layout.cables).toEqual([
      cables[0],
      { ...cables[1], label: "after deletion" },
      cables[2],
      cables[3],
    ]);

    store.updateCableRaw("unrelated-cable", { label: "before redo" });
    store.redo();
    expect(store.layout.cables).toEqual([
      { ...cables[1], label: "before redo" },
      cables[3],
    ]);

    store.undo();
    expect(store.layout.cables).toEqual([
      cables[0],
      { ...cables[1], label: "before redo" },
      cables[2],
      cables[3],
    ]);
  });

  it("does not resurrect an unrelated cable removed outside history", () => {
    const { store, rack, cables } = setupCableAssembly();
    store.removeDeviceFromRack(rack.id, 0);
    store.removeCableRaw("unrelated-cable");

    store.undo();
    expect(store.layout.cables).toEqual([cables[0], cables[2], cables[3]]);

    store.redo();
    expect(store.layout.cables).toEqual([cables[3]]);

    store.undo();
    expect(store.layout.cables).toEqual([cables[0], cables[2], cables[3]]);
  });

  it("restores the latest affected cable state after a later redo", () => {
    const { store, rack, cables } = setupCableAssembly();
    store.removeDeviceFromRack(rack.id, 0);
    store.undo();
    store.updateCableRaw("child-cable", { label: "latest child state" });

    store.redo();
    expect(store.layout.cables).toEqual([cables[1], cables[3]]);

    store.undo();
    expect(store.layout.cables).toEqual([
      cables[0],
      cables[1],
      { ...cables[2], label: "latest child state" },
      cables[3],
    ]);
  });
});
