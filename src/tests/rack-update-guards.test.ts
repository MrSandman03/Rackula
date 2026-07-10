import { beforeEach, describe, expect, it } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestLayout, createTestRack } from "./factories";

describe("rack update guards", () => {
  beforeEach(() => {
    resetLayoutStore();
  });

  it("rejects a per-member RackMate profile change in an 8U bay", () => {
    const store = getLayoutStore();
    const result = store.addBayedRackGroup("Bayed", 2, 8, 19);
    expect(result).not.toBeNull();
    const bay = result!.racks[0];
    store.clearHistory();
    store.markClean();

    // RackMate keeps the existing 8U height, but its profile, width, and
    // depth would still diverge from the other member of the bay.
    store.updateRack(bay.id, { profile: "rackmate-t1-plus" });

    expect(store.getRackById(bay.id)).toMatchObject({
      width: 19,
      height: 8,
      depth_mm: 1000,
    });
    expect(store.getRackById(bay.id)?.profile).toBeUndefined();
    expect(store.isDirty).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it("rejects a width change that would diverge a consistent bay", () => {
    const store = getLayoutStore();
    const result = store.addBayedRackGroup("Bayed", 2, 8, 19);
    expect(result).not.toBeNull();
    const bay = result!.racks[0];
    store.clearHistory();
    store.markClean();

    store.updateRack(bay.id, { width: 10 });

    expect(store.getRackById(bay.id)?.width).toBe(19);
    expect(store.isDirty).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it("repairs a multi-value loaded bay width by reducing divergence", () => {
    const store = getLayoutStore();
    const peer = createTestRack({ id: "peer", height: 8, width: 19 });
    const outlier = createTestRack({
      id: "outlier",
      position: 1,
      height: 8,
      width: 10,
    });
    const secondOutlier = createTestRack({
      id: "second-outlier",
      position: 2,
      height: 8,
      width: 23,
    });
    store.loadLayout(
      createTestLayout({
        racks: [peer, outlier, secondOutlier],
        rack_groups: [
          {
            id: "bay",
            name: "Bayed",
            rack_ids: [peer.id, outlier.id, secondOutlier.id],
            layout_preset: "bayed",
          },
        ],
      }),
    );
    store.markClean();

    store.updateRack(secondOutlier.id, { width: 19 });
    store.updateRack(outlier.id, { width: 19 });

    expect(store.getRackById(peer.id)?.width).toBe(19);
    expect(store.getRackById(outlier.id)?.width).toBe(19);
    expect(store.getRackById(secondOutlier.id)?.width).toBe(19);
    expect(store.undo()).toBe(true);
    expect(store.getRackById(outlier.id)?.width).toBe(10);
    expect(store.getRackById(secondOutlier.id)?.width).toBe(19);
    expect(store.undo()).toBe(true);
    expect(store.getRackById(secondOutlier.id)?.width).toBe(23);
    expect(store.redo()).toBe(true);
    expect(store.getRackById(secondOutlier.id)?.width).toBe(19);
    expect(store.redo()).toBe(true);
    expect(store.getRackById(outlier.id)?.width).toBe(19);
  });

  it("repairs a divergent created bay profile by converging to its peers", () => {
    const store = getLayoutStore();
    const result = store.addBayedRackGroup("Bayed", 2, 8, 10);
    expect(result).not.toBeNull();
    const [peer, outlier] = result!.racks;
    store.updateRackRaw({ profile: "rackmate-t1-plus" }, outlier.id);
    store.clearHistory();
    store.markClean();

    store.updateRack(outlier.id, { profile: "generic" });

    expect(store.getRackById(peer.id)?.profile).toBeUndefined();
    expect(store.getRackById(outlier.id)?.profile).toBe("generic");
    expect(store.undo()).toBe(true);
    expect(store.getRackById(outlier.id)?.profile).toBe("rackmate-t1-plus");
    expect(store.redo()).toBe(true);
    expect(store.getRackById(outlier.id)?.profile).toBe("generic");
  });

  it("allows a bayed rename to add the required implicit Generic marker", () => {
    const store = getLayoutStore();
    const result = store.addBayedRackGroup("Bayed", 2, 8, 10);
    expect(result).not.toBeNull();
    const [origin, peer] = result!.racks;
    store.updateRackRaw({ depth_mm: 260 }, origin.id);
    store.updateRackRaw({ depth_mm: 260 }, peer.id);
    store.clearHistory();
    store.markClean();

    store.updateRack(origin.id, { name: "RackMate T1 Plus" });

    expect(store.getRackById(origin.id)).toMatchObject({
      name: "RackMate T1 Plus",
      profile: "generic",
      width: 10,
      height: 8,
      depth_mm: 260,
    });
    expect(store.getRackById(peer.id)?.profile).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.getRackById(origin.id)).toMatchObject({
      name: "Bay 1",
      profile: undefined,
    });
    expect(store.redo()).toBe(true);
    expect(store.getRackById(origin.id)?.profile).toBe("generic");
  });

  it("does not record an unchanged rack height", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Original", 42)!;
    store.clearHistory();
    store.markClean();

    store.updateRack(rack.id, { height: rack.height });

    expect(store.getRackById(rack.id)?.height).toBe(42);
    expect(store.isDirty).toBe(false);
    expect(store.canUndo).toBe(false);
  });

  it("records only changed fields from a mixed rack update", () => {
    const store = getLayoutStore();
    const rack = store.addRack("Original", 42)!;
    store.clearHistory();
    store.markClean();

    store.updateRack(rack.id, {
      name: "Updated",
      height: rack.height,
    });

    expect(store.getRackById(rack.id)).toMatchObject({
      name: "Updated",
      height: 42,
    });
    expect(store.isDirty).toBe(true);
    expect(store.canUndo).toBe(true);

    // Undoing the rename must not restore the unchanged height field over a
    // later mutation that was intentionally outside this history command.
    store.updateRackRaw({ height: 24 }, rack.id);
    expect(store.undo()).toBe(true);
    expect(store.getRackById(rack.id)).toMatchObject({
      name: "Original",
      height: 24,
    });
    expect(store.undo()).toBe(false);
  });
});
