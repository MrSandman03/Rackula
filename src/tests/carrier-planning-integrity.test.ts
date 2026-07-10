import { describe, expect, it } from "vitest";
import type { DeviceType, Rack } from "$lib/types";
import {
  canDeviceFitRackEnvelope,
  resolveSynthesizedCarrierPlacement,
} from "$lib/utils/collision";
import {
  keyboardPlacementPreview,
  validStartPositions,
} from "$lib/utils/placement-keyboard";
import {
  detectContainerDropTarget,
  detectContainerHover,
} from "$lib/utils/dragdrop";
import { toInternalUnits } from "$lib/utils/position";
import {
  resolveDropTarget,
  type RackDimensions,
} from "$lib/utils/rack-drop-coordinator";
import { getLayoutStore, resetLayoutStore } from "$lib/stores/layout.svelte";
import {
  createTestContainerType,
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";

function withDimensions(
  device: DeviceType,
  dimensions: { width?: number; depth?: number; height?: number },
): DeviceType {
  return {
    ...device,
    custom_fields: { rackula_fit: { dimensions_mm: dimensions } },
  };
}

describe("carrier placement planning integrity", () => {
  it("rejects a nested container in the synthesized store/preview/keyboard plan", () => {
    const nestedChild = createTestContainerType({
      slug: "nested-child",
      u_height: 1,
      slot_width: 1,
    });
    const carrier = createTestContainerType({
      slug: "carrier",
      u_height: 1,
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 1,
        },
      ],
    });
    const rack = createTestRack({ height: 8, devices: [] });

    expect(
      resolveSynthesizedCarrierPlacement(
        rack,
        [nestedChild, carrier],
        nestedChild,
        carrier,
        toInternalUnits(1),
      ),
    ).toBeNull();
  });

  it("shares rack width tolerance and assembly depth envelope checks", () => {
    const rack = createTestRack({ width: 10, depth_mm: 300 });
    const exactTolerance = withDimensions(
      createTestDeviceType({ slug: "exact", rack_widths: [10] }),
      { width: 254.5, depth: 300 },
    );
    const overTolerance = withDimensions(
      createTestDeviceType({ slug: "wide", rack_widths: [10] }),
      { width: 254.51, depth: 250 },
    );

    expect(canDeviceFitRackEnvelope(rack, exactTolerance)).toBe(true);
    expect(canDeviceFitRackEnvelope(rack, overTolerance)).toBe(false);
    expect(canDeviceFitRackEnvelope(rack, exactTolerance, 300)).toBe(true);
    expect(canDeviceFitRackEnvelope(rack, exactTolerance, 300.01)).toBe(false);
  });

  it("includes a compatible existing chassis and previews its full height", () => {
    const chassis = createTestContainerType({
      slug: "chassis",
      u_height: 4,
      slots: [
        {
          id: "bay",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
          height_units: 4,
        },
      ],
    });
    const blade: DeviceType = {
      ...createTestDeviceType({
        slug: "blade",
        u_height: 2,
        slot_width: 1,
      }),
      subdevice_role: "child",
    };
    const placedChassis = createTestDevice({
      id: "chassis-1",
      device_type: chassis.slug,
      position: 3,
      face: "both",
    });
    const rack = createTestRack({
      height: 12,
      devices: [placedChassis],
    });

    expect(validStartPositions(rack, [chassis, blade], blade)).toEqual([3]);
    expect(keyboardPlacementPreview(rack, [chassis, blade], blade, 3)).toEqual({
      height: 4,
      feedback: "valid",
    });
  });

  it("marks a hovered carrier invalid when child depth breaks opposing-face clearance", () => {
    const carrier = withDimensions(
      createTestContainerType({
        slug: "front-carrier",
        u_height: 1,
        is_full_depth: false,
        slots: [
          {
            id: "main",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 1,
          },
        ],
      }),
      { depth: 100 },
    );
    const rearDevice = withDimensions(
      createTestDeviceType({
        slug: "rear-device",
        u_height: 1,
        is_full_depth: false,
      }),
      { depth: 60 },
    );
    const deepChild = withDimensions(
      createTestDeviceType({
        slug: "deep-child",
        u_height: 1,
        is_full_depth: false,
      }),
      { depth: 150 },
    );
    const rack: Rack = createTestRack({
      height: 12,
      depth_mm: 200,
      devices: [
        createTestDevice({
          id: "carrier-1",
          device_type: carrier.slug,
          position: 5,
          face: "front",
        }),
        createTestDevice({
          id: "rear-1",
          device_type: rearDevice.slug,
          position: 5,
          face: "rear",
        }),
      ],
    });
    const library = [carrier, rearDevice, deepChild];

    expect(
      detectContainerDropTarget(
        rack,
        library,
        deepChild,
        170,
        80,
        220,
        12,
        22,
        "front",
      ),
    ).toBeNull();
    expect(
      detectContainerHover(
        rack,
        library,
        deepChild,
        170,
        80,
        220,
        12,
        22,
        "front",
      ),
    ).toMatchObject({ containerId: "carrier-1", isValidTarget: false });
  });

  it("previews a rail detach after removing the last-child auto carrier", () => {
    const carrier = withDimensions(
      createTestContainerType({
        slug: "deep-auto-carrier",
        u_height: 1,
        is_full_depth: false,
        slots: [
          {
            id: "full",
            position: { row: 0, col: 0 },
            width_fraction: 1,
            height_units: 1,
          },
        ],
      }),
      { depth: 120 },
    );
    const child = withDimensions(
      createTestDeviceType({
        slug: "deep-rail-child",
        u_height: 1,
        slot_width: 2,
        is_full_depth: false,
      }),
      { depth: 150 },
    );
    const placedCarrier = createTestDevice({
      id: "auto-carrier-1",
      device_type: carrier.slug,
      position: 4,
      face: "front",
      auto_created: true,
    });
    const placedChild = createTestDevice({
      id: "moving-child-1",
      device_type: child.slug,
      position: 0,
      face: "front",
      container_id: placedCarrier.id,
      slot_id: "full",
    });
    const rack = createTestRack({
      height: 12,
      depth_mm: 200,
      devices: [placedCarrier, placedChild],
    });
    const dimensions: RackDimensions = {
      rackHeight: 12,
      rackWidth: 220,
      interiorWidth: 186,
      uHeight: 22,
      rackPadding: 0,
      railWidth: 17,
    };
    const svg = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 220,
        height: 264,
      }),
      viewBox: { baseVal: { x: 0, y: 0, width: 220, height: 264 } },
    } as unknown as SVGSVGElement;

    expect(
      resolveDropTarget(
        { svgElement: svg, clientX: 100, clientY: 180 },
        dimensions,
        rack,
        [carrier, child],
        child,
        "rear",
        1,
      ),
    ).toMatchObject({
      feedback: "valid",
      targetU: 4,
      dropPreview: { position: 4, height: 1, feedback: "valid" },
    });
  });

  it("anchors a multi-U chassis tap at its bottom and commits into that chassis", () => {
    resetLayoutStore();
    const store = getLayoutStore();
    const chassis = createTestContainerType({
      slug: "multi-u-chassis",
      u_height: 4,
      slots: [
        {
          id: "bay",
          position: { row: 0, col: 0 },
          width_fraction: 0.5,
          height_units: 4,
        },
      ],
    });
    const blade: DeviceType = {
      ...createTestDeviceType({
        slug: "multi-u-blade",
        u_height: 2,
        slot_width: 1,
      }),
      subdevice_role: "child",
    };
    store.addDeviceTypeRaw(chassis);
    store.addDeviceTypeRaw(blade);
    const rack = store.addRack("Rack", 12)!;
    expect(store.placeDevice(rack.id, chassis.slug, 3, "front")).toBe(true);
    const dimensions: RackDimensions = {
      rackHeight: 12,
      rackWidth: 220,
      interiorWidth: 186,
      uHeight: 22,
      rackPadding: 0,
      railWidth: 17,
    };
    const svg = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 220,
        height: 264,
      }),
      viewBox: { baseVal: { x: 0, y: 0, width: 220, height: 264 } },
    } as unknown as SVGSVGElement;

    // y=140 resolves to U6, the upper part of the 4U chassis mounted at U3.
    const result = resolveDropTarget(
      { svgElement: svg, clientX: 100, clientY: 140 },
      dimensions,
      store.rack,
      store.device_types,
      blade,
      "front",
    );

    expect(result).toMatchObject({
      feedback: "valid",
      targetU: 3,
      dropPreview: { position: 3, height: 4, feedback: "valid" },
    });
    expect(
      store.placeDeviceSmart(rack.id, blade.slug, result.targetU, "front"),
    ).toBe(true);
    const placedChassis = store.rack.devices.find(
      (device) => device.device_type === chassis.slug,
    )!;
    expect(
      store.rack.devices.find((device) => device.device_type === blade.slug)
        ?.container_id,
    ).toBe(placedChassis.id);
  });
});
