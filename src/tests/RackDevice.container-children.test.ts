import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Rack from "$lib/components/Rack.svelte";
import type { DeviceType } from "$lib/types";
import {
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";

const carrierType: DeviceType = {
  ...createTestDeviceType({
    slug: "test-carrier",
    model: "Test Carrier",
    category: "shelf",
    u_height: 1,
  }),
  slots: [
    {
      id: "main",
      name: "Main",
      position: { row: 0, col: 0 },
      width_fraction: 1,
      height_units: 1,
    },
  ],
};

const childType = createTestDeviceType({
  slug: "test-child",
  model: "UCG-Max",
  category: "network",
  u_height: 0.5,
});

function renderOccupiedCarrier(onselect = vi.fn()) {
  const carrier = createTestDevice({
    id: "carrier-1",
    device_type: carrierType.slug,
    name: "UCG Tray",
    position: 1,
  });
  const child = createTestDevice({
    id: "child-1",
    device_type: childType.slug,
    name: "UCG-Max",
    position: 0,
    container_id: carrier.id,
    slot_id: "main",
  });

  render(Rack, {
    props: {
      rack: createTestRack({
        height: 8,
        width: 10,
        devices: [carrier, child],
      }),
      deviceLibrary: [carrierType, childType],
      selected: false,
      faceFilter: "front",
      ondeviceselect: onselect,
    },
  });

  return {
    childButton: screen.getByRole("button", {
      name: /UCG-Max, 0\.5U network, mounted in UCG Tray/,
    }),
    onselect,
  };
}

describe("RackDevice container children", () => {
  it("selects a child by pointer and suppresses the occupied carrier label", async () => {
    const { childButton, onselect } = renderOccupiedCarrier();

    expect(screen.queryByText("UCG Tray")).not.toBeInTheDocument();
    await fireEvent.click(childButton);

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail).toEqual({
      deviceId: "child-1",
      slug: "test-child",
      position: 0,
      face: "front",
    });
  });

  it.each(["Enter", " "])("selects a child with %j", async (key) => {
    const { childButton, onselect } = renderOccupiedCarrier();

    await fireEvent.keyDown(childButton, { key });

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail.deviceId).toBe("child-1");
  });
});
