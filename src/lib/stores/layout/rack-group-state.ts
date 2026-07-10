/**
 * Rack-group state accessors and raw command adapter.
 *
 * This leaf module deliberately has no dependency on rack-actions so both the
 * rack and rack-group domains can share it without an import cycle.
 */

import type { RackGroup } from "$lib/types";
import type { RackGroupCommandStore } from "../commands";
import type { LayoutStateAccess } from "./types";

/** Raw create rack group (bypasses history). */
export function createRackGroupRaw(
  ctx: LayoutStateAccess,
  group: RackGroup,
): void {
  const layout = ctx.getLayout();
  const newGroups = [...(layout.rack_groups ?? []), group];
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups,
  });
}

/** Raw update rack group (bypasses history). */
export function updateRackGroupRaw(
  ctx: LayoutStateAccess,
  id: string,
  updates: Partial<RackGroup>,
): void {
  const layout = ctx.getLayout();
  const newGroups = (layout.rack_groups ?? []).map((group) =>
    group.id === id ? { ...group, ...updates } : group,
  );
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups,
  });
}

/** Raw delete rack group (bypasses history). */
export function deleteRackGroupRaw(
  ctx: LayoutStateAccess,
  id: string,
): RackGroup | undefined {
  const group = getRackGroupById(ctx, id);
  if (!group) return undefined;

  const layout = ctx.getLayout();
  const newGroups = (layout.rack_groups ?? []).filter(
    (candidate) => candidate.id !== id,
  );
  ctx.setLayout({
    ...layout,
    rack_groups: newGroups.length > 0 ? newGroups : undefined,
  });
  return group;
}

/** Bind raw group mutations to the command-store contract. */
export function getRackGroupCommandAdapter(
  ctx: LayoutStateAccess,
): RackGroupCommandStore {
  return {
    createRackGroupRaw: (group: RackGroup) => createRackGroupRaw(ctx, group),
    updateRackGroupRaw: (id: string, updates: Partial<RackGroup>) =>
      updateRackGroupRaw(ctx, id, updates),
    deleteRackGroupRaw: (id: string) => deleteRackGroupRaw(ctx, id),
  };
}

/** Get a rack group by ID. */
export function getRackGroupById(
  ctx: LayoutStateAccess,
  id: string,
): RackGroup | undefined {
  return ctx.getRackGroups().find((group) => group.id === id);
}

/** Get the rack group containing a rack. */
export function getRackGroupForRack(
  ctx: LayoutStateAccess,
  rackId: string,
): RackGroup | undefined {
  return ctx.getRackGroups().find((group) => group.rack_ids.includes(rackId));
}

/** Validate the equal-height invariant for a bayed group. */
export function validateBayedGroupHeights(
  ctx: LayoutStateAccess,
  rackIds: string[],
): string | undefined {
  if (rackIds.length <= 1) return undefined;

  const heights = new Set<number>();
  for (const rackId of rackIds) {
    const rack = ctx.findRack(rackId);
    if (rack) heights.add(rack.height);
  }

  if (heights.size <= 1) return undefined;

  const heightList = Array.from(heights)
    .sort((a, b) => a - b)
    .map((height) => `${height}U`)
    .join(", ");
  return `Bayed groups require same-height racks. Found heights: ${heightList}`;
}
