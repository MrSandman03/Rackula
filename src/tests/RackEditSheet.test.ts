import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RackEditSheet from "$lib/components/RackEditSheet.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

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
    expect(screen.getByLabelText("Depth (mm)")).toHaveAttribute("readonly");
    expect(
      screen.queryByRole("group", { name: "Rack width in inches" }),
    ).toBeNull();
  });

  it("converts a generic rack to RackMate as one undoable update", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ height: 12, width: 19, depth_mm: 600 });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
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
      height: 12,
      depth_mm: 600,
    });
  });

  it("lets a mobile user opt an explicit RackMate rack into Generic", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({
      height: 8,
      width: 10,
      depth_mm: 260,
      profile: "rackmate-t1-plus",
    });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    const { rerender } = render(RackEditSheet, {
      props: { rack: layoutStore.racks[0]! },
    });
    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(layoutStore.racks[0]?.profile).toBe("generic");
    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]?.profile).toBe("rackmate-t1-plus");
    expect(layoutStore.redo()).toBe(true);
    expect(layoutStore.racks[0]?.profile).toBe("generic");
    await rerender({ rack: layoutStore.racks[0]! });

    const width = screen.getByRole("group", { name: "Rack width in inches" });
    await user.click(within(width).getByRole("button", { name: '19"' }));

    const depth = screen.getByLabelText("Depth (mm)");
    expect(depth).not.toHaveAttribute("readonly");
    await user.clear(depth);
    await user.type(depth, "600");
    await user.tab();

    const height = screen.getByLabelText("Height");
    await user.clear(height);
    await user.type(height, "12");
    await user.tab();

    expect(layoutStore.racks[0]).toMatchObject({
      profile: "generic",
      width: 19,
      depth_mm: 600,
      height: 12,
    });
  });

  it("announces a rejected RackMate conversion beside the profile control", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const deviceType = createTestDeviceType({
      slug: "mobile-full-width-switch",
      model: "Mobile Full Width Switch",
      rack_widths: [19],
    });
    const rack = createTestRack({
      height: 8,
      width: 19,
      depth_mm: 600,
      devices: [createTestDevice({ device_type: deviceType.slug })],
    });
    layoutStore.loadLayout(
      createTestLayout({ racks: [rack], device_types: [deviceType] }),
    );

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
    const profile = screen.getByRole("group", { name: "Rack profile" });
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "RackMate T1 Plus cannot contain Mobile Full Width Switch",
    );
    const height = screen.getByLabelText("Height");
    expect(profile).not.toHaveAttribute("aria-invalid");
    expect(profile).toHaveAttribute("aria-describedby", alert.id);
    expect(height).toHaveAttribute("aria-invalid", "false");
    expect(height).not.toHaveAttribute("aria-describedby");
    expect(layoutStore.racks[0]?.profile).toBeUndefined();
    expect(layoutStore.canUndo).toBe(false);
  });

  it("associates a rejected mobile width change only with Width", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const deviceType = createTestDeviceType({
      slug: "mobile-width-guard",
      model: "Mobile Width Guard",
      rack_widths: [19],
    });
    const rack = createTestRack({
      width: 19,
      depth_mm: 600,
      devices: [createTestDevice({ device_type: deviceType.slug })],
    });
    layoutStore.loadLayout(
      createTestLayout({ racks: [rack], device_types: [deviceType] }),
    );

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
    const width = screen.getByRole("group", { name: "Rack width in inches" });
    const height = screen.getByLabelText("Height");
    const profile = screen.getByRole("group", { name: "Rack profile" });
    await user.click(within(width).getByRole("button", { name: '10"' }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "10-inch rails cannot contain Mobile Width Guard",
    );
    expect(width).not.toHaveAttribute("aria-invalid");
    expect(width).toHaveAttribute("aria-describedby", alert.id);
    expect(height).toHaveAttribute("aria-invalid", "false");
    expect(height).not.toHaveAttribute("aria-describedby");
    expect(profile).not.toHaveAttribute("aria-invalid");
    expect(profile).not.toHaveAttribute("aria-describedby");
    expect(layoutStore.racks[0]?.width).toBe(19);
  });

  it("rejects a per-member bayed height without local field drift", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ height: 12, width: 19, depth_mm: 600 });
    const peer = createTestRack({
      id: "rack-2",
      height: 12,
      width: 19,
      depth_mm: 600,
    });
    layoutStore.loadLayout(
      createTestLayout({
        racks: [rack, peer],
        rack_groups: [
          {
            id: "group-1",
            rack_ids: [rack.id, peer.id],
            layout_preset: "bayed",
          },
        ],
      }),
    );

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
    const height = screen.getByLabelText("Height");
    await user.clear(height);
    await user.type(height, "18");
    await user.tab();

    expect(layoutStore.racks[0]?.height).toBe(12);
    expect(height).toHaveValue(12);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Bayed racks must share the same height");
    expect(height).toHaveAttribute("aria-invalid", "true");
    expect(height).toHaveAttribute("aria-describedby", alert.id);
    expect(layoutStore.canUndo).toBe(false);
  });

  it("does not add an undo step for the active mobile height preset", async () => {
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

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
    await user.click(screen.getByTestId("btn-preset-height-8"));

    expect(layoutStore.undo()).toBe(true);
    expect(layoutStore.racks[0]?.name).toBe("Test Rack");
    expect(layoutStore.undo()).toBe(false);
  });

  it("rejects a non-positive mobile depth beside the Depth field", async () => {
    const user = userEvent.setup();
    const layoutStore = getLayoutStore();
    const rack = createTestRack({ width: 19, depth_mm: 600 });
    layoutStore.loadLayout(createTestLayout({ racks: [rack] }));

    render(RackEditSheet, { props: { rack: layoutStore.racks[0]! } });
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
      screen.getByRole("group", { name: "Rack profile" }),
    ).not.toHaveAttribute("aria-invalid");
    expect(layoutStore.racks[0]?.depth_mm).toBe(600);
  });
});
