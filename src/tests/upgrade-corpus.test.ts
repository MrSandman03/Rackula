// src/tests/upgrade-corpus.test.ts
import { describe, it, expect } from "vitest";
import {
  parseLayoutYaml,
  parseLayoutYamlWithImages,
  parseYaml,
} from "$lib/utils/yaml";
import {
  findSilentLosses,
  type AllowListEntry,
} from "./upgrade-corpus-helpers";
import {
  effectiveSlotHeightUnits,
  getSlotFitIssues,
  validateSlotTopology,
} from "$lib/utils/slot-fit";
import { DeviceTypeSchema, LayoutSchema } from "$lib/schemas";

interface Sidecar {
  reject?: boolean;
  hasImages?: boolean;
  allowList?: AllowListEntry[];
}

const yamlFiles = import.meta.glob("./fixtures/upgrade-corpus/*.rackula.yaml", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sidecars = import.meta.glob("./fixtures/upgrade-corpus/*.expected.json", {
  import: "default",
  eager: true,
}) as Record<string, Sidecar>;

function sidecarFor(yamlPath: string): Sidecar | null {
  const base = yamlPath.replace(/\.rackula\.yaml$/, "");
  const entry = Object.entries(sidecars).find(
    ([p]) => p.replace(/\.expected\.json$/, "") === base,
  );
  return entry?.[1] ?? null;
}

describe("upgrade corpus: YAML ingress via parseLayoutYaml", () => {
  const names = Object.keys(yamlFiles);
  it("discovers at least one fixture", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const [path, yaml] of Object.entries(yamlFiles)) {
    const name = path.split("/").pop() ?? path;
    const spec = sidecarFor(path);
    if (!spec) {
      it(`${name}: missing required .expected.json sidecar`, () => {
        expect.fail(
          `No .expected.json for ${name}. Every corpus fixture needs an explicit sidecar (see scripts/add-corpus-fixture.sh).`,
        );
      });
      continue;
    }

    if (spec.reject) {
      it(`${name}: is rejected by the version gate`, async () => {
        await expect(parseLayoutYaml(yaml)).rejects.toThrow(
          /newer version of Rackula/,
        );
      });
      continue;
    }

    it(`${name}: loads with no silent data loss`, async () => {
      const raw = await parseYaml(yaml);
      const loaded = spec.hasImages
        ? (await parseLayoutYamlWithImages(yaml)).layout
        : await parseLayoutYaml(yaml);
      const losses = findSilentLosses(raw, loaded, spec.allowList ?? []);
      expect(
        losses,
        `silent data loss in ${name}:\n${JSON.stringify(losses, null, 2)}`,
      ).toEqual([]);
    });
  }
});

// === Over-rack rail position is clamped on load, not rejected (#2661) ===
// The corpus check above only proves no silent data loss; here we pin the actual
// clamped value the load produces so a regression that stops clamping (or that
// hard-rejects an over-rack layout, breaking prior-release loading) fails.
const overRackYaml = (
  await import("./fixtures/upgrade-corpus/over-rack-rail-position.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: over-rack rail clamp (#2661)", () => {
  it("clamps a rail device above a 10U rack to the highest whole-U, loading does not fail", async () => {
    const layout = await parseLayoutYaml(overRackYaml);
    const device = layout.racks[0]!.devices[0]!;
    // UNITS_PER_U = 6; raw position 66 (U11) clamps to U10 = 60 in a 10U rack.
    expect(device.position).toBe(60);
    // Invariant: a rail position is always a whole U (no fractional rails).
    expect(device.position % 6).toBe(0);
  });
});

// === Prior-release racks gain depth_mm/base_weight defaults on load (#2738) ===
// A layout written before the depth/base-weight fields existed must still load,
// and the load must fill the schema defaults rather than leaving the fields unset.
const preDepthWeightYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.5-pre-depth-weight.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: depth/base-weight defaults (#2738)", () => {
  it("fills depth_mm and base_weight defaults for a rack written without them", async () => {
    const layout = await parseLayoutYaml(preDepthWeightYaml);
    const rack = layout.racks[0]!;
    expect(rack.depth_mm).toBe(1000);
    expect(rack.base_weight).toBe(0);
  });
});

const legacyRackMateYaml = (
  await import("./fixtures/upgrade-corpus/legacy-rackmate-t1-plus-profile.rackula.yaml?raw")
).default as string;
const legacyRackMateOverRackYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.6-rackmate-over-rack.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: legacy RackMate profile inference", () => {
  it("infers the named profile from the exact old YAML signature", async () => {
    const layout = await parseLayoutYaml(legacyRackMateYaml);

    expect(layout.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it("retains the prior-release over-rack clamp after profile inference", async () => {
    const layout = await parseLayoutYaml(legacyRackMateOverRackYaml);

    expect(layout.racks[0]?.profile).toBe("rackmate-t1-plus");
    expect(layout.racks[0]?.devices[0]?.position).toBe(42);
  });
});

const preStrictChildFitYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.6-pre-strict-child-fit.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: fit checks added after v26.6.6", () => {
  it("loads prior-valid physical-height and rack-width metadata", async () => {
    const layout = await parseLayoutYaml(preStrictChildFitYaml);

    expect(layout.racks[0]?.devices.map((device) => device.id)).toEqual([
      "legacy-fit-container",
      "legacy-tall-child",
      "legacy-width-child",
    ]);
  });

  it("keeps the new fit checks strict at the current authoring boundary", async () => {
    const parsed = await parseYaml(preStrictChildFitYaml);
    const result = LayoutSchema.safeParse(parsed);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("taller than slot"),
          expect.stringContaining("not compatible with a 19-inch rack"),
        ]),
      );
    }
  });
});

const allOmittedMultirowYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.6-all-omitted-multirow-slots.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: all-omitted multirow slot heights", () => {
  it("loads the prior-valid child while runtime row geometry stays corrected", async () => {
    const layout = await parseLayoutYaml(allOmittedMultirowYaml);
    const containerType = layout.device_types.find(
      (deviceType) => deviceType.slug === "legacy-2u-container",
    )!;
    const slots = containerType.slots!;

    expect(
      layout.racks[0]?.devices.find((device) => device.id === "legacy-child"),
    ).toMatchObject({
      container_id: "legacy-container",
      slot_id: "bottom",
      position: 0,
    });
    expect(slots.every((slot) => slot.height_units === undefined)).toBe(true);
    expect(
      effectiveSlotHeightUnits(slots[0]!, {
        containerHeightUnits: containerType.u_height,
        containerSlots: slots,
      }),
    ).toBe(1);
  });
});

const mixedOmittedMultirowYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.6-mixed-omitted-multirow-slots.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: mixed omitted multirow slot heights", () => {
  it("loads a prior-valid tall child while runtime uses the corrected omitted-row height", async () => {
    const layout = await parseLayoutYaml(mixedOmittedMultirowYaml);
    const containerType = layout.device_types.find(
      (deviceType) => deviceType.slug === "legacy-mixed-container-type",
    )!;
    const childType = layout.device_types.find(
      (deviceType) => deviceType.slug === "legacy-mixed-child-type",
    )!;
    const slots = containerType.slots!;
    const omittedSlot = slots.find((slot) => slot.id === "omitted-bottom")!;

    expect(
      layout.racks[0]?.devices.find(
        (device) => device.id === "legacy-mixed-child",
      ),
    ).toMatchObject({
      container_id: "legacy-mixed-container",
      slot_id: "omitted-bottom",
      position: 0,
    });
    expect(omittedSlot.height_units).toBeUndefined();
    expect(
      effectiveSlotHeightUnits(omittedSlot, {
        containerHeightUnits: containerType.u_height,
        containerSlots: slots,
      }),
    ).toBe(1);
    expect(
      getSlotFitIssues(childType, omittedSlot, {
        rackWidth: layout.racks[0]?.width,
        containerHeightUnits: containerType.u_height,
        containerSlots: slots,
      }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "height" })]),
    );
  });
});

const explicitRowHeightOverflowYaml = (
  await import("./fixtures/upgrade-corpus/v26.6.6-explicit-row-height-overflow.rackula.yaml?raw")
).default as string;

describe("upgrade corpus: explicit row-height overflow", () => {
  it("loads the prior-valid grid without weakening standalone device authoring", async () => {
    const layout = await parseLayoutYaml(explicitRowHeightOverflowYaml);
    const containerType = layout.device_types.find(
      (deviceType) => deviceType.slug === "legacy-explicit-container-type",
    )!;

    expect(
      layout.racks[0]?.devices.find(
        (device) => device.id === "legacy-explicit-child",
      ),
    ).toMatchObject({
      container_id: "legacy-explicit-container",
      slot_id: "two-u-bottom",
      position: 0,
    });
    expect(containerType.slots?.map((slot) => slot.height_units)).toEqual([
      2, 1,
    ]);
    expect(
      validateSlotTopology(containerType.slots!, containerType.u_height),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "height_overflow" }),
      ]),
    );
    expect(DeviceTypeSchema.safeParse(containerType).success).toBe(false);
  });

  it("is rejected by the current layout authoring schema", async () => {
    const parsed = await parseYaml(explicitRowHeightOverflowYaml);

    expect(LayoutSchema.safeParse(parsed).success).toBe(false);
  });
});
