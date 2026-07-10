/**
 * Share URL browser helpers and end-to-end round-trip tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateShareUrl,
  getShareParam,
  clearShareParam,
} from "$lib/utils/share";
import {
  createTestLayout,
  createTestRack,
  createTestDeviceType,
  createTestDevice,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import {
  createLayoutWithDevices,
  requireDecoded,
  requireEncoded,
} from "./helpers/share-test";

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
