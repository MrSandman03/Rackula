/**
 * Primitive and device-type schema validation tests.
 */

import { describe, it, expect } from "vitest";
import {
  SlugSchema,
  DeviceCategorySchema,
  FormFactorSchema,
  DeviceFaceSchema,
  WeightUnitSchema,
  DisplayModeSchema,
  RackWidthSchema,
  DeviceTypeSchema,
} from "$lib/schemas";
import { createTestDeviceType } from "./factories";

// ============================================================================
// SlugSchema Tests
// ============================================================================

describe("SlugSchema", () => {
  describe("valid slugs", () => {
    it("accepts simple lowercase slug", () => {
      expect(SlugSchema.safeParse("server").success).toBe(true);
    });

    it("accepts slug with numbers", () => {
      expect(SlugSchema.safeParse("server1").success).toBe(true);
    });

    it("accepts slug with hyphens", () => {
      expect(SlugSchema.safeParse("dell-r740").success).toBe(true);
    });

    it("accepts multi-hyphen slug", () => {
      expect(SlugSchema.safeParse("dell-poweredge-r740").success).toBe(true);
    });

    it("accepts single character slug", () => {
      expect(SlugSchema.safeParse("a").success).toBe(true);
    });

    it("accepts 100 character slug", () => {
      const slug = "a".repeat(100);
      expect(SlugSchema.safeParse(slug).success).toBe(true);
    });
  });

  describe("invalid slugs", () => {
    it("rejects empty string", () => {
      const result = SlugSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects uppercase letters", () => {
      const result = SlugSchema.safeParse("Server");
      expect(result.success).toBe(false);
    });

    it("rejects leading hyphen", () => {
      const result = SlugSchema.safeParse("-server");
      expect(result.success).toBe(false);
    });

    it("rejects trailing hyphen", () => {
      const result = SlugSchema.safeParse("server-");
      expect(result.success).toBe(false);
    });

    it("rejects consecutive hyphens", () => {
      const result = SlugSchema.safeParse("server--rack");
      expect(result.success).toBe(false);
    });

    it("rejects spaces", () => {
      const result = SlugSchema.safeParse("my server");
      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = SlugSchema.safeParse("server_rack");
      expect(result.success).toBe(false);
    });

    it("rejects slug over 100 characters", () => {
      const slug = "a".repeat(101);
      const result = SlugSchema.safeParse(slug);
      expect(result.success).toBe(false);
    });
  });

  describe("error messages", () => {
    it("shows required message for empty slug", () => {
      const result = SlugSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("required");
      }
    });

    it("shows pattern message for invalid format", () => {
      const result = SlugSchema.safeParse("UPPERCASE");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain("lowercase");
      }
    });
  });
});

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe("DeviceCategorySchema", () => {
  const validCategories = [
    "server",
    "network",
    "patch-panel",
    "power",
    "storage",
    "kvm",
    "av-media",
    "cooling",
    "shelf",
    "blank",
    "cable-management",
    "firewall",
    "chassis",
    "other",
  ];

  it.each(validCategories)("accepts valid category: %s", (category) => {
    expect(DeviceCategorySchema.safeParse(category).success).toBe(true);
  });

  it("rejects invalid category", () => {
    expect(DeviceCategorySchema.safeParse("invalid").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(DeviceCategorySchema.safeParse("").success).toBe(false);
  });
});

describe("FormFactorSchema", () => {
  const validFormFactors = [
    "2-post",
    "4-post",
    "4-post-cabinet",
    "wall-mount",
    "open-frame",
  ];

  it.each(validFormFactors)("accepts valid form factor: %s", (formFactor) => {
    expect(FormFactorSchema.safeParse(formFactor).success).toBe(true);
  });

  it("rejects invalid form factor", () => {
    expect(FormFactorSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("DeviceFaceSchema", () => {
  it("accepts front", () => {
    expect(DeviceFaceSchema.safeParse("front").success).toBe(true);
  });

  it("accepts rear", () => {
    expect(DeviceFaceSchema.safeParse("rear").success).toBe(true);
  });

  it("accepts both", () => {
    expect(DeviceFaceSchema.safeParse("both").success).toBe(true);
  });

  it("rejects invalid face", () => {
    expect(DeviceFaceSchema.safeParse("side").success).toBe(false);
  });
});

describe("WeightUnitSchema", () => {
  it("accepts kg", () => {
    expect(WeightUnitSchema.safeParse("kg").success).toBe(true);
  });

  it("accepts lb", () => {
    expect(WeightUnitSchema.safeParse("lb").success).toBe(true);
  });

  it("rejects invalid unit", () => {
    expect(WeightUnitSchema.safeParse("oz").success).toBe(false);
  });
});

describe("DisplayModeSchema", () => {
  it("accepts label", () => {
    expect(DisplayModeSchema.safeParse("label").success).toBe(true);
  });

  it("accepts image", () => {
    expect(DisplayModeSchema.safeParse("image").success).toBe(true);
  });

  it("rejects invalid mode", () => {
    expect(DisplayModeSchema.safeParse("both").success).toBe(false);
  });
});

describe("RackWidthSchema", () => {
  it.each([10, 19, 21, 23])("accepts standard rack width %s", (width) => {
    expect(RackWidthSchema.safeParse(width).success).toBe(true);
  });

  it.each([0, 15, 24, 42])("rejects out-of-set width %s", (width) => {
    expect(RackWidthSchema.safeParse(width).success).toBe(false);
  });
});

// ============================================================================
// Colour Validation Tests (flat structure in v1.0.0)
// ============================================================================

describe("DeviceTypeSchema colour validation", () => {
  const baseDevice = {
    slug: "test-device",
    u_height: 1,
    category: "server" as const,
  };

  it("accepts valid hex colour", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#FF5733",
    });
    expect(result.success).toBe(true);
  });

  it("accepts lowercase hex colour", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#ff5733",
    });
    expect(result.success).toBe(true);
  });

  it("rejects colour without hash", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "FF5733",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 3-character hex", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#F00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects 8-character hex (with alpha)", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#FF5733FF",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex characters", () => {
    const result = DeviceTypeSchema.safeParse({
      ...baseDevice,
      colour: "#GGGGGG",
    });
    expect(result.success).toBe(false);
  });
});

describe("DeviceTypeSchema", () => {
  // Schema v1.0.0: Flat structure with colour and category at top level
  const validBaseDevice = {
    slug: "test-device",
    u_height: 1,
    colour: "#4A90D9",
    category: "server" as const,
  };

  describe("power device properties", () => {
    it("validates device type without power fields", () => {
      const result = DeviceTypeSchema.safeParse(validBaseDevice);
      expect(result.success).toBe(true);
    });

    it("validates device type with valid va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 1500,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.va_rating).toBe(1500);
      }
    });

    it("validates device type with power_outlets array", () => {
      const device = {
        ...validBaseDevice,
        power_outlets: [
          { name: "Outlet 1", type: "iec-c13" },
          { name: "Outlet 2", type: "iec-c13" },
        ],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: schema should preserve input array length
        expect(result.data.power_outlets).toHaveLength(2);
      }
    });

    it("validates device type with power_ports and va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 3000,
        power_ports: [
          { name: "PSU1", maximum_draw: 500 },
          { name: "PSU2", maximum_draw: 500 },
        ],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
      if (result.success) {
        // eslint-disable-next-line no-restricted-syntax -- behavioral invariant: schema should preserve input array length
        expect(result.data.power_ports).toHaveLength(2);
        expect(result.data.va_rating).toBe(3000);
      }
    });

    it("rejects negative va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: -500,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });

    it("rejects non-integer va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 1500.5,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });

    it("rejects zero va_rating", () => {
      const device = {
        ...validBaseDevice,
        va_rating: 0,
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(false);
    });
  });

  describe("existing field validation", () => {
    it("validates device type with all optional fields", () => {
      // Schema v1.0.0: Flat structure with all fields at top level
      const device = {
        slug: "full-device",
        u_height: 2,
        manufacturer: "Test Mfg",
        model: "Model X",
        is_full_depth: true,
        weight: 25.5,
        weight_unit: "kg" as const,
        notes: "Test notes",
        va_rating: 1500,
        colour: "#4A90D9",
        category: "power" as const,
        tags: ["test"],
      };
      const result = DeviceTypeSchema.safeParse(device);
      expect(result.success).toBe(true);
    });
  });

  describe("u_height validation", () => {
    it("accepts 0.5U height", () => {
      const device = { ...validBaseDevice, u_height: 0.5 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("accepts 1.5U height", () => {
      const device = { ...validBaseDevice, u_height: 1.5 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("accepts 50U height (max)", () => {
      const device = { ...validBaseDevice, u_height: 50 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
    });

    it("rejects height less than 0.5U", () => {
      const device = { ...validBaseDevice, u_height: 0.25 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects height greater than 50U", () => {
      const device = { ...validBaseDevice, u_height: 51 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects non-0.5U multiple height", () => {
      const device = { ...validBaseDevice, u_height: 1.3 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects zero height", () => {
      const device = { ...validBaseDevice, u_height: 0 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects negative height", () => {
      const device = { ...validBaseDevice, u_height: -1 };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });
  });

  describe("required fields", () => {
    it("rejects missing slug", () => {
      const device = {
        u_height: 1,
        colour: "#4A90D9",
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing u_height", () => {
      const device = {
        slug: "test-device",
        colour: "#4A90D9",
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing colour", () => {
      const device = {
        slug: "test-device",
        u_height: 1,
        category: "server",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });

    it("rejects missing category", () => {
      const device = {
        slug: "test-device",
        u_height: 1,
        colour: "#4A90D9",
      };
      expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
    });
  });
});

// ============================================================================
// DeviceTypeSchema interface position validation
// ============================================================================

describe("DeviceTypeSchema rack_widths", () => {
  const base = {
    slug: "width-device",
    u_height: 1,
    colour: "#4A90D9",
    category: "server" as const,
  };

  it("accepts the full set of rack widths including 21", () => {
    const device = { ...base, rack_widths: [10, 19, 21, 23] };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("rejects an unsupported rack width", () => {
    const device = { ...base, rack_widths: [15] };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(false);
  });
});

describe("DeviceTypeSchema half-depth interface position validation", () => {
  const validBase = createTestDeviceType({ slug: "test-device" });

  it("accepts half-depth device with all-front interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: false,
      interfaces: [
        { name: "eth0", type: "1000base-t", position: "front" },
        { name: "eth1", type: "1000base-t", position: "front" },
      ],
    };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("accepts half-depth device with all-rear interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: false,
      interfaces: [
        { name: "eth0", type: "1000base-t", position: "rear" },
        { name: "eth1", type: "1000base-t", position: "rear" },
      ],
    };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("accepts half-depth device with unpositioned interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: false,
      interfaces: [
        { name: "eth0", type: "1000base-t" },
        { name: "eth1", type: "1000base-t" },
      ],
    };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("accepts half-depth device with no interfaces", () => {
    const device = { ...validBase, is_full_depth: false };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("accepts full-depth device with mixed front and rear interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: true,
      interfaces: [
        { name: "eth0", type: "1000base-t", position: "front" },
        { name: "mgmt", type: "console", position: "rear" },
      ],
    };
    expect(DeviceTypeSchema.safeParse(device).success).toBe(true);
  });

  it("rejects half-depth device with mixed front and rear interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: false,
      interfaces: [
        { name: "eth0", type: "1000base-t", position: "front" },
        { name: "mgmt", type: "console", position: "rear" },
      ],
    };
    const result = DeviceTypeSchema.safeParse(device);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("interfaces");
    }
  });

  it("rejects half-depth device with implicit-front and explicit-rear interfaces", () => {
    const device = {
      ...validBase,
      is_full_depth: false,
      interfaces: [
        { name: "eth0", type: "1000base-t", position: "rear" },
        { name: "eth1", type: "1000base-t" }, // no position = implicit front
      ],
    };
    const result = DeviceTypeSchema.safeParse(device);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("interfaces");
    }
  });
});
