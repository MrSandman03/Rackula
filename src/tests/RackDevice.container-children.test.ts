import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";
import Rack from "$lib/components/Rack.svelte";
import RackDevice from "$lib/components/RackDevice.svelte";
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

function renderOccupiedRackDevice(
  onselect = vi.fn(),
  oncontextmenuopen = vi.fn(),
) {
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

  render(RackDevice, {
    props: {
      device: carrierType,
      position: carrier.position,
      rackHeight: 8,
      rackId: "rack-1",
      deviceIndex: 0,
      selected: false,
      uHeight: 22,
      rackWidth: 220,
      placedDeviceName: carrier.name,
      placedDeviceId: carrier.id,
      deviceLibrary: [carrierType, childType],
      containerChildDevices: [{ placedDevice: child, originalIndex: 1 }],
      onselect,
      oncontextmenuopen,
    },
  });

  return {
    carrierButton: screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    }),
    childButton: screen.getByRole("button", {
      name: /UCG-Max, 0\.5U network, mounted in UCG Tray/,
    }),
    onselect,
    oncontextmenuopen,
  };
}

describe("RackDevice container children", () => {
  it("exposes the carrier and child as sibling button controls", () => {
    const { childButton } = renderOccupiedCarrier();
    const carrierGroup = screen.getByRole("group", {
      name: "UCG Tray carrier assembly",
    });
    const carrierButton = screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    });

    expect(carrierGroup).toContainElement(carrierButton);
    expect(carrierGroup).toContainElement(childButton);
    expect(carrierButton).not.toContainElement(childButton);
  });

  it("selects the carrier from an accessibility-style click", async () => {
    const { onselect } = renderOccupiedCarrier();
    const carrierButton = screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    });

    await fireEvent.click(carrierButton, { detail: 0 });

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail.deviceId).toBe("carrier-1");
  });

  it.each(["Enter", " "])("selects the carrier with %j", async (key) => {
    const { onselect } = renderOccupiedCarrier();
    const carrierButton = screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    });

    await fireEvent.keyDown(carrierButton, { key });

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail.deviceId).toBe("carrier-1");
  });

  it("emits selection once for a pointer tap followed by click", async () => {
    const { onselect } = renderOccupiedCarrier();
    const carrierButton = screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    });
    const pointer = {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    };

    carrierButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    carrierButton.dispatchEvent(new PointerEvent("pointerup", pointer));
    await fireEvent.click(carrierButton, { detail: 1 });

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail.deviceId).toBe("carrier-1");
  });

  it("does not select the carrier when the pointer gesture becomes a drag", async () => {
    const { onselect } = renderOccupiedCarrier();
    const carrierButton = screen.getByRole("button", {
      name: /Test Carrier, 1U shelf at U1/,
    });
    const pointer = {
      bubbles: true,
      isPrimary: true,
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    };

    carrierButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    carrierButton.dispatchEvent(
      new PointerEvent("pointermove", { ...pointer, clientX: 40 }),
    );
    carrierButton.dispatchEvent(
      new PointerEvent("pointerup", { ...pointer, clientX: 40 }),
    );
    await fireEvent.click(carrierButton, { detail: 1 });

    expect(onselect).not.toHaveBeenCalled();
  });

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

  it("emits child drag events with the original rack index", () => {
    const { childButton, onselect } = renderOccupiedCarrier();
    const moves: CustomEvent[] = [];
    const ends: CustomEvent[] = [];
    const onMove = (event: Event) => moves.push(event as CustomEvent);
    const onEnd = (event: Event) => ends.push(event as CustomEvent);
    document.addEventListener("rackula:dragmove", onMove);
    document.addEventListener("rackula:dragend", onEnd);
    const pointer = {
      bubbles: true,
      isPrimary: true,
      pointerId: 7,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
    };

    childButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    childButton.dispatchEvent(
      new PointerEvent("pointermove", { ...pointer, clientX: 40 }),
    );
    childButton.dispatchEvent(
      new PointerEvent("pointerup", { ...pointer, clientX: 40 }),
    );

    document.removeEventListener("rackula:dragmove", onMove);
    document.removeEventListener("rackula:dragend", onEnd);
    expect(moves.at(-1)?.detail).toMatchObject({
      rackId: expect.any(String),
      deviceIndex: 1,
      device: expect.objectContaining({ slug: childType.slug }),
    });
    expect(ends.at(-1)?.detail.deviceIndex).toBe(1);
    expect(onselect).not.toHaveBeenCalled();
  });

  it("selects a child once for a pointer tap followed by a physical click", async () => {
    const { childButton, onselect } = renderOccupiedCarrier();
    const pointer = {
      bubbles: true,
      isPrimary: true,
      pointerId: 8,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
    };

    childButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    childButton.dispatchEvent(new PointerEvent("pointerup", pointer));
    await fireEvent.click(childButton, { detail: 1 });

    expect(onselect).toHaveBeenCalledOnce();
    expect(onselect.mock.calls[0]?.[0].detail.deviceId).toBe("child-1");
  });

  it("captures and releases child drags on the explicit child rectangle", () => {
    const { childButton, onselect } = renderOccupiedCarrier();
    const childRect = screen.getByTestId("container-child-drag-surface");
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(childRect, {
      setPointerCapture: { value: setPointerCapture, configurable: true },
      releasePointerCapture: {
        value: releasePointerCapture,
        configurable: true,
      },
    });
    const pointer = {
      bubbles: true,
      isPrimary: true,
      pointerId: 9,
      pointerType: "mouse",
      button: 0,
      clientX: 20,
      clientY: 20,
    };

    childButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    childButton.dispatchEvent(new PointerEvent("pointerup", pointer));

    expect(setPointerCapture).toHaveBeenCalledWith(9);
    expect(releasePointerCapture).toHaveBeenCalledWith(9);
    expect(onselect).toHaveBeenCalledOnce();
  });

  it.each(["mouse", "pen"])(
    "ignores a secondary %s pointer without selecting or dragging",
    async (pointerType) => {
      const { childButton, onselect } = renderOccupiedCarrier();
      const onMove = vi.fn();
      document.addEventListener("rackula:dragmove", onMove);
      const pointer = {
        bubbles: true,
        isPrimary: true,
        pointerId: 10,
        pointerType,
        button: 2,
        clientX: 20,
        clientY: 20,
      };

      childButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
      childButton.dispatchEvent(
        new PointerEvent("pointermove", { ...pointer, clientX: 50 }),
      );
      childButton.dispatchEvent(
        new PointerEvent("pointerup", { ...pointer, clientX: 50 }),
      );
      await fireEvent.click(childButton, { button: 2, detail: 0 });

      document.removeEventListener("rackula:dragmove", onMove);
      expect(onMove).not.toHaveBeenCalled();
      expect(onselect).not.toHaveBeenCalled();
    },
  );

  it("routes a child context menu to the child's original rack index", async () => {
    const { childButton, onselect, oncontextmenuopen } =
      renderOccupiedRackDevice();
    const onMove = vi.fn();
    document.addEventListener("rackula:dragmove", onMove);

    await fireEvent.contextMenu(childButton, { clientX: 40, clientY: 50 });

    document.removeEventListener("rackula:dragmove", onMove);
    expect(oncontextmenuopen).toHaveBeenCalledOnce();
    expect(oncontextmenuopen.mock.calls[0]?.[0].detail).toEqual({
      rackId: expect.any(String),
      deviceIndex: 1,
      x: 40,
      y: 50,
    });
    expect(onselect).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("keeps the carrier context menu bound to the assembly index", async () => {
    const { carrierButton, oncontextmenuopen } = renderOccupiedRackDevice();

    await fireEvent.contextMenu(carrierButton, { clientX: 20, clientY: 30 });

    expect(oncontextmenuopen).toHaveBeenCalledOnce();
    expect(oncontextmenuopen.mock.calls[0]?.[0].detail.deviceIndex).toBe(0);
  });

  it("ignores a non-primary child pointer", () => {
    const { childButton, onselect } = renderOccupiedCarrier();
    const pointer = {
      bubbles: true,
      isPrimary: false,
      pointerId: 11,
      pointerType: "touch",
      button: 0,
      clientX: 20,
      clientY: 20,
    };

    childButton.dispatchEvent(new PointerEvent("pointerdown", pointer));
    childButton.dispatchEvent(new PointerEvent("pointerup", pointer));

    expect(onselect).not.toHaveBeenCalled();
  });
});
