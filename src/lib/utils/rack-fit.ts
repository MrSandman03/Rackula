import type { DeviceType, Rack, RackProfile } from "$lib/types";
import { requiresChassisBay } from "./carrier-rules";
import { canPlaceInSlot } from "./collision";
import { findDeviceType } from "./device-lookup";
import { getDeviceDimensionsMm, rackWidthToMillimetres } from "./slot-fit";
import {
  getMountRecommendation,
  getRecommendedMountSlugs,
} from "./mount-recommendations";

export type RackFitTone = "ok" | "info" | "warn" | "blocked";

export interface RackFitSummary {
  label: string;
  title: string;
  tone: RackFitTone;
}

interface RackulaFitFields {
  status?: string;
  rackmate_t1_plus_depth_clearance_mm?: number;
  open_checks: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function rackulaFitFields(device: DeviceType): RackulaFitFields {
  const raw = device.custom_fields?.rackula_fit;
  if (!isRecord(raw)) return { open_checks: [] };

  const clearance = raw.rackmate_t1_plus_depth_clearance_mm;
  return {
    status: typeof raw.status === "string" ? raw.status : undefined,
    rackmate_t1_plus_depth_clearance_mm:
      typeof clearance === "number" && Number.isFinite(clearance)
        ? clearance
        : undefined,
    open_checks: stringArray(raw.open_checks),
  };
}

export function getRackulaFitOpenChecks(device: DeviceType): string[] {
  return rackulaFitFields(device).open_checks;
}

function statusLabel(status: string | undefined): RackFitSummary | null {
  switch (status) {
    case "candidate":
      return {
        label: "Candidate",
        title: "Candidate fit, not yet build-verified",
        tone: "info",
      };
    case "planned":
      return {
        label: "Plan",
        title: "Planned device, not confirmed hardware yet",
        tone: "info",
      };
    case "needs_measurement":
    case "physically_plausible_needs_measurement":
      return {
        label: "Verify",
        title: "Fit needs physical measurement",
        tone: "warn",
      };
    case "needs_design":
      return {
        label: "Design",
        title: "Mount or tray needs design work before build-ready use",
        tone: "warn",
      };
    case "needs_mount_selection":
    case "needs_stl_selection":
      return {
        label: "Mount",
        title: "Mount choice is still provisional",
        tone: "warn",
      };
    default:
      return null;
  }
}

function findRecommendedMounts(
  device: DeviceType,
  library: DeviceType[],
): DeviceType[] {
  return getRecommendedMountSlugs(device)
    .map(
      (slug) =>
        library.find((entry) => entry.slug === slug) ??
        findDeviceType(slug, library),
    )
    .filter((entry): entry is DeviceType => !!entry);
}

function firstFittingMount(
  device: DeviceType,
  rackWidth: Rack["width"],
  library: DeviceType[],
): DeviceType | undefined {
  return findRecommendedMounts(device, library).find((mount) =>
    (mount.slots ?? []).some((slot) =>
      canPlaceInSlot(device, slot, {
        rackWidth,
        containerHeightUnits: mount.u_height,
        containerSlots: mount.slots,
      }),
    ),
  );
}

function labelForMount(mount: DeviceType): string {
  return mount.model ?? mount.slug;
}

export function getRackFitSummary(
  device: DeviceType,
  rackWidth: Rack["width"],
  library: DeviceType[] = [],
  rackProfile?: RackProfile,
): RackFitSummary | null {
  const fit = rackulaFitFields(device);
  const rackWidthMm = rackWidthToMillimetres(rackWidth);
  const dimensions = getDeviceDimensionsMm(device);
  if (
    dimensions?.width !== undefined &&
    rackWidthMm !== undefined &&
    dimensions.width > rackWidthMm
  ) {
    return {
      label: "Wide",
      title: `${dimensions.width}mm wide exceeds nominal ${rackWidth}" rack width`,
      tone: "blocked",
    };
  }

  const needsBay = requiresChassisBay(device, rackWidth);
  const fittingMount = needsBay
    ? firstFittingMount(device, rackWidth, library)
    : undefined;
  const recommendedMountSlugs = needsBay
    ? getRecommendedMountSlugs(device)
    : [];
  if (needsBay && recommendedMountSlugs.length > 0 && !fittingMount) {
    return {
      label: "No bay",
      title: "Recommended mounts do not fit this rack width or slot geometry",
      tone: "blocked",
    };
  }

  if (
    rackProfile === "rackmate-t1-plus" &&
    fit.rackmate_t1_plus_depth_clearance_mm !== undefined &&
    fit.rackmate_t1_plus_depth_clearance_mm <= 10
  ) {
    return {
      label: "Tight",
      title: `${fit.rackmate_t1_plus_depth_clearance_mm}mm nominal RackMate depth clearance`,
      tone: "warn",
    };
  }

  if (fit.open_checks.length > 0) {
    return {
      label: "Check",
      title: fit.open_checks.slice(0, 3).join("; "),
      tone: "warn",
    };
  }

  const status = statusLabel(fit.status);
  if (status) return status;

  if (needsBay) {
    const recommendation = getMountRecommendation(device, rackWidth, library);
    if (fittingMount) {
      return {
        label: "Mount",
        title: `Requires a chassis bay or tray; fits ${labelForMount(fittingMount)}`,
        tone: "info",
      };
    }
    return {
      label: "Bay",
      title:
        recommendation?.summary ??
        "Requires a chassis bay, tray, carrier, or printed mount",
      tone: "info",
    };
  }

  return null;
}
