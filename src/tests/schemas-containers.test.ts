/**
 * Container and slot schema validation tests.
 */

import { describe, it, expect } from "vitest";
import {
  SlotPosition2DSchema,
  SlotSchema,
  DeviceTypeSchema,
  PlacedDeviceSchema,
  LayoutSchema,
} from "$lib/schemas";
import {
  createTestContainerType,
  createTestSlot,
  createTestDevice,
  createTestContainerChild,
  createTestDeviceType,
} from "./factories";

// ============================================================================
// Container Schema Tests (v0.6.0)
// ============================================================================

describe("SlotPosition2DSchema", () => {
  it("accepts valid position", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 0, col: 0 });
    expect(result.success).toBe(true);
  });

  it("accepts non-zero position", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 2, col: 3 });
    expect(result.success).toBe(true);
  });

  it("rejects negative row", () => {
    const result = SlotPosition2DSchema.safeParse({ row: -1, col: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects negative col", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 0, col: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer row", () => {
    const result = SlotPosition2DSchema.safeParse({ row: 1.5, col: 0 });
    expect(result.success).toBe(false);
  });
});

describe("SlotSchema", () => {
  describe("valid slots", () => {
    it("accepts minimal valid slot", () => {
      const slot = { id: "slot-1", position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts slot with all optional fields", () => {
      const slot = {
        id: "bay-1",
        name: "Left Bay",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 2,
        accepts: ["server", "storage"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts slot with factory helper", () => {
      const slot = createTestSlot({ id: "test-slot" });
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });
  });

  describe("id validation", () => {
    it("rejects empty id", () => {
      const slot = { id: "", position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects missing id", () => {
      const slot = { position: { row: 0, col: 0 } };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("width_fraction validation", () => {
    it("accepts 0.5 width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("accepts 1 width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 1,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects width fraction > 1", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 1.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects negative width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: -0.5,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects zero width fraction", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        width_fraction: 0,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("height_units validation", () => {
    it("accepts valid height units", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: 2,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects height_units > 50", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: 51,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });

    it("rejects negative height_units", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        height_units: -1,
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });

  describe("accepts validation", () => {
    it("accepts valid device categories", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        accepts: ["server", "storage", "network"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(true);
    });

    it("rejects invalid device category", () => {
      const slot = {
        id: "slot-1",
        position: { row: 0, col: 0 },
        accepts: ["invalid-category"],
      };
      expect(SlotSchema.safeParse(slot).success).toBe(false);
    });
  });
});

describe("DeviceTypeSchema container support", () => {
  it("accepts device type with slots (container)", () => {
    const containerType = createTestContainerType();
    const result = DeviceTypeSchema.safeParse(containerType);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slots).toBeDefined();
      expect(result.data.slots?.length).toBeGreaterThan(0);
    }
  });

  it("accepts device type without slots (non-container)", () => {
    const normalType = createTestDeviceType({ slug: "normal-device" });
    const result = DeviceTypeSchema.safeParse(normalType);
    expect(result.success).toBe(true);
  });

  it("accepts device type with empty slots array (non-container)", () => {
    const type = { ...createTestDeviceType(), slots: [] };
    const result = DeviceTypeSchema.safeParse(type);
    expect(result.success).toBe(true);
  });

  it("rejects slot rows taller than their container", () => {
    const type = {
      ...createTestDeviceType({ slug: "overflowing-carrier", u_height: 1 }),
      slots: [
        createTestSlot({
          id: "bottom",
          position: { row: 0, col: 0 },
          height_units: 1,
        }),
        createTestSlot({
          id: "top",
          position: { row: 1, col: 0 },
          height_units: 1,
        }),
      ],
    };

    const result = DeviceTypeSchema.safeParse(type);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) =>
          /exceeding the container height/i.test(issue.message),
        ),
      ).toBe(true);
    }
  });
});

describe("PlacedDeviceSchema container child support", () => {
  describe("container_id and slot_id validation", () => {
    it("accepts device with container_id and slot_id", () => {
      const child = createTestContainerChild({
        container_id: "container-1",
        slot_id: "slot-left",
      });
      const result = PlacedDeviceSchema.safeParse(child);
      expect(result.success).toBe(true);
    });

    it("rejects device with container_id but no slot_id", () => {
      const device = {
        id: "child-1",
        device_type: "test-device",
        position: 0,
        face: "front",
        container_id: "container-1",
        // slot_id is missing
      };
      const result = PlacedDeviceSchema.safeParse(device);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "slot_id is required",
        );
      }
    });

    it("accepts device without container_id or slot_id (rack-level)", () => {
      const device = createTestDevice({ position: 1 });
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });
  });

  describe("position validation with container context", () => {
    it("accepts position 0 for container children", () => {
      const child = createTestContainerChild({
        container_id: "container-1",
        slot_id: "slot-left",
        position: 0,
      });
      expect(PlacedDeviceSchema.safeParse(child).success).toBe(true);
    });

    it("rejects position 0 for rack-level devices", () => {
      const device = {
        id: "device-1",
        device_type: "test-device",
        position: 0,
        face: "front",
        // No container_id = rack-level device
      };
      const result = PlacedDeviceSchema.safeParse(device);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Changed from "at least 1" to "at least 0.5" to support half-U positions (#879)
        expect(result.error.issues[0]?.message).toContain("at least 0.5");
      }
    });
  });
});

describe("LayoutSchema container validation", () => {
  const createValidLayout = () => ({
    version: "0.6.0",
    name: "Container Test Layout",
    racks: [
      {
        id: "rack-1",
        name: "Test Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        show_rear: true,
        form_factor: "4-post" as const,
        starting_unit: 1,
        position: 0,
        devices: [],
      },
    ],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: false,
    },
  });

  describe("container_id references", () => {
    it("accepts valid container child relationship", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      // The chassis has half-width slots, so a child must be half-width to fit.
      const childType = createTestDeviceType({
        slug: "blade-server",
        slot_width: 1,
      });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "container-1",
                device_type: "blade-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "container-1",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects container_id referencing non-existent device", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "non-existent-container",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "non-existent container",
        );
      }
    });
  });

  describe("slot_id validation", () => {
    it("rejects invalid slot_id in container", () => {
      const containerType = createTestContainerType({ slug: "blade-chassis" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [containerType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "container-1",
                device_type: "blade-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "container-1",
                slot_id: "invalid-slot-id",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("invalid slot");
      }
    });
  });

  describe("container_id references device without slots", () => {
    it("rejects placing device in non-container", () => {
      // Regular device type (no slots = not a container)
      const normalType = createTestDeviceType({ slug: "regular-server" });
      const childType = createTestDeviceType({ slug: "blade-server" });

      const layout = {
        ...createValidLayout(),
        device_types: [normalType, childType],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "not-a-container",
                device_type: "regular-server",
                position: 10,
                face: "front" as const,
              },
              {
                id: "child-1",
                device_type: "blade-server",
                position: 0,
                face: "front" as const,
                container_id: "not-a-container",
                slot_id: "slot-1",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("has no slots");
      }
    });
  });

  describe("single-level nesting enforcement", () => {
    it("rejects nested containers (container placed in container)", () => {
      // Both types are containers (have slots)
      const outerContainer = createTestContainerType({ slug: "outer-chassis" });
      const innerContainer = createTestContainerType({ slug: "inner-chassis" });

      const layout = {
        ...createValidLayout(),
        device_types: [outerContainer, innerContainer],
        racks: [
          {
            ...createValidLayout().racks[0],
            devices: [
              {
                id: "outer-1",
                device_type: "outer-chassis",
                position: 10,
                face: "front" as const,
              },
              {
                id: "inner-1",
                device_type: "inner-chassis",
                position: 0,
                face: "front" as const,
                container_id: "outer-1",
                slot_id: "slot-left",
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some((i) =>
            i.message.includes("Single-level nesting only"),
          ),
        ).toBe(true);
      }
    });
  });
});
