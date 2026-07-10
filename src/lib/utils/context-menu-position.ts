export function getContextMenuCoordinates(
  event: MouseEvent,
  element: Element | null,
): { x: number; y: number } {
  let x = event.clientX;
  let y = event.clientY;
  if (element) {
    const rect = element.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      ((x === 0 && y === 0) ||
        x < rect.left ||
        x > rect.right ||
        y < rect.top ||
        y > rect.bottom)
    ) {
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
  }
  return { x, y };
}
