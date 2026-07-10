/**
 * Container Collision Detection Tests
 *
 * Tests for hierarchical collision rules per Epic #159 Design Principles:
 * - Container devices collide at rack level (they occupy space)
 * - Child devices collide ONLY within their container
 * - Child devices are INVISIBLE to rack-level collision
 */
import { describe, it, expect } from "vitest";
import {
  canPlaceDevice,
  findCollisions,
  findValidDropPositions,
  canPlaceInContainer,
  isContainerChild,
} from "$lib/utils/collision";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  createTestContainerType,
  createTestContainerChild,
} from "./factories";
import { toInternalUnits } from "$lib/utils/position";
import type { PlacedDevice, DeviceType, Rack } from "$lib/types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a rack with a container device and optionally child devices
 */
function createRackWithContainer(
  containerPosition: number,
  children: Partial<PlacedDevice>[] = [],
): { rack: Rack; deviceLibrary: DeviceType[] } {
  const containerType = createTestContainerType({
    slug: "blade-chassis",
    u_height: 4,
  });
  const childType = createTestDeviceType({
    slug: "blade-server",
    u_height: 1,
    slot_width: 1, // Half-width device fits in 0.5 fraction slots
  });

  const containerId = "container-1";
  const containerDevice = createTestDevice({
    id: containerId,
    device_type: "blade-chassis",
    position: containerPosition,
    face: "front",
  });

  const childDevices = children.map((child, idx) =>
    createTestContainerChild({
      id: child.id ?? `child-${idx + 1}`,
      device_type: child.device_type ?? "blade-server",
      container_id: containerId,
      slot_id: child.slot_id ?? "slot-left",
      position: child.position ?? 0,
      face: child.face ?? "front",
    }),
  );

  const rack = createTestRack({
    height: 42,
    devices: [containerDevice, ...childDevices],
  });

  return { rack, deviceLibrary: [containerType, childType] };
}

// =============================================================================
// isContainerChild Tests
// =============================================================================

describe("isContainerChild", () => {
  it("returns true when device has container_id set", () => {
    const child = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
    });
    expect(isContainerChild(child)).toBe(true);
  });

  it("returns false when device has no container_id", () => {
    const rackDevice = createTestDevice({ position: 5 });
    // Verify createTestDevice doesn't set container_id
    expect(rackDevice.container_id).toBeUndefined();
    expect(isContainerChild(rackDevice)).toBe(false);
  });
});

// =============================================================================
// Rack-Level Collision with Container Devices
// =============================================================================

describe("Container devices at rack level", () => {
  it("container devices collide at rack level (existing behavior)", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5);
    // Container is at 5-8 (4U), trying to place at 7 should fail
    expect(canPlaceDevice(rack, deviceLibrary, 2, toInternalUnits(7))).toBe(
      false,
    );
  });

  it("container devices block adjacent rack-level placements correctly", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5);
    // Container is at 5-8 (4U), position 9 should be free
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(9))).toBe(
      true,
    );
    // Position 4 should also be free
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(4))).toBe(
      true,
    );
  });

  it("rack-level devices still block container placement", () => {
    const serverType = createTestDeviceType({ slug: "server-1u", u_height: 1 });
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const rack = createTestRack({
      height: 42,
      devices: [
        createTestDevice({
          device_type: "server-1u",
          position: 10,
        }),
      ],
    });

    // Container at 8-11 would overlap with server at 10
    expect(
      canPlaceDevice(rack, [serverType, containerType], 4, toInternalUnits(8)),
    ).toBe(false);
  });

  it("rejects opposite-face placements whose known depths exceed rack depth", () => {
    const frontType: DeviceType = {
      ...createTestDeviceType({
        slug: "front-device",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 160, height: 44 },
        },
      },
    };
    const rearType: DeviceType = {
      ...createTestDeviceType({
        slug: "rear-device",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 120, height: 44 },
        },
      },
    };
    const rack = createTestRack({
      height: 8,
      depth_mm: 260,
      devices: [
        createTestDevice({
          id: "front-1",
          device_type: "front-device",
          position: 3,
          face: "front",
        }),
      ],
    });

    expect(
      canPlaceDevice(
        rack,
        [frontType, rearType],
        rearType.u_height,
        toInternalUnits(3),
        undefined,
        "rear",
        undefined,
        rearType,
      ),
    ).toBe(false);
  });

  it("rejects a single device deeper than the rack", () => {
    const deepType: DeviceType = {
      ...createTestDeviceType({
        slug: "deep-device",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 300, height: 44 },
        },
      },
    };
    const rack = createTestRack({ height: 8, depth_mm: 260, devices: [] });

    expect(
      canPlaceDevice(
        rack,
        [deepType],
        deepType.u_height,
        toInternalUnits(3),
        undefined,
        "front",
        undefined,
        deepType,
      ),
    ).toBe(false);
  });

  it("uses mounted child depth when checking an existing tray assembly", () => {
    const trayType = createTestContainerType({
      slug: "open-tray",
      u_height: 1,
      is_full_depth: false,
    });
    const childType: DeviceType = {
      ...createTestDeviceType({
        slug: "deep-child",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 120, depth: 200, height: 40 },
        },
      },
    };
    const rearType: DeviceType = {
      ...createTestDeviceType({
        slug: "rear-device",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 120, depth: 70, height: 40 },
        },
      },
    };
    const rack = createTestRack({
      height: 8,
      depth_mm: 260,
      devices: [
        createTestDevice({
          id: "tray-1",
          device_type: "open-tray",
          position: 3,
          face: "front",
        }),
        createTestContainerChild({
          id: "child-1",
          device_type: "deep-child",
          container_id: "tray-1",
          slot_id: "slot-left",
          position: 0,
          face: "front",
        }),
      ],
    });

    expect(
      canPlaceDevice(
        rack,
        [trayType, childType, rearType],
        rearType.u_height,
        toInternalUnits(3),
        undefined,
        "rear",
        undefined,
        rearType,
      ),
    ).toBe(false);
  });

  it("uses mounted child depth when moving a tray assembly", () => {
    const trayType = createTestContainerType({
      slug: "open-tray",
      u_height: 1,
      is_full_depth: false,
    });
    const childType: DeviceType = {
      ...createTestDeviceType({
        slug: "too-deep-child",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 120, depth: 300, height: 40 },
        },
      },
    };
    const rack = createTestRack({
      height: 8,
      depth_mm: 260,
      devices: [
        createTestDevice({
          id: "tray-1",
          device_type: "open-tray",
          position: 3,
          face: "front",
        }),
        createTestContainerChild({
          id: "child-1",
          device_type: "too-deep-child",
          container_id: "tray-1",
          slot_id: "slot-left",
          position: 0,
          face: "front",
        }),
      ],
    });

    expect(
      canPlaceDevice(
        rack,
        [trayType, childType],
        trayType.u_height,
        toInternalUnits(4),
        0,
        "front",
        undefined,
        trayType,
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Child Devices Excluded from Rack-Level Collision
// =============================================================================

describe("Child devices excluded from rack-level collision", () => {
  it("child devices do not block rack-level placements", () => {
    // Container at position 5-8, with a child at position 0 in slot-left
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Even though child exists, rack-level placement should work at position 10
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(10))).toBe(
      true,
    );
  });

  it("rack-level device does not collide with child device at same U", () => {
    // Container at 5-8, child inside at relative position 0
    // The child occupies physical U=5 within the container
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Placing at position 5 still blocked by container, not by child
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(5))).toBe(
      false,
    );

    // But position 10 is valid - child doesn't block it
    expect(canPlaceDevice(rack, deviceLibrary, 1, toInternalUnits(10))).toBe(
      true,
    );
  });

  it("findCollisions does not include child devices", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    // Collisions at position 5 should only include the container, not the child
    const collisions = findCollisions(
      rack,
      deviceLibrary,
      1,
      toInternalUnits(5),
    );
    // eslint-disable-next-line no-restricted-syntax -- Testing collision count (exactly 1: the container)
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.container_id).toBeUndefined(); // It's the container, not a child
  });

  it("findValidDropPositions excludes container space but ignores children", () => {
    const { rack, deviceLibrary } = createRackWithContainer(5, [
      { position: 0, slot_id: "slot-left" },
    ]);

    const validPositions = findValidDropPositions(rack, deviceLibrary, 1);

    // Container occupies 5-8, so those positions should be excluded (in internal units)
    expect(validPositions).not.toContain(toInternalUnits(5));
    expect(validPositions).not.toContain(toInternalUnits(6));
    expect(validPositions).not.toContain(toInternalUnits(7));
    expect(validPositions).not.toContain(toInternalUnits(8));

    // Positions 1-4 and 9-42 should be valid (for 1U device, in internal units)
    expect(validPositions).toContain(toInternalUnits(1));
    expect(validPositions).toContain(toInternalUnits(4));
    expect(validPositions).toContain(toInternalUnits(9));
  });
});

// =============================================================================
// canPlaceInContainer Function
// =============================================================================

describe("canPlaceInContainer", () => {
  it("rejects nesting a container inside another container", () => {
    const outerType = createTestContainerType({
      slug: "outer-carrier",
      u_height: 2,
    });
    const nestedType = createTestContainerType({
      slug: "nested-carrier",
      u_height: 1,
    });
    const outer = createTestDevice({
      id: "outer",
      device_type: outerType.slug,
      position: 5,
    });
    const rack = createTestRack({ devices: [outer] });

    expect(
      canPlaceInContainer(
        rack,
        [outerType, nestedType],
        outer,
        outerType,
        nestedType,
        "slot-left",
        0,
      ),
    ).toBe(false);
  });

  it("allows placing device in empty container slot", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });
    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(true);
  });

  it("rejects a child incompatible with the rack width", () => {
    const containerType = createTestContainerType({
      slug: "full-width-tray",
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
    });
    const childType = createTestDeviceType({
      slug: "nineteen-inch-child",
      u_height: 1,
      slot_width: 2,
      rack_widths: [19],
      is_full_depth: false,
    });
    const container = createTestDevice({
      id: "container-1",
      device_type: containerType.slug,
      position: toInternalUnits(3),
      face: "front",
    });
    const rack = createTestRack({ width: 10, devices: [container] });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "main",
        0,
      ),
    ).toBe(false);
  });

  it("rejects a physically too-tall full-width child in a 0.5U slot", () => {
    const containerType = createTestContainerType({
      slug: "half-u-full-width-tray",
      u_height: 1,
      is_full_depth: false,
      slots: [
        {
          id: "main",
          position: { row: 0, col: 0 },
          width_fraction: 1,
          height_units: 0.5,
        },
      ],
    });
    const childType: DeviceType = {
      ...createTestDeviceType({
        slug: "tall-half-u-child",
        u_height: 0.5,
        slot_width: 2,
        rack_widths: [10],
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 100, depth: 100, height: 30 },
        },
      },
    };
    const container = createTestDevice({
      id: "container-1",
      device_type: containerType.slug,
      position: toInternalUnits(3),
      face: "front",
    });
    const rack = createTestRack({ width: 10, devices: [container] });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "main",
        0,
      ),
    ).toBe(false);
  });

  it("rejects a child deeper than the rack", () => {
    const containerType = createTestContainerType({
      slug: "full-width-tray",
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
    });
    const childType: DeviceType = {
      ...createTestDeviceType({
        slug: "deep-child",
        u_height: 1,
        slot_width: 2,
        rack_widths: [10],
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 300, height: 40 },
        },
      },
    };
    const container = createTestDevice({
      id: "container-1",
      device_type: containerType.slug,
      position: toInternalUnits(3),
      face: "front",
    });
    const rack = createTestRack({
      width: 10,
      depth_mm: 260,
      devices: [container],
    });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "main",
        0,
      ),
    ).toBe(false);
  });

  it("rejects a child whose assembly conflicts with opposing rear depth", () => {
    const containerType = createTestContainerType({
      slug: "front-tray",
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
    });
    const childType: DeviceType = {
      ...createTestDeviceType({
        slug: "front-child",
        u_height: 1,
        slot_width: 2,
        rack_widths: [10],
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 200, height: 40 },
        },
      },
    };
    const rearType: DeviceType = {
      ...createTestDeviceType({
        slug: "rear-device",
        u_height: 1,
        rack_widths: [10],
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 200, depth: 70, height: 40 },
        },
      },
    };
    const container = createTestDevice({
      id: "container-1",
      device_type: containerType.slug,
      position: toInternalUnits(3),
      face: "front",
    });
    const rear = createTestDevice({
      id: "rear-1",
      device_type: rearType.slug,
      position: toInternalUnits(3),
      face: "rear",
    });
    const rack = createTestRack({
      width: 10,
      depth_mm: 260,
      devices: [container, rear],
    });

    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType, rearType],
        container,
        containerType,
        childType,
        "main",
        0,
      ),
    ).toBe(false);
  });

  it("allows moving a child device to same position (excludeDeviceId)", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      id: "child-to-move",
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Without excludeDeviceId, placement at same position should be blocked
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);

    // With excludeDeviceId, moving the same device to its current position should succeed
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
        "child-to-move", // Exclude the device being moved
      ),
    ).toBe(true);
  });

  it("blocks placement when slot is occupied by another child", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Same slot and position should be blocked
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);
  });

  it("allows placement in different slot at same position", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // slot-right at same position 0 should be allowed (different slot = no collision)
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-right",
        0,
      ),
    ).toBe(true);
  });

  it("blocks placement when position exceeds container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4, // Container is 4U tall
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // Position 4 would put 1U device at relative position 4, which is at U 5+4=9
    // Container only spans U 5-8, so position 4 is out of bounds
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        4, // position 4 is out of bounds for 4U container with 1U device
      ),
    ).toBe(false);
  });

  it("allows maximum valid position within container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // Position 3 is valid for 1U device in 4U container (positions 0-3)
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        3,
      ),
    ).toBe(true);
  });

  it("blocks multi-U child device that would exceed container height", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server-2u",
      u_height: 2,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const rack = createTestRack({ devices: [container] });

    // 2U device at position 3 would need positions 3-4, but container only has 0-3
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        3,
      ),
    ).toBe(false);
  });
});
