import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditPanelRack from "$lib/components/EditPanelRack.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("EditPanelRack RackMate presets", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
  });

  it("locks an explicit RackMate profile to its height and depth presets", () => {
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-8")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-depth-260")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-4")).toBeNull();
    expect(screen.queryByTestId("btn-preset-height-12")).toBeNull();
    expect(screen.queryByTestId("btn-preset-height-18")).toBeNull();
    expect(screen.queryByTestId("btn-preset-depth-1000")).toBeNull();
  });

  it("does not mutate a generic 10-inch rack when the editor opens", () => {
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({ height: 12, width: 10, depth_mm: 400 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(updateRack).not.toHaveBeenCalled();
    expect(screen.getByTestId("btn-preset-height-42")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-depth-1000")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-depth-260")).toBeNull();
    expect(screen.getByLabelText("Depth (mm)")).not.toHaveAttribute("readonly");
  });

  it("keeps standard rack heights and depths for 19-inch racks", () => {
    const rack = createTestRack({ height: 42, width: 19 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });

    expect(screen.getByTestId("btn-preset-height-42")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-height-18")).toBeInTheDocument();
    expect(screen.getByTestId("btn-preset-depth-1000")).toBeInTheDocument();
    expect(screen.queryByTestId("btn-preset-height-8")).toBeNull();
    expect(screen.queryByTestId("btn-preset-depth-260")).toBeNull();
  });

  it("assigns and clears the RackMate profile when width presets change", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({ height: 8, width: 19, depth_mm: 1000 });

    const view = render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(updateRack).toHaveBeenLastCalledWith(rack.id, {
      width: 10,
      profile: "rackmate-t1-plus",
      height: 8,
      depth_mm: 260,
    });

    view.unmount();
    updateRack.mockClear();
    const rackMate = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    render(EditPanelRack, {
      props: { selectedRack: rackMate, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '19"' }));

    expect(updateRack).toHaveBeenLastCalledWith(rackMate.id, {
      width: 19,
      profile: undefined,
    });
  });

  it("converts a non-8U rack atomically so one undo restores every dimension", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ height: 42, width: 19, depth_mm: 1000 });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(layoutStore.racks[0]).toMatchObject({
      width: 10,
      height: 8,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]).toMatchObject({
      width: 19,
      height: 42,
      depth_mm: 1000,
    });
    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(layoutStore.undo()).toBe(false);
  });

  it("blocks RackMate conversion when installed hardware is 19-inch only", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const deviceType = createTestDeviceType({
      slug: "full-width-switch",
      model: "Full Width Switch",
      rack_widths: [19],
    });
    const rack = createTestRack({
      height: 8,
      width: 19,
      depth_mm: 1000,
      devices: [
        createTestDevice({ device_type: deviceType.slug, position: 1 }),
      ],
    });
    layoutStore.loadLayout(
      createTestLayout({ racks: [rack], device_types: [deviceType] }),
    );

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(layoutStore.racks[0]).toMatchObject({
      width: 19,
      height: 8,
      depth_mm: 1000,
    });
    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(
      screen.getByText(/RackMate T1 Plus cannot contain Full Width Switch/),
    ).toBeInTheDocument();
    expect(layoutStore.undo()).toBe(false);
  });

  it("rejects an individual RackMate conversion in a bayed group without local drift", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({ height: 42, width: 19, depth_mm: 1000 });
    const group = {
      id: "group-1",
      rack_ids: [rack.id, "rack-2"],
      layout_preset: "bayed" as const,
    };

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: group },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(updateRack).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Depth (mm)")).toHaveValue(1000);
    expect(screen.getByLabelText("Height")).toHaveValue(42);
    expect(
      screen.getByText(/Bayed rack profiles must be changed as a group/),
    ).toBeInTheDocument();
  });

  it("keeps existing history intact when the active RackMate preset is clicked", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));
    layoutStore.updateRack(rack.id, { name: "Renamed RackMate" });
    const undoDescription = layoutStore.undoDescription;

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(layoutStore.undoDescription).toBe(undoDescription);
    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]?.name).toBe("Test Rack");
    expect(layoutStore.undo()).toBe(false);
  });
});
