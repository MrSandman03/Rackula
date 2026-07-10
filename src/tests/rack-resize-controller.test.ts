import { describe, expect, it, vi } from "vitest";
import type { Rack } from "$lib/types";
import {
  createRackResizeController,
  type RackResizeDeps,
  type ResizeTarget,
} from "$lib/utils/rack-resize-controller.svelte";

function makeRack(id: string, height = 8, profile?: Rack["profile"]): Rack {
  return {
    id,
    height,
    profile,
    devices: [],
  } as unknown as Rack;
}

function pointer(pointerId: number, clientY: number): PointerEvent {
  return {
    pointerId,
    clientY,
    currentTarget: { setPointerCapture: vi.fn() },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent;
}

function keyboard(key: string): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

function setup(initialRacks: Rack[]) {
  const racks = new Map(initialRacks.map((rack) => [rack.id, rack]));
  let activeRackId = initialRacks[0]?.id ?? null;
  const rawUpdates: Array<{ rackId: string; height: number }> = [];
  const rackCommits: Array<{ rackId: string; height: number }> = [];
  const bayCommits: Array<{ groupId: string; height: number }> = [];
  const visible: string[][] = [];

  const deps: RackResizeDeps = {
    getActiveRackId: () => activeRackId,
    getRack: (rackId) => racks.get(rackId),
    getDeviceLibrary: () => [],
    getZoom: () => 1,
    setActiveRack: (rackId) => {
      activeRackId = rackId;
    },
    updateRackRaw: (rackId, height) => {
      rawUpdates.push({ rackId, height });
      const rack = racks.get(rackId);
      if (rack) rack.height = height;
    },
    updateRack: (rackId, height) => {
      rackCommits.push({ rackId, height });
      const rack = racks.get(rackId);
      if (rack) rack.height = height;
    },
    resizeBayedGroupHeight: (groupId, height) => {
      bayCommits.push({ groupId, height });
    },
    ensureRacksVisible: (rackIds) => visible.push(rackIds),
  };

  return {
    controller: createRackResizeController(deps),
    rawUpdates,
    rackCommits,
    bayCommits,
    visible,
    racks,
  };
}

describe("rack resize controller", () => {
  it("previews raw heights, rewinds, and records one settled rack commit", () => {
    const state = setup([makeRack("rack-1")]);
    const target: ResizeTarget = { kind: "rack", rackId: "rack-1" };

    state.controller.start(target, "top", pointer(1, 100));
    state.controller.move(pointer(1, 56));

    expect(state.controller.drag?.previewHeight).toBe(10);
    expect(state.rawUpdates.at(-1)).toEqual({ rackId: "rack-1", height: 10 });

    state.controller.end(pointer(1, 56));

    expect(state.controller.drag).toBeNull();
    expect(state.rawUpdates.at(-1)).toEqual({ rackId: "rack-1", height: 8 });
    expect(state.rackCommits).toEqual([{ rackId: "rack-1", height: 10 }]);
    expect(state.visible).toEqual([["rack-1"]]);
  });

  it("rewinds a cancelled preview without a recorded commit", () => {
    const state = setup([makeRack("rack-1")]);
    const target: ResizeTarget = { kind: "rack", rackId: "rack-1" };

    state.controller.start(target, "bottom", pointer(2, 100));
    state.controller.move(pointer(2, 144));
    state.controller.cancel(pointer(2, 144));

    expect(state.racks.get("rack-1")?.height).toBe(8);
    expect(state.rackCommits).toEqual([]);
    expect(state.visible).toEqual([]);
  });

  it("resizes a bay through its group action on keyboard input", () => {
    const state = setup([makeRack("rack-1"), makeRack("rack-2")]);
    const target: ResizeTarget = {
      kind: "bay",
      groupId: "bay-1",
      rackIds: ["rack-1", "rack-2"],
    };

    state.controller.handleKey(target, keyboard("ArrowUp"));

    expect(state.bayCommits).toEqual([{ groupId: "bay-1", height: 9 }]);
    expect(state.visible).toEqual([["rack-1", "rack-2"]]);
  });

  it("does not start resizing a fixed RackMate profile", () => {
    const state = setup([makeRack("rack-1", 8, "rackmate-t1-plus")]);

    state.controller.start(
      { kind: "rack", rackId: "rack-1" },
      "top",
      pointer(3, 100),
    );

    expect(state.controller.drag).toBeNull();
    expect(state.rawUpdates).toEqual([]);
  });
});
