import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { toInternalUnits } from "$lib/utils/position";
import { LayoutSchema } from "$lib/schemas";
import { setupStoreWithDevice, createTestDeviceTypeInput } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("placeDevice", () => {
    it("adds device to rack at position", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.markClean();

      const result = store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(result).toBe(true);
      expect(
        store.rack.devices.find((d) => d.device_type === deviceType.slug),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe(deviceType.slug);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("places device with depth-based face default (undefined = full depth = both)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      // Device without is_full_depth specified defaults to full-depth
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      // Full-depth devices default to 'both' face (visible front and rear)
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("places half-depth device with specified rear face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      // Half-depth device can be explicitly placed on rear
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Rear Panel",
          u_height: 1,
          category: "patch-panel",
          colour: "#4A90D9",
          is_full_depth: false,
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5, "rear");
      expect(store.rack.devices[0]!.face).toBe("rear");
    });

    it("places device with specified both face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5, "both");
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("returns false for invalid position (collision)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      const deviceType2 = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Another",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      // device at 5 occupies 5,6. Position 6 would collide.
      const result = store.placeDevice(rack!.id, deviceType2.slug, 6);
      expect(result).toBe(false);
      // eslint-disable-next-line no-restricted-syntax -- Testing collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });

    it("returns false for invalid position (exceeds rack)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      // 2U device at position 42 would occupy 42,43 but rack only has 42
      const result = store.placeDevice(rack!.id, deviceType.slug, 42);
      expect(result).toBe(false);
    });

    it("returns false for position less than 1", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      const result = store.placeDevice(rack!.id, deviceType.slug, 0);
      expect(result).toBe(false);
    });

    it("sets isDirty to true on success", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.markClean();
      expect(store.isDirty).toBe(false);
      store.placeDevice(rack!.id, deviceType.slug, 5);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("moveDevice", () => {
    it("updates device position within rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      const result = store.moveDevice(rack!.id, 0, 10);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(10));
    });

    it("returns false for collision", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      const deviceType2 = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Another",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType2.slug, 10);

      // Try to move first device to 10 (would collide with second device)
      const result = store.moveDevice(rack!.id, 0, 10);
      expect(result).toBe(false);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("sets isDirty to true on success", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();
      expect(store.isDirty).toBe(false);
      store.moveDevice(rack!.id, 0, 10);
      expect(store.isDirty).toBe(true);
    });
  });

  describe("moveDeviceToRack", () => {
    it("delegates to moveDevice for same-rack moves", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Only Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      // Same rack move should work (delegates to moveDevice)
      const result = store.moveDeviceToRack(rack!.id, 0, rack!.id, 10);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(10));
    });
  });

  describe("removeDeviceFromRack", () => {
    it("removes device from rack", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      expect(
        store.rack.devices.find((d) => d.device_type === deviceType.slug),
      ).toBeDefined();
      store.removeDeviceFromRack(rack!.id, 0);
      expect(store.rack.devices).toEqual([]);
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      store.removeDeviceFromRack(rack!.id, 0);
      expect(store.isDirty).toBe(true);
    });

    it("removes an occupied carrier atomically and restores exact order on undo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 12)!;
      const railType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Rail Device",
          u_height: 1,
          category: "network",
          colour: "#4A90D9",
        }),
      );
      const carrierType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Carrier",
          u_height: 1,
          category: "shelf",
          colour: "#8B4513",
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
        }),
      );
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Contained Device",
          u_height: 1,
          category: "server",
          colour: "#336699",
          slot_width: 1,
          is_full_depth: false,
        }),
      );

      store.placeDevice(rack.id, railType.slug, 1);
      store.placeDevice(rack.id, carrierType.slug, 4);
      const carrier = store.rack.devices[1]!;
      expect(
        store.placeInContainer(rack.id, childType.slug, carrier.id, "left", 0),
      ).toBe(true);
      expect(
        store.placeInContainer(rack.id, childType.slug, carrier.id, "right", 0),
      ).toBe(true);
      store.placeDevice(rack.id, railType.slug, 8);

      const before = JSON.parse(
        JSON.stringify(store.rack.devices),
      ) as typeof store.rack.devices;
      const survivingIds = [before[0]!.id, before[4]!.id];
      store.clearHistory();

      store.removeDeviceFromRack(rack.id, 1);

      expect(store.rack.devices.map((device) => device.id)).toEqual(
        survivingIds,
      );
      expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
      expect(store.canUndo).toBe(true);

      store.undo();

      expect(store.rack.devices).toEqual(before);
      expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
      expect(store.canUndo).toBe(false);
      expect(store.canRedo).toBe(true);

      store.redo();

      expect(store.rack.devices.map((device) => device.id)).toEqual(
        survivingIds,
      );
      expect(LayoutSchema.safeParse(store.layout).success).toBe(true);
    });
  });

  describe("updateDeviceName", () => {
    it("updates placed device name", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Device should not have a custom name initially
      expect(store.rack.devices[0]!.name).toBeUndefined();

      // Set a custom name
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");
    });

    it("clears custom name when set to undefined", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Set a custom name first
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");

      // Clear the custom name
      store.updateDeviceName(rack!.id, 0, undefined);
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });

    it("clears custom name when set to empty string", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      store.updateDeviceName(rack!.id, 0, "");
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);
      store.markClean();

      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for name changes", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      // Set a custom name
      store.updateDeviceName(rack!.id, 0, "Primary DB Server");
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.name).toBeUndefined();

      // Redo should restore the name
      store.redo();
      expect(store.rack.devices[0]!.name).toBe("Primary DB Server");
    });

    it("preserves name through multiple updates with undo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Generic Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 5);

      store.updateDeviceName(rack!.id, 0, "First Name");
      store.updateDeviceName(rack!.id, 0, "Second Name");
      store.updateDeviceName(rack!.id, 0, "Third Name");

      expect(store.rack.devices[0]!.name).toBe("Third Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBe("Second Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBe("First Name");

      store.undo();
      expect(store.rack.devices[0]!.name).toBeUndefined();
    });
  });

  describe("updateDeviceNotes", () => {
    it("updates placed device notes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Device should not have notes initially
      expect(store.rack.devices[0]!.notes).toBeUndefined();

      // Set notes
      store.updateDeviceNotes(rackId, 0, "Production database server");
      expect(store.rack.devices[0]!.notes).toBe("Production database server");
    });

    it("clears notes when set to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set notes first
      store.updateDeviceNotes(rackId, 0, "Production database server");
      expect(store.rack.devices[0]!.notes).toBe("Production database server");

      // Clear notes
      store.updateDeviceNotes(rackId, 0, undefined);
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("clears notes when set to empty string", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceNotes(rackId, 0, "Some notes");
      store.updateDeviceNotes(rackId, 0, "");
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("trims whitespace-only notes to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceNotes(rackId, 0, "   ");
      expect(store.rack.devices[0]!.notes).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const { store, rackId } = setupStoreWithDevice();
      store.markClean();

      store.updateDeviceNotes(rackId, 0, "Some notes");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for notes changes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set notes
      store.updateDeviceNotes(rackId, 0, "Production server notes");
      expect(store.rack.devices[0]!.notes).toBe("Production server notes");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.notes).toBeUndefined();

      // Redo should restore the notes
      store.redo();
      expect(store.rack.devices[0]!.notes).toBe("Production server notes");
    });
  });

  describe("updateDeviceIp", () => {
    it("updates placed device IP address", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Device should not have IP initially
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();

      // Set IP
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");
    });

    it("supports hostname values", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "db-primary.local");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("db-primary.local");
    });

    it("clears IP when set to undefined", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP first
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");

      // Clear IP
      store.updateDeviceIp(rackId, 0, undefined);
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });

    it("clears IP when set to empty string", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      store.updateDeviceIp(rackId, 0, "");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });

    it("removes empty custom_fields object when clearing last field", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP which creates custom_fields
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields).toBeDefined();

      // Clear IP should remove empty custom_fields
      store.updateDeviceIp(rackId, 0, undefined);
      expect(store.rack.devices[0]!.custom_fields).toBeUndefined();
    });

    it("sets isDirty to true", () => {
      const { store, rackId } = setupStoreWithDevice();
      store.markClean();

      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.isDirty).toBe(true);
    });

    it("supports undo/redo for IP changes", () => {
      const { store, rackId } = setupStoreWithDevice();

      // Set IP
      store.updateDeviceIp(rackId, 0, "192.168.1.100");
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");

      // Undo should restore undefined
      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();

      // Redo should restore the IP
      store.redo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.100");
    });

    it("preserves IP through multiple updates with undo", () => {
      const { store, rackId } = setupStoreWithDevice();

      store.updateDeviceIp(rackId, 0, "192.168.1.1");
      store.updateDeviceIp(rackId, 0, "192.168.1.2");
      store.updateDeviceIp(rackId, 0, "192.168.1.3");

      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.3");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.2");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBe("192.168.1.1");

      store.undo();
      expect(store.rack.devices[0]!.custom_fields?.ip).toBeUndefined();
    });
  });
});
