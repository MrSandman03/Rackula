/** DOM builders for the category glyphs used by SVG exports. */

import type { DeviceCategory } from "$lib/types";

/**
 * Create SVG elements for a category icon
 * Returns an array of SVG elements to append to a parent group
 */
export function createCategoryIconElements(
  category: DeviceCategory,
  color: string,
  bgColor: string,
): SVGElement[] {
  const elements: SVGElement[] = [];
  const ns = "http://www.w3.org/2000/svg";

  switch (category) {
    case "server": {
      // Server: Horizontal lines (like rack server front)
      for (const [y, h] of [
        [3, 3],
        [7, 3],
        [11, 2],
      ] as const) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", "2");
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "12");
        rect.setAttribute("height", String(h));
        rect.setAttribute("rx", "0.5");
        rect.setAttribute("fill", color);
        elements.push(rect);
      }
      break;
    }
    case "network": {
      // Network: Connected nodes
      for (const [cx, cy] of [
        [8, 4],
        [4, 12],
        [12, 12],
      ] as const) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "2");
        circle.setAttribute("fill", color);
        elements.push(circle);
      }
      for (const [x1, y1, x2, y2] of [
        [8, 6, 4, 10],
        [8, 6, 12, 10],
      ] as const) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        elements.push(line);
      }
      break;
    }
    case "firewall": {
      // Firewall: Brick wall (running bond)
      const wall = document.createElementNS(ns, "rect");
      wall.setAttribute("x", "2");
      wall.setAttribute("y", "4");
      wall.setAttribute("width", "12");
      wall.setAttribute("height", "9");
      wall.setAttribute("rx", "0.5");
      wall.setAttribute("fill", "none");
      wall.setAttribute("stroke", color);
      wall.setAttribute("stroke-width", "1.5");
      elements.push(wall);

      for (const [x1, y1, x2, y2] of [
        // Mortar courses
        [2, 7, 14, 7],
        [2, 10, 14, 10],
        // Offset head joints per course
        [8, 4, 8, 7],
        [5, 7, 5, 10],
        [11, 7, 11, 10],
        [8, 10, 8, 13],
      ] as const) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        elements.push(line);
      }
      break;
    }
    case "patch-panel": {
      // Patch Panel: Grid of dots
      for (const [cx, cy] of [
        [4, 5],
        [8, 5],
        [12, 5],
        [4, 11],
        [8, 11],
        [12, 11],
      ] as const) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "1.5");
        circle.setAttribute("fill", color);
        elements.push(circle);
      }
      break;
    }
    case "power": {
      // Power: Lightning bolt
      const polygon = document.createElementNS(ns, "polygon");
      polygon.setAttribute("points", "9,1 5,8 8,8 7,15 11,6 8,6");
      polygon.setAttribute("fill", color);
      elements.push(polygon);
      break;
    }
    case "storage": {
      // Storage: Stacked drives
      for (const y of [2, 6, 10]) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", "2");
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", "12");
        rect.setAttribute("height", "3");
        rect.setAttribute("rx", "0.5");
        rect.setAttribute("fill", color);
        elements.push(rect);
      }
      for (const cy of [3.5, 7.5, 11.5]) {
        const circle = document.createElementNS(ns, "circle");
        circle.setAttribute("cx", "12");
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "0.75");
        circle.setAttribute("fill", bgColor);
        elements.push(circle);
      }
      break;
    }
    case "kvm": {
      // KVM: Monitor with keyboard
      const monitor = document.createElementNS(ns, "rect");
      monitor.setAttribute("x", "3");
      monitor.setAttribute("y", "2");
      monitor.setAttribute("width", "10");
      monitor.setAttribute("height", "7");
      monitor.setAttribute("rx", "0.5");
      monitor.setAttribute("fill", color);
      elements.push(monitor);

      const screen = document.createElementNS(ns, "rect");
      screen.setAttribute("x", "4");
      screen.setAttribute("y", "3");
      screen.setAttribute("width", "8");
      screen.setAttribute("height", "5");
      screen.setAttribute("fill", bgColor);
      elements.push(screen);

      const keyboard = document.createElementNS(ns, "rect");
      keyboard.setAttribute("x", "2");
      keyboard.setAttribute("y", "11");
      keyboard.setAttribute("width", "12");
      keyboard.setAttribute("height", "3");
      keyboard.setAttribute("rx", "0.5");
      keyboard.setAttribute("fill", color);
      elements.push(keyboard);
      break;
    }
    case "av-media": {
      // AV/Media: Speaker
      const base = document.createElementNS(ns, "rect");
      base.setAttribute("x", "3");
      base.setAttribute("y", "4");
      base.setAttribute("width", "4");
      base.setAttribute("height", "8");
      base.setAttribute("rx", "0.5");
      base.setAttribute("fill", color);
      elements.push(base);

      const cone = document.createElementNS(ns, "path");
      cone.setAttribute("d", "M8 3 L12 1 L12 15 L8 13 Z");
      cone.setAttribute("fill", color);
      elements.push(cone);
      break;
    }
    case "cooling": {
      // Cooling: Fan blades
      const outer = document.createElementNS(ns, "circle");
      outer.setAttribute("cx", "8");
      outer.setAttribute("cy", "8");
      outer.setAttribute("r", "6");
      outer.setAttribute("fill", "none");
      outer.setAttribute("stroke", color);
      outer.setAttribute("stroke-width", "1.5");
      elements.push(outer);

      const center = document.createElementNS(ns, "circle");
      center.setAttribute("cx", "8");
      center.setAttribute("cy", "8");
      center.setAttribute("r", "1.5");
      center.setAttribute("fill", color);
      elements.push(center);

      for (const [x1, y1, x2, y2] of [
        [8, 3, 8, 6],
        [8, 10, 8, 13],
        [3, 8, 6, 8],
        [10, 8, 13, 8],
      ] as const) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", String(x1));
        line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2));
        line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "1.5");
        elements.push(line);
      }
      break;
    }
    case "shelf": {
      // Shelf: Horizontal platform with angled supports
      const platform = document.createElementNS(ns, "rect");
      platform.setAttribute("x", "2");
      platform.setAttribute("y", "7");
      platform.setAttribute("width", "12");
      platform.setAttribute("height", "2");
      platform.setAttribute("rx", "0.3");
      platform.setAttribute("fill", color);
      elements.push(platform);

      for (const [x1, x2] of [
        [3, 4],
        [13, 12],
      ] as const) {
        const leg = document.createElementNS(ns, "line");
        leg.setAttribute("x1", String(x1));
        leg.setAttribute("y1", "9");
        leg.setAttribute("x2", String(x2));
        leg.setAttribute("y2", "13");
        leg.setAttribute("stroke", color);
        leg.setAttribute("stroke-width", "1.5");
        elements.push(leg);
      }
      break;
    }
    case "blank": {
      // Blank: Empty rectangle
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "2");
      rect.setAttribute("y", "4");
      rect.setAttribute("width", "12");
      rect.setAttribute("height", "8");
      rect.setAttribute("rx", "0.5");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", color);
      rect.setAttribute("stroke-width", "1.5");
      elements.push(rect);
      break;
    }
    default: {
      // Other: Question mark in circle
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", "8");
      circle.setAttribute("cy", "8");
      circle.setAttribute("r", "6");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", color);
      circle.setAttribute("stroke-width", "1.5");
      elements.push(circle);

      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", "8");
      text.setAttribute("y", "11");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "8");
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", color);
      text.textContent = "?";
      elements.push(text);
      break;
    }
  }

  return elements;
}
