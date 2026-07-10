/**
 * Container Child Collision Detection Tests
 *
 * Tests for child-device collision rules within hierarchical containers.
 */
import { describe, it, expect } from "vitest";
import { canPlaceInContainer } from "$lib/utils/collision";
import {
  createTestRack,
  createTestDeviceType,
  createTestDevice,
  createTestContainerType,
  createTestContainerChild,
} from "./factories";
import { findStarterDevice } from "$lib/data/starterLibrary";

// =============================================================================
// Children Collide Only with Siblings in Same Container
// =============================================================================

describe("Children collide only with siblings in same container", () => {
  it("children in different containers never collide", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    const container1 = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    const container2 = createTestDevice({
      id: "container-2",
      device_type: "blade-chassis",
      position: 15,
    });
    const child1 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({
      devices: [container1, container2, child1],
    });

    // Placing a child in container-2 should work regardless of child1 in container-1
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container2,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(true);
  });

  it("children in same container and slot collide at overlapping positions", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 2,
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
      position: 0, // 2U at 0-1
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Position 1 would overlap with existing child at 0-1
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        1,
      ),
    ).toBe(false);
  });
});

// =============================================================================
// Face Inheritance
// =============================================================================

describe("Face inheritance for container children", () => {
  it("placement succeeds when container is on rear face", () => {
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1, // Half-width device fits in 0.5 fraction slots
    });

    // Container on rear face
    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
      face: "rear",
    });
    const rack = createTestRack({ devices: [container] });

    // Placing in container should succeed - child inherits rear face
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
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Container collision edge cases", () => {
  it("empty container does not affect child placement", () => {
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

    // All positions 0-3 should be valid in empty container
    for (let pos = 0; pos < 4; pos++) {
      expect(
        canPlaceInContainer(
          rack,
          [containerType, childType],
          container,
          containerType,
          childType,
          "slot-left",
          pos,
        ),
      ).toBe(true);
    }
  });

  it("multiple children in same container, different slots", () => {
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
    const child1 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: "blade-server",
    });
    const child2 = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-right",
      position: 0,
      device_type: "blade-server",
    });
    const rack = createTestRack({ devices: [container, child1, child2] });

    // Position 0 in slot-left is occupied
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

    // Position 0 in slot-right is also occupied
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
    ).toBe(false);

    // Position 1 in slot-left should be free
    expect(
      canPlaceInContainer(
        rack,
        [containerType, childType],
        container,
        containerType,
        childType,
        "slot-left",
        1,
      ),
    ).toBe(true);
  });
});

// =============================================================================
// Sibling Types Resolvable Only Outside the Layout Library (Issue #2131)
// =============================================================================

describe("Sibling collision when sibling type is not in the passed library", () => {
  it("detects overlap with a sibling whose type is only resolvable globally", () => {
    // Sibling references a starter-pack slug that is NOT embedded in the
    // device library passed to canPlaceInContainer. This mirrors a loaded
    // layout whose children reference starter/brand-pack types by slug only.
    const starterSlug = "2u-server";
    const starterDevice = findStarterDevice(starterSlug);
    // Guard the scenario premise: starter device exists and is 2U.
    expect(starterDevice?.u_height).toBe(2);

    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    // Existing sibling occupies positions 0-1 (2U starter device).
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: starterSlug,
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    // Library deliberately omits the sibling's starter type, leaving only
    // the container type and the new child type.
    const deviceLibrary = [containerType, childType];

    // Placing a 1U child at position 1 overlaps the sibling's 0-1 range.
    expect(
      canPlaceInContainer(
        rack,
        deviceLibrary,
        container,
        containerType,
        childType,
        "slot-left",
        1,
      ),
    ).toBe(false);
  });

  it("allows non-overlapping placement next to a globally-resolved sibling", () => {
    const starterSlug = "2u-server";
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1,
    });

    const container = createTestDevice({
      id: "container-1",
      device_type: "blade-chassis",
      position: 5,
    });
    // Sibling occupies positions 0-1.
    const existingChild = createTestContainerChild({
      container_id: "container-1",
      slot_id: "slot-left",
      position: 0,
      device_type: starterSlug,
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    const deviceLibrary = [containerType, childType];

    // Position 2 is clear of the sibling's 0-1 range and within the 4U container.
    expect(
      canPlaceInContainer(
        rack,
        deviceLibrary,
        container,
        containerType,
        childType,
        "slot-left",
        2,
      ),
    ).toBe(true);
  });

  it("blocks placement when a sibling type cannot be resolved anywhere", () => {
    // Fail-closed: an unresolvable sibling type must not silently allow overlap.
    const containerType = createTestContainerType({
      slug: "blade-chassis",
      u_height: 4,
    });
    const childType = createTestDeviceType({
      slug: "blade-server",
      u_height: 1,
      slot_width: 1,
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
      device_type: "totally-unknown-type",
    });
    const rack = createTestRack({ devices: [container, existingChild] });

    const deviceLibrary = [containerType, childType];

    expect(
      canPlaceInContainer(
        rack,
        deviceLibrary,
        container,
        containerType,
        childType,
        "slot-left",
        0,
      ),
    ).toBe(false);
  });
});
