import { beforeEach, describe, expect, it } from "vitest";
import { LayoutSchema, RackSchema } from "$lib/schemas";
import { createDefaultRack } from "$lib/utils/serialization";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  RACKMATE_T1_PLUS_DEPTH_MM,
  RACKMATE_T1_PLUS_HEIGHT,
} from "$lib/types/constants";

const rackInput = {
  id: "rack-1",
  name: "Mini rack",
  height: 12,
  width: 10 as const,
  depth_mm: 400,
  desc_units: false,
  show_rear: true,
  form_factor: "4-post-cabinet" as const,
  starting_unit: 1,
  position: 0,
  devices: [],
};

describe("RackMate profile defaults", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
  });

  it("keeps generic 10-inch rack factory defaults generic", () => {
    const rack = createDefaultRack("Generic mini rack", 12, 10);

    expect(rack.profile).toBeUndefined();
    expect(rack.height).toBe(12);
    expect(rack.depth_mm).toBe(1000);
  });

  it("creates an explicit RackMate T1 Plus at its physical dimensions", () => {
    const rack = createDefaultRack(
      "RackMate",
      12,
      10,
      "4-post-cabinet",
      false,
      1,
      true,
      "rack-1",
      "rackmate-t1-plus",
    );

    expect(rack.profile).toBe("rackmate-t1-plus");
    expect(rack.height).toBe(RACKMATE_T1_PLUS_HEIGHT);
    expect(rack.depth_mm).toBe(RACKMATE_T1_PLUS_DEPTH_MM);
  });

  it("preserves standalone generic 10-inch rack dimensions", () => {
    const parsed = RackSchema.parse(rackInput);

    expect(parsed.profile).toBeUndefined();
    expect(parsed.height).toBe(12);
    expect(parsed.depth_mm).toBe(400);
  });

  it("normalizes an explicit RackMate profile to 8U and 260mm", () => {
    const parsed = RackSchema.parse({
      ...rackInput,
      profile: "rackmate-t1-plus",
    });

    expect(parsed.profile).toBe("rackmate-t1-plus");
    expect(parsed.height).toBe(RACKMATE_T1_PLUS_HEIGHT);
    expect(parsed.depth_mm).toBe(RACKMATE_T1_PLUS_DEPTH_MM);
  });

  it("preserves generic 10-inch dimensions when loading a layout", () => {
    const parsed = LayoutSchema.parse({
      version: "1.0.0",
      name: "Generic mini rack layout",
      racks: [rackInput],
      device_types: [],
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    });

    expect(parsed.racks[0]?.profile).toBeUndefined();
    expect(parsed.racks[0]?.height).toBe(12);
    expect(parsed.racks[0]?.depth_mm).toBe(400);
  });

  it("migrates the exact legacy RackMate signature to the named profile", () => {
    const parsed = LayoutSchema.parse({
      version: "1.0.0",
      name: "Legacy RackMate layout",
      racks: [
        {
          ...rackInput,
          name: "RackMate T1 Plus",
          height: 8,
          depth_mm: 260,
        },
      ],
      device_types: [],
      settings: {
        display_mode: "label",
        show_labels_on_images: false,
      },
    });

    expect(parsed.racks[0]).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it.each([
    { name: "Similar name", height: 8, depth_mm: 260 },
    { name: "RackMate T1 Plus", height: 7, depth_mm: 260 },
    { name: "RackMate T1 Plus", height: 8, depth_mm: 300 },
  ])(
    "keeps a near-match legacy rack generic: $name/$height/$depth_mm",
    (candidate) => {
      const parsed = RackSchema.parse({ ...rackInput, ...candidate });

      expect(parsed.profile).toBeUndefined();
    },
  );

  it("rejects devices above 8U when a RackMate profile normalizes rack height", () => {
    const deviceType = {
      slug: "rackmate-device",
      model: "RackMate Device",
      u_height: 2,
      category: "network" as const,
      colour: "#336699",
      rack_widths: [10] as const,
    };
    const result = LayoutSchema.safeParse({
      version: "1.0.0",
      name: "Invalid RackMate height",
      racks: [
        {
          ...rackInput,
          profile: "rackmate-t1-plus",
          devices: [
            {
              id: "device-1",
              device_type: deviceType.slug,
              position: 60,
              face: "front",
            },
            {
              id: "device-2",
              device_type: deviceType.slug,
              position: 66,
              face: "front",
            },
          ],
        },
      ],
      device_types: [deviceType],
      settings: { display_mode: "label", show_labels_on_images: false },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("does not fit the RackMate"),
          }),
        ]),
      );
    }
  });

  it("rejects an above-8U device instead of clamping an already normalized RackMate", () => {
    const deviceType = {
      slug: "rackmate-device",
      model: "RackMate Device",
      u_height: 1,
      category: "network" as const,
      colour: "#336699",
      rack_widths: [10] as const,
      is_full_depth: false,
    };
    const result = LayoutSchema.safeParse({
      version: "1.0.0",
      name: "Invalid fixed RackMate position",
      racks: [
        {
          ...rackInput,
          height: 8,
          profile: "rackmate-t1-plus",
          devices: [
            {
              id: "device-above-rack",
              device_type: deviceType.slug,
              position: 54,
              face: "front",
            },
          ],
        },
      ],
      device_types: [deviceType],
      settings: { display_mode: "label", show_labels_on_images: false },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining("does not fit the RackMate"),
          }),
        ]),
      );
    }
  });

  it.each([
    {
      name: "19-inch-only",
      rack_widths: [19] as const,
      dimensions_mm: { width: 200, depth: 200, height: 40 },
    },
    {
      name: "too deep",
      rack_widths: [10] as const,
      dimensions_mm: { width: 100, depth: 300, height: 40 },
    },
  ])(
    "rejects $name hardware in a RackMate layout",
    ({ rack_widths, dimensions_mm }) => {
      const deviceType = {
        slug: "incompatible-device",
        model: "Incompatible Device",
        u_height: 1,
        category: "network" as const,
        colour: "#336699",
        rack_widths,
        custom_fields: { rackula_fit: { dimensions_mm } },
      };
      const result = LayoutSchema.safeParse({
        version: "1.0.0",
        name: "Invalid RackMate fit",
        racks: [
          {
            ...rackInput,
            height: 8,
            profile: "rackmate-t1-plus",
            devices: [
              {
                id: "device-1",
                device_type: deviceType.slug,
                position: 6,
                face: "front",
              },
            ],
          },
        ],
        device_types: [deviceType],
        settings: { display_mode: "label", show_labels_on_images: false },
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining("does not fit the RackMate"),
            }),
          ]),
        );
      }
    },
  );

  it("rejects recorded and raw dimension drift for a profiled rack", () => {
    const store = getLayoutStore();
    const rack = store.addRack(
      "RackMate",
      8,
      10,
      "4-post-cabinet",
      false,
      1,
      "rackmate-t1-plus",
    )!;

    store.updateRack(rack.id, { height: 12, depth_mm: 400, width: 19 });
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });

    store.updateRackRaw({ height: 16, depth_mm: 600, width: 23 }, rack.id);
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it("normalizes whole-rack raw replacement through profile defaults", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Generic", 12, 19)!;

    store.replaceRackRaw({
      ...rack,
      name: "Replacement RackMate",
      profile: "rackmate-t1-plus",
      width: 23,
      height: 16,
      depth_mm: 600,
    });

    expect(store.rack).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it("allows dimensions to change when the profile is cleared atomically", () => {
    const store = getLayoutStore();
    const rack = store.addRack(
      "RackMate",
      8,
      10,
      "4-post-cabinet",
      false,
      1,
      "rackmate-t1-plus",
    )!;

    store.updateRack(rack.id, {
      profile: undefined,
      width: 19,
      height: 12,
      depth_mm: 400,
    });

    expect(store.getRackById(rack.id)).toMatchObject({
      width: 19,
      height: 12,
      depth_mm: 400,
    });
    expect(store.getRackById(rack.id)?.profile).toBeUndefined();
  });

  it("undoes and redoes an atomic profile assignment with its dimensions", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Generic", 12, 19)!;

    store.updateRack(rack.id, { profile: "rackmate-t1-plus" });
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });

    store.undo();
    expect(store.getRackById(rack.id)).toMatchObject({
      width: 19,
      height: 12,
      depth_mm: 1000,
    });
    expect(store.getRackById(rack.id)?.profile).toBeUndefined();

    store.redo();
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });

  it("records implicit profile dimensions for exact direct undo and redo", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Generic", 12, 19)!;

    store.updateRackRecorded(rack.id, { profile: "rackmate-t1-plus" });
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });

    store.undo();
    expect(store.getRackById(rack.id)).toMatchObject({
      width: 19,
      height: 12,
      depth_mm: 1000,
    });
    expect(store.getRackById(rack.id)?.profile).toBeUndefined();

    store.redo();
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
  });
});
