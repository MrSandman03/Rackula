import type { DeviceType, Slot } from "$lib/types";

export const SLOT_FRACTION_TOLERANCE = 0.01;
export const SLOT_DIMENSION_TOLERANCE_MM = 0.5;

export interface DeviceDimensionsMm {
  width?: number;
  depth?: number;
  height?: number;
}

export interface SlotFitContext {
  rackWidth?: number;
  rackWidthMm?: number;
  containerHeightUnits?: number;
}

export interface SlotFitIssue {
  code: "category" | "logical_width" | "physical_width" | "height";
  message: string;
}

export interface SlotTopologyIssue {
  code: "duplicate_id" | "duplicate_cell" | "row_width_overflow";
  message: string;
  slotId?: string;
  row?: number;
  col?: number;
}

interface RackulaFitFields {
  dimensions_mm?: DeviceDimensionsMm;
  reported_dimensions_mm?: DeviceDimensionsMm;
}

export function slotWidthFraction(slot: Slot): number {
  return slot.width_fraction ?? 1;
}

export function slotHeightUnits(slot: Slot): number {
  return slot.height_units ?? 1;
}

export function effectiveSlotHeightUnits(
  slot: Slot,
  context: SlotFitContext = {},
): number {
  return slot.height_units ?? context.containerHeightUnits ?? 1;
}

export function requiredSlotFraction(device: DeviceType): number {
  return (device.slot_width ?? 2) === 1 ? 0.5 : 1;
}

export function rackWidthToMillimetres(rackWidth?: number): number | undefined {
  return typeof rackWidth === "number" ? rackWidth * 25.4 : undefined;
}

export function getDeviceDimensionsMm(
  device: DeviceType,
): DeviceDimensionsMm | undefined {
  const rackulaFit = device.custom_fields?.rackula_fit as
    RackulaFitFields | undefined;
  return rackulaFit?.dimensions_mm ?? rackulaFit?.reported_dimensions_mm;
}

export function getDeviceDepthMm(device: DeviceType): number | undefined {
  return getDeviceDimensionsMm(device)?.depth;
}

export function getSlotAvailableWidthMm(
  slot: Slot,
  context: SlotFitContext = {},
): number | undefined {
  const rackWidthMm =
    context.rackWidthMm ?? rackWidthToMillimetres(context.rackWidth);
  return rackWidthMm === undefined
    ? undefined
    : rackWidthMm * slotWidthFraction(slot);
}

export function getSlotFitIssues(
  childType: DeviceType,
  slot: Slot,
  context: SlotFitContext = {},
): SlotFitIssue[] {
  const issues: SlotFitIssue[] = [];

  if (
    slot.accepts &&
    slot.accepts.length > 0 &&
    !slot.accepts.includes(childType.category)
  ) {
    issues.push({
      code: "category",
      message: `Device category "${childType.category}" is not accepted by slot "${slot.id}".`,
    });
  }

  const requiredFraction = requiredSlotFraction(childType);
  const availableFraction = slotWidthFraction(slot);
  if (requiredFraction > availableFraction + SLOT_FRACTION_TOLERANCE) {
    issues.push({
      code: "logical_width",
      message: `Device requires ${requiredFraction} rack-width fraction but slot "${slot.id}" only provides ${availableFraction}.`,
    });
  }

  const slotHeight = effectiveSlotHeightUnits(slot, context);
  if (childType.u_height > slotHeight) {
    issues.push({
      code: "height",
      message: `Device is too tall for slot "${slot.id}" (${childType.u_height}U > ${slotHeight}U).`,
    });
  }

  const deviceWidthMm = getDeviceDimensionsMm(childType)?.width;
  const availableWidthMm = getSlotAvailableWidthMm(slot, context);
  if (
    deviceWidthMm !== undefined &&
    availableWidthMm !== undefined &&
    deviceWidthMm > availableWidthMm + SLOT_DIMENSION_TOLERANCE_MM
  ) {
    issues.push({
      code: "physical_width",
      message: `Device is ${deviceWidthMm}mm wide, wider than slot "${slot.id}" (${availableWidthMm.toFixed(1)}mm).`,
    });
  }

  return issues;
}

export function validateSlotTopology(
  slots: readonly Slot[],
): SlotTopologyIssue[] {
  const issues: SlotTopologyIssue[] = [];
  const ids = new Set<string>();
  const cells = new Map<string, string>();
  const rowWidths = new Map<number, number>();

  for (const slot of slots) {
    if (ids.has(slot.id)) {
      issues.push({
        code: "duplicate_id",
        slotId: slot.id,
        message: `Duplicate slot id "${slot.id}".`,
      });
    }
    ids.add(slot.id);

    const cellKey = `${slot.position.row}:${slot.position.col}`;
    const previous = cells.get(cellKey);
    if (previous) {
      issues.push({
        code: "duplicate_cell",
        slotId: slot.id,
        row: slot.position.row,
        col: slot.position.col,
        message: `Slot "${slot.id}" overlaps slot "${previous}" at row ${slot.position.row}, column ${slot.position.col}.`,
      });
    } else {
      cells.set(cellKey, slot.id);
    }

    rowWidths.set(
      slot.position.row,
      (rowWidths.get(slot.position.row) ?? 0) + slotWidthFraction(slot),
    );
  }

  for (const [row, width] of rowWidths) {
    if (width > 1 + SLOT_FRACTION_TOLERANCE) {
      issues.push({
        code: "row_width_overflow",
        row,
        message: `Slot row ${row} uses ${width.toFixed(2)} rack-width fraction, exceeding 1.00.`,
      });
    }
  }

  return issues;
}
