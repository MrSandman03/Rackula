import { describe, expect, it } from "vitest";
import { getSlotFitIssues, validateSlotTopology } from "$lib/utils/slot-fit";
import { createTestDeviceType, createTestSlot } from "./factories";

describe("slot physical fit", () => {
  it("rejects a device whose measured height exceeds the slot height", () => {
    const device = {
      ...createTestDeviceType({ slug: "ucg-max", u_height: 0.5 }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 141.8, depth: 127.6, height: 30 },
        },
      },
    };
    const slot = createTestSlot({ height_units: 0.5 });

    expect(getSlotFitIssues(device, slot)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "physical_height" }),
      ]),
    );
  });

  it("keeps legacy devices without measured height compatible", () => {
    const device = createTestDeviceType({ slug: "legacy", u_height: 0.5 });
    const slot = createTestSlot({ height_units: 0.5 });

    expect(getSlotFitIssues(device, slot)).toEqual([]);
  });

  it("treats an omitted height as 1U when a sibling row is explicit", () => {
    const slots = [
      createTestSlot({
        id: "bottom",
        position: { row: 0, col: 0 },
        height_units: undefined,
      }),
      createTestSlot({
        id: "top",
        position: { row: 1, col: 0 },
        height_units: 1,
      }),
    ];
    const device = createTestDeviceType({ slug: "two-u-child", u_height: 2 });

    expect(
      getSlotFitIssues(device, slots[0]!, {
        containerHeightUnits: 2,
        containerSlots: slots,
      }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "height" })]),
    );
  });

  it("lets a legacy single-row width-only slot use the full container height", () => {
    const slots = [
      createTestSlot({
        id: "full-height",
        position: { row: 0, col: 0 },
        height_units: undefined,
      }),
    ];
    const device = createTestDeviceType({ slug: "two-u-child", u_height: 2 });

    expect(
      getSlotFitIssues(device, slots[0]!, {
        containerHeightUnits: 2,
        containerSlots: slots,
      }),
    ).toEqual([]);
  });
});

describe("slot topology height", () => {
  it("rejects rows whose declared heights exceed the container height", () => {
    const slots = [
      createTestSlot({
        id: "bottom",
        position: { row: 0, col: 0 },
        height_units: 1,
      }),
      createTestSlot({
        id: "top",
        position: { row: 1, col: 0 },
        height_units: 1,
      }),
    ];

    expect(validateSlotTopology(slots, 1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "height_overflow" }),
      ]),
    );
  });

  it("uses the tallest slot in each row when calculating topology height", () => {
    const slots = [
      createTestSlot({
        id: "bottom-short",
        position: { row: 0, col: 0 },
        width_fraction: 0.5,
        height_units: 0.5,
      }),
      createTestSlot({
        id: "bottom-tall",
        position: { row: 0, col: 1 },
        width_fraction: 0.5,
        height_units: 1,
      }),
      createTestSlot({
        id: "top",
        position: { row: 1, col: 0 },
        height_units: 1,
      }),
    ];

    expect(validateSlotTopology(slots, 2)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "height_overflow" }),
      ]),
    );
  });
});
