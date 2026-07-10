import type { DeviceType } from "$lib/types";

export interface DevicePaletteSection {
  id: string;
  title: string;
  devices: DeviceType[];
  defaultExpanded: boolean;
  icon?: string;
  matchCount?: number;
  firstMatch?: DeviceType;
  isEmpty?: boolean;
}
