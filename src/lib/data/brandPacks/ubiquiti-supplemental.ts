/**
 * Supplemental Ubiquiti device definitions from community asset imports.
 */

import type { DeviceType } from "$lib/types";
import { CATEGORY_COLOURS } from "$lib/types/constants";

export const ubiquitiSupplementalDevices: DeviceType[] = [
  // ============================================
  // UniFi Switches - Pro XG Series (from vastoholic SVGs)
  // ============================================
  {
    slug: "ubiquiti-usw-pro-xg-10-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-XG-10-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-pro-xg-24-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-XG-24-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-pro-xg-48",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-XG-48",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-pro-xg-48-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-XG-48-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-pro-xg-aggregation",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-XG-Aggregation",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },

  // ============================================
  // UniFi Switches - Pro HD Series (from vastoholic SVGs)
  // ============================================
  {
    slug: "ubiquiti-usw-pro-hd-24",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-HD-24",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-pro-hd-24-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Pro-HD-24-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },

  // ============================================
  // UniFi Switches - Special (from vastoholic SVGs)
  // ============================================
  {
    slug: "ubiquiti-usw-mission-critical",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-Mission-Critical",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-usw-wan",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "USW-WAN",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-unifi-wan-switch-rj45",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "Unifi WAN Switch RJ45",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
    rear_image: true,
  },

  // ============================================
  // Enterprise Campus Switches (from vastoholic SVGs)
  // ============================================
  {
    slug: "ubiquiti-ecs-24-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "ECS-24-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-ecs-24s-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "ECS-24S-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-ecs-48-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "ECS-48-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },
  {
    slug: "ubiquiti-ecs-48s-poe",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "ECS-48S-PoE",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.network,
    category: "network",
    front_image: true,
  },

  // ============================================
  // Rackmount Accessories (from vastoholic SVGs)
  // ============================================
  {
    slug: "ubiquiti-brush-panel-1u",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "Brush Panel 1U",
    is_full_depth: false,
    colour: CATEGORY_COLOURS["cable-management"],
    category: "cable-management",
    front_image: true,
  },
  {
    slug: "ubiquiti-uacc-rack-panel-blank-1u",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "UACC-Rack-Panel-Blank-1U",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.blank,
    category: "blank",
    front_image: true,
  },
  {
    slug: "ubiquiti-uacc-rack-panel-blank-2u",
    u_height: 2,
    manufacturer: "Ubiquiti",
    model: "UACC-Rack-Panel-Blank-2U",
    is_full_depth: false,
    colour: CATEGORY_COLOURS.blank,
    category: "blank",
    front_image: true,
  },

  // Additional devices from NetBox library (Issue #1109 Phase 1)
  {
    slug: "ubiquiti-unifi-smartpower-rps",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "UniFi SmartPower RPS",
    is_full_depth: false,
    airflow: "front-to-rear",
    colour: CATEGORY_COLOURS.power,
    category: "power",
    front_image: true,
    rear_image: true,
  },

  {
    slug: "ubiquiti-unifi-switch-24-gen2",
    u_height: 1,
    manufacturer: "Ubiquiti",
    model: "UniFi Switch 24 Gen2",
    is_full_depth: false,
    airflow: "passive",
    colour: CATEGORY_COLOURS.network,
    category: "network",
  },
];
