/**
 * Layout migration and identity-repair schema validation tests.
 */

import { describe, it, expect } from "vitest";
import { LayoutSchema } from "$lib/schemas";
import {
  createTestContainerType,
  createTestSlot,
  createTestDeviceType,
  createTestRack,
  createTestLayoutSettings,
} from "./factories";
import { VERSION } from "$lib/version";

// ============================================================================
// Multi-rack Migration and Validation Tests (#472)
// ============================================================================

describe("LayoutSchema legacy migration", () => {
  const legacyRack = {
    name: "Legacy Rack",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  describe("legacy rack to racks[] migration", () => {
    it("auto-migrates Layout.rack to Layout.racks[0]", () => {
      const legacyLayout = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: legacyRack,
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks).toBeDefined();
        expect(result.data.racks.length).toBe(1);
        expect(result.data.racks[0]!.name).toBe("Legacy Rack");
        // Legacy 'rack' field should be removed from output
        expect("rack" in result.data).toBe(false);
      }
    });

    it("generates nanoid for rack without id during migration", () => {
      const legacyLayout = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: legacyRack, // No id field
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBeDefined();
        expect(result.data.racks[0]!.id.length).toBe(21); // nanoid length
      }
    });

    it("preserves existing rack id during migration", () => {
      const legacyLayoutWithId = {
        version: "0.5.0",
        name: "Legacy Homelab",
        rack: { ...legacyRack, id: "existing-id" },
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(legacyLayoutWithId);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBe("existing-id");
      }
    });

    it("prefers racks[] over legacy rack if both present", () => {
      const modernRack = {
        ...legacyRack,
        id: "rack-modern",
        name: "Modern Rack",
      };
      const layoutWithBoth = {
        version: "0.6.0",
        name: "Mixed Format",
        rack: legacyRack, // Should be ignored
        racks: [modernRack],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layoutWithBoth);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks.length).toBe(1);
        expect(result.data.racks[0]!.name).toBe("Modern Rack");
      }
    });
  });

  describe("rack id generation for racks[] without ids", () => {
    it("generates ids for racks missing id field", () => {
      const layout = {
        version: "0.6.0",
        name: "Multi-rack Layout",
        racks: [
          { ...legacyRack, name: "Rack 1" }, // No id
          { ...legacyRack, name: "Rack 2" }, // No id
        ],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id.length).toBe(21);
        expect(result.data.racks[1]!.id.length).toBe(21);
        // IDs should be unique
        expect(result.data.racks[0]!.id).not.toBe(result.data.racks[1]!.id);
      }
    });

    it("preserves existing ids while generating missing ones", () => {
      const layout = {
        version: "0.6.0",
        name: "Mixed ID Layout",
        racks: [
          { ...legacyRack, id: "has-id", name: "Rack 1" },
          { ...legacyRack, name: "Rack 2" }, // No id
        ],
        device_types: [],
        settings: baseSettings,
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.id).toBe("has-id");
        expect(result.data.racks[1]!.id.length).toBe(21);
      }
    });
  });
});

describe("LayoutSchema rack ID uniqueness validation", () => {
  const validRack = {
    id: "rack-1",
    name: "Rack 1",
    height: 42,
    width: 19 as const,
    desc_units: false,
    show_rear: true,
    form_factor: "4-post-cabinet" as const,
    starting_unit: 1,
    position: 0,
    devices: [],
  };

  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  it("rejects duplicate rack IDs", () => {
    const layout = {
      version: "0.6.0",
      name: "Duplicate ID Layout",
      racks: [
        { ...validRack, id: "duplicate-id", name: "Rack 1" },
        { ...validRack, id: "duplicate-id", name: "Rack 2", position: 1 },
      ],
      device_types: [],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("Duplicate rack IDs");
    }
  });

  it("accepts unique rack IDs", () => {
    const layout = {
      version: "0.6.0",
      name: "Unique ID Layout",
      racks: [
        { ...validRack, id: "rack-1", name: "Rack 1" },
        { ...validRack, id: "rack-2", name: "Rack 2", position: 1 },
        { ...validRack, id: "rack-3", name: "Rack 3", position: 2 },
      ],
      device_types: [],
      settings: baseSettings,
    };

    expect(LayoutSchema.safeParse(layout).success).toBe(true);
  });
});

describe("LayoutSchema device ID deduplication (#1363)", () => {
  const baseSettings = {
    display_mode: "label" as const,
    show_labels_on_images: true,
  };

  it("regenerates duplicate device IDs within a rack", () => {
    const layout = {
      version: "0.7.0",
      name: "Duplicate Device ID Layout",
      racks: [
        {
          id: "rack-1",
          name: "Rack 1",
          height: 42,
          width: 19 as const,
          desc_units: false,
          show_rear: true,
          form_factor: "4-post-cabinet" as const,
          starting_unit: 1,
          position: 0,
          devices: [
            {
              id: "dupe-id",
              device_type: "server-a",
              position: 6,
              face: "front" as const,
            },
            {
              id: "dupe-id",
              device_type: "server-b",
              position: 12,
              face: "front" as const,
            },
            {
              id: "unique-id",
              device_type: "server-c",
              position: 18,
              face: "front" as const,
            },
          ],
        },
      ],
      device_types: [
        {
          slug: "server-a",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
        {
          slug: "server-b",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
        {
          slug: "server-c",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
      ],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      const deviceIds = result.data.racks[0].devices.map((d) => d.id);
      const uniqueIds = new Set(deviceIds);
      expect(uniqueIds.size).toBe(deviceIds.length);
      // The first occurrence keeps its original ID
      expect(deviceIds[0]).toBe("dupe-id");
      // The second occurrence gets a new ID
      expect(deviceIds[1]).not.toBe("dupe-id");
      // The unique one is untouched
      expect(deviceIds[2]).toBe("unique-id");
    }
  });

  it("regenerates duplicate device IDs across multiple racks", () => {
    const layout = {
      version: "0.7.0",
      name: "Multi-Rack Dupe Layout",
      racks: [
        {
          id: "rack-1",
          name: "Rack 1",
          height: 42,
          width: 19 as const,
          desc_units: false,
          show_rear: true,
          form_factor: "4-post-cabinet" as const,
          starting_unit: 1,
          position: 0,
          devices: [
            {
              id: "dupe-id",
              device_type: "server-a",
              position: 6,
              face: "front" as const,
            },
            {
              id: "dupe-id",
              device_type: "server-b",
              position: 12,
              face: "front" as const,
            },
          ],
        },
        {
          id: "rack-2",
          name: "Rack 2",
          height: 42,
          width: 19 as const,
          desc_units: false,
          show_rear: true,
          form_factor: "4-post-cabinet" as const,
          starting_unit: 1,
          position: 1,
          devices: [
            {
              id: "dupe-id-2",
              device_type: "server-a",
              position: 6,
              face: "front" as const,
            },
            {
              id: "dupe-id-2",
              device_type: "server-c",
              position: 12,
              face: "front" as const,
            },
          ],
        },
      ],
      device_types: [
        {
          slug: "server-a",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
        {
          slug: "server-b",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
        {
          slug: "server-c",
          u_height: 1,
          colour: "#4A90A4",
          category: "server" as const,
        },
      ],
      settings: baseSettings,
    };

    const result = LayoutSchema.safeParse(layout);
    expect(result.success).toBe(true);
    if (result.success) {
      for (const rack of result.data.racks) {
        const deviceIds = rack.devices.map((d) => d.id);
        const uniqueIds = new Set(deviceIds);
        expect(uniqueIds.size).toBe(deviceIds.length);
      }
    }
  });
});

// ============================================================================
// Position Migration Tests (v0.7.0 - 1/6U Internal Units)
// ============================================================================

describe("LayoutSchema position migration", () => {
  const migrationDeviceTypes = [
    createTestDeviceType({ slug: "server" }),
    createTestContainerType({
      slug: "chassis",
      u_height: 2,
      slots: [
        createTestSlot({
          id: "slot-1",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 2,
        }),
      ],
    }),
    createTestDeviceType({ slug: "blade", u_height: 1 }),
  ];

  // Helper to create migration test layouts using shared factories
  const createMigrationTestLayout = (version: string, devices: unknown[]) => ({
    version,
    name: "Test Layout",
    racks: [
      createTestRack({
        id: "rack-1",
        devices: devices as Parameters<typeof createTestRack>[0]["devices"],
      }),
    ],
    device_types: migrationDeviceTypes,
    settings: createTestLayoutSettings({ show_labels_on_images: true }),
  });

  describe("version-based detection", () => {
    it("migrates positions for version < 0.7.0", () => {
      const layout = createMigrationTestLayout("0.6.16", [
        { id: "device-1", device_type: "server", position: 10, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position 10 * 6 = 60
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });

    it("does not migrate positions for version >= 0.7.0", () => {
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 60, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
      }
    });

    it("migrates positions when version is missing", () => {
      const layout = {
        name: "Test Layout",
        racks: [
          createTestRack({
            id: "rack-1",
            devices: [
              {
                id: "device-1",
                device_type: "server",
                position: 5,
                face: "front" as const,
              },
            ],
          }),
        ],
        device_types: migrationDeviceTypes,
        settings: createTestLayoutSettings({ show_labels_on_images: true }),
      };

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Position 5 * 6 = 30
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });
  });

  describe("heuristic fallback", () => {
    it("migrates when position < 6 even if version >= 0.7.0", () => {
      // Edge case: version says new, but data says old
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 5, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Heuristic triggered: 5 * 6 = 30
        expect(result.data.racks[0]!.devices[0]!.position).toBe(30);
      }
    });

    it("does not migrate container children based on heuristic", () => {
      // Container children can have position 0, 1, etc. - don't trigger heuristic
      const layout = createMigrationTestLayout("0.7.0", [
        {
          id: "container-1",
          device_type: "chassis",
          position: 60,
          face: "front",
        },
        {
          id: "child-1",
          device_type: "blade",
          position: 0,
          face: "front",
          container_id: "container-1",
          slot_id: "slot-1",
        },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Container position unchanged (already new format)
        expect(result.data.racks[0]!.devices[0]!.position).toBe(60);
        // Child position unchanged
        expect(result.data.racks[0]!.devices[1]!.position).toBe(0);
      }
    });
  });

  describe("version stamping after migration", () => {
    it("stamps migrated layouts with current app version", () => {
      const layout = createMigrationTestLayout("0.6.16", [
        { id: "device-1", device_type: "server", position: 10, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Version should be updated to current app version
        expect(result.data.version).toBe(VERSION);
      }
    });

    it("preserves version for layouts that don't need migration", () => {
      const layout = createMigrationTestLayout("0.7.0", [
        { id: "device-1", device_type: "server", position: 60, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // Version should remain unchanged
        expect(result.data.version).toBe("0.7.0");
      }
    });
  });

  describe("decimal position migration (#879 - Carlton test)", () => {
    it("snaps a legacy decimal U position 1.5 up to whole U2 (internal 12)", () => {
      // Issue #879: a legacy file with a fractional U position must still load.
      // Carrier-first (#2158) snaps fractional rail positions to the nearest
      // whole U during migration: 1.5 -> U2 -> 12 internal units.
      const layout = createMigrationTestLayout("0.6.16", [
        {
          id: "device-1",
          device_type: "server",
          position: 1.5, // Half-U position
          face: "front",
        },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // 1.5 snaps to U2 -> 2 * 6 = 12 internal units
        expect(result.data.racks[0]!.devices[0]!.position).toBe(12);
      }
    });

    it("snaps a legacy decimal U position 0.5 up to whole U1 (internal 6)", () => {
      // Edge case: device at half-U position at the very bottom snaps to U1.
      const layout = createMigrationTestLayout("0.6.16", [
        {
          id: "device-1",
          device_type: "server",
          position: 0.5,
          face: "front",
        },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        // 0.5 snaps to U1 (min) -> 1 * 6 = 6 internal units
        expect(result.data.racks[0]!.devices[0]!.position).toBe(6);
      }
    });

    it("migrates whole-U positions and snaps decimals in a mixed file", () => {
      // Mix of integer and decimal positions (like Carlton's file)
      const layout = createMigrationTestLayout("0.6.16", [
        { id: "d1", device_type: "server", position: 30, face: "front" },
        { id: "d2", device_type: "server", position: 1.5, face: "front" },
        { id: "d3", device_type: "server", position: 15, face: "front" },
      ]);

      const result = LayoutSchema.safeParse(layout);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.racks[0]!.devices[0]!.position).toBe(180); // U30 * 6
        expect(result.data.racks[0]!.devices[1]!.position).toBe(12); // 1.5 -> U2 * 6
        expect(result.data.racks[0]!.devices[2]!.position).toBe(90); // U15 * 6
      }
    });
  });
});
