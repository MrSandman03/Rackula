import { beforeEach, describe, expect, it } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { placementKey } from "$lib/utils/placement-key";
import type { DeviceType } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";
import {
  addTypes,
  carrierType,
  childType,
  placeCarrier,
  plain,
  rackById,
} from "./helpers/carrier-assembly";

describe("carrier assembly integrity", () => {
  beforeEach(() => {
    resetLayoutStore();
    getImageStore().clearAllImages();
  });

  it("flips an occupied carrier and its direct children in one exact undo entry", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const carrier = placeCarrier(store, rack.id, 3);
    expect(
      store.placeInContainer(rack.id, childType.slug, carrier.id, "left", 0),
    ).toBe(true);
    expect(
      store.placeInContainer(rack.id, childType.slug, carrier.id, "right", 0),
    ).toBe(true);
    const before = plain(rackById(store, rack.id).devices);
    store.clearHistory();

    store.updateDeviceFace(rack.id, 0, "rear");

    expect(
      rackById(store, rack.id).devices.map((device) => device.face),
    ).toEqual(["rear", "rear", "rear"]);
    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(
      rackById(store, rack.id).devices.map((device) => device.face),
    ).toEqual(["rear", "rear", "rear"]);
  });

  it("moves and flips an occupied carrier without desynchronizing child faces", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const carrier = placeCarrier(store, rack.id, 2);
    store.placeInContainer(rack.id, childType.slug, carrier.id, "left", 0);
    const before = plain(rackById(store, rack.id).devices);
    store.clearHistory();

    expect(store.moveDevice(rack.id, 0, 7, "rear")).toBe(true);
    const moved = rackById(store, rack.id).devices;
    expect(moved[0]?.position).toBe(toInternalUnits(7));
    expect(moved.map((device) => device.face)).toEqual(["rear", "rear"]);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(store.canUndo).toBe(false);
  });

  it("moves a child between same-rack carriers with exact identity and metadata", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const sourceCarrier = placeCarrier(store, rack.id, 2);
    const targetCarrier = placeCarrier(store, rack.id, 7);
    store.placeInContainer(
      rack.id,
      childType.slug,
      sourceCarrier.id,
      "left",
      0,
    );
    const current = plain(rackById(store, rack.id).devices);
    current.find((device) => device.id === sourceCarrier.id)!.auto_created =
      true;
    const childIndex = current.findIndex(
      (device) => device.container_id === sourceCarrier.id,
    );
    current[childIndex] = {
      ...current[childIndex]!,
      name: "Configured child",
      front_image: "configured.png",
      colour_override: "#123456",
      notes: "keep me",
      custom_fields: { owner: "lab", nested: { exact: true } },
      ports: [
        {
          id: "stable-port",
          template_name: "eth0",
          template_index: 0,
          type: "ethernet",
          label: "WAN",
        },
      ],
    };
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(current);
    const before = plain(rackById(store, rack.id).devices);
    const originalChild = before[childIndex]!;
    const layoutId = store.layout.metadata?.id ?? "";
    const imageKey = placementKey(layoutId, originalChild.id);
    const sourceCarrierImageKey = placementKey(layoutId, sourceCarrier.id);
    const image = {
      filename: "configured.png",
      dataUrl: "data:image/png;base64,AA",
    };
    getImageStore().setDeviceImage(imageKey, "front", image);
    getImageStore().setDeviceImage(sourceCarrierImageKey, "front", image);
    store.clearHistory();

    expect(
      store.moveDeviceIntoContainer(
        rack.id,
        childIndex,
        rack.id,
        targetCarrier.id,
        "right",
        0,
      ),
    ).toBe(true);
    const moved = rackById(store, rack.id).devices.find(
      (device) => device.id === originalChild.id,
    )!;
    expect(moved).toEqual({
      ...originalChild,
      container_id: targetCarrier.id,
      slot_id: "right",
      face: targetCarrier.face,
      position: 0,
    });
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);
    expect(
      rackById(store, rack.id).devices.some(
        (device) => device.id === sourceCarrier.id,
      ),
    ).toBe(false);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toBeUndefined();

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toEqual(image);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(
      rackById(store, rack.id).devices.find(
        (device) => device.id === originalChild.id,
      )?.container_id,
    ).toBe(targetCarrier.id);
  });

  it("moves a child across racks with one undo and exact source restoration", () => {
    const store = addTypes();
    const sourceRack = store.addRack("Source", 12)!;
    const targetRack = store.addRack("Target", 12)!;
    const sourceCarrier = placeCarrier(store, sourceRack.id, 2);
    const targetCarrier = placeCarrier(store, targetRack.id, 5);
    store.placeInContainer(
      sourceRack.id,
      childType.slug,
      sourceCarrier.id,
      "left",
      0,
    );
    const sourceBefore = plain(rackById(store, sourceRack.id).devices);
    sourceBefore.find(
      (device) => device.id === sourceCarrier.id,
    )!.auto_created = true;
    store.setActiveRack(sourceRack.id);
    store.restoreRackDevicesRaw(sourceBefore);
    const targetBefore = plain(rackById(store, targetRack.id).devices);
    const childIndex = sourceBefore.findIndex(
      (device) => device.container_id === sourceCarrier.id,
    );
    const child = sourceBefore[childIndex]!;
    const layoutId = store.layout.metadata?.id ?? "";
    const sourceCarrierImageKey = placementKey(layoutId, sourceCarrier.id);
    const sourceCarrierImage = {
      filename: "cross-source.png",
      dataUrl: "data:image/png;base64,CS",
    };
    getImageStore().setDeviceImage(
      sourceCarrierImageKey,
      "front",
      sourceCarrierImage,
    );
    store.clearHistory();

    expect(
      store.moveDeviceIntoContainer(
        sourceRack.id,
        childIndex,
        targetRack.id,
        targetCarrier.id,
        "right",
        0,
      ),
    ).toBe(true);
    expect(
      rackById(store, sourceRack.id).devices.some(
        (device) => device.id === child.id,
      ),
    ).toBe(false);
    expect(rackById(store, sourceRack.id).devices).toEqual([]);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toBeUndefined();
    expect(
      rackById(store, targetRack.id).devices.find(
        (device) => device.id === child.id,
      ),
    ).toEqual({
      ...child,
      container_id: targetCarrier.id,
      slot_id: "right",
      face: targetCarrier.face,
      position: 0,
    });

    store.undo();
    expect(rackById(store, sourceRack.id).devices).toEqual(sourceBefore);
    expect(rackById(store, targetRack.id).devices).toEqual(targetBefore);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toEqual(sourceCarrierImage);
    expect(store.canUndo).toBe(false);
  });

  it("moves a rendered child onto bare rails through a new carrier without copying it", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const sourceCarrier = placeCarrier(store, rack.id, 2);
    store.placeInContainer(
      rack.id,
      childType.slug,
      sourceCarrier.id,
      "left",
      0,
    );
    const configured = plain(rackById(store, rack.id).devices);
    configured.find((device) => device.id === sourceCarrier.id)!.auto_created =
      true;
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    const childIndex = before.findIndex(
      (device) => device.container_id === sourceCarrier.id,
    );
    const sourceChild = before[childIndex]!;
    const layoutId = store.layout.metadata?.id ?? "";
    const sourceCarrierImageKey = placementKey(layoutId, sourceCarrier.id);
    const sourceCarrierImage = {
      filename: "smart-source.png",
      dataUrl: "data:image/png;base64,SS",
    };
    getImageStore().setDeviceImage(
      sourceCarrierImageKey,
      "front",
      sourceCarrierImage,
    );
    store.clearHistory();

    expect(
      store.moveDeviceWithSmartCarrier(
        rack.id,
        childIndex,
        rack.id,
        8,
        "front",
      ),
    ).toBe(true);
    const movedChild = rackById(store, rack.id).devices.find(
      (device) => device.id === sourceChild.id,
    )!;
    expect(movedChild.id).toBe(sourceChild.id);
    expect(movedChild.ports).toEqual(sourceChild.ports);
    expect(movedChild.container_id).not.toBe(sourceCarrier.id);
    expect(
      rackById(store, rack.id).devices.some(
        (device) => device.id === sourceCarrier.id,
      ),
    ).toBe(false);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toBeUndefined();
    expect(
      rackById(store, rack.id).devices.find(
        (device) => device.id === movedChild.container_id,
      )?.auto_created,
    ).toBe(true);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(
      getImageStore().getDeviceImage(sourceCarrierImageKey, "front"),
    ).toEqual(sourceCarrierImage);
    expect(store.canUndo).toBe(false);
  });

  it("moves a last child across racks through a smart carrier and prunes its auto source", () => {
    const store = addTypes();
    const sourceRack = store.addRack("Source", 12)!;
    const targetRack = store.addRack("Target", 12)!;
    const sourceCarrier = placeCarrier(store, sourceRack.id, 2);
    store.placeInContainer(
      sourceRack.id,
      childType.slug,
      sourceCarrier.id,
      "left",
      0,
    );
    const sourceConfigured = plain(rackById(store, sourceRack.id).devices);
    sourceConfigured[0]!.auto_created = true;
    store.setActiveRack(sourceRack.id);
    store.restoreRackDevicesRaw(sourceConfigured);
    const sourceBefore = plain(rackById(store, sourceRack.id).devices);
    const targetBefore = plain(rackById(store, targetRack.id).devices);
    const childIndex = sourceBefore.findIndex(
      (device) => device.container_id === sourceCarrier.id,
    );
    const childId = sourceBefore[childIndex]!.id;
    const layoutId = store.layout.metadata?.id ?? "";
    const imageKey = placementKey(layoutId, sourceCarrier.id);
    const image = {
      filename: "cross-smart.png",
      dataUrl: "data:image/png;base64,XS",
    };
    getImageStore().setDeviceImage(imageKey, "front", image);
    store.clearHistory();

    expect(
      store.moveDeviceWithSmartCarrier(
        sourceRack.id,
        childIndex,
        targetRack.id,
        7,
        "front",
      ),
    ).toBe(true);
    expect(rackById(store, sourceRack.id).devices).toEqual([]);
    const movedChild = rackById(store, targetRack.id).devices.find(
      (device) => device.id === childId,
    )!;
    expect(movedChild.id).toBe(childId);
    expect(
      rackById(store, targetRack.id).devices.find(
        (device) => device.id === movedChild.container_id,
      )?.auto_created,
    ).toBe(true);
    expect(getImageStore().getDeviceImage(imageKey, "front")).toBeUndefined();

    store.undo();
    expect(rackById(store, sourceRack.id).devices).toEqual(sourceBefore);
    expect(rackById(store, targetRack.id).devices).toEqual(targetBefore);
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);
    expect(store.canUndo).toBe(false);
  });

  it("removes an empty auto-created carrier with its last child only", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const otherRack = store.addRack("Other rack", 12)!;
    const autoCarrier = placeCarrier(store, rack.id, 2);
    store.placeInContainer(rack.id, childType.slug, autoCarrier.id, "left", 0);
    const autoDevices = plain(rackById(store, rack.id).devices);
    autoDevices[0]!.auto_created = true;
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(autoDevices);
    const before = plain(rackById(store, rack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const parentImageKey = placementKey(layoutId, before[0]!.id);
    const childImageKey = placementKey(layoutId, before[1]!.id);
    const parentImage = {
      filename: "auto-carrier.png",
      dataUrl: "data:image/png;base64,AC",
    };
    const childImage = {
      filename: "last-child.png",
      dataUrl: "data:image/png;base64,LC",
    };
    getImageStore().setDeviceImage(parentImageKey, "front", parentImage);
    getImageStore().setDeviceImage(childImageKey, "front", childImage);
    store.clearHistory();

    store.removeDeviceFromRack(rack.id, 1);
    expect(rackById(store, rack.id).devices).toEqual([]);
    expect(
      getImageStore().getDeviceImage(parentImageKey, "front"),
    ).toBeUndefined();
    expect(
      getImageStore().getDeviceImage(childImageKey, "front"),
    ).toBeUndefined();
    store.setActiveRack(otherRack.id);
    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(rackById(store, otherRack.id).devices).toEqual([]);
    expect(getImageStore().getDeviceImage(parentImageKey, "front")).toEqual(
      parentImage,
    );
    expect(getImageStore().getDeviceImage(childImageKey, "front")).toEqual(
      childImage,
    );

    store.clearHistory();
    store.setActiveRack(rack.id);
    const userDevices = plain(rackById(store, rack.id).devices);
    userDevices[0]!.auto_created = false;
    store.restoreRackDevicesRaw(userDevices);
    store.removeDeviceFromRack(rack.id, 1);
    expect(rackById(store, rack.id).devices).toEqual([userDevices[0]]);
  });

  it("removes an auto carrier when its last child detaches to same-rack rails", () => {
    const store = addTypes();
    const fullCarrier: DeviceType = {
      ...carrierType,
      slug: "full-carrier",
      slots: [
        {
          id: "full",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    const railChild: DeviceType = {
      ...childType,
      slug: "rail-child",
      slot_width: 2,
    };
    store.addDeviceTypeRaw(fullCarrier);
    store.addDeviceTypeRaw(railChild);
    const rack = store.addRack("Rack", 12)!;
    store.placeDevice(rack.id, fullCarrier.slug, 2, "front");
    const carrier = rackById(store, rack.id).devices[0]!;
    store.placeInContainer(rack.id, railChild.slug, carrier.id, "full", 0);
    const configured = plain(rackById(store, rack.id).devices);
    configured[0]!.auto_created = true;
    configured[1]!.custom_fields = { exact: true };
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const carrierImageKey = placementKey(layoutId, carrier.id);
    const carrierImage = {
      filename: "detach-carrier.png",
      dataUrl: "data:image/png;base64,DR",
    };
    getImageStore().setDeviceImage(carrierImageKey, "front", carrierImage);
    store.clearHistory();

    expect(store.moveDevice(rack.id, 1, 8, "front")).toBe(true);
    expect(rackById(store, rack.id).devices).toEqual([
      {
        ...before[1]!,
        position: toInternalUnits(8),
        container_id: undefined,
        slot_id: undefined,
      },
    ]);
    expect(
      getImageStore().getDeviceImage(carrierImageKey, "front"),
    ).toBeUndefined();

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(getImageStore().getDeviceImage(carrierImageKey, "front")).toEqual(
      carrierImage,
    );
    expect(store.canUndo).toBe(false);
  });

  it("validates a same-U detach after pruning the last-child auto carrier", () => {
    const store = addTypes();
    const deepAutoCarrier: DeviceType = {
      ...carrierType,
      slug: "deep-auto-carrier",
      custom_fields: {
        rackula_fit: { dimensions_mm: { depth: 120 } },
      },
      slots: [
        {
          id: "full",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    const deepRailChild: DeviceType = {
      ...childType,
      slug: "deep-rail-child",
      slot_width: 2,
      custom_fields: {
        rackula_fit: { dimensions_mm: { depth: 150 } },
      },
    };
    store.addDeviceTypeRaw(deepAutoCarrier);
    store.addDeviceTypeRaw(deepRailChild);
    const rack = store.addRack("Depth rack", 12)!;
    store.updateRack(rack.id, { depth_mm: 200 });
    expect(store.placeDevice(rack.id, deepAutoCarrier.slug, 4, "front")).toBe(
      true,
    );
    const carrier = rackById(store, rack.id).devices[0]!;
    expect(
      store.placeInContainer(
        rack.id,
        deepRailChild.slug,
        carrier.id,
        "full",
        0,
      ),
    ).toBe(true);
    const configured = plain(rackById(store, rack.id).devices);
    configured[0]!.auto_created = true;
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    store.clearHistory();

    expect(store.moveDevice(rack.id, 1, 4, "rear")).toBe(true);
    expect(rackById(store, rack.id).devices).toEqual([
      {
        ...before[1]!,
        position: toInternalUnits(4),
        face: "rear",
        container_id: undefined,
        slot_id: undefined,
      },
    ]);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(store.canUndo).toBe(false);
  });

  it("removes an auto carrier when its last child moves to another rack's rails", () => {
    const store = addTypes();
    const fullCarrier: DeviceType = {
      ...carrierType,
      slug: "cross-full-carrier",
      slots: [
        {
          id: "full",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    const railChild: DeviceType = {
      ...childType,
      slug: "cross-rail-child",
      slot_width: 2,
    };
    store.addDeviceTypeRaw(fullCarrier);
    store.addDeviceTypeRaw(railChild);
    const sourceRack = store.addRack("Source", 12)!;
    const targetRack = store.addRack("Target", 12)!;
    store.placeDevice(sourceRack.id, fullCarrier.slug, 2, "front");
    const carrier = rackById(store, sourceRack.id).devices[0]!;
    store.placeInContainer(
      sourceRack.id,
      railChild.slug,
      carrier.id,
      "full",
      0,
    );
    const sourceConfigured = plain(rackById(store, sourceRack.id).devices);
    sourceConfigured[0]!.auto_created = true;
    store.setActiveRack(sourceRack.id);
    store.restoreRackDevicesRaw(sourceConfigured);
    const sourceBefore = plain(rackById(store, sourceRack.id).devices);
    const targetBefore = plain(rackById(store, targetRack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const carrierImageKey = placementKey(layoutId, carrier.id);
    const carrierImage = {
      filename: "cross-detach.png",
      dataUrl: "data:image/png;base64,CD",
    };
    getImageStore().setDeviceImage(carrierImageKey, "front", carrierImage);
    store.clearHistory();

    expect(
      store.moveDeviceToRack(sourceRack.id, 1, targetRack.id, 6, "front"),
    ).toBe(true);
    expect(rackById(store, sourceRack.id).devices).toEqual([]);
    expect(rackById(store, targetRack.id).devices[0]).toEqual({
      ...sourceBefore[1]!,
      position: toInternalUnits(6),
      container_id: undefined,
      slot_id: undefined,
    });
    expect(
      getImageStore().getDeviceImage(carrierImageKey, "front"),
    ).toBeUndefined();

    store.undo();
    expect(rackById(store, sourceRack.id).devices).toEqual(sourceBefore);
    expect(rackById(store, targetRack.id).devices).toEqual(targetBefore);
    expect(getImageStore().getDeviceImage(carrierImageKey, "front")).toEqual(
      carrierImage,
    );
    expect(store.canUndo).toBe(false);
  });

  it("excludes the moving child from source assembly depth on same-rack moves", () => {
    const store = getLayoutStore();
    const depthCarrier: DeviceType = {
      ...carrierType,
      slug: "depth-carrier",
      custom_fields: {
        rackula_fit: { dimensions_mm: { width: 400, depth: 50 } },
      },
      slots: [
        {
          id: "full",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    const deepChild: DeviceType = {
      ...childType,
      slug: "deep-moving-child",
      slot_width: 2,
      custom_fields: {
        rackula_fit: { dimensions_mm: { width: 300, depth: 150 } },
      },
    };
    store.addDeviceTypeRaw(depthCarrier);
    store.addDeviceTypeRaw(deepChild);
    const rack = store.addRack("Depth rack", 12)!;
    store.updateRack(rack.id, { depth_mm: 200 });
    store.placeDevice(rack.id, depthCarrier.slug, 4, "front");
    store.placeDevice(rack.id, depthCarrier.slug, 4, "rear");
    const [frontCarrier, rearCarrier] = rackById(store, rack.id).devices;
    expect(
      store.placeInContainer(
        rack.id,
        deepChild.slug,
        frontCarrier!.id,
        "full",
        0,
      ),
    ).toBe(true);
    const before = plain(rackById(store, rack.id).devices);
    const childIndex = before.findIndex(
      (device) => device.container_id === frontCarrier!.id,
    );
    store.clearHistory();

    expect(
      store.moveDeviceIntoContainer(
        rack.id,
        childIndex,
        rack.id,
        rearCarrier!.id,
        "full",
        0,
      ),
    ).toBe(true);
    expect(
      rackById(store, rack.id).devices.find(
        (device) => device.id === before[childIndex]!.id,
      )?.container_id,
    ).toBe(rearCarrier!.id);
    expect(
      rackById(store, rack.id).devices.some(
        (device) => device.id === frontCarrier!.id,
      ),
    ).toBe(true);
    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
  });

  it("validates a carrier move after pruning the last-child auto source", () => {
    const store = addTypes();
    const sourceCarrierType: DeviceType = {
      ...carrierType,
      slug: "deep-auto-source",
      custom_fields: {
        rackula_fit: { dimensions_mm: { depth: 120 } },
      },
      slots: [
        {
          id: "full",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    const targetCarrierType: DeviceType = {
      ...sourceCarrierType,
      slug: "shallow-target",
      custom_fields: {
        rackula_fit: { dimensions_mm: { depth: 50 } },
      },
    };
    const deepChild: DeviceType = {
      ...childType,
      slug: "deep-carried-child",
      slot_width: 2,
      custom_fields: {
        rackula_fit: { dimensions_mm: { depth: 150 } },
      },
    };
    store.addDeviceTypeRaw(sourceCarrierType);
    store.addDeviceTypeRaw(targetCarrierType);
    store.addDeviceTypeRaw(deepChild);
    const rack = store.addRack("Depth rack", 12)!;
    store.updateRack(rack.id, { depth_mm: 200 });
    expect(store.placeDevice(rack.id, sourceCarrierType.slug, 4, "front")).toBe(
      true,
    );
    expect(store.placeDevice(rack.id, targetCarrierType.slug, 4, "rear")).toBe(
      true,
    );
    const [sourceCarrier, targetCarrier] = rackById(store, rack.id).devices;
    expect(
      store.placeInContainer(
        rack.id,
        deepChild.slug,
        sourceCarrier!.id,
        "full",
        0,
      ),
    ).toBe(true);
    const configured = plain(rackById(store, rack.id).devices);
    configured[0]!.auto_created = true;
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    const childIndex = before.findIndex(
      (device) => device.container_id === sourceCarrier!.id,
    );
    store.clearHistory();

    expect(
      store.moveDeviceIntoContainer(
        rack.id,
        childIndex,
        rack.id,
        targetCarrier!.id,
        "full",
        0,
      ),
    ).toBe(true);
    expect(rackById(store, rack.id).devices).toEqual([
      before[1],
      {
        ...before[childIndex]!,
        face: targetCarrier!.face,
        container_id: targetCarrier!.id,
        slot_id: "full",
        position: 0,
      },
    ]);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(store.canUndo).toBe(false);
  });

  it("restores an ordinary middle deletion at its exact index with images", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    store.placeDevice(rack.id, carrierType.slug, 1, "front");
    store.placeDevice(rack.id, carrierType.slug, 4, "front");
    store.placeDevice(rack.id, carrierType.slug, 8, "front");
    const configured = plain(rackById(store, rack.id).devices);
    configured[1]!.custom_fields = { exact: "middle" };
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const imageKey = placementKey(layoutId, before[1]!.id);
    const image = {
      filename: "middle.png",
      dataUrl: "data:image/png;base64,MI",
    };
    getImageStore().setDeviceImage(imageKey, "front", image);
    store.clearHistory();

    store.removeDeviceFromRack(rack.id, 1);
    expect(rackById(store, rack.id).devices.map((device) => device.id)).toEqual(
      [before[0]!.id, before[2]!.id],
    );
    expect(getImageStore().getDeviceImage(imageKey, "front")).toBeUndefined();
    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);
    expect(store.canUndo).toBe(false);
  });

  it("restores exact source and target rosters for a cross-rack occupied assembly move", () => {
    const store = addTypes();
    const sourceRack = store.addRack("Source", 12)!;
    const targetRack = store.addRack("Target", 12)!;
    const sourceBottom = placeCarrier(store, sourceRack.id, 1);
    const assembly = placeCarrier(store, sourceRack.id, 4);
    store.placeInContainer(
      sourceRack.id,
      childType.slug,
      assembly.id,
      "left",
      0,
    );
    const sourceTop = placeCarrier(store, sourceRack.id, 9);
    placeCarrier(store, targetRack.id, 1);
    const sourceConfigured = plain(rackById(store, sourceRack.id).devices);
    const assemblyIndex = sourceConfigured.findIndex(
      (device) => device.id === assembly.id,
    );
    sourceConfigured[assemblyIndex]!.custom_fields = { exact: "assembly" };
    store.setActiveRack(sourceRack.id);
    store.restoreRackDevicesRaw(sourceConfigured);
    const sourceBefore = plain(rackById(store, sourceRack.id).devices);
    const targetBefore = plain(rackById(store, targetRack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const imageKey = placementKey(layoutId, assembly.id);
    const image = {
      filename: "assembly.png",
      dataUrl: "data:image/png;base64,AS",
    };
    getImageStore().setDeviceImage(imageKey, "front", image);
    store.clearHistory();

    expect(
      store.moveDeviceToRack(
        sourceRack.id,
        assemblyIndex,
        targetRack.id,
        7,
        "rear",
      ),
    ).toBe(true);
    expect(rackById(store, sourceRack.id).devices.map((d) => d.id)).toEqual([
      sourceBottom.id,
      sourceTop.id,
    ]);
    expect(
      rackById(store, targetRack.id).devices.find(
        (device) => device.id === assembly.id,
      ),
    ).toMatchObject({
      id: assembly.id,
      custom_fields: { exact: "assembly" },
      position: toInternalUnits(7),
      face: "rear",
    });
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);

    store.undo();
    expect(rackById(store, sourceRack.id).devices).toEqual(sourceBefore);
    expect(rackById(store, targetRack.id).devices).toEqual(targetBefore);
    expect(getImageStore().getDeviceImage(imageKey, "front")).toEqual(image);
    expect(store.canUndo).toBe(false);
    store.redo();
    expect(
      rackById(store, targetRack.id).devices.some(
        (device) => device.id === assembly.id,
      ),
    ).toBe(true);
  });
});
