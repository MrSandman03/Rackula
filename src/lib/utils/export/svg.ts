/**
 * Export utilities for generating images from rack layouts
 */

import type { Rack, RackGroup, DeviceType, ExportOptions } from "$lib/types";
import type { ImageStoreMap } from "$lib/types/images";
import { fitTextToWidth } from "../text-sizing";
import { RAIL_WIDTH } from "$lib/constants/layout";
import {
  BAYED_BAY_LABEL_HEIGHT,
  BAYED_ROW_GAP,
  BRAND_PURPLE_DARK,
  BRAND_PURPLE_LIGHT,
  DARK_BG,
  DARK_GRID,
  DARK_RACK_INTERIOR,
  DARK_RACK_RAIL,
  DARK_TEXT,
  EXPORT_PADDING,
  LEGEND_ITEM_HEIGHT,
  LEGEND_MAX_FONT_SIZE,
  LEGEND_MIN_FONT_SIZE,
  LEGEND_PADDING,
  LEGEND_TEXT_WIDTH,
  LIGHT_BG,
  LIGHT_GRID,
  LIGHT_RACK_INTERIOR,
  LIGHT_RACK_RAIL,
  LIGHT_TEXT,
  QR_LABEL_HEIGHT,
  QR_PADDING,
  QR_SIZE,
  RACK_BOTTOM_PADDING,
  RACK_GAP,
  RACK_NAME_HEIGHT,
  RACK_PADDING,
  RACK_WIDTH,
  U_HEIGHT,
  VIEW_LABEL_HEIGHT,
} from "./svg/constants";
import { createCategoryIconElements } from "./svg/category-icons";
import {
  renderRackView,
  type RackViewRenderContext,
} from "./svg/render-rack-view";

/**
 * Generate an SVG element for export
 * @param racks - Racks to export
 * @param deviceLibrary - Device library for device definitions
 * @param options - Export options including displayMode
 * @param images - Optional map of device images (required when displayMode is 'image')
 */
export function generateExportSVG(
  racks: Rack[],
  deviceLibrary: DeviceType[],
  options: ExportOptions,
  images?: ImageStoreMap,
  rackGroups?: RackGroup[],
  layoutId?: string,
): SVGElement {
  const {
    includeNames,
    includeLegend,
    background,
    exportView,
    displayMode = "label",
    includeQR,
    qrCodeDataUrl,
  } = options;

  // Determine if we should render QR code
  const shouldRenderQR = includeQR === true && !!qrCodeDataUrl;

  // Determine if we're doing dual-view export
  const isDualView = exportView === "both";

  // Build render items: identify bayed groups vs standalone racks
  // A render item is either { type: 'bayed', group, racks } or { type: 'standalone', rack }
  type RenderItem =
    | { type: "bayed"; group: RackGroup; racks: Rack[] }
    | { type: "standalone"; rack: Rack };

  const renderItems: RenderItem[] = [];
  const racksInBayedGroups = new Set<string>();

  // Identify bayed groups (layout_preset === 'bayed')
  const bayedGroups = (rackGroups ?? []).filter(
    (g) => g.layout_preset === "bayed",
  );

  // Process bayed groups - add as render items and track their rack IDs
  for (const group of bayedGroups) {
    const groupRacks = group.rack_ids
      .map((id) => racks.find((r) => r.id === id))
      .filter((r): r is Rack => r !== undefined);

    if (groupRacks.length > 0) {
      renderItems.push({ type: "bayed", group, racks: groupRacks });
      for (const rackId of group.rack_ids) {
        racksInBayedGroups.add(rackId);
      }
    }
  }

  // Add standalone racks (not part of any bayed group)
  for (const rack of racks) {
    if (!racksInBayedGroups.has(rack.id)) {
      renderItems.push({ type: "standalone", rack });
    }
  }

  // Get unique devices used in racks for legend
  const usedDeviceSlugs = new Set<string>();
  for (const rack of racks) {
    for (const device of rack.devices) {
      usedDeviceSlugs.add(device.device_type);
    }
  }
  const usedDevices = deviceLibrary.filter((d) => usedDeviceSlugs.has(d.slug));

  // Calculate dimensions based on render items
  const maxRackHeight = Math.max(...racks.map((r) => r.height), 0);

  // Calculate total width needed for all render items
  let totalRackWidth = 0;
  let maxRackAreaHeight = 0;

  for (const [i, item] of renderItems.entries()) {
    if (i > 0) totalRackWidth += RACK_GAP;

    if (item.type === "bayed") {
      // Bayed group: all bays side-by-side
      const numBays = item.racks.length;
      const groupWidth = numBays * RACK_WIDTH;
      totalRackWidth += groupWidth;

      // Bayed groups always show front and rear in stacked layout
      // Height: name + (FRONT label + bay labels + front row) + gap + (REAR label + bay labels + rear row)
      const groupMaxHeight = Math.max(...item.racks.map((r) => r.height), 0);
      const singleRowHeight =
        groupMaxHeight * U_HEIGHT +
        RACK_PADDING +
        RAIL_WIDTH * 2 +
        RACK_BOTTOM_PADDING;
      const bayedGroupHeight =
        (includeNames && item.group.name ? RACK_NAME_HEIGHT : 0) +
        VIEW_LABEL_HEIGHT + // FRONT label
        BAYED_BAY_LABEL_HEIGHT + // Bay labels
        singleRowHeight +
        BAYED_ROW_GAP +
        VIEW_LABEL_HEIGHT + // REAR label
        BAYED_BAY_LABEL_HEIGHT + // Bay labels
        singleRowHeight;
      maxRackAreaHeight = Math.max(maxRackAreaHeight, bayedGroupHeight);
    } else {
      // Standalone rack
      const rack = item.rack;
      const shouldShowRear = rack.show_rear !== false;
      const effectiveDualView = isDualView && shouldShowRear;

      if (effectiveDualView) {
        // Dual view: front and rear side-by-side
        totalRackWidth += RACK_WIDTH * 2 + RACK_GAP;
      } else {
        // Single view
        totalRackWidth += RACK_WIDTH;
      }
    }
  }

  // Calculate header space for standalone racks (bayed groups handle their own headers)
  const headerSpace = includeNames
    ? isDualView
      ? RACK_NAME_HEIGHT + VIEW_LABEL_HEIGHT // Name + view labels
      : RACK_NAME_HEIGHT // Just name
    : isDualView
      ? VIEW_LABEL_HEIGHT // Just view labels
      : 0;

  // Rack internal height for standalone racks
  const standaloneRackHeight =
    maxRackHeight * U_HEIGHT +
    RACK_PADDING +
    RAIL_WIDTH * 2 +
    RACK_BOTTOM_PADDING +
    headerSpace;

  // Use the larger of bayed group height or standalone rack height
  const rackAreaHeight = Math.max(maxRackAreaHeight, standaloneRackHeight);
  const legendWidth = includeLegend ? 180 : 0;
  const legendHeight = includeLegend
    ? usedDevices.length * LEGEND_ITEM_HEIGHT + LEGEND_PADDING * 2
    : 0;

  // Calculate QR code dimensions
  const qrTotalSize = QR_SIZE + QR_PADDING * 2; // QR size including padding
  const qrAreaHeight = qrTotalSize + QR_LABEL_HEIGHT; // QR + label above it

  // Calculate sidebar (legend + QR column) dimensions
  // QR code shares the same column as legend, positioned at the bottom
  const hasSidebar = includeLegend || shouldRenderQR;
  const sidebarWidth = Math.max(
    includeLegend ? legendWidth : 0,
    shouldRenderQR ? qrTotalSize : 0,
  );

  const contentWidth =
    totalRackWidth + (hasSidebar ? LEGEND_PADDING + sidebarWidth : 0);
  const contentHeight = Math.max(rackAreaHeight, legendHeight);

  const svgWidth = contentWidth + EXPORT_PADDING * 2;
  const svgHeight =
    Math.max(contentHeight, shouldRenderQR ? qrAreaHeight : 0) +
    EXPORT_PADDING * 2;

  // Determine colours based on background
  const isDark = background === "dark";
  const bgColor =
    background === "transparent"
      ? "none"
      : background === "dark"
        ? DARK_BG
        : LIGHT_BG;
  const rackInterior = isDark ? DARK_RACK_INTERIOR : LIGHT_RACK_INTERIOR;
  const rackRail = isDark ? DARK_RACK_RAIL : LIGHT_RACK_RAIL;
  const textColor = isDark ? DARK_TEXT : LIGHT_TEXT;
  const gridColor = isDark ? DARK_GRID : LIGHT_GRID;

  // Create SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(svgWidth));
  svg.setAttribute("height", String(svgHeight));
  svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Background
  if (background !== "transparent") {
    const bgRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    bgRect.setAttribute("class", "export-background");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(svgWidth));
    bgRect.setAttribute("height", String(svgHeight));
    bgRect.setAttribute("fill", bgColor);
    svg.appendChild(bgRect);
  } else {
    // Add transparent background marker for tests
    const bgRect = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    bgRect.setAttribute("class", "export-background");
    bgRect.setAttribute("x", "0");
    bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(svgWidth));
    bgRect.setAttribute("height", String(svgHeight));
    bgRect.setAttribute("fill", "none");
    svg.appendChild(bgRect);
  }

  const rackViewContext: RackViewRenderContext = {
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
  };

  // Helper function to render a bayed rack group as a connected unit
  // Layout: Group name -> FRONT label -> front row -> REAR label -> rear row
  function renderBayedGroup(
    group: RackGroup,
    groupRacks: Rack[],
    xOffset: number,
    yOffset: number,
  ): { element: SVGGElement; width: number } {
    const bayedGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    bayedGroup.setAttribute("class", "bayed-rack-group");
    bayedGroup.setAttribute("transform", `translate(${xOffset}, ${yOffset})`);

    const numBays = groupRacks.length;
    const groupWidth = numBays * RACK_WIDTH;
    const groupMaxHeight = Math.max(...groupRacks.map((r) => r.height), 0);
    const singleRowHeight =
      groupMaxHeight * U_HEIGHT +
      RACK_PADDING +
      RAIL_WIDTH * 2 +
      RACK_BOTTOM_PADDING;

    let currentY = 0;

    // Group name (if present)
    if (includeNames && group.name) {
      const nameText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      nameText.setAttribute("class", "bayed-group-name");
      nameText.setAttribute("x", String(groupWidth / 2));
      nameText.setAttribute("y", String(currentY + 14));
      nameText.setAttribute("fill", textColor);
      nameText.setAttribute("font-size", "14");
      nameText.setAttribute("font-weight", "600");
      nameText.setAttribute("text-anchor", "middle");
      nameText.setAttribute("font-family", "system-ui, sans-serif");
      nameText.textContent = group.name;
      bayedGroup.appendChild(nameText);
      currentY += RACK_NAME_HEIGHT;
    }

    // FRONT label
    const frontLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    frontLabel.setAttribute("class", "row-label");
    frontLabel.setAttribute("x", String(groupWidth / 2));
    frontLabel.setAttribute("y", String(currentY + 12));
    frontLabel.setAttribute("fill", textColor);
    frontLabel.setAttribute("font-size", "11");
    frontLabel.setAttribute("font-weight", "600");
    frontLabel.setAttribute("text-anchor", "middle");
    frontLabel.setAttribute("font-family", "system-ui, sans-serif");
    frontLabel.setAttribute("letter-spacing", "0.1em");
    frontLabel.textContent = "FRONT";
    bayedGroup.appendChild(frontLabel);
    currentY += VIEW_LABEL_HEIGHT;

    // Bay labels for front row
    groupRacks.forEach((_, bayIndex) => {
      const bayLabel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      bayLabel.setAttribute("class", "bay-label");
      bayLabel.setAttribute(
        "x",
        String(bayIndex * RACK_WIDTH + RACK_WIDTH / 2),
      );
      bayLabel.setAttribute("y", String(currentY + 10));
      bayLabel.setAttribute("fill", textColor);
      bayLabel.setAttribute("font-size", "10");
      bayLabel.setAttribute("text-anchor", "middle");
      bayLabel.setAttribute("font-family", "system-ui, sans-serif");
      bayLabel.setAttribute("opacity", "0.7");
      bayLabel.textContent = `Bay ${bayIndex + 1}`;
      bayedGroup.appendChild(bayLabel);
    });
    currentY += BAYED_BAY_LABEL_HEIGHT;

    // Front row: render each bay's front view
    groupRacks.forEach((rack, bayIndex) => {
      const bayX = bayIndex * RACK_WIDTH;
      const bayY = currentY + (groupMaxHeight - rack.height) * U_HEIGHT;
      const frontView = renderRackView(
        rackViewContext,
        rack,
        bayX,
        bayY,
        "front",
        undefined,
        true,
      );
      bayedGroup.appendChild(frontView);
    });
    currentY += singleRowHeight + BAYED_ROW_GAP;

    // REAR label
    const rearLabel = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    rearLabel.setAttribute("class", "row-label");
    rearLabel.setAttribute("x", String(groupWidth / 2));
    rearLabel.setAttribute("y", String(currentY + 12));
    rearLabel.setAttribute("fill", textColor);
    rearLabel.setAttribute("font-size", "11");
    rearLabel.setAttribute("font-weight", "600");
    rearLabel.setAttribute("text-anchor", "middle");
    rearLabel.setAttribute("font-family", "system-ui, sans-serif");
    rearLabel.setAttribute("letter-spacing", "0.1em");
    rearLabel.textContent = "REAR";
    bayedGroup.appendChild(rearLabel);
    currentY += VIEW_LABEL_HEIGHT;

    // Bay labels for rear row (mirrored order: Bay N on left, Bay 1 on right)
    const reversedRacks = [...groupRacks].reverse();
    reversedRacks.forEach((_, reversedIndex) => {
      const bayIndex = groupRacks.length - 1 - reversedIndex;
      const bayLabel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      bayLabel.setAttribute("class", "bay-label");
      bayLabel.setAttribute(
        "x",
        String(reversedIndex * RACK_WIDTH + RACK_WIDTH / 2),
      );
      bayLabel.setAttribute("y", String(currentY + 10));
      bayLabel.setAttribute("fill", textColor);
      bayLabel.setAttribute("font-size", "10");
      bayLabel.setAttribute("text-anchor", "middle");
      bayLabel.setAttribute("font-family", "system-ui, sans-serif");
      bayLabel.setAttribute("opacity", "0.7");
      bayLabel.textContent = `Bay ${bayIndex + 1}`;
      bayedGroup.appendChild(bayLabel);
    });
    currentY += BAYED_BAY_LABEL_HEIGHT;

    // Rear row: render each bay's rear view (mirrored order)
    reversedRacks.forEach((rack, reversedIndex) => {
      const bayX = reversedIndex * RACK_WIDTH;
      const bayY = currentY + (groupMaxHeight - rack.height) * U_HEIGHT;
      const rearView = renderRackView(
        rackViewContext,
        rack,
        bayX,
        bayY,
        "rear",
        undefined,
        true,
      );
      bayedGroup.appendChild(rearView);
    });

    return { element: bayedGroup, width: groupWidth };
  }

  // Render each render item (bayed group or standalone rack)
  // Track cumulative X position to handle mixed items properly
  let currentX = EXPORT_PADDING;

  for (const item of renderItems) {
    if (item.type === "bayed") {
      // Render bayed group as connected unit
      const { element, width } = renderBayedGroup(
        item.group,
        item.racks,
        currentX,
        EXPORT_PADDING,
      );
      svg.appendChild(element);
      currentX += width + RACK_GAP;
    } else {
      // Standalone rack - use original logic
      const rack = item.rack;
      // Position rack below header space (name/labels)
      const rackY =
        EXPORT_PADDING + headerSpace + (maxRackHeight - rack.height) * U_HEIGHT;

      // Respect rack's show_rear setting - if false, force front-only even when isDualView
      const shouldShowRear = rack.show_rear !== false;
      const effectiveDualView = isDualView && shouldShowRear;

      if (effectiveDualView) {
        // Dual view: render front and rear side-by-side
        const dualRackWidth = RACK_WIDTH * 2 + RACK_GAP;
        const baseX = currentX;

        // Render rack name centered above both views
        if (includeNames) {
          const nameText = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text",
          );
          nameText.setAttribute("class", "rack-name");
          nameText.setAttribute("x", String(baseX + dualRackWidth / 2));
          // Position name at top of header space (above view labels)
          const nameY = rackY - VIEW_LABEL_HEIGHT - 5;
          nameText.setAttribute("y", String(nameY));
          nameText.setAttribute("fill", textColor);
          nameText.setAttribute("font-size", "13");
          nameText.setAttribute("text-anchor", "middle");
          nameText.setAttribute("font-family", "system-ui, sans-serif");
          nameText.textContent = rack.name;
          svg.appendChild(nameText);
        }

        // Front view on the left
        const frontGroup = renderRackView(
          rackViewContext,
          rack,
          baseX,
          rackY,
          "front",
          "FRONT",
        );
        svg.appendChild(frontGroup);

        // Rear view on the right
        const rearX = baseX + RACK_WIDTH + RACK_GAP;
        const rearGroup = renderRackView(
          rackViewContext,
          rack,
          rearX,
          rackY,
          "rear",
          "REAR",
        );
        svg.appendChild(rearGroup);

        // Advance X position for next item
        currentX += dualRackWidth + RACK_GAP;
      } else {
        // Single view: render with optional face filter
        // Note: Rack name is handled inside renderRackView when no viewLabel is provided
        const rackX = currentX;
        const faceFilter =
          exportView === "front" || exportView === "rear"
            ? exportView
            : undefined;
        const rackGroup = renderRackView(
          rackViewContext,
          rack,
          rackX,
          rackY,
          faceFilter,
        );

        svg.appendChild(rackGroup);

        // Advance X position for next item
        currentX += RACK_WIDTH + RACK_GAP;
      }
    }
  }

  // Legend
  if (includeLegend && usedDevices.length > 0) {
    const legendX = EXPORT_PADDING + totalRackWidth + LEGEND_PADDING;
    const legendY = EXPORT_PADDING;

    const legendGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    legendGroup.setAttribute("class", "export-legend");
    legendGroup.setAttribute("transform", `translate(${legendX}, ${legendY})`);

    // Add background box when using transparent background (so legend text is legible)
    if (background === "transparent") {
      const legendBgPadding = 8;
      const legendBgWidth = legendWidth + legendBgPadding * 2;
      const legendBgHeight = legendHeight + legendBgPadding;

      const legendBg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      legendBg.setAttribute("class", "legend-background");
      legendBg.setAttribute("x", String(-legendBgPadding));
      legendBg.setAttribute("y", "0");
      legendBg.setAttribute("width", String(legendBgWidth));
      legendBg.setAttribute("height", String(legendBgHeight));
      legendBg.setAttribute("fill", "rgba(255, 255, 255, 0.95)");
      legendBg.setAttribute("rx", "4");
      legendBg.setAttribute("ry", "4");
      legendGroup.appendChild(legendBg);
    }

    // Legend title
    const legendTitle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    legendTitle.setAttribute("x", "0");
    legendTitle.setAttribute("y", "16");
    legendTitle.setAttribute("fill", textColor);
    legendTitle.setAttribute("font-size", "14");
    legendTitle.setAttribute("font-weight", "bold");
    legendTitle.setAttribute("font-family", "system-ui, sans-serif");
    legendTitle.textContent = "Legend";
    legendGroup.appendChild(legendTitle);

    // Legend items
    usedDevices.forEach((device, i) => {
      const itemY = LEGEND_PADDING + 8 + i * LEGEND_ITEM_HEIGHT;
      const deviceDisplayName = device.model ?? device.slug;

      const itemGroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g",
      );
      itemGroup.setAttribute("class", "legend-item");

      // Category icon (replaces colour swatch) or fallback to colour swatch
      if (device.category) {
        const iconGroup = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        iconGroup.setAttribute("x", "0");
        iconGroup.setAttribute("y", String(itemY));
        iconGroup.setAttribute("width", "16");
        iconGroup.setAttribute("height", "16");
        iconGroup.setAttribute("viewBox", "0 0 16 16");

        const iconElements = createCategoryIconElements(
          device.category,
          textColor,
          bgColor,
        );
        for (const el of iconElements) {
          iconGroup.appendChild(el);
        }
        itemGroup.appendChild(iconGroup);
      } else {
        // Fallback to colour swatch if no category
        const swatch = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        swatch.setAttribute("x", "0");
        swatch.setAttribute("y", String(itemY));
        swatch.setAttribute("width", "16");
        swatch.setAttribute("height", "16");
        swatch.setAttribute("fill", device.colour);
        swatch.setAttribute("rx", "2");
        itemGroup.appendChild(swatch);
      }

      // Device name with auto-sizing
      const legendLabelText = `${deviceDisplayName} (${device.u_height}U)`;
      const fittedLegendLabel = fitTextToWidth(legendLabelText, {
        maxFontSize: LEGEND_MAX_FONT_SIZE,
        minFontSize: LEGEND_MIN_FONT_SIZE,
        availableWidth: LEGEND_TEXT_WIDTH,
      });

      const nameText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      nameText.setAttribute("x", "24");
      nameText.setAttribute("y", String(itemY + 12));
      nameText.setAttribute("fill", textColor);
      nameText.setAttribute("font-size", String(fittedLegendLabel.fontSize));
      nameText.setAttribute("font-family", "system-ui, sans-serif");
      nameText.textContent = fittedLegendLabel.text;
      itemGroup.appendChild(nameText);

      legendGroup.appendChild(itemGroup);
    });

    svg.appendChild(legendGroup);
  }

  // QR Code (in sidebar column, at bottom)
  if (shouldRenderQR && qrCodeDataUrl) {
    const qrGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    qrGroup.setAttribute("class", "export-qr");

    // Position QR in sidebar column (same X as legend), at bottom of content area
    const sidebarX = EXPORT_PADDING + totalRackWidth + LEGEND_PADDING;
    const qrY = EXPORT_PADDING + contentHeight - qrAreaHeight;
    qrGroup.setAttribute(
      "transform",
      `translate(${sidebarX}, ${Math.max(qrY, EXPORT_PADDING)})`,
    );

    // Label: "Scan to open in Rackula" with Rackula in brand purple
    const labelGroup = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    labelGroup.setAttribute("x", String(qrTotalSize / 2));
    labelGroup.setAttribute("y", "12");
    labelGroup.setAttribute("text-anchor", "middle");
    labelGroup.setAttribute("font-size", "11");
    labelGroup.setAttribute("font-family", "system-ui, sans-serif");

    const labelPart1 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    labelPart1.setAttribute("fill", textColor);
    labelPart1.textContent = "Scan to open in ";
    labelGroup.appendChild(labelPart1);

    const labelPart2 = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "tspan",
    );
    labelPart2.setAttribute(
      "fill",
      isDark ? BRAND_PURPLE_DARK : BRAND_PURPLE_LIGHT,
    );
    labelPart2.setAttribute("font-weight", "600");
    labelPart2.textContent = "Rackula";
    labelGroup.appendChild(labelPart2);

    qrGroup.appendChild(labelGroup);

    // White background for QR code visibility (below the label)
    const qrBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    qrBg.setAttribute("x", "0");
    qrBg.setAttribute("y", String(QR_LABEL_HEIGHT));
    qrBg.setAttribute("width", String(qrTotalSize));
    qrBg.setAttribute("height", String(qrTotalSize));
    qrBg.setAttribute("fill", "#ffffff");
    qrBg.setAttribute("rx", "4");
    qrBg.setAttribute("ry", "4");
    qrGroup.appendChild(qrBg);

    // QR code image
    const qrImage = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "image",
    );
    qrImage.setAttribute("x", String(QR_PADDING));
    qrImage.setAttribute("y", String(QR_LABEL_HEIGHT + QR_PADDING));
    qrImage.setAttribute("width", String(QR_SIZE));
    qrImage.setAttribute("height", String(QR_SIZE));
    qrImage.setAttribute("href", qrCodeDataUrl);
    qrImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
    qrGroup.appendChild(qrImage);

    svg.appendChild(qrGroup);
  }

  return svg;
}

/**
 * Generate an SVG element for a single rack
 * This is a simpler version of generateExportSVG for multi-rack exports
 *
 * @param rack - Single rack to export
 * @param deviceLibrary - Device library for device definitions
 * @param options - Export options
 * @param images - Optional map of device images
 */
export function generateSingleRackSVG(
  rack: Rack,
  deviceLibrary: DeviceType[],
  options: ExportOptions,
  images?: ImageStoreMap,
  layoutId?: string,
): SVGElement {
  return generateExportSVG(
    [rack],
    deviceLibrary,
    options,
    images,
    undefined,
    layoutId,
  );
}
