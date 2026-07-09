import type { DeviceType } from "$lib/types";

const DEFAULT_RACK_WIDTHS = [19];

export function resolveDeviceRackWidths(device: DeviceType): number[] {
  return device.rack_widths?.length ? device.rack_widths : DEFAULT_RACK_WIDTHS;
}

/** A supported width is a minimum rail width, not an exact-width constraint. */
export function isDeviceCompatibleWithRackWidth(
  device: DeviceType,
  rackWidth: number,
): boolean {
  return resolveDeviceRackWidths(device).some(
    (deviceWidth) => rackWidth >= deviceWidth,
  );
}
