import { describe, expect, it } from "vitest";
import type { DeviceType } from "$lib/types";
import { getRackFitSummary } from "$lib/utils/rack-fit";
import { createTestDeviceType } from "./factories";

function withRackulaFit(
  fit: unknown,
  overrides: Partial<DeviceType> = {},
): DeviceType {
  return {
    ...createTestDeviceType({ rack_widths: [10] }),
    ...overrides,
    custom_fields: { rackula_fit: fit },
  };
}

describe("Rack fit summaries", () => {
  it.each([
    ["candidate", "Candidate", "info"],
    ["planned", "Plan", "info"],
    ["needs_measurement", "Verify", "warn"],
    ["physically_plausible_needs_measurement", "Verify", "warn"],
    ["needs_design", "Design", "warn"],
    ["needs_mount_selection", "Mount", "warn"],
    ["needs_stl_selection", "Mount", "warn"],
  ] as const)("recognizes the %s readiness state", (status, label, tone) => {
    expect(getRackFitSummary(withRackulaFit({ status }), 10)).toMatchObject({
      label,
      tone,
    });
  });

  it("surfaces concrete open checks before generic mount guidance", () => {
    const child = withRackulaFit(
      {
        status: "candidate",
        recommended_mount_slugs: ["test-tray"],
        open_checks: ["measure cable bend clearance"],
      },
      {
        slug: "test-child",
        category: "network",
        subdevice_role: "child",
        slot_width: 2,
      },
    );
    const tray = withRackulaFit(
      {},
      {
        slug: "test-tray",
        model: "Test Tray",
        category: "shelf",
        slots: [
          {
            id: "main",
            name: "Main",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 1,
            accepts: ["network"],
          },
        ],
      },
    );

    expect(getRackFitSummary(child, 10, [tray])).toEqual({
      label: "Check",
      title: "measure cable bend clearance",
      tone: "warn",
    });
  });

  it("keeps mount readiness warnings ahead of a fitting bay", () => {
    const child = withRackulaFit(
      {
        status: "needs_measurement",
        recommended_mount_slugs: ["test-tray"],
      },
      {
        slug: "test-child",
        category: "network",
        subdevice_role: "child",
        slot_width: 2,
      },
    );
    const tray = withRackulaFit(
      {},
      {
        slug: "test-tray",
        model: "Test Tray",
        category: "shelf",
        slots: [
          {
            id: "main",
            name: "Main",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 1,
            accepts: ["network"],
          },
        ],
      },
    );

    expect(getRackFitSummary(child, 10, [tray])).toMatchObject({
      label: "Verify",
      tone: "warn",
    });
  });

  it("applies RackMate clearance warnings only to the explicit T1 Plus profile", () => {
    const tightFit = withRackulaFit({
      rackmate_t1_plus_depth_clearance_mm: 6,
    });

    expect(getRackFitSummary(tightFit, 10)).toBeNull();
    expect(
      getRackFitSummary(tightFit, 10, [], "rackmate-t1-plus"),
    ).toMatchObject({
      label: "Tight",
      tone: "warn",
    });
  });

  it("does not throw or trust malformed rackula_fit fields", () => {
    const malformed = withRackulaFit({
      status: ["needs_measurement"],
      recommended_mount_slugs: "not-an-array",
      rackmate_t1_plus_depth_clearance_mm: "6",
      open_checks: { 0: "not-an-array" },
    });

    expect(() => getRackFitSummary(malformed, 10)).not.toThrow();
    expect(getRackFitSummary(malformed, 10)).toBeNull();
    expect(getRackFitSummary(withRackulaFit("not-an-object"), 10)).toBeNull();
  });

  it("honours the physical-width tolerance used by placement", () => {
    const withinTolerance = withRackulaFit({
      dimensions_mm: { width: 254.5 },
    });
    const overTolerance = withRackulaFit({
      dimensions_mm: { width: 254.51 },
    });

    expect(getRackFitSummary(withinTolerance, 10)).toBeNull();
    expect(getRackFitSummary(overTolerance, 10)).toMatchObject({
      label: "Wide",
      tone: "blocked",
    });
  });

  it("does not call a recommended mount fitting when the mount misses the rack envelope", () => {
    const child = withRackulaFit(
      { recommended_mount_slugs: ["recommended-tray"] },
      {
        slug: "tray-only-child",
        subdevice_role: "child",
        slot_width: 1,
        custom_fields: {
          rackula_fit: {
            recommended_mount_slugs: ["recommended-tray"],
            dimensions_mm: { depth: 200 },
          },
        },
      },
    );
    const tray = withRackulaFit(
      { dimensions_mm: { depth: 300 } },
      {
        slug: "recommended-tray",
        model: "Recommended Tray",
        category: "shelf",
        rack_widths: [19],
        slots: [
          {
            id: "main",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 1,
          },
        ],
      },
    );

    expect(
      getRackFitSummary(child, 10, [tray], "rackmate-t1-plus", 260),
    ).toMatchObject({
      label: "No bay",
      tone: "blocked",
    });
  });

  it("blocks devices and required mounts taller than the rack", () => {
    const direct = withRackulaFit({}, { slug: "tall-device", u_height: 12 });
    const child = withRackulaFit(
      { recommended_mount_slugs: ["tall-tray"] },
      {
        slug: "mounted-child",
        subdevice_role: "child",
        slot_width: 1,
      },
    );
    const tallTray = withRackulaFit(
      {},
      {
        slug: "tall-tray",
        category: "shelf",
        u_height: 9,
        slots: [
          {
            id: "main",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 9,
          },
        ],
      },
    );

    expect(getRackFitSummary(direct, 10, [], undefined, 260, 8)).toMatchObject({
      label: "Tall",
      tone: "blocked",
    });
    expect(
      getRackFitSummary(child, 10, [tallTray], undefined, 260, 8),
    ).toMatchObject({ label: "No bay", tone: "blocked" });
  });
});
