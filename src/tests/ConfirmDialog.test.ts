import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";

describe("ConfirmDialog keyboard behavior", () => {
  it("activates focused Cancel on Enter without confirming", async () => {
    const user = userEvent.setup();
    const oncancel = vi.fn();
    const onconfirm = vi.fn();

    render(ConfirmDialog, {
      props: {
        open: true,
        title: "Remove assembly?",
        message: "This also removes mounted devices.",
        oncancel,
        onconfirm,
      },
    });

    const cancel = screen.getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.keyboard("{Enter}");

    expect(oncancel).toHaveBeenCalledOnce();
    expect(onconfirm).not.toHaveBeenCalled();
  });
});
