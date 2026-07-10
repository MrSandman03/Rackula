/** Shared geometry and theme constants for SVG export rendering. */

import {
  BASE_RACK_WIDTH,
  RACK_PADDING_HIDDEN,
  U_HEIGHT_PX,
} from "$lib/constants/layout";

export const U_HEIGHT = U_HEIGHT_PX;
export const RACK_WIDTH = BASE_RACK_WIDTH;
export const RACK_PADDING = RACK_PADDING_HIDDEN;
export const RACK_GAP = 40;
export const LEGEND_PADDING = 20;
export const LEGEND_ITEM_HEIGHT = 24;
export const EXPORT_PADDING = 20;
export const RACK_NAME_HEIGHT = 18; // Space for rack name above rack
export const VIEW_LABEL_HEIGHT = 15; // Space for FRONT/REAR labels
export const RACK_BOTTOM_PADDING = 2; // Visual breathing room below bottom rail
export const BAYED_ROW_GAP = 10; // Gap between front and rear rows in bayed layout
export const BAYED_BAY_LABEL_HEIGHT = 14; // Height for "Bay 1", "Bay 2" labels

// Legend text sizing constants
export const LEGEND_MAX_FONT_SIZE = 12;
export const LEGEND_MIN_FONT_SIZE = 9;
export const LEGEND_TEXT_WIDTH = 160; // Available width for legend device names

// QR Code export constants
export const QR_SIZE = 150; // Size of QR code in pixels for screen exports
export const QR_PADDING = 10; // Padding around QR code
export const QR_LABEL_HEIGHT = 20; // Height for "Scan to open in Rackula" label

// Brand colours for QR label
export const BRAND_PURPLE_DARK = "#BD93F9";
export const BRAND_PURPLE_LIGHT = "#644AC9";

// Theme colours
export const DARK_BG = "#1a1a1a";
export const LIGHT_BG = "#f5f5f5";
export const DARK_RACK_INTERIOR = "#2d2d2d";
export const LIGHT_RACK_INTERIOR = "#e0e0e0";
export const DARK_RACK_RAIL = "#404040";
export const LIGHT_RACK_RAIL = "#c0c0c0";
export const DARK_TEXT = "#ffffff";
export const LIGHT_TEXT = "#1a1a1a";
export const DARK_GRID = "#505050";
export const LIGHT_GRID = "#a0a0a0";
