import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import TestDevicePaletteItem from "./helpers/TestDevicePaletteItem.svelte";
import { createTestDeviceType } from "./factories";

describe("DevicePaletteItem", () => {
  it("blocks pointer and keyboard activation for an incompatible device", async () => {
    const onselect = vi.fn();
    const device = createTestDeviceType({
      slug: "wide-device",
      model: "Wide Device",
      rack_widths: [19],
    });
    render(TestDevicePaletteItem, {
      props: {
        device,
        isCompatible: false,
        incompatibilityReason:
          'Requires at least 19" rack width (current: 10")',
        onselect,
      },
    });

    const row = screen.getByTestId("device-palette-item");
    const selectButton = screen.getByTestId("device-palette-select");
    expect(selectButton).toHaveAttribute("aria-disabled", "true");
    expect(row).toHaveAttribute("draggable", "false");

    await fireEvent.click(selectButton);
    await fireEvent.touchStart(selectButton);
    await fireEvent.touchEnd(selectButton);
    await fireEvent.keyDown(selectButton, { key: "Enter" });
    await fireEvent.keyDown(selectButton, { key: " " });

    expect(onselect).not.toHaveBeenCalled();
  });

  it("renders one touch-discoverable fit marker when bay and fit guidance overlap", async () => {
    const device = createTestDeviceType({
      slug: "test-child",
      model: "Test Child",
    });
    render(TestDevicePaletteItem, {
      props: {
        device,
        placementRequirement: "Requires a compatible tray",
        fitSummary: {
          label: "Check",
          title: "Measure cable bend clearance",
          tone: "warn",
        },
      },
    });

    expect(screen.queryByText("Bay")).not.toBeInTheDocument();
    const marker = screen.getByRole("button", {
      name: "Fit details: Measure cable bend clearance",
    });
    expect(marker).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(marker);

    expect(marker).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByTestId("fit-detail-popover");
    expect(details).toHaveTextContent("Measure cable bend clearance");
    expect(screen.getByTestId("device-palette-item")).not.toContainElement(
      details,
    );
    expect(document.body).toContainElement(details);
  });

  it("closes fit details with Escape", async () => {
    const device = createTestDeviceType({
      slug: "test-child",
      model: "Test Child",
    });
    render(TestDevicePaletteItem, {
      props: {
        device,
        fitSummary: {
          label: "Check",
          title: "Measure cable bend clearance",
          tone: "warn",
        },
      },
    });

    const marker = screen.getByRole("button", {
      name: "Fit details: Measure cable bend clearance",
    });
    await fireEvent.keyDown(marker, { key: "Enter" });
    expect(screen.getByTestId("fit-detail-popover")).toBeInTheDocument();

    await fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(marker).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByTestId("fit-detail-popover"),
      ).not.toBeInTheDocument();
    });
  });
});
