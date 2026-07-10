import { expect } from "vitest";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import type { DeviceType, PlacedDevice, Rack } from "$lib/types";
import { toInternalUnits } from "$lib/utils/position";

export const carrierType: DeviceType = {
  slug: "test-carrier",
  model: "Test Carrier",
  category: "shelf",
  colour: "#555555",
  u_height: 1,
  is_full_depth: false,
  slots: [
    {
      id: "left",
      position: { row: 0, col: 0 },
      width_fraction: 0.5,
      height_units: 1,
    },
    {
      id: "right",
      position: { row: 0, col: 1 },
      width_fraction: 0.5,
      height_units: 1,
    },
  ],
};

export const childType: DeviceType = {
  slug: "test-child",
  model: "Test Child",
  category: "network",
  colour: "#336699",
  u_height: 1,
  slot_width: 1,
  is_full_depth: false,
  interfaces: [{ name: "eth0", type: "1000base-t" }],
};

export function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function addTypes(): ReturnType<typeof getLayoutStore> {
  const store = getLayoutStore();
  store.addDeviceTypeRaw(carrierType);
  store.addDeviceTypeRaw(childType);
  return store;
}

export function rackById(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
): Rack {
  return store.layout.racks.find((rack) => rack.id === rackId)!;
}

export function placeCarrier(
  store: ReturnType<typeof getLayoutStore>,
  rackId: string,
  position: number,
): PlacedDevice {
  expect(store.placeDevice(rackId, carrierType.slug, position, "front")).toBe(
    true,
  );
  return rackById(store, rackId).devices.find(
    (device) => device.position === toInternalUnits(position),
  )!;
}
