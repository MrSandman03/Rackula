import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import EditPanelRack from "$lib/components/EditPanelRack.svelte";
import RackEditSheet from "$lib/components/RackEditSheet.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import { planRackProfileChange } from "$lib/utils/rack-profile-change";
import type { Rack, RackGroup } from "$lib/types";
import { createTestLayout, createTestRack } from "./factories";

function loadBayedRacks(origin: Rack, peer: Rack) {
  const store = getLayoutStore();
  const group: RackGroup = {
    id: "bay-group",
    name: "Bayed",
    rack_ids: [origin.id, peer.id],
    layout_preset: "bayed",
  };
  store.loadLayout(
    createTestLayout({ racks: [origin, peer], rack_groups: [group] }),
  );
  store.markClean();
  return {
    store,
    origin: store.getRackById(origin.id)!,
    peer: store.getRackById(peer.id)!,
    group: store.rack_groups[0]!,
  };
}

function genericRack(overrides: Partial<Rack>): Rack {
  return createTestRack({
    height: 8,
    width: 10,
    depth_mm: 260,
    profile: undefined,
    ...overrides,
  });
}

describe("bayed rack profile planning", () => {
  it("plans a convergent RackMate-to-Generic repair", () => {
    const origin = genericRack({
      id: "origin",
      profile: "rackmate-t1-plus",
    });
    const peer = genericRack({ id: "peer" });
    const group: RackGroup = {
      id: "bay-group",
      rack_ids: [origin.id, peer.id],
      layout_preset: "bayed",
    };

    expect(
      planRackProfileChange(origin, [], "generic", {
        group,
        racks: [origin, peer],
      }),
    ).toEqual({ kind: "update", updates: { profile: "generic" } });
  });

  it("rejects a profile change that would diverge a healthy bay", () => {
    const origin = genericRack({ id: "origin" });
    const peer = genericRack({ id: "peer" });
    const group: RackGroup = {
      id: "bay-group",
      rack_ids: [origin.id, peer.id],
      layout_preset: "bayed",
    };

    expect(
      planRackProfileChange(origin, [], "rackmate", {
        group,
        racks: [origin, peer],
      }),
    ).toEqual({
      kind: "error",
      message: "This change would make the bayed rack profiles diverge.",
    });
  });
});

describe("bayed rack editor convergence", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
  });

  it("repairs a divergent profile from the desktop editor", async () => {
    const user = userEvent.setup();
    const { store, origin, group } = loadBayedRacks(
      genericRack({ id: "origin", profile: "rackmate-t1-plus" }),
      genericRack({ id: "peer" }),
    );
    render(EditPanelRack, {
      props: { selectedRack: origin, selectedGroup: group },
    });

    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(store.getRackById(origin.id)?.profile).toBe("generic");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("repairs a divergent width from the desktop editor", async () => {
    const user = userEvent.setup();
    const { store, origin, group } = loadBayedRacks(
      genericRack({ id: "origin", width: 10 }),
      genericRack({ id: "peer", width: 19 }),
    );
    render(EditPanelRack, {
      props: { selectedRack: origin, selectedGroup: group },
    });

    await user.click(screen.getByRole("button", { name: '19"' }));

    expect(store.getRackById(origin.id)?.width).toBe(19);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("repairs a divergent profile from the mobile editor", async () => {
    const user = userEvent.setup();
    const { store, origin } = loadBayedRacks(
      genericRack({ id: "origin", profile: "rackmate-t1-plus" }),
      genericRack({ id: "peer" }),
    );
    render(RackEditSheet, { props: { rack: origin } });

    await user.click(screen.getByRole("button", { name: "Generic" }));

    expect(store.getRackById(origin.id)?.profile).toBe("generic");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("repairs a divergent width from the mobile editor", async () => {
    const user = userEvent.setup();
    const { store, origin } = loadBayedRacks(
      genericRack({ id: "origin", width: 10 }),
      genericRack({ id: "peer", width: 19 }),
    );
    render(RackEditSheet, { props: { rack: origin } });

    const width = screen.getByRole("group", { name: "Rack width in inches" });
    await user.click(within(width).getByRole("button", { name: '19"' }));

    expect(store.getRackById(origin.id)?.width).toBe(19);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a mobile width change that would diverge a healthy bay", async () => {
    const user = userEvent.setup();
    const { store, origin } = loadBayedRacks(
      genericRack({ id: "origin", width: 19 }),
      genericRack({ id: "peer", width: 19 }),
    );
    render(RackEditSheet, { props: { rack: origin } });

    const width = screen.getByRole("group", { name: "Rack width in inches" });
    await user.click(within(width).getByRole("button", { name: '10"' }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "This change would make the bayed rack widths diverge",
    );
    expect(width).toHaveAttribute("aria-describedby", alert.id);
    expect(store.getRackById(origin.id)?.width).toBe(19);
  });

  it("announces a mobile profile change that would diverge a healthy bay", async () => {
    const user = userEvent.setup();
    const { store, origin } = loadBayedRacks(
      genericRack({ id: "origin" }),
      genericRack({ id: "peer" }),
    );
    render(RackEditSheet, { props: { rack: origin } });

    const profile = screen.getByRole("group", { name: "Rack profile" });
    await user.click(screen.getByRole("button", { name: "RackMate T1 Plus" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "This change would make the bayed rack profiles diverge",
    );
    expect(profile).toHaveAttribute("aria-describedby", alert.id);
    expect(store.getRackById(origin.id)?.profile).toBeUndefined();
  });
});
