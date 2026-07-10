/**
 * Multi-rack schema validation tests.
 */

import { describe, it, expect } from "vitest";
import {
  RackGroupSchema,
  LayoutSchema,
  RackSchema,
  validateSlugUniqueness,
} from "$lib/schemas";

// ============================================================================
// RackGroupSchema Tests (Multi-rack support)
// ============================================================================

describe("RackGroupSchema", () => {
  const validRackGroup = {
    id: "group-1",
    name: "Touring Rack",
    rack_ids: ["rack-1", "rack-2", "rack-3"],
    layout_preset: "bayed" as const,
  };

  describe("valid rack groups", () => {
    it("accepts minimal valid rack group (id + rack_ids only)", () => {
      const group = { id: "group-1", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group with all fields", () => {
      expect(RackGroupSchema.safeParse(validRackGroup).success).toBe(true);
    });

    it("accepts bayed layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "bayed" as const };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts row layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "row" as const };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group without optional name", () => {
      const group = { id: "group-1", rack_ids: ["rack-1", "rack-2"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });

    it("accepts rack group without optional layout_preset", () => {
      const group = { id: "group-1", name: "Test Group", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(true);
    });
  });

  describe("id validation", () => {
    it("rejects missing id", () => {
      const group = { rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects empty id", () => {
      const group = { id: "", rack_ids: ["rack-1"] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });

  describe("rack_ids validation", () => {
    it("rejects missing rack_ids", () => {
      const group = { id: "group-1" };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects empty rack_ids array", () => {
      const group = { id: "group-1", rack_ids: [] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });

    it("rejects rack_ids with empty strings", () => {
      const group = { id: "group-1", rack_ids: ["rack-1", ""] };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });

  describe("layout_preset validation", () => {
    it("rejects invalid layout preset", () => {
      const group = { ...validRackGroup, layout_preset: "invalid" };
      expect(RackGroupSchema.safeParse(group).success).toBe(false);
    });
  });
});

// ============================================================================
// Multi-rack LayoutSchema Tests
// ============================================================================

describe("LayoutSchema multi-rack support", () => {
  const validRack = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const validMultiRackLayout = {
    version: "0.6.0",
    name: "Multi-Rack Homelab",
    racks: [validRack],
    device_types: [],
    settings: {
      display_mode: "label" as const,
      show_labels_on_images: true,
    },
  };

  describe("racks array validation", () => {
    it("accepts layout with single rack in array", () => {
      expect(LayoutSchema.safeParse(validMultiRackLayout).success).toBe(true);
    });

    it("accepts layout with multiple racks", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
          { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects layout with empty racks array", () => {
      const layout = { ...validMultiRackLayout, racks: [] };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "At least one rack is required",
        );
      }
    });

    it("generates id for racks missing required id (migration)", () => {
      // After #472: racks without id get nanoid generated
      const rackWithoutId = { ...validRack };
      delete (rackWithoutId as Record<string, unknown>).id;
      const layout = {
        ...validMultiRackLayout,
        racks: [rackWithoutId],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBeDefined();
        expect(result.data.racks[0]!.id.length).toBe(21); // nanoid length
      }
    });
  });

  describe("rack_groups validation", () => {
    it("accepts layout with rack_groups", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
        ],
        rack_groups: [
          {
            id: "group-1",
            name: "Touring Rack",
            rack_ids: ["rack-1", "rack-2"],
            layout_preset: "bayed" as const,
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout without rack_groups (optional)", () => {
      const layout = { ...validMultiRackLayout };
      delete (layout as Record<string, unknown>).rack_groups;
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("accepts layout with empty rack_groups array", () => {
      const layout = { ...validMultiRackLayout, rack_groups: [] };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });

    it("rejects rack_groups with non-existent rack_ids", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [validRack],
        rack_groups: [
          {
            id: "group-1",
            name: "Invalid Group",
            rack_ids: ["rack-1", "non-existent-rack"],
          },
        ],
      };
      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "non-existent rack IDs",
        );
      }
    });

    it("accepts rack_groups with all valid rack_ids", () => {
      const layout = {
        ...validMultiRackLayout,
        racks: [
          validRack,
          { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
          { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
        ],
        rack_groups: [
          {
            id: "group-1",
            name: "Valid Group",
            rack_ids: ["rack-1", "rack-3"],
          },
        ],
      };
      expect(LayoutSchema.safeParse(layout).success).toBe(true);
    });
  });

  describe("backward compatibility with single rack format", () => {
    // After #472: Schema now auto-migrates legacy format via transform
    it("auto-migrates old single-rack format (rack to racks[])", () => {
      const oldLayout = {
        version: "0.5.0",
        name: "Old Homelab",
        rack: validRack, // Old format
        device_types: [],
        settings: {
          display_mode: "label" as const,
          show_labels_on_images: true,
        },
      };
      // Schema now handles migration via transform
      const result = LayoutSchema.safeParse(oldLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks).toBeDefined();
        expect(result.data.racks[0]!.name).toBe("Main Rack");
      }
    });
  });
});

// ============================================================================
// RackSchema multi-rack changes (id required)
// ============================================================================

describe("RackSchema multi-rack changes", () => {
  const validRackWithId = {
    id: "rack-1",
    name: "Main Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  it("requires id field", () => {
    const rackWithoutId = { ...validRackWithId };
    delete (rackWithoutId as Record<string, unknown>).id;
    expect(RackSchema.safeParse(rackWithoutId).success).toBe(false);
  });

  it("accepts rack with valid id", () => {
    expect(RackSchema.safeParse(validRackWithId).success).toBe(true);
  });

  it("rejects rack with empty id", () => {
    const rack = { ...validRackWithId, id: "" };
    expect(RackSchema.safeParse(rack).success).toBe(false);
  });
});

// ============================================================================
// validateSlugUniqueness Tests
// ============================================================================

describe("validateSlugUniqueness", () => {
  it("returns empty array for unique slugs", () => {
    const types = [{ slug: "a" }, { slug: "b" }, { slug: "c" }];
    expect(validateSlugUniqueness(types)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(validateSlugUniqueness([])).toEqual([]);
  });

  it("returns duplicate slug when found", () => {
    const types = [{ slug: "a" }, { slug: "b" }, { slug: "a" }];
    expect(validateSlugUniqueness(types)).toEqual(["a"]);
  });

  it("returns all duplicate slugs", () => {
    const types = [
      { slug: "a" },
      { slug: "b" },
      { slug: "a" },
      { slug: "b" },
      { slug: "c" },
    ];
    const result = validateSlugUniqueness(types);
    expect(result).toContain("a");
    expect(result).toContain("b");
    // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: deduplication should return exactly 2 duplicate slugs
    expect(result).toHaveLength(2);
  });

  it("handles single item", () => {
    expect(validateSlugUniqueness([{ slug: "a" }])).toEqual([]);
  });
});

describe("LayoutSchema bayed group height validation", () => {
  const createRack = (id: string, height: number, position: number) => ({
    id,
    name: `Rack ${id}`,
    height,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position,
    devices: [],
  });

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  it("rejects bayed group with mixed-height racks", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Bayed",
      racks: [
        createRack("rack-1", 12, 0), // 12U
        createRack("rack-2", 20, 1), // 20U - different height
      ],
      rack_groups: [
        {
          id: "group-1",
          name: "Touring Rack",
          rack_ids: ["rack-1", "rack-2"],
          layout_preset: "bayed" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("same height");
    }
  });

  it("accepts bayed group with same-height racks", () => {
    const layout = {
      version: "0.6.0",
      name: "Same Height Bayed",
      racks: [
        createRack("rack-1", 12, 0),
        createRack("rack-2", 12, 1),
        createRack("rack-3", 12, 2),
      ],
      rack_groups: [
        {
          id: "group-1",
          name: "Touring Rack",
          rack_ids: ["rack-1", "rack-2", "rack-3"],
          layout_preset: "bayed" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("allows mixed heights in non-bayed groups (row preset)", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Row",
      racks: [createRack("rack-1", 12, 0), createRack("rack-2", 42, 1)],
      rack_groups: [
        {
          id: "group-1",
          name: "Row Group",
          rack_ids: ["rack-1", "rack-2"],
          layout_preset: "row" as const,
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });

  it("allows mixed heights in groups without layout_preset", () => {
    const layout = {
      version: "0.6.0",
      name: "Mixed Height Default",
      racks: [createRack("rack-1", 12, 0), createRack("rack-2", 42, 1)],
      rack_groups: [
        {
          id: "group-1",
          name: "Default Group",
          rack_ids: ["rack-1", "rack-2"],
          // No layout_preset
        },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });
});
