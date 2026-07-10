import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestDevicePalette from "./helpers/TestDevicePalette.svelte";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import { resetHistoryStore } from "$lib/stores/history.svelte";
import { getUIStore, resetUIStore } from "$lib/stores/ui.svelte";
import {
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "./factories";

describe("DevicePalette fit blocking", () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistoryStore();
    resetLayoutStore();
    resetUIStore();
  });

  it("cannot click, key-activate, or drag a child whose only mount misses the rack", async () => {
    const child = {
      ...createTestDeviceType({
        slug: "blocked-child",
        model: "Blocked Child",
        slot_width: 1,
      }),
      subdevice_role: "child" as const,
      custom_fields: {
        rackula_fit: { recommended_mount_slugs: ["wide-tray"] },
      },
    };
    const tray = {
      ...createTestDeviceType({
        slug: "wide-tray",
        model: "Wide Tray",
        category: "shelf",
        rack_widths: [19],
      }),
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    };
    getLayoutStore().loadLayout(
      createTestLayout({
        racks: [
          createTestRack({
            width: 10,
            height: 8,
            depth_mm: 260,
            profile: "rackmate-t1-plus",
          }),
        ],
        device_types: [child, tray],
      }),
    );
    if (getUIStore().compatibleOnly) getUIStore().toggleCompatibleOnly();
    const onselect = vi.fn();
    render(TestDevicePalette, { props: { ondeviceselect: onselect } });
    const row = screen
      .getAllByTestId("device-palette-item")
      .find((item) => item.textContent?.includes("Blocked Child"));
    expect(row).toBeDefined();
    const select = within(row!).getByTestId("device-palette-select");

    expect(row).toHaveAttribute("draggable", "false");
    expect(select).toHaveAttribute("aria-disabled", "true");
    expect(
      within(row!).getByRole("button", {
        name: /Fit details: Recommended mounts do not fit this rack/,
      }),
    ).toBeInTheDocument();

    await fireEvent.click(select);
    await fireEvent.keyDown(select, { key: "Enter" });
    await fireEvent.keyDown(select, { key: " " });

    expect(onselect).not.toHaveBeenCalled();
  });
});
