import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EditPanelRack from "$lib/components/EditPanelRack.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { getLayoutStore } from "$lib/stores/layout.svelte";
import { parseLayoutObject } from "$lib/utils/yaml";
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

  it("keeps the active Generic profile history-free on an ordinary rack", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ height: 12, width: 10, depth_mm: 400 });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));
    layoutStore.markClean();

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(layoutStore.isDirty).toBe(false);
    expect(layoutStore.canUndo).toBe(false);
  });

  it("keeps an already-active 10-inch width generic when clicked", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ height: 12, width: 10, depth_mm: 400 });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(layoutStore.racks[0]).toMatchObject({
      width: 10,
      height: 12,
      depth_mm: 400,
    });
    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(layoutStore.canUndo).toBe(false);
  });

  it("records Generic when an unmarked rack matches the legacy RackMate tuple", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({
      name: "RackMate T1 Plus",
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: undefined,
    });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(updateRack).toHaveBeenLastCalledWith(rack.id, {
      profile: "generic",
    });
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

  it("keeps the 10-inch width generic until RackMate is explicitly selected", async () => {
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
    });

    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    expect(updateRack).toHaveBeenLastCalledWith(rack.id, {
      width: 10,
      height: 8,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
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
    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(updateRack).toHaveBeenLastCalledWith(rackMate.id, {
      profile: "generic",
    });
  });

  it("keeps an explicit Generic opt-out after persisted-layout validation", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rackMate = createTestRack({
      name: "RackMate T1 Plus",
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    layoutStore.loadLayout(createTestLayout({ racks: [rackMate] }));

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: "Generic" }));

    const persisted = parseLayoutObject(
      JSON.parse(JSON.stringify(layoutStore.layout)),
    );
    expect(persisted?.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      width: 10,
      height: 8,
      depth_mm: 260,
      profile: "generic",
    });
    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      profile: "rackmate-t1-plus",
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
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

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
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    expect(layoutStore.racks[0]).toMatchObject({
      width: 19,
      height: 8,
      depth_mm: 1000,
    });
    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(
      screen.getByText(/RackMate T1 Plus cannot contain Full Width Switch/),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    const height = screen.getByLabelText("Height");
    const width = screen.getByRole("group", { name: "Rack width in inches" });
    const profile = screen.getByRole("group", { name: "Rack profile" });
    expect(profile).not.toHaveAttribute("aria-invalid");
    expect(profile).toHaveAttribute("aria-describedby", alert.id);
    expect(height).toHaveAttribute("aria-invalid", "false");
    expect(height).not.toHaveAttribute("aria-describedby");
    expect(width).not.toHaveAttribute("aria-invalid");
    expect(width).not.toHaveAttribute("aria-describedby");
    expect(layoutStore.undo()).toBe(false);
  });

  it("blocks a generic width shrink when installed hardware is 19-inch only", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const deviceType = createTestDeviceType({
      slug: "generic-full-width-switch",
      model: "Generic Full Width Switch",
      rack_widths: [19],
    });
    const rack = createTestRack({
      width: 19,
      devices: [createTestDevice({ device_type: deviceType.slug })],
    });
    layoutStore.loadLayout(
      createTestLayout({ racks: [rack], device_types: [deviceType] }),
    );

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '10"' }));

    expect(layoutStore.racks[0]?.width).toBe(19);
    expect(
      screen.getByText(
        /10-inch rails cannot contain Generic Full Width Switch/,
      ),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    const height = screen.getByLabelText("Height");
    const width = screen.getByRole("group", { name: "Rack width in inches" });
    const profile = screen.getByRole("group", { name: "Rack profile" });
    expect(width).not.toHaveAttribute("aria-invalid");
    expect(width).toHaveAttribute("aria-describedby", alert.id);
    expect(height).toHaveAttribute("aria-invalid", "false");
    expect(height).not.toHaveAttribute("aria-describedby");
    expect(profile).not.toHaveAttribute("aria-invalid");
    expect(profile).not.toHaveAttribute("aria-describedby");
    expect(layoutStore.canUndo).toBe(false);
  });

  it("associates a locked RackMate height error only with Height", async () => {
    const user = userEvent.setup();
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });
    const height = screen.getByLabelText("Height");
    await user.clear(height);
    await user.type(height, "12");
    await user.tab();

    const alert = screen.getByRole("alert");
    const width = screen.getByRole("group", { name: "Rack width in inches" });
    const profile = screen.getByRole("group", { name: "Rack profile" });
    expect(alert).toHaveTextContent("RackMate T1 Plus height is locked to 8U");
    expect(height).toHaveAttribute("aria-invalid", "true");
    expect(height).toHaveAttribute("aria-describedby", alert.id);
    expect(width).not.toHaveAttribute("aria-invalid");
    expect(width).not.toHaveAttribute("aria-describedby");
    expect(profile).not.toHaveAttribute("aria-invalid");
    expect(profile).not.toHaveAttribute("aria-describedby");
  });

  it.each([
    ["blank", ""],
    ["zero", "0"],
    ["over-100", "101"],
    ["fractional", "12.5"],
  ])(
    "rejects a %s rack height without truncating or leaving field drift",
    async (_label, value) => {
      const layoutStore = getLayoutStore();
      const rack = createTestRack({ height: 18, width: 19, depth_mm: 600 });
      layoutStore.loadLayout(createTestLayout({ racks: [rack] }));
      layoutStore.markClean();

      render(EditPanelRack, {
        props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
      });
      const height = screen.getByLabelText("Height");
      await fireEvent.change(height, { target: { value } });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(
        "Height must be a whole number between 1 and 100U",
      );
      expect(height).toHaveValue(18);
      expect(height).toHaveAttribute("aria-invalid", "true");
      expect(height).toHaveAttribute("aria-describedby", alert.id);
      expect(
        screen.getByRole("group", { name: "Rack width in inches" }),
      ).not.toHaveAttribute("aria-describedby");
      expect(
        screen.getByRole("group", { name: "Rack profile" }),
      ).not.toHaveAttribute("aria-describedby");
      expect(layoutStore.racks[0]?.height).toBe(18);
      expect(layoutStore.isDirty).toBe(false);
      expect(layoutStore.canUndo).toBe(false);
    },
  );

  it("announces an invalid depth only beside the Depth field", async () => {
    const user = userEvent.setup();
    const rack = createTestRack({ depth_mm: 600 });

    render(EditPanelRack, {
      props: { selectedRack: rack, selectedGroup: null },
    });
    const depth = screen.getByLabelText("Depth (mm)");
    await user.clear(depth);
    await user.tab();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Depth must be a positive number in millimetres",
    );
    expect(depth).toHaveAttribute("aria-invalid", "true");
    expect(depth).toHaveAttribute("aria-describedby", alert.id);
    expect(screen.getByLabelText("Height")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    expect(
      screen.getByRole("group", { name: "Rack width in inches" }),
    ).not.toHaveAttribute("aria-describedby");
    expect(
      screen.getByRole("group", { name: "Rack profile" }),
    ).not.toHaveAttribute("aria-describedby");
  });

  it("keeps a width-based RackMate exit generic after returning to 10 inches", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({
      name: "RackMate T1 Plus",
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    render(EditPanelRack, {
      props: { selectedRack: layoutStore.racks[0]!, selectedGroup: null },
    });
    await user.click(screen.getByRole("button", { name: '19"' }));

    expect(layoutStore.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      width: 19,
      profile: "generic",
    });

    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]).toMatchObject({
      name: "RackMate T1 Plus",
      width: 10,
      profile: "rackmate-t1-plus",
    });
    expect(layoutStore.redo()).toBe(true);

    layoutStore.updateRack(rack.id, { width: 10 });
    const persisted = parseLayoutObject(
      JSON.parse(JSON.stringify(layoutStore.layout)),
    );
    expect(persisted?.racks[0]?.width).toBe(10);
    expect(persisted?.racks[0]?.profile).toBe("generic");
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
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    expect(updateRack).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Depth (mm)")).toHaveValue(1000);
    expect(screen.getByLabelText("Height")).toHaveValue(42);
    expect(
      screen.getByText(/Bayed rack profiles must be changed as a group/),
    ).toBeInTheDocument();
  });

  it("rejects a per-member width change in a generic bayed group", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const updateRack = vi.spyOn(layoutStore, "updateRack");
    const rack = createTestRack({ height: 12, width: 19, depth_mm: 600 });
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
    expect(
      screen.getByText(/Bayed rack widths must be changed as a group/),
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
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    expect(layoutStore.undoDescription).toBe(undoDescription);
    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]?.name).toBe("Test Rack");
    expect(layoutStore.undo()).toBe(false);
  });
});
