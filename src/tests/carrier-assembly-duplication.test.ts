import { beforeEach, describe, expect, it } from "vitest";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { getImageStore } from "$lib/stores/images.svelte";
import { placementKey } from "$lib/utils/placement-key";
import {
  addTypes,
  childType,
  placeCarrier,
  plain,
  rackById,
} from "./helpers/carrier-assembly";

describe("carrier assembly duplication", () => {
  beforeEach(() => {
    resetLayoutStore();
    getImageStore().clearAllImages();
  });

  it("duplicates an occupied carrier with children, metadata, and images atomically", () => {
    const store = addTypes();
    const rack = store.addRack("Rack", 12)!;
    const carrier = placeCarrier(store, rack.id, 2);
    store.placeInContainer(rack.id, childType.slug, carrier.id, "left", 0);
    const configured = plain(rackById(store, rack.id).devices);
    configured[0]!.name = "Carrier A";
    configured[1]!.name = "Child A";
    configured[1]!.custom_fields = { exact: "metadata" };
    configured[1]!.ports = [
      {
        id: "source-port",
        template_name: "eth0",
        template_index: 0,
        type: "ethernet",
        label: "WAN",
      },
    ];
    store.setActiveRack(rack.id);
    store.restoreRackDevicesRaw(configured);
    const before = plain(rackById(store, rack.id).devices);
    const layoutId = store.layout.metadata?.id ?? "";
    const parentImage = {
      filename: "carrier.png",
      dataUrl: "data:image/png;base64,PA",
    };
    const childImage = {
      filename: "child.png",
      dataUrl: "data:image/png;base64,CH",
    };
    getImageStore().setDeviceImage(
      placementKey(layoutId, before[0]!.id),
      "front",
      parentImage,
    );
    getImageStore().setDeviceImage(
      placementKey(layoutId, before[1]!.id),
      "front",
      childImage,
    );
    store.clearHistory();

    const result = store.duplicateDevice(rack.id, 0);
    expect(result.error).toBeUndefined();
    const duplicateParent = result.device!;
    const duplicateChild = rackById(store, rack.id).devices.find(
      (device) => device.container_id === duplicateParent.id,
    )!;
    expect(duplicateParent.name).toBe("Carrier A");
    expect(duplicateChild.name).toBe("Child A");
    expect(duplicateChild.custom_fields).toEqual({ exact: "metadata" });
    expect(duplicateChild.id).not.toBe(before[1]!.id);
    expect(duplicateChild.ports?.[0]).toMatchObject({
      template_name: "eth0",
      label: "WAN",
    });
    expect(duplicateChild.ports?.[0]?.id).not.toBe("source-port");
    expect(
      getImageStore().getDeviceImage(
        placementKey(layoutId, duplicateParent.id),
        "front",
      ),
    ).toEqual(parentImage);
    expect(
      getImageStore().getDeviceImage(
        placementKey(layoutId, duplicateChild.id),
        "front",
      ),
    ).toEqual(childImage);

    store.undo();
    expect(rackById(store, rack.id).devices).toEqual(before);
    expect(
      getImageStore().getDeviceImage(
        placementKey(layoutId, duplicateChild.id),
        "front",
      ),
    ).toBeUndefined();
    expect(store.canUndo).toBe(false);
    store.redo();
    // eslint-disable-next-line no-restricted-syntax -- one parent plus one child must duplicate as exactly one linked pair
    expect(rackById(store, rack.id).devices).toHaveLength(4);
  });
});
