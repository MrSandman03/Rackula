import { fireEvent, render, screen } from "@testing-library/svelte";
import { SvelteSet } from "svelte/reactivity";
import { describe, expect, it, vi } from "vitest";
import ExportRackSelection from "$lib/components/ExportRackSelection.svelte";
import type { SelectableExportItem } from "$lib/components/export-dialog.types";

const items: SelectableExportItem[] = [
  {
    id: "bay-1",
    name: "Primary bay",
    heightDisplay: "8U × 2-bay",
    rackIds: ["rack-1", "rack-2"],
    isBayedGroup: true,
  },
  {
    id: "rack-3",
    name: "Standalone",
    heightDisplay: "12U",
    rackIds: ["rack-3"],
    isBayedGroup: false,
  },
];

describe("ExportRackSelection", () => {
  it("shows an indeterminate bay when only some member racks are selected", () => {
    render(ExportRackSelection, {
      props: {
        items,
        selectedRackIds: new SvelteSet(["rack-1"]),
        message: null,
      },
    });

    const [bayCheckbox] = screen.getAllByRole("checkbox");
    expect(bayCheckbox).toBePartiallyChecked();
  });

  it("requests the next complete selection state for an item", async () => {
    const onitemtoggle = vi.fn();
    render(ExportRackSelection, {
      props: {
        items,
        selectedRackIds: new SvelteSet<string>(),
        message: null,
        onitemtoggle,
      },
    });

    await fireEvent.click(screen.getAllByRole("checkbox")[0]!);

    expect(onitemtoggle).toHaveBeenCalledWith(items[0], true);
  });

  it("disables select all when every item is selected and renders its message", () => {
    render(ExportRackSelection, {
      props: {
        items,
        selectedRackIds: new SvelteSet(["rack-1", "rack-2", "rack-3"]),
        message: "3 racks selected",
      },
    });

    expect(screen.getByRole("button", { name: "Select All" })).toBeDisabled();
    expect(screen.getByText("3 racks selected")).toBeVisible();
  });
});
