import type { Rack, RackGroup } from "$lib/types";
import { RACKMATE_T1_PLUS_PROFILE } from "$lib/utils/rack-profile";

export const BAYED_PROFILE_DIVERGENCE_ERROR =
  "This change would make the bayed rack profiles diverge.";
export const BAYED_WIDTH_DIVERGENCE_ERROR =
  "This change would make the bayed rack widths diverge.";

export interface BayedRackUpdateContext {
  group: RackGroup;
  racks: readonly Rack[];
}

type BayedInvariantKey = "profile" | "width" | "height";

function bayedInvariantValue(
  rack: Rack,
  key: BayedInvariantKey,
): Rack["profile"] | Rack["width"] | Rack["height"] {
  if (key === "profile") {
    return rack.profile === RACKMATE_T1_PLUS_PROFILE
      ? RACKMATE_T1_PLUS_PROFILE
      : "generic";
  }
  return rack[key];
}

/**
 * Allow a bay invariant change only when it strictly reduces the target rack's
 * disagreements with its peers. Identity-preserving marker changes are safe.
 */
export function isBayedRackUpdateAllowed(
  rack: Rack,
  updates: Partial<Rack>,
  context?: BayedRackUpdateContext,
): boolean {
  if (!context || context.group.layout_preset !== "bayed") return true;

  const nextRack = { ...rack, ...updates };
  const peerIds = context.group.rack_ids.filter((rackId) => rackId !== rack.id);
  const peers = peerIds
    .map((rackId) => context.racks.find((candidate) => candidate.id === rackId))
    .filter((peer): peer is Rack => peer !== undefined);

  return !(["profile", "width", "height"] as const).some((key) => {
    if (!(key in updates)) return false;
    const currentValue = bayedInvariantValue(rack, key);
    const nextValue = bayedInvariantValue(nextRack, key);
    if (currentValue === nextValue) return false;

    if (peers.length !== peerIds.length || peers.length === 0) return true;

    const currentDisagreements = peers.filter(
      (peer) => bayedInvariantValue(peer, key) !== currentValue,
    ).length;
    const nextDisagreements = peers.filter(
      (peer) => bayedInvariantValue(peer, key) !== nextValue,
    ).length;
    return nextDisagreements >= currentDisagreements;
  });
}
