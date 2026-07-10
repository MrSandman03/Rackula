import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { toInternalUnits } from "$lib/utils/position";
import { createTestDeviceTypeInput } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("placeDevice with face/depth awareness", () => {
    it("allows placing half-depth rear device at same U as half-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half-Depth Device",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
          is_full_depth: false,
        }),
      );

      // Place on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place on rear at U5 - should succeed because both are half-depth
      const result2 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(true);

      // Both devices should exist at position U5 (stored as internal units)
      const devicesAtU5 = store.rack.devices.filter(
        (d) => d.position === toInternalUnits(5),
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing half-depth pairing (front + rear = 2 devices at same U)
      expect(devicesAtU5).toHaveLength(2);
    });

    it("blocks placing half-depth rear device when full-depth front device exists at same U", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add full-depth device type (default)
      const fullDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Full-Depth Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
          // is_full_depth defaults to true
        }),
      );

      // Add half-depth device type
      const halfDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half-Depth Blank",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
          is_full_depth: false,
        }),
      );

      // Place full-depth on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        fullDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place half-depth on rear at U5 - should FAIL because front is full-depth
      const result2 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(false);

      // Only one device should exist
      // eslint-disable-next-line no-restricted-syntax -- Testing depth-based collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });

    it("blocks placing full-depth rear device when half-depth front device exists at same U", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half-Depth Blank",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
          is_full_depth: false,
        }),
      );

      // Add full-depth device type
      const fullDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Full-Depth Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      // Place half-depth on front at U5
      const result1 = store.placeDevice(
        rack!.id,
        halfDepthType.slug,
        5,
        "front",
      );
      expect(result1).toBe(true);

      // Place full-depth on rear at U5 - should FAIL because new device is full-depth
      const result2 = store.placeDevice(
        rack!.id,
        fullDepthType.slug,
        5,
        "rear",
      );
      expect(result2).toBe(false);

      // Only one device should exist
      // eslint-disable-next-line no-restricted-syntax -- Testing depth-based collision rejection (placement failed, array unchanged)
      expect(store.rack.devices).toHaveLength(1);
    });
  });

  describe("moveDevice with face/depth awareness", () => {
    it("allows moving half-depth rear device to same U as half-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add half-depth device type
      const halfDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half-Depth Device",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
          is_full_depth: false,
        }),
      );

      // Place on front at U5
      store.placeDevice(rack!.id, halfDepthType.slug, 5, "front");

      // Place on rear at U10
      store.placeDevice(rack!.id, halfDepthType.slug, 10, "rear");

      // Move rear device from U10 to U5 - should succeed
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(true);

      // Both devices should be at position U5 (stored as internal units)
      const devicesAtU5 = store.rack.devices.filter(
        (d) => d.position === toInternalUnits(5),
      );
      // eslint-disable-next-line no-restricted-syntax -- Testing half-depth pairing (rear + front = 2 devices at same U)
      expect(devicesAtU5).toHaveLength(2);
    });

    it("blocks moving half-depth rear device to same U as full-depth front device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add full-depth device type
      const fullDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Full-Depth Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      // Add half-depth device type
      const halfDepthType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Half-Depth Blank",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
          is_full_depth: false,
        }),
      );

      // Place full-depth on front at U5
      store.placeDevice(rack!.id, fullDepthType.slug, 5, "front");

      // Place half-depth on rear at U10
      store.placeDevice(rack!.id, halfDepthType.slug, 10, "rear");

      // Move rear device from U10 to U5 - should FAIL because front is full-depth
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(false);

      // Device at index 1 should still be at U10
      expect(store.rack.devices[1]!.position).toBe(toInternalUnits(10));
    });
  });

  describe("0.5U device movement", () => {
    it("rejects moving a 0.5U blank to a half-unit rail position", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "0.5U Device",
          u_height: 0.5,
          category: "blank",
          colour: "#2F4F4F",
        }),
      );

      // Place at whole-U position 1 (rails register at whole-U boundaries)
      const placed = store.placeDevice(rack!.id, halfUType.slug, 1, "front");
      expect(placed).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(1));

      // Move to fractional position 1.5 - rejected at the chokepoint, the device
      // stays at its whole-U position (rail positions must be whole-U, #2667).
      const result = store.moveDevice(rack!.id, 0, 1.5);
      expect(result).toBe(false);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(1));
    });

    it("allows moving a 0.5U blank between whole-U rail positions", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "0.5U Device",
          u_height: 0.5,
          category: "blank",
          colour: "#2F4F4F",
        }),
      );

      // Place at whole-U position 1
      const placed = store.placeDevice(rack!.id, halfUType.slug, 1, "front");
      expect(placed).toBe(true);

      // Move to whole-U position 2 - should succeed
      const result = store.moveDevice(rack!.id, 0, 2);
      expect(result).toBe(true);
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(2));
    });

    it("blocks 0.5U device from exceeding rack height", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "0.5U Device",
          u_height: 0.5,
          category: "blank",
          colour: "#2F4F4F",
        }),
      );

      // Place at position 42
      store.placeDevice(rack!.id, halfUType.slug, 42, "front");

      // Position 43 definitely exceeds rack height
      const result = store.moveDevice(rack!.id, 0, 43);
      expect(result).toBe(false);
    });

    it("detects collision between 1U devices at same position", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 1U device type (collision detection works correctly for 1U)
      const oneUType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "1U Device",
          u_height: 1,
          category: "blank",
          colour: "#2F4F4F",
        }),
      );

      // Place first device at U5
      store.placeDevice(rack!.id, oneUType.slug, 5, "front");

      // Place second device at U10
      store.placeDevice(rack!.id, oneUType.slug, 10, "front");

      // Try to move second device to U5 - should fail (collision on same face)
      const result = store.moveDevice(rack!.id, 1, 5);
      expect(result).toBe(false);
    });

    it("rejects moving a 0.5U blank onto a half-unit rail position next to a sibling", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add 0.5U device type
      const halfUType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "0.5U Device",
          u_height: 0.5,
          category: "blank",
          colour: "#2F4F4F",
        }),
      );

      // Place first device at U5
      store.placeDevice(rack!.id, halfUType.slug, 5, "front");

      // Place second device at U10
      store.placeDevice(rack!.id, halfUType.slug, 10, "front");

      // Move second device to fractional U5.5 - rejected by the whole-U rail
      // guard (#2667), so the device keeps its whole-U position.
      const result = store.moveDevice(rack!.id, 1, 5.5);
      expect(result).toBe(false);
      expect(store.rack.devices[1]!.position).toBe(toInternalUnits(10));
    });
  });

  describe("duplicateDevice", () => {
    it("rejects direct duplication of a contained child", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42)!;
      const carrierType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Carrier",
          u_height: 1,
          category: "shelf",
          colour: "#8B4513",
          slots: [
            {
              id: "main",
              position: { row: 0, col: 0 },
              width_fraction: 1,
              height_units: 1,
            },
          ],
        }),
      );
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Contained Device",
          u_height: 0.5,
          category: "network",
          colour: "#4A90D9",
          slot_width: 2,
          is_full_depth: false,
        }),
      );

      store.placeDevice(rack.id, carrierType.slug, 10);
      const carrier = store.rack.devices[0]!;
      expect(
        store.placeInContainer(rack.id, childType.slug, carrier.id, "main", 0),
      ).toBe(true);
      const childIndex = store.rack.devices.findIndex(
        (device) => device.container_id === carrier.id,
      );
      const initialDevices = [...store.rack.devices];

      const result = store.duplicateDevice(rack.id, childIndex);

      expect(result.device).toBeUndefined();
      expect(result.error).toBe(
        "Contained devices must be duplicated through their carrier",
      );
      expect(store.rack.devices).toEqual(initialDevices);
    });

    it("duplicates device with all properties inherited", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Add a device type and place it
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Set a custom name on the device
      store.updateDeviceName(rack!.id, 0, "Primary Server");

      // Duplicate the device
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.device!.id).not.toBe(store.rack.devices[0]!.id); // Must have unique ID
      expect(result.device!.device_type).toBe(deviceType.slug);
      expect(result.device!.name).toBe("Primary Server"); // Custom name inherited
    });

    it("places duplicate in next available slot on same face", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create a half-depth device (is_full_depth: false) to test face inheritance
      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
          is_full_depth: false, // Half-depth allows explicit face
        }),
      );
      // Place at U10 (occupies U10-U11) on front face
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Duplicate
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Original 2U device occupies U10-U11, so the next slot above (U12) is the
      // first valid, preferred position. Compare in internal units so a same-slot
      // (U10) placement would fail this assertion.
      expect(result.device!.position).toBe(toInternalUnits(12));
      // Should be on same face as original
      expect(result.device!.face).toBe("front");
    });

    it("prefers adjacent slot when available", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Small Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      // Place at U10
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Should prefer adjacent slot (either U9 or U11) - stored as internal units
      const adjacentPositions = [toInternalUnits(9), toInternalUnits(11)];
      expect(adjacentPositions).toContain(result.device!.position);
    });

    it("returns error if rack is full", () => {
      const store = getLayoutStore();
      // Create a tiny 2U rack
      const rack = store.addRack("Tiny Rack", 2);

      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "2U Server",
          u_height: 2,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      // Fill the rack completely
      store.placeDevice(rack!.id, deviceType.slug, 1, "front");

      // Try to duplicate - should fail
      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
      expect(result.error).toContain("no available space");
    });

    it("returns error if device index is invalid", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const result = store.duplicateDevice(rack!.id, 99);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("returns error if rack is not found", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);

      const result = store.duplicateDevice("nonexistent-rack", 0);

      expect(result.device).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it("inherits colour override from original device", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Set a colour override and capture it for comparison
      const customColour = "#FF5500";
      store.updateDeviceColour(rack!.id, 0, customColour);
      const originalDevice = store.rack.devices[0]!;

      const result = store.duplicateDevice(rack!.id, 0);

      expect(result.device).toBeDefined();
      // Verify duplicate inherits the same colour override as the original
      expect(result.device!.colour_override).toBe(
        originalDevice.colour_override,
      );
    });

    it("works with undo/redo", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const deviceType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Server",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );
      store.placeDevice(rack!.id, deviceType.slug, 10, "front");

      // Clear history for clean test
      store.clearHistory();

      const initialCount = store.rack.devices.length;
      const result = store.duplicateDevice(rack!.id, 0);
      expect(result.device).toBeDefined();
      expect(store.rack.devices.length).toBe(initialCount + 1);

      // Undo should remove the duplicate
      store.undo();
      expect(store.rack.devices.length).toBe(initialCount);

      // Redo should restore the duplicate
      store.redo();
      expect(store.rack.devices.length).toBe(initialCount + 1);
    });
  });
});
