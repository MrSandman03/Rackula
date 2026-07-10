import type { Rack, RackProfile } from "$lib/types";
import {
  DEFAULT_RACK_DEPTH_MM,
  RACKMATE_T1_PLUS_DEPTH_MM,
  RACKMATE_T1_PLUS_HEIGHT,
} from "$lib/types/constants";

export const RACKMATE_T1_PLUS_NAME = "RackMate T1 Plus";
export const RACKMATE_T1_PLUS_WIDTH: Rack["width"] = 10;
export const RACKMATE_T1_PLUS_PROFILE: RackProfile = "rackmate-t1-plus";

export function isRackMateT1Plus(
  rack: Pick<Rack, "profile"> | undefined,
): boolean {
  return rack?.profile === RACKMATE_T1_PLUS_PROFILE;
}

export function rackDepthForProfile(
  profile: RackProfile | undefined,
  depthMm?: number,
): number {
  if (profile === RACKMATE_T1_PLUS_PROFILE) {
    return RACKMATE_T1_PLUS_DEPTH_MM;
  }
  return depthMm ?? DEFAULT_RACK_DEPTH_MM;
}

function hasLegacyRackMateSignature(rack: {
  name?: string;
  width: Rack["width"];
  height: number;
  depth_mm?: number;
}): boolean {
  return (
    rack.name === RACKMATE_T1_PLUS_NAME &&
    rack.width === RACKMATE_T1_PLUS_WIDTH &&
    rack.height === RACKMATE_T1_PLUS_HEIGHT &&
    rack.depth_mm === RACKMATE_T1_PLUS_DEPTH_MM
  );
}

/** Mark an otherwise ambiguous current-authored rack as explicitly Generic. */
export function withCurrentRackProfileMarker<
  T extends {
    name?: string;
    width: Rack["width"];
    height: number;
    profile?: RackProfile;
    depth_mm?: number;
  },
>(rack: T): T {
  return (
    rack.profile === undefined && hasLegacyRackMateSignature(rack)
      ? { ...rack, profile: "generic" as const }
      : rack
  ) as T;
}

export function withRackProfileDefaults<
  T extends {
    name?: string;
    width: Rack["width"];
    height: number;
    profile?: RackProfile;
    depth_mm?: number;
  },
>(rack: T): T & { width: Rack["width"]; height: number; depth_mm: number } {
  // Current authoring treats an unmarked exact legacy tuple as Generic. The
  // explicit marker keeps a later saved-layout load from mistaking it for a
  // pre-profile RackMate document.
  const markedRack = withCurrentRackProfileMarker(rack);
  const profile = markedRack.profile;
  const isRackMate = profile === RACKMATE_T1_PLUS_PROFILE;
  return {
    ...markedRack,
    ...(profile !== undefined ? { profile } : {}),
    width: isRackMate ? RACKMATE_T1_PLUS_WIDTH : markedRack.width,
    height: isRackMate ? RACKMATE_T1_PLUS_HEIGHT : markedRack.height,
    depth_mm: rackDepthForProfile(profile, markedRack.depth_mm),
  };
}

/** Apply the exact-tuple inference only at prior-release saved-data ingress. */
export function withLegacyRackProfileDefaults<
  T extends {
    name?: string;
    width: Rack["width"];
    height: number;
    profile?: RackProfile;
    depth_mm?: number;
  },
>(rack: T): T & { width: Rack["width"]; height: number; depth_mm: number } {
  return withRackProfileDefaults(
    rack.profile === undefined && hasLegacyRackMateSignature(rack)
      ? { ...rack, profile: RACKMATE_T1_PLUS_PROFILE }
      : rack,
  ) as T & { width: Rack["width"]; height: number; depth_mm: number };
}

/** Keep direct and recorded mutations inside a named profile's dimensions. */
export function constrainRackProfileUpdates<T extends Partial<Rack>>(
  rack: Pick<Rack, "name" | "width" | "height" | "depth_mm" | "profile">,
  updates: T,
): T {
  const touchesProfileDimensions =
    "profile" in updates ||
    "width" in updates ||
    "height" in updates ||
    "depth_mm" in updates;
  const touchesLegacySignature = touchesProfileDimensions || "name" in updates;
  if (!touchesLegacySignature) return updates;

  const nextProfile = "profile" in updates ? updates.profile : rack.profile;
  if (nextProfile !== RACKMATE_T1_PLUS_PROFILE) {
    const nextRack = { ...rack, ...updates };
    return nextRack.profile === undefined &&
      hasLegacyRackMateSignature(nextRack)
      ? ({ ...updates, profile: "generic" } as T)
      : updates;
  }

  return {
    ...updates,
    width: RACKMATE_T1_PLUS_WIDTH,
    height: RACKMATE_T1_PLUS_HEIGHT,
    depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
  };
}

export function createRackMateT1PlusDefaults(): Pick<
  Rack,
  | "name"
  | "height"
  | "width"
  | "profile"
  | "depth_mm"
  | "form_factor"
  | "desc_units"
  | "starting_unit"
> {
  return {
    name: RACKMATE_T1_PLUS_NAME,
    height: RACKMATE_T1_PLUS_HEIGHT,
    width: RACKMATE_T1_PLUS_WIDTH,
    profile: RACKMATE_T1_PLUS_PROFILE,
    depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
    form_factor: "4-post-cabinet",
    desc_units: false,
    starting_unit: 1,
  };
}
