import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";
import EditPanelActions from "$lib/components/EditPanelActions.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { resetSelectionStore } from "$lib/stores/selection.svelte";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("EditPanelActions carrier removal", () => {
  beforeEach(() => {
    resetHistoryStore();
    resetLayoutStore();
    resetSelectionStore();
  });

  it("discloses mounted children and leaves state untouched when cancelled", async () => {
    const store = getLayoutStore();
    const carrierType = createTestDeviceType({
      slug: "carrier",
      model: "Utility Tray",
      category: "shelf",
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    });
    const childType = createTestDeviceType({
      slug: "child",
      model: "Gateway",
      u_height: 0.5,
      slot_width: 1,
    });
    const carrier = createTestDevice({
      id: "carrier-1",
      device_type: carrierType.slug,
      name: "Gateway Tray",
    });
    const child = createTestDevice({
      id: "child-1",
      device_type: childType.slug,
      container_id: carrier.id,
      slot_id: "main",
      position: 0,
    });
    store.loadLayout(
      createTestLayout({
        racks: [createTestRack({ devices: [carrier, child] })],
        device_types: [carrierType, childType],
      }),
    );
    const rack = store.racks[0]!;

    render(EditPanelActions, {
      props: {
        selectedDeviceInfo: {
          device: carrierType,
          placedDevice: rack.devices[0]!,
          rack,
          deviceIndex: 0,
        },
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "Remove from rack" }),
    );

    expect(
      screen.getByText(
        'Remove "Gateway Tray" and 1 mounted device from this rack?',
      ),
    ).toBeInTheDocument();
    expect(store.racks[0]?.devices.map((device) => device.id)).toEqual([
      "carrier-1",
      "child-1",
    ]);
    expect(store.canUndo).toBe(false);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(store.racks[0]?.devices.map((device) => device.id)).toEqual([
      "carrier-1",
      "child-1",
    ]);
    expect(store.canUndo).toBe(false);

    await fireEvent.click(
      screen.getByRole("button", { name: "Remove from rack" }),
    );
    await fireEvent.click(
      screen.getByRole("button", { name: "Remove 2 devices" }),
    );

    expect(store.racks[0]?.devices).toEqual([]);
    expect(store.canUndo).toBe(true);
  });
});
