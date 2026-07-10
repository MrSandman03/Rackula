import type { DeviceType, PlacedDevice, Rack } from "$lib/types";
import { findDeviceType } from "$lib/utils/device-lookup";
import { getDeviceDepthMm } from "./slot-fit";

/** Resolve the deepest known member of a placed parent/child assembly. */
export function getPlacedAssemblyDepthMm(
  rack: Rack,
  deviceLibrary: DeviceType[],
  placedDevice: PlacedDevice,
  visited = new Set<string>(),
  excludeDeviceId?: string,
): number | undefined {
  if (placedDevice.id === excludeDeviceId) return undefined;
  if (visited.has(placedDevice.id)) return undefined;
  visited.add(placedDevice.id);

  const placedType = findDeviceType(placedDevice.device_type, deviceLibrary);
  let depth = placedType ? getDeviceDepthMm(placedType) : undefined;

  for (const child of rack.devices) {
    if (child.container_id !== placedDevice.id) continue;
    if (child.id === excludeDeviceId) continue;
    const childDepth = getPlacedAssemblyDepthMm(
      rack,
      deviceLibrary,
      child,
      visited,
      excludeDeviceId,
    );
    if (childDepth !== undefined) {
      depth = depth === undefined ? childDepth : Math.max(depth, childDepth);
    }
  }

  return depth;
}

/** Resolve an auto-created carrier that becomes empty after this child moves. */
export function findEmptyAutoCarrierAfterChildMove(
  rack: Rack,
  child: PlacedDevice,
  destinationContainerId?: string,
): PlacedDevice | undefined {
  if (!child.container_id || child.container_id === destinationContainerId) {
    return undefined;
  }

  const parent = rack.devices.find(
    (device) => device.id === child.container_id,
  );
  if (!parent?.auto_created) return undefined;

  return rack.devices.some(
    (device) => device.container_id === parent.id && device.id !== child.id,
  )
    ? undefined
    : parent;
}

/**
 * Build the rack roster used to validate an existing placement's destination.
 * The moving placement no longer contributes at its old location, and a
 * last-child auto carrier no longer contributes when the child leaves it.
 */
export function getProspectiveRackAfterDeviceMove(
  rack: Rack,
  deviceId: string,
  destinationContainerId?: string,
): Rack {
  const movingDevice = rack.devices.find((device) => device.id === deviceId);
  if (!movingDevice) return rack;

  const emptyAutoCarrier = findEmptyAutoCarrierAfterChildMove(
    rack,
    movingDevice,
    destinationContainerId,
  );
  const removedIds = new Set([
    movingDevice.id,
    ...(emptyAutoCarrier ? [emptyAutoCarrier.id] : []),
  ]);

  return {
    ...rack,
    devices: rack.devices.filter((device) => !removedIds.has(device.id)),
  };
}

export function getTargetAssemblyDepthMm(
  rack: Rack,
  deviceLibrary: DeviceType[],
  targetDeviceType: DeviceType | undefined,
  excludeIndex?: number,
): number | undefined {
  if (!targetDeviceType) return undefined;

  const ownDepth = getDeviceDepthMm(targetDeviceType);
  const placedTarget =
    excludeIndex !== undefined ? rack.devices[excludeIndex] : undefined;
  if (!placedTarget || placedTarget.device_type !== targetDeviceType.slug) {
    return ownDepth;
  }

  const assemblyDepth = getPlacedAssemblyDepthMm(
    rack,
    deviceLibrary,
    placedTarget,
  );
  if (assemblyDepth === undefined) return ownDepth;
  return ownDepth === undefined
    ? assemblyDepth
    : Math.max(ownDepth, assemblyDepth);
}
