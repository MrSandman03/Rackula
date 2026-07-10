import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceType, Rack } from "$lib/types";
import { createTestDeviceType, createTestRack } from "./factories";

vi.mock("$lib/utils/rack-drop-coordinator", () => ({
  resolveDropTarget: vi.fn(),
  resolveDropAction: vi.fn(),
}));
vi.mock("$lib/utils/rack-drop-handlers", () => ({
  dispatchDropAction: vi.fn(),
}));

import { attachPointerDragListeners } from "$lib/utils/rack-pointer-drag";
import { resolveDropTarget } from "$lib/utils/rack-drop-coordinator";
import { dispatchDropAction } from "$lib/utils/rack-drop-handlers";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
  vi.clearAllMocks();
});

function svgAt(left: number): SVGSVGElement {
  return {
    getBoundingClientRect: () =>
      ({
        left,
        right: left + 100,
        top: 0,
        bottom: 100,
        width: 100,
        height: 100,
      }) as DOMRect,
  } as SVGSVGElement;
}

function attachRack(rack: Rack, svg: SVGSVGElement, sourceRack: Rack) {
  let preview: unknown = null;
  let hover: unknown = null;
  const onDragFinished = vi.fn();
  const cleanup = attachPointerDragListeners({
    getSvgElement: () => svg,
    getRack: () => rack,
    getDeviceLibrary: () => [],
    getRackDims: () => ({
      rackHeight: rack.height,
      rackWidth: 100,
      interiorWidth: 80,
      uHeight: 10,
      rackPadding: 0,
      railWidth: 10,
    }),
    getFaceFilter: () => "front",
    getSelectedDeviceId: () => null,
    getEventCallbacks: () => ({}),
    setDropPreview: (value) => {
      preview = value;
    },
    setContainerHoverInfo: (value) => {
      hover = value;
    },
    onDragFinished,
    layoutStore: {
      getRackById: (id: string) => (id === sourceRack.id ? sourceRack : rack),
    } as never,
    toastStore: {} as never,
  });
  cleanups.push(cleanup);
  return {
    get preview() {
      return preview;
    },
    get hover() {
      return hover;
    },
    onDragFinished,
  };
}

describe("rack pointer drag cancellation", () => {
  it("clears preview and carrier hover from every rack without dropping", () => {
    const sourceRack = createTestRack({ id: "source-rack" });
    const targetRack = createTestRack({ id: "target-rack" });
    const source = attachRack(sourceRack, svgAt(0), sourceRack);
    const target = attachRack(targetRack, svgAt(100), sourceRack);
    const device: DeviceType = createTestDeviceType({ slug: "dragged-child" });
    vi.mocked(resolveDropTarget).mockReturnValue({
      targetU: 4,
      xOffsetInRack: 20,
      feedback: "valid",
      containerHoverInfo: {
        containerId: "target-carrier",
        targetSlotId: "left",
        isValidTarget: true,
      },
      dropPreview: { position: 4, height: 1, feedback: "valid" },
    });

    document.dispatchEvent(
      new CustomEvent("rackula:dragmove", {
        detail: {
          clientX: 150,
          clientY: 50,
          device,
          rackId: sourceRack.id,
          deviceIndex: 1,
        },
      }),
    );

    expect(source.preview).toBeNull();
    expect(source.hover).toBeNull();
    expect(target.preview).toEqual({
      position: 4,
      height: 1,
      feedback: "valid",
    });
    expect(target.hover).toMatchObject({ containerId: "target-carrier" });

    document.dispatchEvent(new CustomEvent("rackula:dragcancel"));

    expect(source.preview).toBeNull();
    expect(source.hover).toBeNull();
    expect(target.preview).toBeNull();
    expect(target.hover).toBeNull();
    expect(dispatchDropAction).not.toHaveBeenCalled();
    expect(source.onDragFinished).not.toHaveBeenCalled();
    expect(target.onDragFinished).not.toHaveBeenCalled();
  });
});
