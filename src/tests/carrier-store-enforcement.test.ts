/**
 * Carrier-First Store Enforcement Tests (C4, epic #2158)
 *
 * Locks carrier-first placement at the store boundary for direct placement and
 * device moves. Each test starts with fresh layout and history stores.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { CATEGORY_COLOURS } from "$lib/types/constants";

beforeEach(() => {
  resetLayoutStore();
  resetHistoryStore();
});

// =============================================================================
// Store enforcement (placeDevice)
// =============================================================================

describe("placeDevice store enforcement", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  function setupRack(
    height = 12,
    width: 10 | 19 | 21 | 23 = 19,
  ): { store: Store; rackId: string } {
    const store = getLayoutStore()!;
    const rack = store.addRack("Test Rack", height, width);
    return { store, rackId: rack!.id };
  }

  it("rejects a sub-U half-width device placed directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "RB5009",
      u_height: 0.5,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(false);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      false,
    );
  });

  it("rejects a half-width full-height device placed directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Mini 1U",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(false);
  });

  it("places a full-width whole-U device directly via placeDevice", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Server 1U",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(true);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      true,
    );
  });

  it("places a native 10-inch whole-U device directly on a 10-inch rack", () => {
    const { store, rackId } = setupRack(12, 10);
    const dt = store.addDeviceType({
      name: "Native 10-inch PDU",
      u_height: 1,
      category: "power",
      colour: CATEGORY_COLOURS.power,
      is_full_depth: false,
      slot_width: 1,
      rack_widths: [10],
    });

    expect(store.placeDevice(rackId, dt.slug, 5, "rear")).toBe(true);
    const placed = store.rack!.devices.find((d) => d.device_type === dt.slug);
    expect(placed?.container_id).toBeUndefined();
    expect(placed?.face).toBe("rear");
  });

  it("keeps native 10-inch devices off 19-inch bare rails", () => {
    const { store, rackId } = setupRack(12, 19);
    const dt = store.addDeviceType({
      name: "Native 10-inch PDU",
      u_height: 1,
      category: "power",
      colour: CATEGORY_COLOURS.power,
      is_full_depth: false,
      slot_width: 1,
      rack_widths: [10],
    });

    expect(store.placeDevice(rackId, dt.slug, 5, "rear")).toBe(false);
  });

  it("places native 10-inch devices via smart placement without synthesizing a carrier", () => {
    const { store, rackId } = setupRack(12, 10);
    const dt = store.addDeviceType({
      name: "Native 10-inch PDU",
      u_height: 1,
      category: "power",
      colour: CATEGORY_COLOURS.power,
      is_full_depth: false,
      slot_width: 1,
      rack_widths: [10],
    });

    expect(store.placeDeviceSmart(rackId, dt.slug, 5, "rear")).toBe(true);
    const placed = store.rack!.devices.find((d) => d.device_type === dt.slug);
    expect(placed).toBeDefined();
    expect(placed?.auto_created).toBeUndefined();
    expect(store.rack!.devices.some((d) => d.auto_created)).toBe(false);
  });

  it("keeps compatible tray-only child devices off bare rails", () => {
    const { store, rackId } = setupRack(12, 10);
    const dt = store.addDeviceType({
      name: "Tray-Only Switch",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
      rack_widths: [10, 19],
      subdevice_role: "child",
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(false);
  });

  it("places a sub-U blank panel directly via placeDevice (exemption)", () => {
    const { store, rackId } = setupRack();
    const dt = store.addDeviceType({
      name: "Blank Panel",
      u_height: 0.5,
      category: "blank",
      colour: CATEGORY_COLOURS.blank,
    });

    expect(store.placeDevice(rackId, dt.slug, 5)).toBe(true);
    expect(store.rack!.devices.some((d) => d.device_type === dt.slug)).toBe(
      true,
    );
  });
});

describe("moveDevice store enforcement (carrier-first parity)", () => {
  type Store = NonNullable<ReturnType<typeof getLayoutStore>>;

  /** Seed a carrier holding one half-width child; return store + ids. */
  function setupCarrierWithChild(): {
    store: Store;
    rackId: string;
    childIndex: number;
  } {
    const store = getLayoutStore()!;
    const carrierType = store.addDeviceType({
      name: "Carrier",
      u_height: 1,
      category: "shelf",
      colour: CATEGORY_COLOURS.shelf,
      slots: [
        {
          id: "col-1",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
          height_units: 1,
        },
        {
          id: "col-2",
          position: { row: 0, col: 1 },
          width_fraction: 0.5,
          height_units: 1,
        },
      ],
    });
    const childType = store.addDeviceType({
      name: "Half",
      u_height: 1,
      category: "network",
      colour: CATEGORY_COLOURS.network,
      slot_width: 1,
    });
    const rack = store.addRack("Rack", 42)!;
    store.placeDevice(rack.id, carrierType.slug, 5);
    const carrier = store.rack!.devices.find(
      (d) => d.device_type === carrierType.slug,
    )!;
    store.placeInContainer(rack.id, childType.slug, carrier.id, "col-1", 0);
    const child = store.rack!.devices.find(
      (d) => d.container_id === carrier.id,
    )!;
    return {
      store,
      rackId: rack.id,
      childIndex: store.rack!.devices.indexOf(child),
    };
  }

  it("refuses to move a half-width child out onto a bare rail", () => {
    const { store, rackId, childIndex } = setupCarrierWithChild();
    const child = store.rack!.devices[childIndex]!;
    const containerId = child.container_id;

    expect(store.moveDevice(rackId, childIndex, 10)).toBe(false);

    // The child stays in its carrier; it is not detached onto the rail.
    const after = store.rack!.devices.find((d) => d.id === child.id)!;
    expect(after.container_id).toBe(containerId);
  });

  it("still moves a full-width rail device", () => {
    const store = getLayoutStore()!;
    const dt = store.addDeviceType({
      name: "Server",
      u_height: 1,
      category: "server",
      colour: CATEGORY_COLOURS.server,
      slot_width: 2,
    });
    const rack = store.addRack("Rack", 42)!;
    store.placeDevice(rack.id, dt.slug, 5);
    const idx = store.rack!.devices.findIndex((d) => d.device_type === dt.slug);

    expect(store.moveDevice(rack.id, idx, 10)).toBe(true);
  });
});
