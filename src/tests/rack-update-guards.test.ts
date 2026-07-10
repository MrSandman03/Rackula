import { beforeEach, describe, expect, it } from "vitest";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";

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
