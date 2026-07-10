/** Single-rack SVG renderer used by standalone and bayed exports. */

import type { DeviceType, DisplayMode, Rack } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { placementKey } from "$lib/utils/placement-key";
import { getBlockedSlots } from "../../blocked-slots";
import { effectiveFace } from "$lib/utils/effective-face";
import {
  fitTextToWidth,
  DEVICE_LABEL_MAX_FONT,
  DEVICE_LABEL_MIN_FONT,
  DEVICE_LABEL_ICON_SPACE_LEFT,
  DEVICE_LABEL_ICON_SPACE_RIGHT,
} from "../../text-sizing";
import { RAIL_WIDTH } from "$lib/constants/layout";
import { toHumanUnits } from "$lib/utils/position";
import { createCategoryIconElements } from "./category-icons";
import { RACK_PADDING, RACK_WIDTH, U_HEIGHT } from "./constants";

export interface RackViewRenderContext {
  svg: SVGSVGElement;
  deviceLibrary: DeviceType[];
  images?: ImageStoreMap;
  layoutId?: string;
  displayMode: DisplayMode;
  includeNames: boolean;
  isDark: boolean;
  rackInterior: string;
  rackRail: string;
  textColor: string;
  gridColor: string;
}

// Aliases for export context (export uses hidden padding since view labels show rack name)

/**
 * Filter devices by face for export.
 *
 * Mirrors the live preview in Rack.svelte: a device is visible on a face when
 * its effective face is "both" or matches the requested face. The effective
 * face is derived on read via effectiveFace, which looks the placement's type
 * up in deviceLibrary and returns "both" for any full-depth device regardless
 * of its stored face. Stored face is therefore non-authoritative for full-depth
 * devices, and the per-device library lookup is required to resolve depth.
 */
function filterDevicesByFace(
  devices: Rack["devices"],
  faceFilter: "front" | "rear" | undefined,
  deviceLibrary: DeviceType[],
): Rack["devices"] {
  if (!faceFilter) return devices;
  return devices.filter((d) => {
    const face = effectiveFace(
      d,
      deviceLibrary.find((dt) => dt.slug === d.device_type),
    );
    return face === "both" || face === faceFilter;
  });
}

/** Render one rack face into a translated SVG group. */
export function renderRackView(
  context: RackViewRenderContext,
  rack: Rack,
  xOffset: number,
  yOffset: number,
  faceFilter: "front" | "rear" | undefined,
  viewLabel?: string,
  suppressName = false,
): SVGGElement {
  const {
    svg,
    deviceLibrary,
    images,
    layoutId,
    displayMode,
    includeNames,
    isDark,
    rackInterior,
    rackRail,
    textColor,
    gridColor,
  } = context;
  const rackGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
  rackGroup.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);

  const rackHeight = rack.height * U_HEIGHT;

  // Rack interior
  const interior = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  interior.setAttribute("x", String(RAIL_WIDTH));
  interior.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
  interior.setAttribute("width", String(RACK_WIDTH - RAIL_WIDTH * 2));
  interior.setAttribute("height", String(rackHeight));
  interior.setAttribute("fill", rackInterior);
  rackGroup.appendChild(interior);

  // Top bar (horizontal)
  const topBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  topBar.setAttribute("x", "0");
  topBar.setAttribute("y", String(RACK_PADDING));
  topBar.setAttribute("width", String(RACK_WIDTH));
  topBar.setAttribute("height", String(RAIL_WIDTH));
  topBar.setAttribute("fill", rackRail);
  rackGroup.appendChild(topBar);

  // Bottom bar (horizontal)
  const bottomBar = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  bottomBar.setAttribute("x", "0");
  bottomBar.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH + rackHeight));
  bottomBar.setAttribute("width", String(RACK_WIDTH));
  bottomBar.setAttribute("height", String(RAIL_WIDTH));
  bottomBar.setAttribute("fill", rackRail);
  rackGroup.appendChild(bottomBar);

  // Left rail (vertical)
  const leftRail = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  leftRail.setAttribute("x", "0");
  leftRail.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
  leftRail.setAttribute("width", String(RAIL_WIDTH));
  leftRail.setAttribute("height", String(rackHeight));
  leftRail.setAttribute("fill", rackRail);
  rackGroup.appendChild(leftRail);

  // Right rail (vertical)
  const rightRail = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "rect",
  );
  rightRail.setAttribute("x", String(RACK_WIDTH - RAIL_WIDTH));
  rightRail.setAttribute("y", String(RACK_PADDING + RAIL_WIDTH));
  rightRail.setAttribute("width", String(RAIL_WIDTH));
  rightRail.setAttribute("height", String(rackHeight));
  rightRail.setAttribute("fill", rackRail);
  rackGroup.appendChild(rightRail);

  // Grid lines
  for (let i = 0; i <= rack.height; i++) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    const y = i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH;
    line.setAttribute("x1", String(RAIL_WIDTH));
    line.setAttribute("y1", String(y));
    line.setAttribute("x2", String(RACK_WIDTH - RAIL_WIDTH));
    line.setAttribute("y2", String(y));
    line.setAttribute("stroke", gridColor);
    line.setAttribute("stroke-width", "1");
    rackGroup.appendChild(line);
  }

  // Mounting holes on both rails (3 per U) - matches Rack.svelte exactly
  const holeColor = isDark ? "#505050" : "#a0a0a0";
  const leftHoleX = RAIL_WIDTH - 4;
  const rightHoleX = RACK_WIDTH - RAIL_WIDTH + 1;

  for (let i = 0; i < rack.height; i++) {
    const baseY = i * U_HEIGHT + RACK_PADDING + RAIL_WIDTH + 4;

    // Three holes per U, matching canvas offsets: -2, 5, 12
    for (const offsetY of [-2, 5, 12]) {
      // Left rail holes
      const leftHole = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      leftHole.setAttribute("x", String(leftHoleX));
      leftHole.setAttribute("y", String(baseY + offsetY));
      leftHole.setAttribute("width", "3");
      leftHole.setAttribute("height", "4");
      leftHole.setAttribute("rx", "0.5");
      leftHole.setAttribute("fill", holeColor);
      rackGroup.appendChild(leftHole);

      // Right rail holes
      const rightHole = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rightHole.setAttribute("x", String(rightHoleX));
      rightHole.setAttribute("y", String(baseY + offsetY));
      rightHole.setAttribute("width", "3");
      rightHole.setAttribute("height", "4");
      rightHole.setAttribute("rx", "0.5");
      rightHole.setAttribute("fill", holeColor);
      rackGroup.appendChild(rightHole);
    }
  }

  // U labels on left rail
  // Respect desc_units and starting_unit settings (mirrors Rack.svelte logic)
  const startUnit = rack.starting_unit ?? 1;
  for (let i = 0; i < rack.height; i++) {
    const uNumber = rack.desc_units
      ? startUnit + i // Descending: lowest number at top
      : startUnit + (rack.height - 1) - i; // Ascending: highest number at top
    const labelY = i * U_HEIGHT + U_HEIGHT / 2 + RACK_PADDING + RAIL_WIDTH;

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    label.setAttribute("x", String(RAIL_WIDTH / 2));
    label.setAttribute("y", String(labelY));
    label.setAttribute("fill", textColor);
    label.setAttribute("font-size", "10");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dominant-baseline", "middle");
    label.setAttribute("font-family", "system-ui, sans-serif");
    label.textContent = String(uNumber);
    rackGroup.appendChild(label);
  }

  // Render blocked slots (hatching for half-depth devices on opposite face)
  if (faceFilter) {
    const blockedSlots = getBlockedSlots(rack, faceFilter, deviceLibrary);
    if (blockedSlots.length > 0) {
      // Create pattern definition if not already in defs
      const patternId = `blocked-stripe-pattern-${faceFilter}`;
      let defs = svg.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        svg.insertBefore(defs, svg.firstChild);
      }
      if (!defs.querySelector(`#${patternId}`)) {
        const pattern = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "pattern",
        );
        pattern.setAttribute("id", patternId);
        pattern.setAttribute("patternUnits", "userSpaceOnUse");
        pattern.setAttribute("width", "8");
        pattern.setAttribute("height", "8");
        pattern.setAttribute("patternTransform", "rotate(45)");
        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("width", "4");
        rect.setAttribute("height", "8");
        rect.setAttribute(
          "fill",
          isDark ? "rgba(239, 68, 68, 0.35)" : "rgba(239, 68, 68, 0.35)",
        );
        pattern.appendChild(rect);
        defs.appendChild(pattern);
      }

      // Render blocked slot rectangles
      for (const slot of blockedSlots) {
        const slotY =
          (rack.height - slot.top) * U_HEIGHT + RACK_PADDING + RAIL_WIDTH;
        const slotHeight = (slot.top - slot.bottom + 1) * U_HEIGHT;
        const slotWidth = RACK_WIDTH - 2 * RAIL_WIDTH;

        // Background wash
        const bgRect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        bgRect.setAttribute("x", String(RAIL_WIDTH));
        bgRect.setAttribute("y", String(slotY));
        bgRect.setAttribute("width", String(slotWidth));
        bgRect.setAttribute("height", String(slotHeight));
        bgRect.setAttribute("fill", "rgba(239, 68, 68, 0.08)");
        bgRect.setAttribute("opacity", "0.5");
        rackGroup.appendChild(bgRect);

        // Stripe pattern
        const stripeRect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        stripeRect.setAttribute("x", String(RAIL_WIDTH));
        stripeRect.setAttribute("y", String(slotY));
        stripeRect.setAttribute("width", String(slotWidth));
        stripeRect.setAttribute("height", String(slotHeight));
        stripeRect.setAttribute("fill", `url(#${patternId})`);
        stripeRect.setAttribute("opacity", "0.8");
        rackGroup.appendChild(stripeRect);
      }
    }
  }

  // Filter and render devices
  const filteredDevices = filterDevicesByFace(
    rack.devices,
    faceFilter,
    deviceLibrary,
  );
  for (const placedDevice of filteredDevices) {
    const device = deviceLibrary.find(
      (d) => d.slug === placedDevice.device_type,
    );
    if (!device) continue;

    // Device display name
    const deviceDisplayName = device.model ?? device.slug;

    // Device Y position matches Rack.svelte: includes RACK_PADDING + RAIL_WIDTH offset
    // Convert position from internal units to human U
    const positionU = toHumanUnits(placedDevice.position);
    const deviceY =
      (rack.height - positionU - device.u_height + 1) * U_HEIGHT +
      RACK_PADDING +
      RAIL_WIDTH;
    const deviceHeight = device.u_height * U_HEIGHT - 2;

    // Carrier-first: rail-mounted devices are whole-U full-width. Sub-U /
    // half-width gear mounts inside a carrier rather than splitting a rail
    // slot, so a rack-level device always spans the full interior width.
    const fullInteriorWidth = RACK_WIDTH - RAIL_WIDTH * 2;
    const deviceX = RAIL_WIDTH + 2;
    const deviceWidth = fullInteriorWidth - 4;

    // Always render device rect as background
    const deviceRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    deviceRect.setAttribute("x", String(deviceX));
    deviceRect.setAttribute("y", String(deviceY + 1));
    deviceRect.setAttribute("width", String(deviceWidth));
    deviceRect.setAttribute("height", String(deviceHeight));
    deviceRect.setAttribute(
      "fill",
      placedDevice.colour_override ?? device.colour,
    );
    deviceRect.setAttribute("rx", "2");
    deviceRect.setAttribute("ry", "2");
    rackGroup.appendChild(deviceRect);

    // Check if we should show an image
    const face = faceFilter === "rear" ? "rear" : "front";
    // Placement image wins per face, else fall back to the device-type image
    // (mirrors RackDevice.svelte). Per-face so a front-only placement still
    // inherits the device-type rear image.
    const placementImages = images?.get(
      layoutId
        ? placementKey(layoutId, placedDevice.id)
        : `placement-${placedDevice.id}`,
    );
    const slugImages = images?.get(device.slug);
    const deviceImage = placementImages?.[face] ?? slugImages?.[face];
    // Support both URL-based (bundled) and dataUrl-based (user upload) images
    const imageUrl = deviceImage?.url ?? deviceImage?.dataUrl;
    const isImageMode =
      displayMode === "image" || displayMode === "image-label";
    const showImage = isImageMode && imageUrl;

    if (showImage) {
      // Render device image
      const imageEl = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "image",
      );
      imageEl.setAttribute("x", String(deviceX));
      imageEl.setAttribute("y", String(deviceY + 1));
      imageEl.setAttribute("width", String(deviceWidth));
      imageEl.setAttribute("height", String(deviceHeight));
      imageEl.setAttribute("href", imageUrl);
      imageEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
      rackGroup.appendChild(imageEl);

      // Clip the image to rounded corners
      const clipId = `clip-${rack.id}-${placedDevice.id}-${face}`;
      const clipPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "clipPath",
      );
      clipPath.setAttribute("id", clipId);
      const clipRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      clipRect.setAttribute("x", String(deviceX));
      clipRect.setAttribute("y", String(deviceY + 1));
      clipRect.setAttribute("width", String(deviceWidth));
      clipRect.setAttribute("height", String(deviceHeight));
      clipRect.setAttribute("rx", "2");
      clipRect.setAttribute("ry", "2");
      clipPath.appendChild(clipRect);
      rackGroup.appendChild(clipPath);
      imageEl.setAttribute("clip-path", `url(#${clipId})`);
    } else {
      // Category icon (only for devices tall enough and with a category)
      if (deviceHeight >= 20 && device.category) {
        const iconSize = 12;
        const iconX = deviceX + 4;
        const iconY = deviceY + (deviceHeight - iconSize) / 2 + 1;

        const iconSvg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        iconSvg.setAttribute("x", String(iconX));
        iconSvg.setAttribute("y", String(iconY));
        iconSvg.setAttribute("width", String(iconSize));
        iconSvg.setAttribute("height", String(iconSize));
        iconSvg.setAttribute("viewBox", "0 0 16 16");

        // White icon with slight transparency for visibility on coloured backgrounds
        const iconColor = "rgba(255, 255, 255, 0.85)";
        const iconBgColor = placedDevice.colour_override ?? device.colour;
        const iconElements = createCategoryIconElements(
          device.category,
          iconColor,
          iconBgColor,
        );
        for (const el of iconElements) {
          iconSvg.appendChild(el);
        }
        rackGroup.appendChild(iconSvg);
      }
    }

    // Device name (always shown unless image mode without labels)
    // In image mode, name is still shown as overlay for accessibility
    const labelText = placedDevice.name || deviceDisplayName;

    // Calculate available width for text (using shared constants from text-sizing.ts)
    const textAvailableWidth = showImage
      ? deviceWidth - 16 // Small padding in image mode
      : deviceWidth -
        DEVICE_LABEL_ICON_SPACE_LEFT -
        DEVICE_LABEL_ICON_SPACE_RIGHT;

    // Apply auto-sizing to fit text within available width
    const fittedLabel = fitTextToWidth(labelText, {
      maxFontSize: DEVICE_LABEL_MAX_FONT,
      minFontSize: DEVICE_LABEL_MIN_FONT,
      availableWidth: textAvailableWidth,
    });

    const deviceNameEl = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    deviceNameEl.setAttribute("x", String(deviceX + deviceWidth / 2));
    deviceNameEl.setAttribute("y", String(deviceY + deviceHeight / 2 + 1));
    deviceNameEl.setAttribute("fill", "#ffffff");
    deviceNameEl.setAttribute("font-size", String(fittedLabel.fontSize));
    deviceNameEl.setAttribute("text-anchor", "middle");
    deviceNameEl.setAttribute("dominant-baseline", "middle");
    deviceNameEl.setAttribute("font-family", "system-ui, sans-serif");
    if (showImage) {
      // Thin stroke outline for text visibility over images
      deviceNameEl.setAttribute("stroke", "rgba(0,0,0,0.7)");
      deviceNameEl.setAttribute("stroke-width", "1.5");
      deviceNameEl.setAttribute("stroke-linejoin", "round");
    }
    deviceNameEl.textContent = fittedLabel.text;
    rackGroup.appendChild(deviceNameEl);
  }

  // View label (FRONT/REAR) for dual-view export
  if (viewLabel) {
    const viewLabelText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    viewLabelText.setAttribute("x", String(RACK_WIDTH / 2));
    viewLabelText.setAttribute("y", "-8");
    viewLabelText.setAttribute("fill", textColor);
    viewLabelText.setAttribute("font-size", "11");
    viewLabelText.setAttribute("text-anchor", "middle");
    viewLabelText.setAttribute("font-family", "system-ui, sans-serif");
    viewLabelText.setAttribute("font-weight", "500");
    viewLabelText.textContent = viewLabel;
    rackGroup.appendChild(viewLabelText);
  }

  // Rack name (positioned above rack) - only for non-dual-view
  // In dual-view, the name is rendered separately above both front/rear views.
  // In bayed groups, the bay label already identifies each bay, so suppress the
  // rack's own name to avoid drawing it on top of the bay label (#1740).
  if (includeNames && !viewLabel && !suppressName) {
    const nameText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    nameText.setAttribute("class", "rack-name");
    nameText.setAttribute("x", String(RACK_WIDTH / 2));
    // Position above the rack (negative Y relative to rackGroup)
    nameText.setAttribute("y", String(-5));
    nameText.setAttribute("fill", textColor);
    nameText.setAttribute("font-size", "13");
    nameText.setAttribute("text-anchor", "middle");
    nameText.setAttribute("font-family", "system-ui, sans-serif");
    nameText.textContent = rack.name;
    rackGroup.appendChild(nameText);
  }

  return rackGroup;
}
