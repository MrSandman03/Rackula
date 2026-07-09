import { describe, expect, it } from "vitest";
import { buildCollisionMessage } from "$lib/utils/rack-drop-coordinator";
import {
  createTestDevice,
  createTestDeviceType,
  createTestRack,
} from "./factories";

describe("buildCollisionMessage", () => {
  it("names a depth blocker using human U input and the target device type", () => {
    const frontType = {
      ...createTestDeviceType({
        slug: "front-device",
        model: "Front Appliance",
        u_height: 1,
        is_full_depth: false,
      }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 120, depth: 200, height: 40 },
        },
      },
    };
    const rearType = {
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
          device_type: frontType.slug,
          position: 3,
          face: "front",
        }),
      ],
    });

    expect(
      buildCollisionMessage(
        "blocked",
        rack,
        [frontType, rearType],
        rearType.u_height,
        3,
        undefined,
        "rear",
        rearType,
      ),
    ).toBe("Position blocked by Front Appliance");
  });

  it("explains a physical-fit block when no placed device is responsible", () => {
    const deepType = {
      ...createTestDeviceType({ slug: "deep-device", u_height: 1 }),
      custom_fields: {
        rackula_fit: {
          dimensions_mm: { width: 120, depth: 300, height: 40 },
        },
      },
    };
    const rack = createTestRack({ height: 8, width: 10, depth_mm: 260 });

    expect(
      buildCollisionMessage(
        "blocked",
        rack,
        [deepType],
        deepType.u_height,
        1,
        undefined,
        "front",
        deepType,
      ),
    ).toBe("Device doesn't fit this rack's width or depth");
  });
});
