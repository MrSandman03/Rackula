import { render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import RackCanvasView from "$lib/components/RackCanvasView.svelte";
import { resetCanvasStore } from "$lib/stores/canvas.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  getSelectionStore,
  resetSelectionStore,
} from "$lib/stores/selection.svelte";
import { resetUIStore } from "$lib/stores/ui.svelte";
import { createTestRack } from "./factories";

describe("RackCanvasView rack profiles", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
    resetCanvasStore();
    resetUIStore();
  });

  it("shows height resize grips for a selected generic rack", () => {
    const rack = createTestRack({ height: 12, width: 10, depth_mm: 400 });
    getSelectionStore().selectRack(rack.id);

    render(RackCanvasView, {
      props: {
        racks: [rack],
        activeRackId: rack.id,
        rackGroups: [],
        deviceLibrary: [],
      },
    });

    // eslint-disable-next-line no-restricted-syntax -- one grip per top/bottom edge is the resize-control invariant
    expect(
      screen.getAllByRole("button", { name: /Resize rack height/ }),
    ).toHaveLength(2);
  });

  it("hides height resize grips for a selected RackMate profile", () => {
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    getSelectionStore().selectRack(rack.id);

    render(RackCanvasView, {
      props: {
        racks: [rack],
        activeRackId: rack.id,
        rackGroups: [],
        deviceLibrary: [],
      },
    });

    expect(
      screen.queryByRole("button", { name: /Resize rack height/ }),
    ).toBeNull();
  });
});
