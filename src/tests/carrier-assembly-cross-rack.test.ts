import { beforeEach, describe, expect, it } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import type { DeviceType } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";
import {
  carrierType,
  childType,
  plain,
  rackById,
} from "./helpers/carrier-assembly";

describe("cross-rack carrier assembly integrity", () => {
  beforeEach(() => resetLayoutStore());

  it("keeps a full-depth occupied carrier and its children on both faces", () => {
    const store = getLayoutStore();
    const fullDepthCarrier: DeviceType = {
      slug: "full-depth-carrier",
      model: "Full-depth Carrier",
      category: carrierType.category,
      colour: carrierType.colour,
      u_height: carrierType.u_height,
      slots: carrierType.slots,
    };
    store.addDeviceTypeRaw(fullDepthCarrier);
    store.addDeviceTypeRaw(childType);
    const sourceRack = store.addRack("Source", 12)!;
    const targetRack = store.addRack("Target", 12)!;

    expect(
      store.placeDevice(sourceRack.id, fullDepthCarrier.slug, 3, "front"),
    ).toBe(true);
    const carrier = rackById(store, sourceRack.id).devices[0]!;
    expect(
      store.placeInContainer(
        sourceRack.id,
        childType.slug,
        carrier.id,
        "left",
        0,
      ),
    ).toBe(true);
    const sourceBefore = plain(rackById(store, sourceRack.id).devices);
    store.clearHistory();

    expect(
      store.moveDeviceToRack(sourceRack.id, 0, targetRack.id, 7, "rear"),
    ).toBe(true);
    expect(rackById(store, sourceRack.id).devices).toEqual([]);
    const targetDevices = rackById(store, targetRack.id).devices;
    expect(targetDevices.map((device) => device.id)).toEqual(
      sourceBefore.map((device) => device.id),
    );
    expect(targetDevices[0]?.position).toBe(toInternalUnits(7));
    expect(targetDevices.map((device) => device.face)).toEqual([
      "both",
      "both",
    ]);
    expect(targetDevices[1]?.container_id).toBe(carrier.id);

    store.undo();
    expect(rackById(store, sourceRack.id).devices).toEqual(sourceBefore);
    expect(rackById(store, targetRack.id).devices).toEqual([]);
    store.redo();
    expect(
      rackById(store, targetRack.id).devices.map((device) => device.face),
    ).toEqual(["both", "both"]);
  });
});
