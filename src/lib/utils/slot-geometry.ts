import type { Slot } from "$lib/types";
import { effectiveSlotHeightUnits, slotWidthFraction } from "./slot-fit";

export interface SlotGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  heightUnits: number;
}

function sortedUnique(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Resolve container slot geometry from the declared row/column grid.
 * Slot rows are 0-indexed from the bottom of the container; SVG Y is top-down.
 */
export function buildSlotGeometry(
  slots: readonly Slot[],
  containerWidth: number,
  containerHeight: number,
  containerHeightUnits?: number,
): Map<string, SlotGeometry> {
  const geometry = new Map<string, SlotGeometry>();
  if (slots.length === 0) return geometry;

  const rows = sortedUnique(slots.map((slot) => slot.position.row));
  const heightContext = { containerHeightUnits, containerSlots: slots };
  const rowHeights = new Map<number, number>();
  for (const row of rows) {
    const rowSlots = slots.filter((slot) => slot.position.row === row);
    rowHeights.set(
      row,
      Math.max(
        ...rowSlots.map((slot) =>
          effectiveSlotHeightUnits(slot, heightContext),
        ),
      ),
    );
  }

  const totalHeightUnits = rows.reduce(
    (sum, row) => sum + (rowHeights.get(row) ?? 1),
    0,
  );
  const heightScale =
    containerHeightUnits !== undefined && containerHeightUnits > 0
      ? containerHeight / containerHeightUnits
      : totalHeightUnits > 0
        ? containerHeight / totalHeightUnits
        : containerHeight;

  let unitsBelow = 0;
  for (const row of rows) {
    const rowSlots = slots
      .filter((slot) => slot.position.row === row)
      .sort((a, b) => a.position.col - b.position.col);

    let x = 0;
    const rowHeight = rowHeights.get(row) ?? 1;
    const rowY = containerHeight - (unitsBelow + rowHeight) * heightScale;

    for (const slot of rowSlots) {
      const width = containerWidth * slotWidthFraction(slot);
      const heightUnits = effectiveSlotHeightUnits(slot, heightContext);
      geometry.set(slot.id, {
        x,
        y: rowY + (rowHeight - heightUnits) * heightScale,
        width,
        height: heightUnits * heightScale,
        heightUnits,
      });
      x += width;
    }

    unitsBelow += rowHeight;
  }

  return geometry;
}

export function slotGeometryFor(
  slots: readonly Slot[] | undefined,
  slotId: string | undefined,
  containerWidth: number,
  containerHeight: number,
  containerHeightUnits?: number,
): SlotGeometry | undefined {
  if (!slots || !slotId) return undefined;
  return buildSlotGeometry(
    slots,
    containerWidth,
    containerHeight,
    containerHeightUnits,
  ).get(slotId);
}
