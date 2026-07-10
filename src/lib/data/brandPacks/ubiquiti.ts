/**
 * Ubiquiti Brand Pack
 * Pre-defined device types for Ubiquiti networking equipment
 * Source: NetBox community devicetype-library
 *
 * Slugs follow NetBox naming convention for compatibility:
 * Pattern: {manufacturer}-{product-line}-{model}
 */

import type { DeviceType } from "$lib/types";
import { ubiquitiCoreDevices } from "./ubiquiti-core";
import { ubiquitiNetboxDevices } from "./ubiquiti-netbox";
import { ubiquitiSupplementalDevices } from "./ubiquiti-supplemental";

/**
 * Ubiquiti device definitions.
 *
 * Concatenation order intentionally matches the historical single-file catalog.
 */
export const ubiquitiDevices: DeviceType[] = [
  ...ubiquitiCoreDevices,
  ...ubiquitiNetboxDevices,
  ...ubiquitiSupplementalDevices,
];
