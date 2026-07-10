/**
 * Minimal share-layout shape and round-trip tests.
 */

import { describe, it, expect } from "vitest";
import { toMinimalLayout } from "$lib/utils/share";
import {
  createTestLayout,
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import { findRegisteredBrandDevice } from "$lib/data/brandPacks/registry";
import {
  createLayoutWithDevices,
  requireDecoded,
  requireEncoded,
} from "./helpers/share-test";

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
