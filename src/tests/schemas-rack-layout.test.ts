/**
 * Rack and base layout schema validation tests.
 */

import { describe, it, expect } from "vitest";
import {
  PlacedDeviceSchema,
  RackSchema,
  LayoutSettingsSchema,
  LayoutSchema,
  LegacySavedLayoutSchema,
} from "$lib/schemas";

// ============================================================================
// PlacedDeviceSchema Tests
// ============================================================================

describe("PlacedDeviceSchema", () => {
  // Schema v1.0.0: PlacedDevice requires id field
  const validPlacedDevice = {
    id: "test-id-123",
    device_type: "test-device",
    position: 1,
    face: "front" as const,
  };

  describe("valid placed devices", () => {
    it("accepts minimal valid placed device", () => {
      expect(PlacedDeviceSchema.safeParse(validPlacedDevice).success).toBe(
        true,
      );
    });

    it("accepts placed device with optional name", () => {
      const device = { ...validPlacedDevice, name: "Web Server 1" };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts rear face", () => {
      const device = { ...validPlacedDevice, face: "rear" as const };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts both face", () => {
      const device = { ...validPlacedDevice, face: "both" as const };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });
  });

  describe("position validation", () => {
    it("accepts position 1", () => {
      const device = { ...validPlacedDevice, position: 1 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts high position numbers", () => {
      const device = { ...validPlacedDevice, position: 42 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("rejects position 0", () => {
      const device = { ...validPlacedDevice, position: 0 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });

    it("rejects negative position", () => {
      const device = { ...validPlacedDevice, position: -1 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });

    it("accepts decimal position for legacy migration (#879)", () => {
      // Decimal positions (like 1.5) are valid for legacy files (pre-0.7.0)
      // Migration converts them to internal units via Math.round()
      const device = { ...validPlacedDevice, position: 1.5 };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("accepts empty name", () => {
      const device = { ...validPlacedDevice, name: "" };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("accepts name with 100 characters", () => {
      const device = { ...validPlacedDevice, name: "a".repeat(100) };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(true);
    });

    it("rejects name over 100 characters", () => {
      const device = { ...validPlacedDevice, name: "a".repeat(101) };
      expect(PlacedDeviceSchema.safeParse(device).success).toBe(false);
    });
  });
});

// ============================================================================
// RackSchema Tests
// ============================================================================

describe("RackSchema", () => {
  const validRack = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  describe("valid racks", () => {
    it("accepts minimal valid rack", () => {
      expect(RackSchema.safeParse(validRack).success).toBe(true);
    });

    it("accepts 10-inch rack", () => {
      const rack = { ...validRack, width: 10 as const };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts rack with devices", () => {
      const rack = {
        ...validRack,
        devices: [
          {
            id: "device-1",
            device_type: "server",
            position: 1,
            face: "front" as const,
          },
        ],
      };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts desc_units true", () => {
      const rack = { ...validRack, desc_units: true };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });
  });

  describe("height validation", () => {
    it("accepts 1U rack (min)", () => {
      const rack = { ...validRack, height: 1 };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("accepts 50U rack (within allowed range)", () => {
      const rack = { ...validRack, height: 50 };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("rejects 0U rack", () => {
      const rack = { ...validRack, height: 0 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects 101U rack", () => {
      // Schema v1.0.0: Max rack height is 100U
      const rack = { ...validRack, height: 101 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects non-integer height", () => {
      const rack = { ...validRack, height: 42.5 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("width validation", () => {
    it.each([10, 19, 21, 23] as const)("accepts %s-inch width", (width) => {
      const rack = { ...validRack, width };
      expect(RackSchema.safeParse(rack).success).toBe(true);
    });

    it("rejects invalid width", () => {
      const rack = { ...validRack, width: 15 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("rejects empty name", () => {
      const rack = { ...validRack, name: "" };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects name over 100 characters", () => {
      const rack = { ...validRack, name: "a".repeat(101) };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("depth_mm validation", () => {
    it("fills the default depth when absent (prior-release data)", () => {
      const parsed = RackSchema.parse(validRack);
      expect(parsed.depth_mm).toBe(1000);
    });

    it("accepts an explicit positive depth", () => {
      const rack = { ...validRack, depth_mm: 800 };
      expect(RackSchema.parse(rack).depth_mm).toBe(800);
    });

    it("rejects zero depth", () => {
      const rack = { ...validRack, depth_mm: 0 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects negative depth", () => {
      const rack = { ...validRack, depth_mm: -600 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects NaN depth", () => {
      const rack = { ...validRack, depth_mm: Number.NaN };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects non-finite depth", () => {
      const rack = { ...validRack, depth_mm: Number.POSITIVE_INFINITY };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });

  describe("base_weight validation", () => {
    it("fills the default base weight when absent (prior-release data)", () => {
      const parsed = RackSchema.parse(validRack);
      expect(parsed.base_weight).toBe(0);
    });

    it("accepts zero base weight", () => {
      const rack = { ...validRack, base_weight: 0 };
      expect(RackSchema.parse(rack).base_weight).toBe(0);
    });

    it("accepts a fractional positive base weight", () => {
      const rack = { ...validRack, base_weight: 12.5 };
      expect(RackSchema.parse(rack).base_weight).toBe(12.5);
    });

    it("rejects negative base weight", () => {
      const rack = { ...validRack, base_weight: -1 };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects NaN base weight", () => {
      const rack = { ...validRack, base_weight: Number.NaN };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });

    it("rejects non-finite base weight", () => {
      const rack = { ...validRack, base_weight: Number.POSITIVE_INFINITY };
      expect(RackSchema.safeParse(rack).success).toBe(false);
    });
  });
});

// ============================================================================
// LayoutSettingsSchema Tests
// ============================================================================

describe("LayoutSettingsSchema", () => {
  it("accepts valid settings", () => {
    const settings = {
      display_mode: "label" as const,
      show_labels_on_images: true,
    };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("accepts image display mode", () => {
    const settings = {
      display_mode: "image" as const,
      show_labels_on_images: false,
    };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(true);
  });

  it("rejects missing display_mode", () => {
    const settings = { show_labels_on_images: true };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(false);
  });

  it("rejects missing show_labels_on_images", () => {
    const settings = { display_mode: "label" };
    expect(LayoutSettingsSchema.safeParse(settings).success).toBe(false);
  });
});

// ============================================================================
// LayoutSchema Tests
// ============================================================================

describe("LayoutSchema", () => {
  const validLayout = {
    version: "0.2.0",
    name: "My Homelab",
    racks: [
      {
        id: "rack-1",
        name: "Main Rack",
        height: 42,
        width: 19 as const,
        desc_units: false,
        form_factor: "4-post-cabinet" as const,
        starting_unit: 1,
        position: 0,
        devices: [],
      },
    ],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: true,
    },
  };

  describe("valid layouts", () => {
    it("accepts minimal valid layout", () => {
      expect(LayoutSchema.safeParse(validLayout).success).toBe(true);
    });

    it("accepts layout with device types", () => {
      // Schema v1.0.0: Flat structure with colour and category at top level
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "dell-r740",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout with multiple device types", () => {
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "server-1",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
          {
            slug: "switch-1",
            u_height: 1,
            colour: "#FF5733",
            category: "network" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("slug uniqueness validation", () => {
    it("rejects duplicate device type slugs", () => {
      const layout = {
        ...validLayout,
        device_types: [
          {
            slug: "duplicate-slug",
            u_height: 2,
            colour: "#4A90D9",
            category: "server" as const,
          },
          {
            slug: "duplicate-slug",
            u_height: 1,
            colour: "#FF5733",
            category: "network" as const,
          },
        ],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("Duplicate");
      }
    });

    it("allows empty device_types", () => {
      const layout = { ...validLayout, device_types: [] };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("device type referential integrity", () => {
    it("rejects a placed device with no embedded or built-in definition", () => {
      const layout = {
        ...validLayout,
        version: "1.0.0",
        racks: [
          {
            ...validLayout.racks[0],
            devices: [
              {
                id: "unknown-device-1",
                device_type: "not-registered-anywhere",
                position: 6,
                face: "front" as const,
              },
            ],
          },
        ],
      };

      const result = LayoutSchema.safeParse(layout);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ["racks", 0, "devices", 0, "device_type"],
              message: expect.stringContaining("no device type definition"),
            }),
          ]),
        );
      }
    });

    it("preserves an unknown placed type only at the prior-release boundary", () => {
      const layout = {
        ...validLayout,
        racks: [
          {
            ...validLayout.racks[0],
            devices: [
              {
                id: "legacy-unknown-device",
                device_type: "not-registered-anywhere",
                position: 6,
                face: "front" as const,
              },
            ],
          },
        ],
      };

      expect(LegacySavedLayoutSchema.safeParse(layout).success).toBe(true);
      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });
  });

  describe("name validation", () => {
    it("rejects empty layout name", () => {
      const layout = { ...validLayout, name: "" };
      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });

    it("rejects layout name over 100 characters", () => {
      const layout = { ...validLayout, name: "a".repeat(101) };
      expect(LayoutSchema.safeParse(layout).success).toBe(false);
    });
  });

  // === Over-rack rail position clamping (#2661) ===
  // A hand-edited or prior-release layout can carry a rail position whose top
  // extends past rack.height. LayoutSchema enforces whole-U and carrier-first
  // but never bounded the top, so the device rendered outside the rack. On load
  // we clamp such a position to the highest within-rack whole-U position rather
  // than hard-rejecting (prior-release loading must still succeed).
  describe("over-rack rail position clamping", () => {
    // 10U rack: UNITS_PER_U = 6, so the highest whole-U bottom position for a
    // 1U device is U10 = 60 internal units (top 65 = rack.height*6 + 5).
    const tenURack = {
      id: "rack-1",
      name: "Small Rack",
      height: 10,
      width: 19 as const,
      desc_units: false,
      form_factor: "4-post-cabinet" as const,
      starting_unit: 1,
      position: 0,
      devices: [],
    };
    const oneUType = {
      slug: "switch-1u",
      u_height: 1,
      colour: "#4A90D9",
      category: "network" as const,
    };

    it("clamps a 1U rail device whose top exceeds the rack to the highest whole-U position", () => {
      // Modern layout: position 66 is internal units (U11), one U above a 10U rack.
      const layout = {
        ...validLayout,
        version: "26.5.0",
        racks: [
          {
            ...tenURack,
            devices: [
              {
                id: "dev-over",
                device_type: "switch-1u",
                position: 66,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [oneUType],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        const placed = result.data.racks[0]!.devices[0]!;
        // Clamped to U10 = 60 internal units, a whole-U rail position.
        expect(placed.position).toBe(60);
        expect(placed.position % 6).toBe(0);
      }
    });

    it("clamps a legacy U-value over-rack position (U999) to within the rack", () => {
      // Legacy layout (< 0.7.0): position 999 is a U-value, migrated to internal
      // units would be 5994; without an upper clamp it sits far above a 10U rack.
      const layout = {
        ...validLayout,
        version: "0.6.0",
        racks: [
          {
            ...tenURack,
            devices: [
              {
                id: "dev-legacy",
                device_type: "switch-1u",
                position: 999,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [oneUType],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        const placed = result.data.racks[0]!.devices[0]!;
        expect(placed.position).toBe(60);
        expect(placed.position % 6).toBe(0);
      }
    });

    it("clamps a 2U rail device so the whole device fits within the rack", () => {
      const layout = {
        ...validLayout,
        version: "26.5.0",
        racks: [
          {
            ...tenURack,
            devices: [
              {
                id: "dev-2u",
                device_type: "server-2u",
                position: 66,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [
          {
            slug: "server-2u",
            u_height: 2,
            colour: "#996633",
            category: "server" as const,
          },
        ],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        const placed = result.data.racks[0]!.devices[0]!;
        // A 2U device fits with its bottom at U9 = 54 (top U10 = 65).
        expect(placed.position).toBe(54);
        expect(placed.position % 6).toBe(0);
      }
    });

    it("clamps an over-rack rail device whose container_id is an empty string", () => {
      // The rest of the schema treats a falsy/empty container_id as rack-level
      // (PlacedDeviceSchema uses `!data.container_id`; the carrier-first refine
      // uses `if (!device.container_id)`). A malformed rail device with
      // container_id "" and no slot_id must be clamped like any other rail
      // device, not skipped as if it were a container child (#2661 follow-up).
      const layout = {
        ...validLayout,
        version: "26.5.0",
        racks: [
          {
            ...tenURack,
            devices: [
              {
                id: "dev-empty-cid",
                device_type: "switch-1u",
                position: 66,
                face: "front" as const,
                container_id: "",
              },
            ],
          },
        ],
        device_types: [oneUType],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        const placed = result.data.racks[0]!.devices[0]!;
        expect(placed.position).toBe(60);
        expect(placed.position % 6).toBe(0);
      }
    });

    it("leaves an in-bounds rail position unchanged", () => {
      const layout = {
        ...validLayout,
        version: "26.5.0",
        racks: [
          {
            ...tenURack,
            devices: [
              {
                id: "dev-ok",
                device_type: "switch-1u",
                position: 30,
                face: "front" as const,
              },
            ],
          },
        ],
        device_types: [oneUType],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });
  });
});
