/**
 * Share URL codec, size-limit, and malformed-payload tests.
 */

import { describe, it, expect, vi } from "vitest";
import * as pako from "pako";
import LZString from "lz-string";
import {
  encodeLayout,
  decodeLayout,
  toMinimalLayout,
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
import {
  MAX_SHARE_DEVICES_PER_RACK,
  MAX_SHARE_RACKS,
  MAX_SHARE_TOTAL_DEVICES,
} from "$lib/schemas/share";
import {
  createLayoutWithDevices,
  requireDecoded,
  requireEncoded,
} from "./helpers/share-test";

// pako 3.x exports a frozen, read-only ESM namespace, so vi.spyOn cannot
// redefine its properties. Replace it with a spread copy whose properties are
// writable, restoring spy support for the size-guard test below.
vi.mock("pako", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pako")>();
  return { ...actual };
});

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

  it("rejects duplicate compact rack IDs before resolving rack groups", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Duplicate rack IDs",
        rs: [
          { i: "0", n: "Rack A", h: 8, w: 19, d: [] },
          { i: "0", n: "Rack B", h: 8, w: 19, d: [] },
        ],
        rg: [{ n: "Ambiguous group", p: "row", rs: ["0"] }],
        dt: [],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects an unknown authoritative device category in format v3", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Unknown current category",
        rs: [
          {
            i: "0",
            n: "Rack",
            h: 8,
            w: 19,
            d: [{ t: "unknown-category-device", p: 1, f: "front" }],
          },
        ],
        dt: [
          {
            s: "unknown-category-device",
            h: 1,
            c: "#336699",
            x: "q",
            o: 1,
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects an oversized accepted-category collection inside one slot", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Nested category cardinality",
        rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
        dt: [
          {
            s: "bounded-carrier",
            h: 1,
            c: "#336699",
            x: "h",
            o: 1,
            sl: [
              {
                id: "main",
                r: 0,
                cl: 0,
                a: Array.from({ length: 15 }, () => "n"),
              },
            ],
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects an oversized compatible-rack-width collection", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Nested rack-width cardinality",
        rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
        dt: [
          {
            s: "bounded-device",
            h: 1,
            c: "#336699",
            x: "n",
            o: 1,
            rw: [10, 19, 21, 23, 19],
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it.each([
    [
      "accepted categories",
      {
        sl: [{ id: "main", r: 0, cl: 0, a: ["n", "n"] }],
      },
    ],
    ["compatible rack widths", { rw: [10, 10] }],
  ])("rejects duplicate %s", (_label, duplicateFields) => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Duplicate nested values",
        rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
        dt: [
          {
            s: "duplicate-values-device",
            h: 1,
            c: "#336699",
            x: "n",
            o: 1,
            ...duplicateFields,
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects oversized fit-metadata lists", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Nested fit cardinality",
        rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
        dt: [
          {
            s: "bounded-fit-device",
            h: 1,
            c: "#336699",
            x: "n",
            o: 1,
            rf: {
              open_checks: Array.from({ length: 257 }, () => "measure fit"),
            },
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects fit metadata outside the public compact schema", () => {
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify({
        v: "1.0",
        fv: 3,
        n: "Unknown fit metadata",
        rs: [{ i: "0", n: "Rack", h: 8, w: 19, d: [] }],
        dt: [
          {
            s: "bounded-fit-device",
            h: 1,
            c: "#336699",
            x: "n",
            o: 1,
            rf: {
              status: "candidate",
              private_nested: { values: Array.from({ length: 1000 }, () => 1) },
            },
          },
        ],
      }),
    );

    expect(decodeLayout(encoded).layout).toBeNull();
  });
});
