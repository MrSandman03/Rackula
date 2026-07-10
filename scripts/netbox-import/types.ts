/** Shared models for the NetBox bulk-import script. */

export type DeviceCategory =
  | "server"
  | "network"
  | "patch-panel"
  | "power"
  | "storage"
  | "kvm"
  | "av-media"
  | "cooling"
  | "shelf"
  | "blank"
  | "cable-management"
  | "other";

export interface NetBoxDevice {
  manufacturer: string;
  model: string;
  slug: string;
  u_height: number;
  is_full_depth?: boolean;
  front_image?: boolean;
  rear_image?: boolean;
  airflow?: string;
  weight?: number;
  weight_unit?: string;
  subdevice_role?: string;
  comments?: string;
  part_number?: string;
}

export interface VendorConfig {
  name: string;
  defaultCategory: DeviceCategory;
  filter?: (device: NetBoxDevice) => boolean;
  categoryOverrides?: Record<string, DeviceCategory>;
}

export interface ImportedDevice {
  slug: string;
  manufacturer: string;
  model: string;
  u_height: number;
  is_full_depth: boolean;
  category: DeviceCategory;
  airflow?: string;
  front_image?: boolean;
  rear_image?: boolean;
}

export interface ImportStats {
  vendor: string;
  total: number;
  imported: number;
  skipped: number;
}
