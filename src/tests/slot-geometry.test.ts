import { describe, expect, it } from "vitest";
import { findStarterDevice } from "$lib/data/starterLibrary";
import { buildSlotGeometry } from "$lib/utils/slot-geometry";

describe("slot geometry", () => {
  it("lays out 2x2 carrier slots by row and column", () => {
    const carrier = findStarterDevice("carrier-1u-2x2")!;

    const geometry = buildSlotGeometry(carrier.slots!, 200, 40);

    expect(geometry.get("r0-c0")).toMatchObject({
      x: 0,
      y: 20,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r0-c1")).toMatchObject({
      x: 100,
      y: 20,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r1-c0")).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 20,
    });
    expect(geometry.get("r1-c1")).toMatchObject({
      x: 100,
      y: 0,
      width: 100,
      height: 20,
    });
  });

  it("keeps single-row slots horizontal", () => {
    const shelf = findStarterDevice("shelf-1u-2slot")!;

    const geometry = buildSlotGeometry(shelf.slots!, 200, 40);

    expect(geometry.get("left")).toMatchObject({
      x: 0,
      y: 0,
      width: 100,
      height: 40,
    });
    expect(geometry.get("right")).toMatchObject({
      x: 100,
      y: 0,
      width: 100,
      height: 40,
    });
  });

  it("leaves unused space above an underfilled explicit grid", () => {
    const slots = [
      {
        id: "bottom",
        position: { row: 0, col: 0 },
        width_fraction: 1,
        height_units: 1,
      },
    ];

    const geometry = buildSlotGeometry(slots, 200, 80, 2);

    expect(geometry.get("bottom")).toMatchObject({
      x: 0,
      y: 40,
      width: 200,
      height: 40,
      heightUnits: 1,
    });
  });

  it("renders an omitted mixed-grid row as the same 1U used by fit checks", () => {
    const slots = [
      {
        id: "bottom",
        position: { row: 0, col: 0 },
        width_fraction: 1,
      },
      {
        id: "top",
        position: { row: 1, col: 0 },
        width_fraction: 1,
        height_units: 1,
      },
    ];

    const geometry = buildSlotGeometry(slots, 200, 80, 2);

    expect(geometry.get("bottom")).toMatchObject({
      y: 40,
      height: 40,
      heightUnits: 1,
    });
    expect(geometry.get("top")).toMatchObject({
      y: 0,
      height: 40,
      heightUnits: 1,
    });
  });

  it("fills a legacy multi-U container with one width-only row", () => {
    const slots = [
      {
        id: "full-height",
        position: { row: 0, col: 0 },
        width_fraction: 1,
      },
    ];

    expect(
      buildSlotGeometry(slots, 200, 80, 2).get("full-height"),
    ).toMatchObject({
      y: 0,
      height: 80,
      heightUnits: 2,
    });
  });
});
