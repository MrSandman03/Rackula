import type { DeviceType, Rack } from "$lib/types";
import {
  RACKMATE_T1_PLUS_DEPTH_MM,
  RACKMATE_T1_PLUS_HEIGHT,
} from "$lib/types/constants";
import {
  hasLegacyRackMateSignature,
  isRackMateT1Plus,
  RACKMATE_T1_PLUS_PROFILE,
  RACKMATE_T1_PLUS_WIDTH,
} from "$lib/utils/rack-profile";
import {
  canFitRackDimensions,
  formatConflictMessage,
  getConflictDetails,
} from "$lib/utils/rack-resize";
import {
  BAYED_PROFILE_DIVERGENCE_ERROR,
  isBayedRackUpdateAllowed,
  type BayedRackUpdateContext,
} from "$lib/utils/rack-bay-invariants";

export type RackProfileSelection = "generic" | "rackmate";

export type RackProfileChangePlan =
  | { kind: "noop" }
  | { kind: "error"; message: string }
  | { kind: "update"; updates: Partial<Rack> };

/** Plan an explicit profile change without mutating editor or store state. */
export function planRackProfileChange(
  rack: Rack,
  deviceTypes: DeviceType[],
  profile: RackProfileSelection,
  bayedContext?: BayedRackUpdateContext,
): RackProfileChangePlan {
  const selectRackMate = profile === "rackmate";
  if (
    (selectRackMate && isRackMateT1Plus(rack)) ||
    (!selectRackMate &&
      (rack.profile === "generic" ||
        (rack.profile === undefined && !hasLegacyRackMateSignature(rack))))
  ) {
    return { kind: "noop" };
  }

  const updates: Partial<Rack> = selectRackMate
    ? {
        width: RACKMATE_T1_PLUS_WIDTH,
        height: RACKMATE_T1_PLUS_HEIGHT,
        depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
        profile: RACKMATE_T1_PLUS_PROFILE,
      }
    : { profile: "generic" };

  if (!isBayedRackUpdateAllowed(rack, updates, bayedContext)) {
    return {
      kind: "error",
      message: BAYED_PROFILE_DIVERGENCE_ERROR,
    };
  }

  if (!selectRackMate) {
    return { kind: "update", updates };
  }

  const result = canFitRackDimensions(
    rack,
    {
      width: RACKMATE_T1_PLUS_WIDTH,
      height: RACKMATE_T1_PLUS_HEIGHT,
      depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
    },
    deviceTypes,
  );
  if (!result.allowed) {
    const conflicts = getConflictDetails(result.conflicts, deviceTypes);
    return {
      kind: "error",
      message: `RackMate T1 Plus cannot contain ${formatConflictMessage(conflicts)}`,
    };
  }

  return {
    kind: "update",
    updates,
  };
}
