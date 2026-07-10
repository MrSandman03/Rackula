import { describe, it, expect, beforeEach } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { toInternalUnits } from "$lib/utils/position";
import { createTestDeviceTypeInput } from "./factories";

describe("Layout Store", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  describe("placeInContainer", () => {
    it("places device in container slot with container_id and slot_id", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create container type with slots
      const containerType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Shelf",
          u_height: 2,
          category: "server",
          colour: "#8B4513",
          slots: [
            {
              id: "slot-left",
              position: { row: 0, col: 0 },
              width_fraction: 0.5,
            },
            {
              id: "slot-right",
              position: { row: 0, col: 1 },
              width_fraction: 0.5,
            },
          ],
        }),
      );
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
          slot_width: 1, // Half-width device fits in 0.5 fraction slot
          is_full_depth: false, // Half-width devices must be half-depth
        }),
      );

      // Place container at rack level
      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      // Place child in container slot
      const success = store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );

      expect(success).toBe(true);
      const child = store.activeRack!.devices[1]!;
      expect(child.container_id).toBe(container.id);
      expect(child.slot_id).toBe("slot-left");
      expect(child.position).toBe(0);
    });

    it("returns false when container not found", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      const success = store.placeInContainer(
        rack!.id,
        childType.slug,
        "nonexistent-id",
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });

    it("inherits face from container", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Create half-depth container so we can set explicit face
      const containerType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Shelf",
          u_height: 2,
          category: "server",
          colour: "#8B4513",
          is_full_depth: false,
          slots: [
            {
              id: "slot-left",
              position: { row: 0, col: 0 },
              width_fraction: 0.5,
            },
          ],
        }),
      );
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
          slot_width: 1, // Half-width device fits in 0.5 fraction slot
          is_full_depth: false, // Half-width devices must be half-depth
        }),
      );

      // Place container on rear face
      store.placeDevice(rack!.id, containerType.slug, 10, "rear");
      const container = store.activeRack!.devices[0]!;
      expect(container.face).toBe("rear");

      // Place child in container
      store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );

      const child = store.activeRack!.devices[1]!;
      expect(child.face).toBe("rear");
    });

    it("supports undo/redo for container placement", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const containerType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Shelf",
          u_height: 2,
          category: "server",
          colour: "#8B4513",
          slots: [
            {
              id: "slot-left",
              position: { row: 0, col: 0 },
              width_fraction: 0.5,
            },
          ],
        }),
      );
      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
          slot_width: 1, // Half-width device fits in 0.5 fraction slot
          is_full_depth: false, // Half-width devices must be half-depth
        }),
      );

      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      // Clear history for clean test
      store.clearHistory();

      const initialDeviceCount = store.activeRack!.devices.length;
      store.placeInContainer(
        rack!.id,
        childType.slug,
        container.id,
        "slot-left",
        0,
      );
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount + 1);

      // Undo should remove the child
      store.undo();
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount);

      // Redo should restore the child
      store.redo();
      expect(store.activeRack!.devices.length).toBe(initialDeviceCount + 1);
    });

    it("returns false when rack not found", () => {
      const store = getLayoutStore();
      store.addRack("Test Rack", 42);

      const childType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Mini PC",
          u_height: 1,
          category: "server",
          colour: "#4A90D9",
        }),
      );

      const success = store.placeInContainer(
        "nonexistent-rack",
        childType.slug,
        "container-id",
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });

    it("returns false when child device type not found", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const containerType = store.addDeviceType(
        createTestDeviceTypeInput({
          name: "Test Shelf",
          u_height: 2,
          category: "server",
          colour: "#8B4513",
          slots: [
            {
              id: "slot-left",
              position: { row: 0, col: 0 },
              width_fraction: 0.5,
            },
          ],
        }),
      );

      store.placeDevice(rack!.id, containerType.slug, 10);
      const container = store.activeRack!.devices[0]!;

      const success = store.placeInContainer(
        rack!.id,
        "nonexistent-device-type",
        container.id,
        "slot-left",
        0,
      );

      expect(success).toBe(false);
    });

    it("places child when container type is missing from layout but resolvable globally (#2127)", () => {
      const store = getLayoutStore();

      // Load a layout where the container device references a starter
      // library type that is NOT embedded in layout.device_types
      store.loadLayout({
        version: "0.7.0",
        name: "Container Lookup Test",
        racks: [
          {
            id: "rack-1",
            name: "Test Rack",
            height: 42,
            width: 19,
            desc_units: false,
            form_factor: "4-post-cabinet",
            starting_unit: 1,
            position: 0,
            devices: [
              {
                id: "container-1",
                device_type: "shelf-1u-2slot", // starter library container
                position: 60,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [],
        settings: {
          display_mode: "label",
          show_labels_on_images: false,
        },
      });

      const success = store.placeInContainer(
        "rack-1",
        "generic-mini-pc", // starter library mini device
        "container-1",
        "left",
        0,
      );

      expect(success).toBe(true);
      const child = store.layout.racks[0]!.devices.find(
        (d) => d.container_id === "container-1",
      );
      expect(child).toBeDefined();
      expect(child!.slot_id).toBe("left");
    });
  });

  describe("placeDevice with brand pack devices", () => {
    it("places Ubiquiti brand pack device successfully", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Ubiquiti device slug from brand pack (not in starter library)
      const result = store.placeDevice(
        rack!.id,
        "ubiquiti-unifi-switch-24-pro",
        5,
      );

      expect(result).toBe(true);
      expect(
        store.rack.devices.find(
          (d) => d.device_type === "ubiquiti-unifi-switch-24-pro",
        ),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe(
        "ubiquiti-unifi-switch-24-pro",
      );
      expect(store.rack.devices[0]!.position).toBe(toInternalUnits(5));
    });

    it("places Mikrotik brand pack device successfully", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Mikrotik device slug from brand pack
      const result = store.placeDevice(rack!.id, "crs326-24g-2s-plus", 10);

      expect(result).toBe(true);
      expect(
        store.rack.devices.find((d) => d.device_type === "crs326-24g-2s-plus"),
      ).toBeDefined();
      expect(store.rack.devices[0]!.device_type).toBe("crs326-24g-2s-plus");
    });

    it("auto-imports brand device into device_types on first placement", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Initially, brand device is not in device_types
      const initialCount = store.device_types.length;
      expect(
        store.device_types.find(
          (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
        ),
      ).toBeUndefined();

      // Place brand device
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      // Device should now be in device_types
      expect(store.device_types.length).toBe(initialCount + 1);
      const imported = store.device_types.find(
        (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
      );
      expect(imported).toBeDefined();
      expect(imported?.manufacturer).toBe("Ubiquiti");
      expect(imported?.model).toBe("USW-Pro-24");
    });

    it("does not duplicate device_type when placing same brand device twice", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Place same brand device twice at different positions
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);
      const countAfterFirst = store.device_types.length;

      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 10);
      expect(store.device_types.length).toBe(countAfterFirst);
    });

    it("returns false for unknown slug (not in library or brand packs)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      const result = store.placeDevice(rack!.id, "nonexistent-device-xyz", 5);
      expect(result).toBe(false);
      // eslint-disable-next-line no-restricted-syntax -- Testing device lookup failure (no placement, empty array)
      expect(store.rack.devices).toHaveLength(0);
    });

    it("preserves brand device properties when auto-imported", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      const imported = store.device_types.find(
        (d) => d.slug === "ubiquiti-unifi-switch-24-pro",
      );
      expect(imported?.is_full_depth).toBe(false);
      // Schema v1.0.0: Flat structure with category at top level
      expect(imported?.category).toBe("network");
    });

    it("full-depth brand device defaults to both face when placed", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // US-24-500W has is_full_depth: true (legacy switch with power supply)
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-500w", 5);

      // Full-depth devices should default to 'both' face (visible front and rear)
      expect(store.rack.devices[0]!.face).toBe("both");
    });

    it("half-depth brand device defaults to front face when placed", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Ubiquiti PDU has is_full_depth: false
      store.placeDevice(rack!.id, "ubiquiti-usp-pdu-pro", 5);

      // Half-depth devices should default to 'front' face
      expect(store.rack.devices[0]!.face).toBe("front");
    });

    it("auto-import creates new array reference for Svelte reactivity", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Capture the original array reference
      const originalDeviceTypes = store.device_types;

      // Place a brand device that will trigger auto-import
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);

      // The device_types array should be a NEW reference (not mutated in place)
      // This is required for Svelte 5 reactivity to trigger UI updates
      expect(store.device_types).not.toBe(originalDeviceTypes);

      // But should still contain all original items plus the new one
      expect(store.device_types.length).toBe(originalDeviceTypes.length + 1);
    });

    it("failed placement does not auto-import or mark dirty (#1470)", () => {
      const store = getLayoutStore();
      const rack = store.addRack("Test Rack", 42);

      // Place a brand device at position 5 to create a collision target
      store.placeDevice(rack!.id, "ubiquiti-unifi-switch-24-pro", 5);
      store.markClean();
      expect(store.isDirty).toBe(false);

      const typeCountBefore = store.device_types.length;

      // Place a different brand device at the same position (collision)
      const result = store.placeDevice(
        rack!.id,
        "ubiquiti-unifi-dream-machine-pro",
        5,
      );

      // Placement failed — nothing should have been imported or dirtied
      expect(result).toBe(false);
      expect(store.isDirty).toBe(false);
      expect(store.device_types.length).toBe(typeCountBefore);
    });
  });
});
