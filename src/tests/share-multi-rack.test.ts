/**
 * Multi-rack share format and backward-compatibility tests.
 */

import { describe, it, expect } from "vitest";
import * as pako from "pako";
import LZString from "lz-string";
import {
  decodeLayout,
  toMinimalLayout,
  base64UrlEncode,
  MAX_ENCODED_LENGTH,
} from "$lib/utils/share";
import {
  createTestLayout,
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";
import {
  createLayoutWithDevices,
  encodeLegacyPayload,
  requireDecoded,
  requireEncoded,
} from "./helpers/share-test";

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
      dt: [
        {
          s: "bare-sub-u",
          h: 0.5,
          c: "#336699",
          x: "s",
          sw: 1,
          o: 1,
        },
      ],
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

  it("clamps an over-rack device after inferring RackMate from a legacy v1 tuple", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      n: "Legacy RackMate Over-Rack Layout",
      r: {
        n: "RackMate T1 Plus",
        h: 8,
        w: 10,
        d: [{ t: "legacy-two-u-device", p: 8, f: "front" }],
      },
      dt: [
        {
          s: "legacy-two-u-device",
          h: 2,
          c: "#336699",
          x: "n",
        },
      ],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0]?.profile).toBe("rackmate-t1-plus");
    expect(decoded.racks[0]?.devices[0]?.position).toBe(42);
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

  it("clamps an over-rack device after inferring RackMate from a legacy v2 tuple", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 2,
      n: "Legacy RackMate Over-Rack Layout",
      rs: [
        {
          i: "0",
          n: "RackMate T1 Plus",
          h: 8,
          w: 10,
          d: [{ t: "legacy-two-u-device", p: 8, f: "front" }],
        },
      ],
      dt: [
        {
          s: "legacy-two-u-device",
          h: 2,
          c: "#336699",
          x: "n",
        },
      ],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.racks[0]?.profile).toBe("rackmate-t1-plus");
    expect(decoded.racks[0]?.devices[0]?.position).toBe(42);
  });

  it("keeps the unknown-category fallback for legacy format v2", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 2,
      n: "Legacy Unknown Category",
      rs: [
        {
          i: "0",
          n: "Rack",
          h: 8,
          w: 19,
          d: [{ t: "legacy-category-device", p: 1, f: "front" }],
        },
      ],
      dt: [
        {
          s: "legacy-category-device",
          h: 1,
          c: "#336699",
          x: "q",
        },
      ],
    });

    const decoded = requireDecoded(encoded);

    expect(decoded.device_types[0]?.category).toBe("other");
  });

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
          o: 1,
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
          o: 1,
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
