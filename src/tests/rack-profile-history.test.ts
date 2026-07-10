import { beforeEach, describe, expect, it } from "vitest";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { createTestLayout, createTestRack } from "./factories";

describe("rack profile history invariants", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
  });

  it("keeps RackMate dimensions canonical across profile history replay", () => {
    const store = getLayoutStore();
    const rack = store.addRack(
      "RackMate",
      8,
      10,
      "4-post-cabinet",
      false,
      1,
      "rackmate-t1-plus",
    )!;
    store.clearHistory();

    store.updateRack(rack.id, { profile: "generic" });
    store.updateRackRaw({ width: 19, height: 12, depth_mm: 600 }, rack.id);
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "generic",
      width: 19,
      height: 12,
      depth_mm: 600,
    });

    expect(store.undo()).toBe(true);
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "rackmate-t1-plus",
      width: 10,
      height: 8,
      depth_mm: 260,
    });

    expect(store.redo()).toBe(true);
    expect(store.getRackById(rack.id)?.profile).toBe("generic");
  });

  it("restores an exact unmarked legacy profile without authoring inference", () => {
    const store = getLayoutStore();
    const rack = createTestRack({
      name: "RackMate T1 Plus",
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: undefined,
    });
    store.loadLayout(createTestLayout({ racks: [rack] }));

    store.updateRack(rack.id, { profile: "generic" });
    store.updateRackRaw({ width: 19 }, rack.id);

    expect(store.undo()).toBe(true);
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: undefined,
      width: 19,
      height: 8,
      depth_mm: 260,
    });

    expect(store.redo()).toBe(true);
    expect(store.getRackById(rack.id)).toMatchObject({
      profile: "generic",
      width: 19,
    });
  });
});
