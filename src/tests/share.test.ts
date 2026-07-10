/**
 * Tests for Share URL Encoding/Decoding utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as pako from "pako";
import LZString from "lz-string";
import {
  encodeLayout,
  decodeLayout,
  toMinimalLayout,
  generateShareUrl,
  getShareParam,
  clearShareParam,
  base64UrlEncode,
  MAX_ENCODED_LENGTH,
  MAX_DECOMPRESSED_BYTES,
} from "$lib/utils/share";
import {
  createTestLayout,
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { Layout } from "$lib/types";
import { findRegisteredBrandDevice } from "$lib/data/brandPacks/registry";
import {
  MAX_SHARE_DEVICES_PER_RACK,
  MAX_SHARE_RACKS,
  MAX_SHARE_TOTAL_DEVICES,
} from "$lib/schemas/share";

// pako 3.x exports a frozen, read-only ESM namespace, so vi.spyOn cannot
// redefine its properties. Replace it with a spread copy whose properties are
// writable, restoring spy support for the size-guard test below.
vi.mock("pako", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pako")>();
  return { ...actual };
});

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Helper to assert encodeLayout returns a non-null string.
 * Use this to safely get encoded values in tests.
 */
function requireEncoded(layout: Layout): string {
  const encoded = encodeLayout(layout);
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("encodeLayout returned null or empty string");
  }
  return encoded;
}

/**
 * Helper to assert decodeLayout returns a non-null Layout.
 * Use this to safely get decoded values in tests.
 */
function requireDecoded(encoded: string): Layout {
  const { layout } = decodeLayout(encoded);
  if (!layout) {
    throw new Error("decodeLayout returned null layout");
  }
  return layout;
}

function encodeLegacyPayload(payload: unknown): string {
  return base64UrlEncode(pako.deflate(JSON.stringify(payload)));
}

/**
 * Creates a layout with devices for testing encoding/decoding.
 */
function createLayoutWithDevices(): Layout {
  const deviceType = createTestDeviceType({
    slug: "test-server",
    u_height: 2,
    category: "server",
    model: "Test Server",
  });

  const device = createTestDevice({
    device_type: "test-server",
    position: 5,
    face: "front",
  });

  return createTestLayout({
    name: "Test Layout",
    racks: [
      createTestRack({
        name: "Main Rack",
        height: 42,
        width: 19,
        devices: [device],
      }),
    ],
    device_types: [deviceType],
  });
}

// =============================================================================
// toMinimalLayout Tests
// =============================================================================

describe("toMinimalLayout", () => {
  it("converts layout to minimal format", () => {
    const layout = createLayoutWithDevices();
    const minimal = toMinimalLayout(layout);

    expect(minimal.v).toBe(layout.version);
    expect(minimal.n).toBe(layout.name);
    expect(minimal.rs[0].n).toBe(layout.racks[0].name);
    expect(minimal.rs[0].h).toBe(layout.racks[0].height);
    expect(minimal.rs[0].w).toBe(19);
    expect(minimal.fv).toBe(3);
  });

  it("round-trips rack width 10", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ width: 10, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0].w).toBe(10);
    expect(decoded.racks[0]?.width).toBe(10);
  });

  it("round-trips the RackMate T1 Plus profile", () => {
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 10,
          height: 8,
          depth_mm: 260,
          profile: "rackmate-t1-plus",
          devices: [],
        }),
      ],
    });

    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0].pf).toBe("rackmate-t1-plus");
    expect(decoded.racks[0].profile).toBe("rackmate-t1-plus");
    expect(decoded.racks[0].height).toBe(8);
    expect(decoded.racks[0].depth_mm).toBe(260);
  });

  it("round-trips an explicit Generic profile without renaming the rack", () => {
    const layout = createTestLayout({
      racks: [
        createTestRack({
          name: "RackMate T1 Plus",
          width: 10,
          height: 8,
          depth_mm: 260,
          profile: "generic",
          devices: [],
        }),
      ],
    });

    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0]).toMatchObject({ pf: "generic", dp: 260 });
    expect(decoded.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      profile: "generic",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it("round-trips a generic mini-rack custom depth", () => {
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 10,
          height: 12,
          depth_mm: 400,
          devices: [],
        }),
      ],
    });

    const decoded = requireDecoded(requireEncoded(layout));

    expect(decoded.racks[0].profile).toBeUndefined();
    expect(decoded.racks[0].height).toBe(12);
    expect(decoded.racks[0].depth_mm).toBe(400);
  });

  it("restores built-in fit metadata stripped by the minimal format", () => {
    const ucgMax = findRegisteredBrandDevice(
      "ubiquiti-unifi-cloud-gateway-max",
    )!;
    const tray = {
      ...createTestDeviceType({
        slug: "custom-ucg-tray",
        category: "shelf",
        rack_widths: [10],
        is_full_depth: false,
      }),
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
          accepts: ["network" as const],
        },
      ],
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 10,
          devices: [
            createTestDevice({
              id: "tray-1",
              device_type: tray.slug,
              position: 1,
            }),
            {
              id: "ucg-1",
              device_type: ucgMax.slug,
              position: 0,
              face: "front",
              container_id: "tray-1",
              slot_id: "main",
            },
          ],
        }),
      ],
      device_types: [tray, ucgMax],
    });

    const decoded = requireDecoded(requireEncoded(layout));
    const restored = decoded.device_types.find(
      (device) => device.slug === ucgMax.slug,
    );
    const fit = restored?.custom_fields?.rackula_fit as
      | { dimensions_mm?: { width?: number }; open_checks?: string[] }
      | undefined;

    expect(restored?.rack_widths).toEqual([10, 19]);
    expect(restored?.is_full_depth).toBe(false);
    expect(fit?.dimensions_mm?.width).toBe(141.8);
    expect(fit?.open_checks).toContain("RJ45 cable bend clearance");
  });

  it("round-trips an authoritative custom shadow of a built-in device", () => {
    const shadow = createTestDeviceType({
      slug: "ubiquiti-unifi-cloud-gateway-max",
      model: "Custom Shadow Gateway",
      u_height: 1,
      rack_widths: [19],
      is_full_depth: true,
    });
    shadow.custom_fields = {
      owner: "local",
      rackula_fit: {
        dimensions_mm: { width: 440, depth: 300, height: 44 },
      },
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 19,
          devices: [
            createTestDevice({
              device_type: shadow.slug,
              position: toInternalUnits(1),
            }),
          ],
        }),
      ],
      device_types: [shadow],
    });

    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));
    const restored = decoded.device_types.find(
      (deviceType) => deviceType.slug === shadow.slug,
    );

    expect(minimal.dt[0]?.o).toBe(1);
    expect(restored).toMatchObject({
      slug: shadow.slug,
      model: "Custom Shadow Gateway",
      rack_widths: [19],
      is_full_depth: true,
      custom_fields: { rackula_fit: shadow.custom_fields.rackula_fit },
    });
    expect(restored?.custom_fields?.owner).toBeUndefined();
    expect(decoded.racks[0]?.devices[0]?.container_id).toBeUndefined();
  });

  it("keeps private device metadata out of share links", () => {
    const deviceType = createTestDeviceType({ slug: "private-device" });
    deviceType.notes = "private device note";
    deviceType.serial_number = "SERIAL-PRIVATE-123";
    deviceType.asset_tag = "ASSET-PRIVATE-456";
    deviceType.links = [
      { label: "private portal", url: "https://private.invalid/device" },
    ];
    deviceType.custom_fields = {
      secret: "CUSTOM-FIELD-PRIVATE",
      rackula_fit: {
        status: "candidate",
        secret: "FIT-FIELD-PRIVATE",
      },
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);
    const serialized = JSON.stringify(minimal);
    const restored = requireDecoded(requireEncoded(layout)).device_types[0]!;

    expect(serialized).not.toContain("SERIAL-PRIVATE-123");
    expect(serialized).not.toContain("ASSET-PRIVATE-456");
    expect(serialized).not.toContain("private device note");
    expect(serialized).not.toContain("private.invalid");
    expect(serialized).not.toContain("CUSTOM-FIELD-PRIVATE");
    expect(serialized).not.toContain("FIT-FIELD-PRIVATE");
    expect(restored.serial_number).toBeUndefined();
    expect(restored.asset_tag).toBeUndefined();
    expect(restored.notes).toBeUndefined();
    expect(restored.links).toBeUndefined();
    expect(restored.custom_fields).toEqual({
      rackula_fit: { status: "candidate" },
    });
  });

  it("round-trips fit-critical fields for custom devices and carriers", () => {
    const customCarrier = {
      ...createTestDeviceType({
        slug: "custom-carrier",
        u_height: 1,
        rack_widths: [10],
        is_full_depth: false,
      }),
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
          accepts: ["network" as const],
        },
      ],
      custom_fields: {
        rackula_fit: {
          status: "needs_measurement",
          dimensions_mm: { width: 200, depth: 180, height: 40 },
          open_checks: ["measure cable clearance"],
        },
      },
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 10,
          devices: [createTestDevice({ device_type: customCarrier.slug })],
        }),
      ],
      device_types: [customCarrier],
    });

    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));
    const restored = decoded.device_types.find(
      (device) => device.slug === customCarrier.slug,
    );
    const fit = restored?.custom_fields?.rackula_fit as
      | {
          status?: string;
          dimensions_mm?: { depth?: number };
          open_checks?: string[];
        }
      | undefined;

    expect(restored?.rack_widths).toEqual([10]);
    expect(restored?.is_full_depth).toBe(false);
    expect(restored?.slots?.[0]?.accepts).toEqual(["network"]);
    expect(minimal.dt[0]?.o).toBe(1);
    expect(fit?.status).toBe("needs_measurement");
    expect(fit?.dimensions_mm?.depth).toBe(180);
    expect(fit?.open_checks).toEqual(["measure cable clearance"]);
  });

  it.each([
    ["an array", []],
    ["a string", "invalid-fit-metadata"],
    ["a non-plain object", new Date("2026-01-01T00:00:00Z")],
  ])("omits malformed rackula_fit metadata when it is %s", (_label, fit) => {
    const deviceType = createTestDeviceType({ slug: "malformed-fit-device" });
    deviceType.custom_fields = { rackula_fit: fit };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.dt[0]?.rf).toBeUndefined();
    expect(decoded.device_types[0]?.custom_fields?.rackula_fit).toBeUndefined();
  });

  it("round-trips rack width 19", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ width: 19, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0].w).toBe(19);
    expect(decoded.racks[0]?.width).toBe(19);
  });

  it("round-trips rack width 21", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ width: 21, devices: [] })],
    });
    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0].w).toBe(21);
    expect(decoded.racks[0]?.width).toBe(21);
  });

  it("round-trips rack width 23 and 23-inch-only device constraints", () => {
    const deviceType = createTestDeviceType({
      slug: "telecom-device",
      rack_widths: [23],
    });
    deviceType.custom_fields = {
      rackula_fit: {
        dimensions_mm: { width: 550, depth: 300, height: 44 },
      },
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          width: 23,
          depth_mm: 600,
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });
    const minimal = toMinimalLayout(layout);
    const decoded = requireDecoded(requireEncoded(layout));

    expect(minimal.rs[0].w).toBe(23);
    expect(minimal.dt[0]?.rw).toEqual([23]);
    expect(decoded.racks[0]?.width).toBe(23);
    expect(decoded.device_types[0]?.rack_widths).toEqual([23]);
    expect(decoded.device_types[0]?.custom_fields?.rackula_fit).toMatchObject({
      dimensions_mm: { width: 550 },
    });
  });

  it("only includes device types that are placed", () => {
    const usedType = createTestDeviceType({ slug: "used-device" });
    const unusedType = createTestDeviceType({ slug: "unused-device" });
    const device = createTestDevice({ device_type: "used-device" });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [usedType, unusedType],
    });

    const minimal = toMinimalLayout(layout);

    // Check used device is included
    expect(minimal.dt.find((dt) => dt.s === "used-device")).toBeDefined();
    // Check unused device is excluded
    expect(minimal.dt.find((dt) => dt.s === "unused-device")).toBeUndefined();
  });

  it("converts device types with abbreviated keys", () => {
    const deviceType = createTestDeviceType({
      slug: "test-slug",
      u_height: 2,
      manufacturer: "Test Mfr",
      model: "Test Model",
      category: "server",
    });
    const device = createTestDevice({ device_type: "test-slug" });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);
    const dt = minimal.dt.find((d) => d.s === "test-slug");

    expect(dt).toBeDefined();
    expect(dt!.h).toBe(2);
    expect(dt!.mf).toBe("Test Mfr");
    expect(dt!.m).toBe("Test Model");
    expect(dt!.c).toBeTruthy(); // Color is preserved
    expect(dt!.x).toBe("s"); // server -> s
  });

  it("includes optional device name when set", () => {
    const deviceType = createTestDeviceType({ slug: "server" });
    const device = createTestDevice({
      device_type: "server",
      name: "Primary DB",
    });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].d[0].n).toBe("Primary DB");
  });
});

// =============================================================================
// encodeLayout / decodeLayout Tests
// =============================================================================

describe("encodeLayout", () => {
  it("returns a non-null value", () => {
    const layout = createLayoutWithDevices();
    const encoded = encodeLayout(layout);

    expect(encoded).not.toBeNull();
  });

  it("produces output with no slashes or equals signs (URL query-param safe)", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    // lz-string uses + intentionally in its alphabet; decompressFromEncodedURIComponent
    // handles the + -> space conversion that URLSearchParams applies when parsing query params
    expect(encoded).not.toMatch(/[/=]/);
  });

  it("round-trips correctly through URLSearchParams (+ decoded as space)", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    // Simulate URLSearchParams converting + to space (standard query-string decoding)
    const fromUrlParams = encoded.replace(/\+/g, " ");
    const decoded = requireDecoded(fromUrlParams);

    expect(decoded.name).toBe(layout.name);
    expect(decoded.racks[0].name).toBe(layout.racks[0].name);
  });

  it("produces reasonably sized output for QR codes", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    // Only enforce an upper bound suitable for QR codes
    // Don't use tight bounds that break on encoding/compression changes
    expect(encoded.length).toBeLessThan(1600);
  });

  it("encodes empty layout to small output", () => {
    const layout = createTestLayout({
      racks: [createTestRack({ devices: [] })],
      device_types: [],
    });
    const encoded = requireEncoded(layout);

    expect(encoded.length).toBeLessThan(200);
  });

  it("does not publish a link above the per-rack device bound", () => {
    const deviceType = createTestDeviceType({ slug: "bounded-device" });
    const devices = Array.from(
      { length: MAX_SHARE_DEVICES_PER_RACK + 1 },
      (_, index) =>
        createTestDevice({
          id: `bounded-${index}`,
          device_type: deviceType.slug,
        }),
    );
    const layout = createTestLayout({
      racks: [createTestRack({ devices })],
      device_types: [deviceType],
    });

    expect(encodeLayout(layout)).toBeNull();
  });

  it("does not publish a strict share containing a bare sub-U device", () => {
    const deviceType = createTestDeviceType({
      slug: "bare-sub-u",
      u_height: 0.5,
      slot_width: 1,
    });
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });

    expect(encodeLayout(layout)).toBeNull();
  });

  it("does not publish a strict share with duplicate device definitions", () => {
    const deviceType = createTestDeviceType({ slug: "duplicate-type" });
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType, { ...deviceType }],
    });

    expect(encodeLayout(layout)).toBeNull();
  });

  it("does not publish a link above the decompressed byte limit", () => {
    const deviceType = createTestDeviceType({ slug: "oversized-snapshot" });
    deviceType.custom_fields = {
      rackula_fit: {
        open_checks: ["a".repeat(MAX_DECOMPRESSED_BYTES + 1)],
      },
    };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });

    expect(encodeLayout(layout)).toBeNull();
  });

  it("does not publish a link above the encoded character limit", () => {
    let state = 0x12345678;
    const entropy = Array.from({ length: 180_000 }, () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return String.fromCharCode(33 + ((state >>> 16) % 90));
    }).join("");
    const deviceType = createTestDeviceType({ slug: "high-entropy-snapshot" });
    deviceType.custom_fields = { rackula_fit: { open_checks: [entropy] } };
    const layout = createTestLayout({
      racks: [
        createTestRack({
          devices: [createTestDevice({ device_type: deviceType.slug })],
        }),
      ],
      device_types: [deviceType],
    });

    expect(encodeLayout(layout)).toBeNull();
  });
});

describe("decodeLayout", () => {
  it("returns null layout with error for invalid input", () => {
    expect(decodeLayout("invalid").layout).toBeNull();
    expect(decodeLayout("invalid").error).toBeDefined();
    expect(decodeLayout("").layout).toBeNull();
    expect(decodeLayout("!!!").layout).toBeNull();
  });

  it("round-trips layout through encode/decode", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.name).toBe(original.name);
    expect(decoded.racks[0].name).toBe(original.racks[0].name);
    expect(decoded.racks[0].height).toBe(original.racks[0].height);
    // Check device was preserved
    expect(
      decoded.racks[0].devices.find((d) => d.device_type === "test-server"),
    ).toBeDefined();
    // Check device type was preserved
    expect(
      decoded.device_types.find((dt) => dt.slug === "test-server"),
    ).toBeDefined();
  });

  it("generates a unique id for each decoded device", () => {
    const deviceType = createTestDeviceType({
      slug: "test-server",
      u_height: 1,
      category: "server",
      model: "Test Server",
    });
    const original = createTestLayout({
      name: "Test Layout",
      racks: [
        createTestRack({
          name: "Main Rack",
          height: 42,
          width: 19,
          devices: [
            createTestDevice({ device_type: "test-server", position: 1 }),
            createTestDevice({ device_type: "test-server", position: 10 }),
            createTestDevice({ device_type: "test-server", position: 20 }),
          ],
        }),
      ],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    const ids = decoded.racks[0].devices.map((d) => d.id);
    expect(ids.every(Boolean)).toBe(true);
    // Decode assigns a fresh id per device; all must be distinct.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("applies default layout settings on decode", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.settings.display_mode).toBe("label");
    expect(decoded.settings.show_labels_on_images).toBe(false);
  });

  it("applies default rack properties on decode", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].desc_units).toBe(false);
    expect(decoded.racks[0].form_factor).toBe("4-post-cabinet");
    expect(decoded.racks[0].starting_unit).toBe(1);
    expect(decoded.racks[0].view).toBe("front");
  });

  it("preserves device positions", () => {
    const original = createLayoutWithDevices();
    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].devices[0].position).toBe(
      original.racks[0].devices[0].position,
    );
    expect(decoded.racks[0].devices[0].face).toBe(
      original.racks[0].devices[0].face,
    );
  });

  it("preserves device custom names", () => {
    const deviceType = createTestDeviceType({ slug: "server" });
    const device = createTestDevice({
      device_type: "server",
      name: "My Custom Name",
    });

    const layout = createTestLayout({
      racks: [createTestRack({ devices: [device] })],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].devices[0].name).toBe("My Custom Name");
  });

  it("rejects an over-length encoded input before decompressing", () => {
    // Spy on the inflate paths to confirm the size guard short-circuits before
    // any decompression runs. decodeLayout uses pako.Inflate (class) for the
    // legacy path; pako.inflate (function) is covered too for completeness.
    const inflateSpy = vi.spyOn(pako, "inflate");
    const InflateSpy = vi.spyOn(pako, "Inflate");
    const oversized = "A".repeat(MAX_ENCODED_LENGTH + 1);

    const result = decodeLayout(oversized);

    expect(result.layout).toBeNull();
    expect(result.error).toBeDefined();
    expect(inflateSpy).not.toHaveBeenCalled();
    expect(InflateSpy).not.toHaveBeenCalled();
    inflateSpy.mockRestore();
    InflateSpy.mockRestore();
  });

  it("aborts decompression when output exceeds the decompressed ceiling", () => {
    // A small, highly compressible payload that inflates past the ceiling.
    // Stays well under MAX_ENCODED_LENGTH so the input-size guard passes and
    // the decompressed-size ceiling is the thing under test.
    const huge = "a".repeat(MAX_DECOMPRESSED_BYTES + 1024);
    const compressed = pako.deflate(huge);
    const encoded = base64UrlEncode(compressed);

    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);

    const result = decodeLayout(encoded);

    expect(result.layout).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("rejects a payload whose byte length exceeds the ceiling even when its character count does not", () => {
    // Byte-accuracy guard: 中 is 3 UTF-8 bytes but one UTF-16 code unit, so ~3M of
    // them decode to ~9 MB (over MAX_DECOMPRESSED_BYTES) while the string length
    // (~3M) stays under it. A character-based guard would wrongly accept this; the
    // byte-based guard rejects it. Compresses tiny, so the input-size guard passes
    // and the decompressed byte ceiling is the thing under test.
    const oversizedByBytes = "中".repeat(3_000_000);
    expect(oversizedByBytes.length).toBeLessThan(MAX_DECOMPRESSED_BYTES);
    const layout = createTestLayout({
      name: oversizedByBytes,
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "pako-server", position: 2 }),
          ],
        }),
      ],
      device_types: [createTestDeviceType({ slug: "pako-server" })],
    });
    const encoded = base64UrlEncode(
      pako.deflate(JSON.stringify(toMinimalLayout(layout))),
    );
    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);

    const result = decodeLayout(encoded);

    expect(result.layout).toBeNull();
    expect(result.error).toBeDefined();
  });

  it("accepts the documented 100-rack and 4200-device extreme", () => {
    const devicesPerRack = MAX_SHARE_TOTAL_DEVICES / MAX_SHARE_RACKS;
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Documented Extreme",
        rs: Array.from({ length: MAX_SHARE_RACKS }, (_, rackIndex) => ({
          i: String(rackIndex),
          n: `Rack ${rackIndex}`,
          h: 42,
          w: 19,
          d: Array.from({ length: devicesPerRack }, () => ({
            t: "repeated-device",
            p: 1,
            f: "front",
          })),
        })),
        dt: [
          {
            s: "repeated-device",
            h: 1,
            c: "#336699",
            x: "s",
            o: 1,
          },
        ],
      }),
    );

    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
    const decoded = requireDecoded(encoded);
    expect(decoded.racks).toHaveLength(MAX_SHARE_RACKS);
    expect(
      decoded.racks.reduce((total, rack) => total + rack.devices.length, 0),
    ).toBe(MAX_SHARE_TOTAL_DEVICES);
  });

  it("rejects a highly compressed payload above the device cardinality limit", () => {
    const devicesPerRack =
      Math.floor(MAX_SHARE_TOTAL_DEVICES / MAX_SHARE_RACKS) + 1;
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Repetitive hostile layout",
        rs: Array.from({ length: MAX_SHARE_RACKS }, (_, rackIndex) => ({
          i: String(rackIndex),
          n: `Rack ${rackIndex}`,
          h: 42,
          w: 19,
          d: Array.from({ length: devicesPerRack }, () => ({
            t: "repeated-device",
            p: 1,
            f: "front",
          })),
        })),
        dt: [{ s: "repeated-device", h: 1, c: "#336699", x: "s" }],
      }),
    );

    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);
    expect(decodeLayout(encoded).layout).toBeNull();
  });
});

// =============================================================================
// generateShareUrl Tests
// =============================================================================

describe("generateShareUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.racku.la",
        pathname: "/",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates URL with encoded layout parameter", () => {
    const layout = createLayoutWithDevices();
    const url = generateShareUrl(layout);

    expect(url).toMatch(/^https:\/\/app\.racku\.la\/\?l=/);
    expect(url).toContain("?l=");
  });

  it("uses current origin and pathname", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://custom.domain.com",
        pathname: "/app/",
      },
    });

    const layout = createLayoutWithDevices();
    const url = generateShareUrl(layout);

    expect(url).toMatch(/^https:\/\/custom\.domain\.com\/app\/\?l=/);
  });
});

// =============================================================================
// getShareParam Tests
// =============================================================================

describe("getShareParam", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        search: "",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when no parameter present", () => {
    expect(getShareParam()).toBeNull();
  });

  it("returns parameter value when present", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?l=abc123",
      },
    });

    expect(getShareParam()).toBe("abc123");
  });

  it("returns null when different parameter present", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?other=value",
      },
    });

    expect(getShareParam()).toBeNull();
  });
});

// =============================================================================
// clearShareParam Tests
// =============================================================================

describe("clearShareParam", () => {
  let replaceStateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    replaceStateSpy = vi.fn();

    vi.stubGlobal("window", {
      location: {
        href: "https://app.racku.la/?l=abc123",
        search: "?l=abc123",
      },
      history: {
        replaceState: replaceStateSpy,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls replaceState to remove parameter", () => {
    clearShareParam();

    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      "",
      "https://app.racku.la/",
    );
  });

  it("preserves other URL parameters", () => {
    const newSpy = vi.fn();
    vi.stubGlobal("window", {
      location: {
        href: "https://app.racku.la/?l=abc123&other=value",
        search: "?l=abc123&other=value",
      },
      history: {
        replaceState: newSpy,
      },
    });

    clearShareParam();

    expect(newSpy).toHaveBeenCalledWith(
      {},
      "",
      "https://app.racku.la/?other=value",
    );
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe("share integration", () => {
  it("full round-trip: layout -> encode -> decode -> layout", () => {
    const deviceType = createTestDeviceType({
      slug: "integration-test",
      u_height: 3,
      manufacturer: "Test Corp",
      model: "Model X",
      colour: "#AABBCC",
      category: "network",
    });

    const devices = [
      createTestDevice({
        device_type: "integration-test",
        position: 1,
        face: "front",
        name: "Device 1",
      }),
      createTestDevice({
        device_type: "integration-test",
        position: 5,
        face: "rear",
        name: "Device 2",
      }),
    ];

    const original = createTestLayout({
      name: "Integration Test Layout",
      racks: [
        createTestRack({
          name: "Test Rack",
          height: 24,
          width: 10,
          devices,
        }),
      ],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(original);
    const decoded = requireDecoded(encoded);

    expect(decoded.name).toBe("Integration Test Layout");
    expect(decoded.racks[0].name).toBe("Test Rack");
    expect(decoded.racks[0].height).toBe(24);
    expect(decoded.racks[0].width).toBe(10);
    // Check both devices were preserved
    expect(
      decoded.racks[0].devices.find((d) => d.name === "Device 1"),
    ).toBeDefined();
    expect(
      decoded.racks[0].devices.find((d) => d.name === "Device 2"),
    ).toBeDefined();
    expect(decoded.device_types[0].manufacturer).toBe("Test Corp");
  });

  it("handles layout with many devices", () => {
    const deviceType = createTestDeviceType({ slug: "bulk-device" });
    const devices = Array.from({ length: 20 }, (_, i) =>
      createTestDevice({
        device_type: "bulk-device",
        position: i + 1,
        face: i % 2 === 0 ? "front" : "rear",
      }),
    );

    const layout = createTestLayout({
      racks: [createTestRack({ height: 42, devices })],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // Check devices are present at first and last positions (positions are in internal units)
    expect(
      decoded.racks[0].devices.find((d) => d.position === toInternalUnits(1)),
    ).toBeDefined();
    expect(
      decoded.racks[0].devices.find((d) => d.position === toInternalUnits(20)),
    ).toBeDefined();
    expect(decoded.racks[0].devices.length).toBeGreaterThan(0);

    // Output should still be reasonable for QR codes
    expect(encoded.length).toBeLessThan(1600);
  });
});

// =============================================================================
// Multi-Rack Tests (v2 schema)
// =============================================================================

describe("multi-rack share", () => {
  it("round-trips multi-rack layout with devices", () => {
    const serverType = createTestDeviceType({
      slug: "server-1u",
      u_height: 1,
      category: "server",
    });
    const switchType = createTestDeviceType({
      slug: "switch-1u",
      u_height: 1,
      category: "network",
    });

    const rack1 = createTestRack({
      id: "rack-a",
      name: "Rack A",
      height: 42,
      devices: [
        createTestDevice({
          device_type: "server-1u",
          position: 1,
          face: "front",
        }),
      ],
    });
    const rack2 = createTestRack({
      id: "rack-b",
      name: "Rack B",
      height: 24,
      devices: [
        createTestDevice({
          device_type: "switch-1u",
          position: 3,
          face: "front",
        }),
      ],
    });

    const layout = createTestLayout({
      name: "Multi-Rack Layout",
      racks: [rack1, rack2],
      device_types: [serverType, switchType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack count
    expect(decoded.racks).toHaveLength(2);
    expect(decoded.racks[0].name).toBe("Rack A");
    expect(decoded.racks[0].height).toBe(42);
    expect(decoded.racks[1].name).toBe("Rack B");
    expect(decoded.racks[1].height).toBe(24);
    expect(
      decoded.racks[0].devices.find((d) => d.device_type === "server-1u"),
    ).toBeDefined();
    expect(
      decoded.racks[1].devices.find((d) => d.device_type === "switch-1u"),
    ).toBeDefined();
  });

  it("round-trips bayed rack group", () => {
    const deviceType = createTestDeviceType({ slug: "device-1u" });
    const rack1 = createTestRack({
      id: "bay-1",
      name: "Bay 1",
      height: 42,
      devices: [createTestDevice({ device_type: "device-1u", position: 1 })],
    });
    const rack2 = createTestRack({
      id: "bay-2",
      name: "Bay 2",
      height: 42,
      devices: [createTestDevice({ device_type: "device-1u", position: 2 })],
    });

    const layout = createTestLayout({
      name: "Bayed Layout",
      racks: [rack1, rack2],
      rack_groups: [
        {
          id: "group-1",
          name: "Server Bay",
          rack_ids: ["bay-1", "bay-2"],
          layout_preset: "bayed",
        },
      ],
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack count
    expect(decoded.racks).toHaveLength(2);
    expect(decoded.rack_groups).toBeDefined();
    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact group count
    expect(decoded.rack_groups).toHaveLength(1);
    const group = decoded.rack_groups![0];
    expect(group.name).toBe("Server Bay");
    expect(group.layout_preset).toBe("bayed");
    // eslint-disable-next-line no-restricted-syntax -- round-trip must preserve exact rack_ids count
    expect(group.rack_ids).toHaveLength(2);
    expect(group.rack_ids).toContain(decoded.racks[0].id);
    expect(group.rack_ids).toContain(decoded.racks[1].id);
  });

  it("deduplicates device types used across multiple racks", () => {
    const sharedType = createTestDeviceType({ slug: "shared-device" });
    const rack1 = createTestRack({
      id: "r1",
      name: "Rack 1",
      devices: [
        createTestDevice({ device_type: "shared-device", position: 1 }),
      ],
    });
    const rack2 = createTestRack({
      id: "r2",
      name: "Rack 2",
      devices: [
        createTestDevice({ device_type: "shared-device", position: 2 }),
      ],
    });

    const layout = createTestLayout({
      racks: [rack1, rack2],
      device_types: [sharedType],
    });

    const minimal = toMinimalLayout(layout);

    // Should have exactly one device type entry despite being used in both racks
    const matchingTypes = minimal.dt.filter((dt) => dt.s === "shared-device");
    // eslint-disable-next-line no-restricted-syntax -- deduplication behavioral invariant
    expect(matchingTypes).toHaveLength(1);
  });

  it("preserves rack ordering across round-trip", () => {
    const deviceType = createTestDeviceType({ slug: "generic" });
    const racks = ["Alpha", "Beta", "Gamma"].map((name, i) =>
      createTestRack({
        id: `rack-${i}`,
        name,
        devices: [createTestDevice({ device_type: "generic", position: 1 })],
      }),
    );

    const layout = createTestLayout({
      racks,
      device_types: [deviceType],
    });

    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0].name).toBe("Alpha");
    expect(decoded.racks[1].name).toBe("Beta");
    expect(decoded.racks[2].name).toBe("Gamma");
  });

  it("decodes v1 share links (backward compatibility)", () => {
    // Manually construct a v1 payload (single rack with `r` field)
    const v1Payload = {
      v: "1.0",
      n: "Legacy Layout",
      r: {
        n: "Old Rack",
        h: 42,
        w: 19,
        d: [{ t: "legacy-server", p: 5, f: "front" as const }],
      },
      dt: [{ s: "legacy-server", h: 2, c: "#336699", x: "s" }],
    };

    const json = JSON.stringify(v1Payload);
    const compressed = pako.deflate(json);
    const encoded = base64UrlEncode(compressed);

    const { layout: decoded } = decodeLayout(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe("Legacy Layout");
    expect(decoded!.racks[0].name).toBe("Old Rack");
    expect(decoded!.racks[0].height).toBe(42);
    expect(
      decoded!.racks[0].devices.find((d) => d.device_type === "legacy-server"),
    ).toBeDefined();
    expect(
      decoded!.device_types.find((dt) => dt.slug === "legacy-server"),
    ).toBeDefined();
  });

  it("hydrates partial built-in definitions from legacy compact links", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 2,
      n: "Legacy Compact Built-In",
      rs: [
        {
          i: "0",
          n: "Mini Rack",
          h: 8,
          w: 10,
          d: [],
        },
      ],
      dt: [
        {
          s: "ubiquiti-unifi-cloud-gateway-max",
          h: 0.5,
          m: "UCG-Max",
          c: "#4A90D9",
          x: "n",
          sw: 1,
          sr: "child",
        },
      ],
    });

    const decoded = requireDecoded(encoded);
    const restored = decoded.device_types.find(
      (deviceType) => deviceType.slug === "ubiquiti-unifi-cloud-gateway-max",
    );
    const fit = restored?.custom_fields?.rackula_fit as
      { dimensions_mm?: { width?: number } } | undefined;

    expect(restored?.rack_widths).toEqual([10, 19]);
    expect(restored?.is_full_depth).toBe(false);
    expect(fit?.dimensions_mm?.width).toBe(141.8);
  });

  it("rejects a current built-in definition without its authoritative snapshot", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Malformed Current Built-In",
      rs: [{ i: "0", n: "Mini Rack", h: 8, w: 10, d: [] }],
      dt: [
        {
          s: "ubiquiti-unifi-cloud-gateway-max",
          h: 0.5,
          m: "Crafted replacement",
          c: "#4A90D9",
          x: "n",
          sw: 1,
          sr: "child",
        },
      ],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it.each([undefined, 1, 2])(
    "loads legacy explicit multirow overflow with format version %s",
    (formatVersion) => {
      const encoded = encodeLegacyPayload({
        v: "1.0",
        ...(formatVersion === undefined ? {} : { fv: formatVersion }),
        n: "Legacy Explicit Overflow",
        rs: [
          {
            i: "0",
            n: "Legacy Rack",
            h: 8,
            w: 19,
            d: [
              { t: "legacy-container", p: 1, f: "front" },
              {
                t: "legacy-child",
                p: 0,
                f: "front",
                ci: 0,
                si: "bottom",
              },
            ],
          },
        ],
        dt: [
          {
            s: "legacy-container",
            h: 2,
            c: "#336699",
            x: "h",
            sl: [
              { id: "bottom", r: 0, cl: 0, wf: 1, hu: 2 },
              { id: "top", r: 1, cl: 0, wf: 1, hu: 1 },
            ],
          },
          { s: "legacy-child", h: 2, c: "#336699", x: "s" },
        ],
      });

      const decoded = requireDecoded(encoded);
      const child = decoded.racks[0]?.devices.find(
        (device) => device.device_type === "legacy-child",
      );

      expect(child?.container_id).toBeDefined();
      expect(child?.slot_id).toBe("bottom");
    },
  );

  it.each([undefined, 1, 2])(
    "adapts a legacy bare half-width device with format version %s",
    (formatVersion) => {
      const encoded = encodeLegacyPayload({
        v: "1.0",
        ...(formatVersion === undefined ? {} : { fv: formatVersion }),
        n: "Legacy Bare Half-Width",
        rs: [
          {
            i: "0",
            n: "Rack",
            h: 8,
            w: 19,
            d: [{ t: "legacy-half-width", p: 1, f: "front" }],
          },
        ],
        dt: [
          {
            s: "legacy-half-width",
            h: 1,
            c: "#336699",
            x: "s",
            sw: 1,
          },
        ],
      });

      const decoded = requireDecoded(encoded);
      const child = decoded.racks[0]?.devices.find(
        (device) => device.device_type === "legacy-half-width",
      );

      expect(child?.container_id).toBeDefined();
      expect(child?.slot_id).toBe("col-1");
    },
  );

  it("rejects a bare sub-U device in strict format v3", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Malformed Current Share",
      rs: [
        {
          i: "0",
          n: "Rack",
          h: 8,
          w: 19,
          d: [{ t: "bare-sub-u", p: 1, f: "front" }],
        },
      ],
      dt: [{ s: "bare-sub-u", h: 0.5, c: "#336699", x: "s", sw: 1 }],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects a placed device whose type definition is missing", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Missing Device Type",
      rs: [
        {
          i: "0",
          n: "Rack",
          h: 8,
          w: 19,
          d: [{ t: "not-registered-anywhere", p: 1, f: "front" }],
        },
      ],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects a current built-in placement omitted from the type table", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Missing Built-In Definition",
      rs: [
        {
          i: "0",
          n: "Rack",
          h: 8,
          w: 19,
          d: [{ t: "1u-server", p: 1, f: "front" }],
        },
      ],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects current-format semantics on the legacy v1 shape", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Invalid Current V1",
      r: { n: "Rack", h: 8, w: 19, d: [] },
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("infers the RackMate profile from an exact legacy v1 rack tuple", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      n: "Legacy RackMate Layout",
      r: {
        n: "RackMate T1 Plus",
        h: 8,
        w: 10,
        d: [],
      },
      dt: [],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0]?.profile).toBe("rackmate-t1-plus");
    expect(decoded.racks[0]?.depth_mm).toBe(260);
  });

  it.each([undefined, 1, 2])(
    "infers the RackMate profile from an exact legacy v2 tuple with format version %s",
    (formatVersion) => {
      const encoded = encodeLegacyPayload({
        v: "1.0",
        ...(formatVersion === undefined ? {} : { fv: formatVersion }),
        n: "Legacy RackMate Layout",
        rs: [
          {
            i: "0",
            n: "RackMate T1 Plus",
            h: 8,
            w: 10,
            d: [],
          },
        ],
        dt: [],
      });

      const decoded = requireDecoded(encoded);

      expect(decoded.racks[0]?.profile).toBe("rackmate-t1-plus");
      expect(decoded.racks[0]?.depth_mm).toBe(260);
    },
  );

  it("keeps an exact omitted-profile tuple generic in format v3", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Current Generic Layout",
      rs: [
        {
          i: "0",
          n: "RackMate T1 Plus",
          h: 8,
          w: 10,
          d: [],
        },
      ],
      dt: [],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0]?.profile).toBeUndefined();
  });

  it("rejects compact links from a future share format", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 4,
      n: "Future Share",
      rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it.each([
    ["height", { h: 9 }],
    ["width", { w: 19 }],
    ["depth", { dp: 300 }],
  ])(
    "rejects an explicit RackMate profile with mismatched %s",
    (_label, override) => {
      const encoded = encodeLegacyPayload({
        v: "1.0",
        fv: 3,
        n: "Crafted RackMate",
        rs: [
          {
            i: "0",
            n: "RackMate T1 Plus",
            h: 8,
            w: 10,
            pf: "rackmate-t1-plus",
            d: [],
            ...override,
          },
        ],
        dt: [],
      });

      expect(decodeLayout(encoded).layout).toBeNull();
    },
  );

  it("rejects an out-of-bounds device in a crafted RackMate share", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Crafted RackMate",
      rs: [
        {
          i: "0",
          n: "RackMate T1 Plus",
          h: 8,
          w: 10,
          pf: "rackmate-t1-plus",
          d: [{ t: "two-u-device", p: 8, f: "front" }],
        },
      ],
      dt: [
        {
          s: "two-u-device",
          h: 2,
          c: "#336699",
          x: "s",
          rw: [10],
        },
      ],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects a rack-width-incompatible device in a crafted RackMate share", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Crafted RackMate",
      rs: [
        {
          i: "0",
          n: "RackMate T1 Plus",
          h: 8,
          w: 10,
          pf: "rackmate-t1-plus",
          d: [{ t: "nineteen-inch-device", p: 1, f: "front" }],
        },
      ],
      dt: [
        {
          s: "nineteen-inch-device",
          h: 1,
          c: "#336699",
          x: "s",
          rw: [19],
        },
      ],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it.each([
    ["an explicit depth", { dp: 260 }],
    ["a different name", { n: "Generic 10-inch Rack" }],
    ["a different height", { h: 9 }],
    ["a different width", { w: 19 }],
  ])("does not infer the RackMate profile with %s", (_label, override) => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 2,
      n: "Near-match Layout",
      rs: [
        {
          i: "0",
          n: "RackMate T1 Plus",
          h: 8,
          w: 10,
          d: [],
          ...override,
        },
      ],
      dt: [],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0]?.profile).not.toBe("rackmate-t1-plus");
  });

  it("decodes pako-encoded v2 share links (backward compatibility)", () => {
    // Construct a pako-encoded v2 payload to verify pre-migration URLs still decode
    const serverType = createTestDeviceType({ slug: "pako-server" });
    const rack = createTestRack({
      id: "legacy-rack",
      name: "Legacy Rack",
      height: 24,
      devices: [createTestDevice({ device_type: "pako-server", position: 2 })],
    });
    const layout = createTestLayout({
      name: "Pako Layout",
      racks: [rack],
      device_types: [serverType],
    });
    const minimal = toMinimalLayout(layout);
    const json = JSON.stringify(minimal);
    const compressed = pako.deflate(json);
    const encoded = base64UrlEncode(compressed);

    const { layout: decoded } = decodeLayout(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.name).toBe("Pako Layout");
    expect(decoded!.racks[0].name).toBe("Legacy Rack");
    expect(
      decoded!.racks[0].devices.find((d) => d.device_type === "pako-server"),
    ).toBeDefined();
  });

  it("re-encodes a workspace-loaded v1 share with partial metadata", () => {
    const legacy = encodeLegacyPayload({
      v: "26.6.6",
      n: "Visual Test Layout",
      r: {
        n: "Rack A",
        h: 12,
        w: 19,
        d: [
          { t: "vis-switch", p: 1, f: "front", n: "Switch" },
          { t: "vis-server", p: 3, f: "front", n: "Server" },
          { t: "vis-pdu", p: 10, f: "rear", n: "PDU" },
        ],
      },
      dt: [
        { s: "vis-switch", h: 1, c: "#4A90A4", x: "n" },
        { s: "vis-server", h: 2, c: "#7B6FA3", x: "s" },
        { s: "vis-pdu", h: 2, c: "#A4705A", x: "w" },
      ],
    });

    const decoded = {
      ...requireDecoded(legacy),
      metadata: { id: "33333333-3333-4333-8333-333333333333" },
    };

    expect(requireEncoded(decoded)).not.toBe(legacy);
  });

  it("decodes a large pako-encoded share link with multi-byte UTF-8 spanning chunk boundaries", () => {
    // Regression guard for the pako 3.x migration. pako's streaming Inflate emits
    // 64 KB Uint8Array chunks, so a payload larger than one chunk can split a
    // multi-byte UTF-8 sequence across a boundary. inflateBounded must decode with a
    // single streaming TextDecoder; decoding each chunk in isolation corrupts those
    // characters. 中 is 3 bytes and 65536 is not a multiple of 3, so boundaries fall
    // mid-character. ~240 KB decompressed spans ~4 chunks but deflates to a tiny link.
    const longMarker = "中".repeat(80000);
    const serverType = createTestDeviceType({ slug: "pako-server" });
    serverType.custom_fields = {
      rackula_fit: { open_checks: [longMarker] },
    };
    const layout = createTestLayout({
      name: "UTF-8 Streaming Layout",
      racks: [
        createTestRack({
          devices: [
            createTestDevice({ device_type: "pako-server", position: 2 }),
          ],
        }),
      ],
      device_types: [serverType],
    });
    const encoded = base64UrlEncode(
      pako.deflate(JSON.stringify(toMinimalLayout(layout))),
    );

    // Stays under the input-size guard so the decompression path actually runs.
    expect(encoded.length).toBeLessThanOrEqual(MAX_ENCODED_LENGTH);

    const { layout: decoded } = decodeLayout(encoded);

    expect(decoded).not.toBeNull();
    const fit = decoded!.device_types[0]?.custom_fields?.rackula_fit as
      { open_checks?: string[] } | undefined;
    expect(fit?.open_checks?.[0]).toBe(longMarker);
    expect(fit?.open_checks?.[0]).not.toContain("�");
  });

  it("uses lz-string encoding for new share links", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);

    // lz-string output should decompress successfully with LZString
    const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
    expect(decompressed).not.toBeNull();
    expect(decompressed).not.toBe("");
    const parsed = JSON.parse(decompressed!);
    expect(parsed).toHaveProperty("rs");
  });

  it("assigns sequential short IDs to racks in minimal format", () => {
    const deviceType = createTestDeviceType({ slug: "test-dev" });
    const racks = [0, 1, 2].map((i) =>
      createTestRack({
        id: `rack-${i}`,
        name: `Rack ${i}`,
        devices: [createTestDevice({ device_type: "test-dev", position: 1 })],
      }),
    );

    const layout = createTestLayout({
      racks,
      device_types: [deviceType],
    });

    const minimal = toMinimalLayout(layout);

    expect(minimal.rs[0].i).toBe("0");
    expect(minimal.rs[1].i).toBe("1");
    expect(minimal.rs[2].i).toBe("2");
  });

  it("omits rack_groups when layout has none", () => {
    const layout = createLayoutWithDevices();
    const encoded = requireEncoded(layout);
    const decoded = requireDecoded(encoded);

    expect(decoded.rack_groups).toBeUndefined();
  });
});
