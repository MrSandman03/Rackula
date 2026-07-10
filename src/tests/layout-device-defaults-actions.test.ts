import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  createTestDevice,
  createTestDeviceType,
  createTestDeviceTypeInput,
} from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("placeDevice face defaults based on depth", () => {
    it("full-depth device defaults to both face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a full-depth device type
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Full Depth Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
          is_full_depth: true,
        }),
      );

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth device defaults to front face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a half-depth device type
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half Depth Switch",
          u_height: 1,
          category: "network",
          colour: "#7B68EE",
          is_full_depth: false,
        }),
      );

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("front");
    });

    it("device with undefined is_full_depth defaults to both face (full depth assumed)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create device without is_full_depth specified (defaults to full depth)
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Default Depth Device",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
          // is_full_depth not specified
        }),
      );

      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("full-depth device ignores explicit face and uses both", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Full-depth devices physically occupy both front and rear
      // Even if 'front' is passed (e.g., from RackDualView drop), it should be 'both'
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Full Depth Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
          is_full_depth: true,
        }),
      );

      store.placeDevice(rack!.id, deviceType.slug, 5, "front");
      // Full-depth devices ALWAYS use 'both' regardless of passed face
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth device respects explicit face parameter", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Half-depth devices can be front-mounted or rear-mounted
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Patch Panel",
          u_height: 1,
          category: "patch-panel",
          colour: "#7B68EE",
          is_full_depth: false,
        }),
      );

      // Explicitly place on rear
      store.placeDevice(rack!.id, deviceType.slug, 5, "rear");
      expect(store.rack.devices[0]!.face).toBe("rear");
    });
  });

  describe("custom multi-U device placement (Issue #166)", () => {
    it("preserves u_height for custom 4U device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 4U device
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "RACKOWL 4U Server",
          u_height: 4,
          category: "server",
          colour: "#3b82f6",
        }),
      );

      // Verify the device type was created with correct u_height
      expect(deviceType.u_height).toBe(4);
      expect(
        store.device_types.find((d) => d.slug === deviceType.slug)?.u_height,
      ).toBe(4);

      // Place the device
      const result = store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(result).toBe(true);

      // After placement, the device type in store should still have u_height: 4
      const storedType = store.device_types.find(
        (d) => d.slug === deviceType.slug,
      );
      expect(storedType?.u_height).toBe(4);
    });

    it("custom 2U device blocks both U positions", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 2U device
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Custom 2U Server",
          u_height: 2,
          category: "server",
          colour: "#ef4444",
        }),
      );

      // Place at position 10 (should occupy 10-11)
      store.placeDevice(rack!.id, deviceType.slug, 10);

      // Create another 1U device
      const otherDevice = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Other Device",
          u_height: 1,
          category: "server",
          colour: "#22c55e",
        }),
      );

      // Try to place at position 11 - should fail because 2U device at 10 occupies 10-11
      const result = store.placeDevice(rack!.id, otherDevice.slug, 11);
      expect(result).toBe(false);

      // But position 12 should work
      const result2 = store.placeDevice(rack!.id, otherDevice.slug, 12);
      expect(result2).toBe(true);
    });

    it("custom 4U device collision detection works correctly", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a custom 4U device
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Big 4U Server",
          u_height: 4,
          category: "server",
          colour: "#8b5cf6",
        }),
      );

      // Place at position 20 (should occupy U20-23)
      const result1 = store.placeDevice(rack!.id, deviceType.slug, 20);
      expect(result1).toBe(true);

      // Create a 1U device
      const smallDevice = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Small Device",
          u_height: 1,
          category: "server",
          colour: "#f59e0b",
        }),
      );

      // All positions 20-23 should be blocked
      expect(store.placeDevice(rack!.id, smallDevice.slug, 20)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 21)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 22)).toBe(false);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 23)).toBe(false);

      // Position 19 (below) and 24 (above) should be available
      expect(store.placeDevice(rack!.id, smallDevice.slug, 19)).toBe(true);
      expect(store.placeDevice(rack!.id, smallDevice.slug, 24)).toBe(true);
    });
  });

  describe("duplicate device ID guards (#1363)", () => {
    it("placeDeviceRaw regenerates ID when duplicate exists in rack", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);
      const deviceType = createTestDeviceType({
        slug: "server-1",
        u_height: 1,
        category: "server",
      });
      store.addDeviceTypeRaw(deviceType);

      // Place first device with a known ID
      const device1 = createTestDevice({
        id: "dupe-id",
        device_type: "server-1",
        position: 5,
      });
      store.placeDeviceRaw(device1);

      // Place second device with the same ID
      const device2 = createTestDevice({
        id: "dupe-id",
        device_type: "server-1",
        position: 10,
      });
      store.placeDeviceRaw(device2);

      const devices = store.layout.racks[0].devices;
      // eslint-disable-next-line no-restricted-syntax -- dedup invariant: 2 inputs must produce exactly 2 outputs
      expect(devices).toHaveLength(2);
      // First device keeps its ID, second gets regenerated
      expect(devices[0].id).toBe("dupe-id");
      expect(devices[1].id).not.toBe("dupe-id");
    });

    it("restoreRackDevicesRaw deduplicates IDs in restored array", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);

      const devicesWithDupes = [
        createTestDevice({ id: "same-id", device_type: "server", position: 5 }),
        createTestDevice({
          id: "same-id",
          device_type: "server",
          position: 10,
        }),
        createTestDevice({
          id: "unique-id",
          device_type: "server",
          position: 15,
        }),
      ];

      store.restoreRackDevicesRaw(devicesWithDupes);

      const devices = store.layout.racks[0].devices;
      // eslint-disable-next-line no-restricted-syntax -- dedup invariant: 3 inputs must produce exactly 3 outputs
      expect(devices).toHaveLength(3);
      // First keeps its ID, second gets regenerated, third keeps its unique ID
      expect(devices[0].id).toBe("same-id");
      expect(devices[1].id).not.toBe("same-id");
      expect(devices[2].id).toBe("unique-id");
      // All IDs are unique
      const ids = new Set(devices.map((d) => d.id));
      expect(ids.size).toBe(3);
    });
  });
});
