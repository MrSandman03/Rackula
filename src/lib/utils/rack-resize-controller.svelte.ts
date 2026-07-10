import type { DeviceType, Rack } from "$lib/types";
import { U_HEIGHT_PX } from "$lib/constants/layout";
import { MAX_RACK_HEIGHT } from "$lib/types/constants";
import { getMinResizeHeight, snapResizeHeight } from "$lib/utils/rack-resize";
import { isRackMateT1Plus } from "$lib/utils/rack-profile";

export type ResizeGrip = "top" | "bottom";

export type ResizeTarget =
  | { kind: "rack"; rackId: string }
  | { kind: "bay"; groupId: string; rackIds: string[] };

export interface ResizeDrag {
  target: ResizeTarget;
  rackIds: string[];
  grip: ResizeGrip;
  startHeight: number;
  startClientY: number;
  minHeight: number;
  previewHeight: number;
  pointerId: number;
}

export const GRIP_SQUARE_PX = 11;
export const GRIP_HIT_MAX_PX = 44;
const GRIP_HIT_GAP_PX = 4;

export interface RackResizeDeps {
  getActiveRackId: () => string | null;
  getRack: (rackId: string) => Rack | undefined;
  getDeviceLibrary: () => DeviceType[];
  getZoom: () => number;
  setActiveRack: (rackId: string) => void;
  updateRackRaw: (rackId: string, height: number) => void;
  updateRack: (rackId: string, height: number) => void;
  resizeBayedGroupHeight: (groupId: string, height: number) => void;
  ensureRacksVisible: (rackIds: string[]) => void;
}

export interface RackResizeController {
  readonly drag: ResizeDrag | null;
  hitHeightPx: (heightU: number) => number;
  blockPan: (event: Event) => void;
  start: (target: ResizeTarget, grip: ResizeGrip, event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  end: (event: PointerEvent) => void;
  cancel: (event: PointerEvent) => void;
  handleKey: (target: ResizeTarget, event: KeyboardEvent) => void;
}

export function createRackResizeController(
  deps: RackResizeDeps,
): RackResizeController {
  let drag = $state<ResizeDrag | null>(null);

  function targetRackIds(target: ResizeTarget): string[] {
    return target.kind === "rack" ? [target.rackId] : target.rackIds;
  }

  function targetHasFixedProfile(target: ResizeTarget): boolean {
    return targetRackIds(target).some((id) =>
      isRackMateT1Plus(deps.getRack(id)),
    );
  }

  function targetMinHeight(rackIds: string[]): number {
    let floor = 0;
    for (const id of rackIds) {
      const rack = deps.getRack(id);
      if (!rack) continue;
      floor = Math.max(
        floor,
        getMinResizeHeight(rack, deps.getDeviceLibrary()),
      );
    }
    return floor;
  }

  function commitHeight(target: ResizeTarget, height: number): void {
    if (targetHasFixedProfile(target)) return;
    if (target.kind === "rack") deps.updateRack(target.rackId, height);
    else deps.resizeBayedGroupHeight(target.groupId, height);
    deps.ensureRacksVisible(targetRackIds(target));
  }

  function growPx(
    grip: ResizeGrip,
    startClientY: number,
    clientY: number,
  ): number {
    return grip === "top" ? startClientY - clientY : clientY - startClientY;
  }

  function hitHeightPx(heightU: number): number {
    const rackScreenHeight = heightU * U_HEIGHT_PX * deps.getZoom();
    return Math.max(
      GRIP_SQUARE_PX,
      Math.min(GRIP_HIT_MAX_PX, rackScreenHeight / 2 - GRIP_HIT_GAP_PX),
    );
  }

  function blockPan(event: Event): void {
    event.stopPropagation();
  }

  function start(
    target: ResizeTarget,
    grip: ResizeGrip,
    event: PointerEvent,
  ): void {
    if (targetHasFixedProfile(target)) return;
    const rackIds = targetRackIds(target);
    const firstRackId = rackIds[0];
    if (!firstRackId) return;
    const firstRack = deps.getRack(firstRackId);
    if (!firstRack) return;

    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget as HTMLElement;
    element?.setPointerCapture?.(event.pointerId);
    if (target.kind === "rack" && deps.getActiveRackId() !== target.rackId) {
      deps.setActiveRack(target.rackId);
    }
    drag = {
      target,
      rackIds,
      grip,
      startHeight: firstRack.height,
      startClientY: event.clientY,
      minHeight: targetMinHeight(rackIds),
      previewHeight: firstRack.height,
      pointerId: event.pointerId,
    };
  }

  function move(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    const previewHeight = snapResizeHeight({
      startHeight: current.startHeight,
      growPx: growPx(current.grip, current.startClientY, event.clientY),
      pxPerU: U_HEIGHT_PX * deps.getZoom(),
      minHeight: current.minHeight,
      maxHeight: MAX_RACK_HEIGHT,
      currentHeight: current.previewHeight,
    });
    if (previewHeight === current.previewHeight) return;
    current.previewHeight = previewHeight;
    for (const id of current.rackIds) deps.updateRackRaw(id, previewHeight);
  }

  function end(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    const finalHeight = snapResizeHeight({
      startHeight: current.startHeight,
      growPx: growPx(current.grip, current.startClientY, event.clientY),
      pxPerU: U_HEIGHT_PX * deps.getZoom(),
      minHeight: current.minHeight,
      maxHeight: MAX_RACK_HEIGHT,
      currentHeight: current.previewHeight,
    });
    const { target, rackIds, startHeight } = current;
    drag = null;
    for (const id of rackIds) deps.updateRackRaw(id, startHeight);
    if (finalHeight !== startHeight) commitHeight(target, finalHeight);
  }

  function cancel(event: PointerEvent): void {
    const current = drag;
    if (!current || event.pointerId !== current.pointerId) return;
    drag = null;
    for (const id of current.rackIds) {
      deps.updateRackRaw(id, current.startHeight);
    }
  }

  function handleKey(target: ResizeTarget, event: KeyboardEvent): void {
    let delta: number;
    if (event.key === "ArrowUp") delta = 1;
    else if (event.key === "ArrowDown") delta = -1;
    else return;
    if (targetHasFixedProfile(target)) return;
    const rackIds = targetRackIds(target);
    const firstRackId = rackIds[0];
    if (!firstRackId) return;
    const firstRack = deps.getRack(firstRackId);
    if (!firstRack) return;

    event.preventDefault();
    event.stopPropagation();
    const next = Math.max(
      targetMinHeight(rackIds),
      Math.min(MAX_RACK_HEIGHT, firstRack.height + delta),
    );
    if (next === firstRack.height) return;
    if (target.kind === "rack" && deps.getActiveRackId() !== target.rackId) {
      deps.setActiveRack(target.rackId);
    }
    commitHeight(target, next);
  }

  return {
    get drag() {
      return drag;
    },
    hitHeightPx,
    blockPan,
    start,
    move,
    end,
    cancel,
    handleKey,
  };
}
