import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RackEditSheet from "$lib/components/RackEditSheet.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { createTestRack } from "./factories";

describe("RackEditSheet rack profiles", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
  });

  it("does not mutate a generic 10-inch rack when the sheet opens", () => {
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({ height: 12, width: 10, depth_mm: 400 });

    render(RackEditSheet, { props: { rack } });

    expect(updateRack).not.toHaveBeenCalled();
    expect(screen.getByTestId("btn-preset-height-42")).toBeInTheDocument();
    expect(screen.queryByText(/RackMate T1 Plus is fixed/)).toBeNull();
  });

  it("identifies only an explicit RackMate profile as fixed", () => {
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });

    render(RackEditSheet, { props: { rack } });

    expect(screen.getByText(/RackMate T1 Plus is fixed/)).toBeInTheDocument();
    expect(screen.getByText(/10.*RackMate T1 Plus/)).toBeInTheDocument();
  });
});
