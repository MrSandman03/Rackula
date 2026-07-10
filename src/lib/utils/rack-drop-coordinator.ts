/**
 * Rack Drop Coordinator
 * Consolidates the drag-drop calculation pipeline used by native DnD,
 * custom pointer events (Safari workaround), and mobile touch-to-place.
 */

import type { Rack, DeviceType, DeviceFace, PlacedDevice } from "$lib/types";
import {
  calculateDropPosition,
  getDropFeedback,
  detectContainerDropTarget,
  detectContainerHover,
  type DragData,
  type DropFeedback,
  type ContainerHoverInfo,
  type ContainerDropTarget,
} from "$lib/utils/dragdrop";
import {
  allowsFractionalRailPosition,
  canMoveRackAssemblyToRack,
  findCollisions,
  getProspectiveRackAfterDeviceMove,
  resolveSynthesizedCarrierPlacement,
  synthesizeCarrierForDevice,
  requiresChassisBay,
} from "$lib/utils/collision";
import { findDeviceType } from "$lib/utils/device-lookup";
import { getDeviceDisplayName } from "$lib/utils/device";
import { screenToSVG } from "$lib/utils/coordinates";
import { getMountRecommendation } from "$lib/utils/mount-recommendations";
import { toHumanUnits, toInternalUnits } from "$lib/utils/position";

/** Pixel-based measurements of a rack, used by the drop calculation pipeline. */
export interface RackDimensions {
  rackHeight: number;
  rackWidth: number;
  interiorWidth: number;
  uHeight: number;
  rackPadding: number;
  railWidth: number;
}

/** SVG element and client coordinates for a drop or drag-over event. */
export interface DropCoordinateInput {
  svgElement: SVGSVGElement;
  clientX: number;
  clientY: number;
}

/** Visual preview state for the drop target overlay rendered in the rack SVG. */
export interface DropPreview {
  position: number;
  height: number;
  feedback: DropFeedback;
}

/** Full result from drop target resolution, including preview and container hover state. */
export interface DropTargetResult {
  targetU: number;
  xOffsetInRack: number;
  feedback: DropFeedback;
  containerHoverInfo: ContainerHoverInfo | null;
  dropPreview: DropPreview;
}

/** Source assembly details needed to validate a cross-rack preview. */
export interface RackAssemblyDragSource {
  rack: Rack;
  deviceIndex: number;
}

/**
 * Discriminated union describing the resolved action for a drop event.
 * - `internal-move`: device moved within the same rack
 * - `cross-rack-move`: device moved between racks
 * - `palette-drop`: new device placed from the palette
 * - `container-drop`: device placed into a container slot
 * - `invalid`: drop blocked by collision or out-of-bounds
 */
export type DropAction =
  | {
      kind: "internal-move";
      rackId: string;
      deviceIndex: number;
      targetU: number;
    }
  | {
      kind: "cross-rack-move";
      sourceRackId: string;
      sourceIndex: number;
      targetRackId: string;
      targetU: number;
      face: DeviceFace;
    }
  | {
      kind: "palette-drop";
      rackId: string;
      slug: string;
      targetU: number;
    }
  | {
      kind: "container-drop";
      rackId: string;
      containerTarget: ContainerDropTarget;
      slug: string;
      dragData: DragData;
    }
  | {
      kind: "carrier-drop";
      rackId: string;
      slug: string;
      targetU: number;
      face: DeviceFace;
      dragData: DragData;
    }
  | {
      kind: "invalid";
      feedback: DropFeedback;
      targetU: number;
      deviceHeight: number;
      excludeIndex?: number;
      deviceType?: DeviceType;
      /**
       * Explicit user-facing message that overrides the collision-derived one.
       * Set for the honest "requires a chassis" case (a chassis child dropped on
       * bare rails), which has no colliding device to name.
       */
      message?: string;
    };

/**
 * Convert screen coordinates to SVG-relative position data used by the drop pipeline.
 */
function resolveCoordinates(
  coords: DropCoordinateInput,
  dims: RackDimensions,
): {
  mouseY: number;
  xOffsetInRack: number;
  svgCoords: { x: number; y: number };
} {
  const svgCoords = screenToSVG(
    coords.svgElement,
    coords.clientX,
    coords.clientY,
  );
  const mouseY = svgCoords.y - dims.rackPadding;
  const xOffsetInRack = svgCoords.x - dims.railWidth;
  return { mouseY, xOffsetInRack, svgCoords };
}

function calculateRailDropPosition(
  mouseY: number,
  dims: RackDimensions,
  rack: Rack,
  device: DeviceType,
): number {
  if (!allowsFractionalRailPosition(device, rack.width)) {
    return calculateDropPosition(
      mouseY,
      dims.rackHeight,
      dims.uHeight,
      dims.rackPadding,
    );
  }

  const stepU = device.u_height;
  const segmentHeight = dims.uHeight * stepU;
  const totalHeight = dims.rackHeight * dims.uHeight;
  const clampedY = Math.max(0, Math.min(mouseY, totalHeight - 1));
  const segmentFromTop = Math.floor(clampedY / segmentHeight);
  const targetU = dims.rackHeight - (segmentFromTop + 1) * stepU + 1;
  const maxBottomU = dims.rackHeight - device.u_height + 1;
  return Math.max(1, Math.min(targetU, maxBottomU));
}

/**
 * Derive the exclude index for collision checks.
 * Internal moves exclude the source device; all other operations don't.
 */
export function deriveExcludeIndex(
  dragSource: DragData,
  targetRackId: string,
): number | undefined {
  if (
    dragSource.type === "rack-device" &&
    dragSource.sourceRackId === targetRackId &&
    dragSource.sourceIndex !== undefined
  ) {
    return dragSource.sourceIndex;
  }
  return undefined;
}

/**
 * Unified drop-target resolution pipeline.
 * Called by handleDragOver, handleDragMove, and handleTouchEnd to calculate
 * preview position and feedback.
 */
export function resolveDropTarget(
  coords: DropCoordinateInput,
  dims: RackDimensions,
  rack: Rack,
  deviceLibrary: DeviceType[],
  device: DeviceType,
  faceFilter: DeviceFace | undefined,
  excludeIndex?: number,
  assemblySource?: RackAssemblyDragSource,
): DropTargetResult {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);
  const excludeDeviceId =
    excludeIndex === undefined ? undefined : rack.devices[excludeIndex]?.id;
  const movingDevice =
    excludeIndex === undefined ? undefined : rack.devices[excludeIndex];
  const railValidationRack =
    movingDevice?.container_id && excludeDeviceId
      ? getProspectiveRackAfterDeviceMove(rack, excludeDeviceId)
      : rack;
  const railExcludeIndex =
    railValidationRack === rack ? excludeIndex : undefined;

  let targetU = calculateRailDropPosition(mouseY, dims, rack, device);

  const containerHover = detectContainerHover(
    rack,
    deviceLibrary,
    device,
    mouseY,
    xOffsetInRack,
    dims.rackWidth,
    dims.rackHeight,
    dims.uHeight,
    faceFilter,
    excludeDeviceId,
  );

  // Carrier-first: a sub-U / half-width device (including a chassis child) never
  // lands on a bare rail. Its preview is valid when an existing container under
  // the cursor has a free, fitting cell (a resolvable bay), or else - for a
  // device that can synthesise its own rail carrier - when that carrier's full
  // footprint would fit at this U. A device that requires a carrier but has none
  // synthesisable (a chassis child) is INVALID on bare rails: it can only go
  // into an existing bay. This mirrors placeDeviceSmart so preview and placement
  // agree.
  const carrierSlug = synthesizeCarrierForDevice(device, rack.width);
  const needsBay = requiresChassisBay(device, rack.width);
  // Both a carrier-synthesising device and a bay-only device can drop into an
  // existing container cell under the cursor.
  const resolvableContainerTarget = detectContainerDropTarget(
    rack,
    deviceLibrary,
    device,
    mouseY,
    xOffsetInRack,
    dims.rackWidth,
    dims.rackHeight,
    dims.uHeight,
    faceFilter,
    excludeDeviceId,
  );
  const resolvedContainerId =
    resolvableContainerTarget?.containerId ?? containerHover?.containerId;
  const resolvedContainer = resolvedContainerId
    ? rack.devices.find((placed) => placed.id === resolvedContainerId)
    : undefined;
  if (resolvedContainer) {
    targetU = toHumanUnits(resolvedContainer.position);
  }

  let feedback: DropFeedback;
  let previewHeight = device.u_height;
  if (resolvableContainerTarget) {
    feedback = "valid";
    previewHeight = resolvedContainer
      ? (findDeviceType(resolvedContainer.device_type, deviceLibrary)
          ?.u_height ?? device.u_height)
      : device.u_height;
  } else if (containerHover) {
    feedback = "blocked";
    previewHeight = resolvedContainer
      ? (findDeviceType(resolvedContainer.device_type, deviceLibrary)
          ?.u_height ?? device.u_height)
      : device.u_height;
  } else if (carrierSlug) {
    // Synthesise a rail carrier at this U and validate the complete assembly.
    const carrierType = findDeviceType(carrierSlug, deviceLibrary);
    const carrierHeight = carrierType?.u_height ?? 1;
    previewHeight = carrierHeight;
    const carrierFeedback = getDropFeedback(
      railValidationRack,
      deviceLibrary,
      carrierHeight,
      targetU,
      railExcludeIndex,
      "both",
      carrierType,
    );
    const carrierPlacement =
      carrierFeedback === "valid" && carrierType
        ? resolveSynthesizedCarrierPlacement(
            railValidationRack,
            deviceLibrary,
            device,
            carrierType,
            toInternalUnits(targetU),
            railExcludeIndex,
          )
        : null;
    feedback =
      carrierFeedback === "valid" && !carrierPlacement
        ? "blocked"
        : carrierFeedback;
  } else if (needsBay) {
    // Requires a chassis bay but none is under the cursor: honestly invalid.
    feedback = "invalid";
  } else {
    feedback = getDropFeedback(
      railValidationRack,
      deviceLibrary,
      device.u_height,
      targetU,
      railExcludeIndex,
      faceFilter,
      device,
    );
  }

  if (
    feedback === "valid" &&
    assemblySource &&
    assemblySource.rack.id !== rack.id &&
    !resolvableContainerTarget &&
    !carrierSlug &&
    !needsBay &&
    !canMoveRackAssemblyToRack(
      assemblySource.rack,
      rack,
      deviceLibrary,
      assemblySource.deviceIndex,
      targetU,
      faceFilter,
    )
  ) {
    feedback = "blocked";
  }

  return {
    targetU,
    xOffsetInRack,
    feedback,
    containerHoverInfo: containerHover,
    dropPreview: {
      position: targetU,
      height: previewHeight,
      feedback,
    },
  };
}

/**
 * Unified drop-action resolution pipeline.
 * Called by handleDrop and handleDragEnd to classify the drop into an action.
 */
export function resolveDropAction(
  coords: DropCoordinateInput,
  dims: RackDimensions,
  rack: Rack,
  deviceLibrary: DeviceType[],
  dragData: DragData,
  faceFilter: DeviceFace | undefined,
  /** Set true to skip container detection (the fallthrough re-resolution after a failed container placement). */
  skipContainer: boolean = false,
  sourceRack?: Rack,
): DropAction {
  const { mouseY, xOffsetInRack } = resolveCoordinates(coords, dims);

  const targetU = calculateRailDropPosition(
    mouseY,
    dims,
    rack,
    dragData.device,
  );

  // Carrier-first: a sub-U / half-width device must land inside a carrier.
  const carrierSlug = synthesizeCarrierForDevice(dragData.device, rack.width);
  const excludeIndex = deriveExcludeIndex(dragData, rack.id);
  const excludeDeviceId =
    excludeIndex === undefined ? undefined : rack.devices[excludeIndex]?.id;
  const movingDevice =
    excludeIndex === undefined ? undefined : rack.devices[excludeIndex];
  const railValidationRack =
    movingDevice?.container_id && excludeDeviceId
      ? getProspectiveRackAfterDeviceMove(rack, excludeDeviceId)
      : rack;
  const railExcludeIndex =
    railValidationRack === rack ? excludeIndex : undefined;

  // Drop into the cell under the cursor when hovering a container with a free,
  // fitting cell (y-aware: both column and row). Skipped on the failed-container
  // fallback re-resolution.
  if (!skipContainer) {
    const containerTarget = detectContainerDropTarget(
      rack,
      deviceLibrary,
      dragData.device,
      mouseY,
      xOffsetInRack,
      dims.rackWidth,
      dims.rackHeight,
      dims.uHeight,
      faceFilter,
      excludeDeviceId,
    );

    if (containerTarget) {
      return {
        kind: "container-drop",
        rackId: rack.id,
        containerTarget,
        slug: dragData.device.slug,
        dragData,
      };
    }

    const containerHover = detectContainerHover(
      rack,
      deviceLibrary,
      dragData.device,
      mouseY,
      xOffsetInRack,
      dims.rackWidth,
      dims.rackHeight,
      dims.uHeight,
      faceFilter,
      excludeDeviceId,
    );
    if (containerHover) {
      const container = rack.devices.find(
        (placed) => placed.id === containerHover.containerId,
      );
      const containerType = container
        ? findDeviceType(container.device_type, deviceLibrary)
        : undefined;
      return {
        kind: "invalid",
        feedback: "blocked",
        targetU,
        deviceHeight: containerType?.u_height ?? dragData.device.u_height,
        excludeIndex,
        deviceType: dragData.device,
        message: "Device doesn't fit in this carrier slot",
      };
    }
  }
  const isInternalMove =
    dragData.type === "rack-device" &&
    dragData.sourceRackId === rack.id &&
    dragData.sourceIndex !== undefined;
  const isCrossRackMove =
    dragData.type === "rack-device" &&
    dragData.sourceRackId !== rack.id &&
    dragData.sourceIndex !== undefined;

  // No container under the cursor: a carriable device synthesises (or fills) a
  // carrier at the target U via the store. Validate the carrier's full rail
  // footprint (height-matched: a 2U carrier needs 2U of clear rail).
  if (carrierSlug) {
    const carrierType = findDeviceType(carrierSlug, deviceLibrary);
    const carrierHeight = carrierType?.u_height ?? 1;
    const carrierFeedback = getDropFeedback(
      railValidationRack,
      deviceLibrary,
      carrierHeight,
      targetU,
      railExcludeIndex,
      "both",
      carrierType,
    );
    if (carrierFeedback !== "valid") {
      return {
        kind: "invalid",
        feedback: carrierFeedback,
        targetU,
        deviceHeight: carrierHeight,
        excludeIndex,
        deviceType: carrierType,
      };
    }
    const carrierPlacement = carrierType
      ? resolveSynthesizedCarrierPlacement(
          railValidationRack,
          deviceLibrary,
          dragData.device,
          carrierType,
          toInternalUnits(targetU),
          railExcludeIndex,
        )
      : null;
    if (!carrierPlacement) {
      return {
        kind: "invalid",
        feedback: "blocked",
        targetU,
        deviceHeight: carrierHeight,
        excludeIndex,
        deviceType: dragData.device,
        message: "Device and carrier don't fit this rack",
      };
    }
    return {
      kind: "carrier-drop",
      rackId: rack.id,
      slug: dragData.device.slug,
      targetU,
      face: faceFilter ?? "front",
      dragData,
    };
  }

  // A device that requires a carrier but has none synthesisable (a chassis
  // child) can only go into an existing chassis bay - handled above when the
  // cursor is over one. On bare rails it is honestly invalid: say it needs a
  // chassis rather than fall through to a rail placement the store would refuse
  // with a misleading "No space".
  if (requiresChassisBay(dragData.device, rack.width)) {
    return {
      kind: "invalid",
      feedback: "invalid",
      targetU,
      deviceHeight: dragData.device.u_height,
      excludeIndex,
      deviceType: dragData.device,
      message: chassisRequirementMessage(
        dragData.device,
        deviceLibrary,
        rack.width,
      ),
    };
  }

  const feedback = getDropFeedback(
    railValidationRack,
    deviceLibrary,
    dragData.device.u_height,
    targetU,
    railExcludeIndex,
    faceFilter,
    dragData.device,
  );

  if (feedback !== "valid") {
    return {
      kind: "invalid",
      feedback,
      targetU,
      deviceHeight: dragData.device.u_height,
      excludeIndex,
      deviceType: dragData.device,
    };
  }

  if (
    isCrossRackMove &&
    (!sourceRack ||
      !canMoveRackAssemblyToRack(
        sourceRack,
        rack,
        deviceLibrary,
        dragData.sourceIndex!,
        targetU,
        faceFilter,
      ))
  ) {
    return {
      kind: "invalid",
      feedback: "blocked",
      targetU,
      deviceHeight: dragData.device.u_height,
      deviceType: dragData.device,
      message: "Device assembly doesn't fit this rack",
    };
  }

  if (isInternalMove && dragData.sourceIndex !== undefined) {
    return {
      kind: "internal-move",
      rackId: rack.id,
      deviceIndex: dragData.sourceIndex,
      targetU,
    };
  }

  if (
    isCrossRackMove &&
    dragData.sourceIndex !== undefined &&
    dragData.sourceRackId
  ) {
    return {
      kind: "cross-rack-move",
      sourceRackId: dragData.sourceRackId,
      sourceIndex: dragData.sourceIndex,
      targetRackId: rack.id,
      targetU,
      face: faceFilter ?? "front",
    };
  }

  return {
    kind: "palette-drop",
    rackId: rack.id,
    slug: dragData.device.slug,
    targetU,
  };
}

/**
 * Honest message for a device that can only mount inside a chassis bay (a
 * chassis child, or a half-width device with no rail carrier). Shown instead of
 * a misleading "No space" when such a device is dropped on bare rails.
 */
export function chassisRequirementMessage(
  device: DeviceType,
  deviceLibrary: DeviceType[] = [],
  rackWidth: Rack["width"] = 19,
): string {
  const recommendation = getMountRecommendation(
    device,
    rackWidth,
    deviceLibrary,
  );
  if (recommendation) return recommendation.requirement;

  const name = device.model ?? device.slug;
  return `${name} must be placed in a chassis bay`;
}

/**
 * Build a user-facing collision message for blocked/invalid drops.
 */
export function buildCollisionMessage(
  feedback: DropFeedback,
  rack: Rack,
  deviceLibrary: DeviceType[],
  deviceHeight: number,
  targetU: number,
  excludeIndex?: number,
  faceFilter?: DeviceFace,
  targetDeviceType?: DeviceType,
): string | null {
  if (feedback === "blocked") {
    const collisions: PlacedDevice[] = findCollisions(
      rack,
      deviceLibrary,
      deviceHeight,
      toInternalUnits(targetU),
      excludeIndex,
      faceFilter,
      targetDeviceType,
    );

    if (collisions.length > 0) {
      const blockingNames = collisions.map((placed) =>
        getDeviceDisplayName(placed, deviceLibrary),
      );
      return blockingNames.length === 1
        ? `Position blocked by ${blockingNames[0]}`
        : `Position blocked by ${blockingNames.join(", ")}`;
    }
    return "Device doesn't fit this rack's width or depth";
  }

  if (feedback === "invalid") {
    return "Device doesn't fit at this position";
  }

  return null;
}
