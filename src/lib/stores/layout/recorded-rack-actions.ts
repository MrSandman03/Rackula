/**
 * Recorded Rack Actions for Layout Store
 *
 * Extracted from layout/command-adapters.ts — rack-level operations
 * with undo/redo support. Each function creates a Command wrapping raw
 * mutators, then executes it through the history system.
 */

import type { Rack } from "$lib/types";
import {
  createUpdateRackCommand,
  createClearRackCommand,
  createBatchCommand,
  type Command,
} from "../commands";
import type { LayoutStateAccess } from "./types";
import { getCommandStoreAdapter } from "./command-adapters";
import { getTargetRack, getRackById } from "./rack-actions";
import { constrainRackProfileUpdates } from "$lib/utils/rack-profile";
import { filterUnchangedRackUpdates } from "$lib/utils/rack";

/**
 * Bind a command to a specific rack. The history mutators behind rack commands
 * operate on whichever rack is active, so execute/undo must activate the
 * target rack first and restore the previously active rack afterwards.
 * Mirrors what createCrossRackMoveCommand does with getActiveRackId() so
 * undo/redo targets the intended rack regardless of which rack is active
 * at undo time (#2126).
 */
export function bindCommandToRack(
  ctx: LayoutStateAccess,
  rackId: string,
  inner: Command,
): Command {
  const runOnRack = (action: () => void) => {
    // If the bound rack is gone, the raw mutators would fall back to the
    // first rack and mutate the wrong one — no-op instead.
    if (!ctx.findRack(rackId)) return;
    const previousActiveId = ctx.getActiveRackId();
    ctx.setActiveRackId(rackId);
    try {
      action();
    } finally {
      ctx.setActiveRackId(previousActiveId);
    }
  };

  return {
    ...inner,
    execute() {
      runOnRack(() => inner.execute());
    },
    undo() {
      runOnRack(() => inner.undo());
    },
  };
}

/**
 * Update rack settings with undo/redo support
 * @param ctx - Layout state access
 * @param rackId - Rack ID
 * @param updates - Settings to update
 */
export function updateRackRecorded(
  ctx: LayoutStateAccess,
  rackId: string,
  updates: Partial<Omit<Rack, "devices" | "view">>,
): void {
  const targetRack = getRackById(ctx, rackId);
  if (!targetRack) return;

  const constrainedUpdates = filterUnchangedRackUpdates(
    targetRack,
    constrainRackProfileUpdates(targetRack, updates),
  );
  if (Object.keys(constrainedUpdates).length === 0) return;

  // Capture before state
  const before: Partial<Omit<Rack, "devices" | "view">> = {};
  for (const key of Object.keys(constrainedUpdates) as (keyof Omit<
    Rack,
    "devices" | "view"
  >)[]) {
    before[key] = targetRack[key] as never;
  }

  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = bindCommandToRack(
    ctx,
    rackId,
    createUpdateRackCommand(before, constrainedUpdates, adapter),
  );
  history.execute(command);
  ctx.markDirty();
}

/**
 * Update the same fields on multiple racks atomically — a single undo reverts
 * every rack in the batch. Used to keep bayed-group U-numbering in sync (#1520).
 *
 * @param ctx - Layout state access
 * @param targets - rackId → updates pairs; racks that already match are silently skipped
 * @param description - History entry label
 */
export function updateRacksBatchRecorded(
  ctx: LayoutStateAccess,
  targets: {
    rackId: string;
    updates: Partial<Omit<Rack, "devices" | "view">>;
  }[],
  description: string,
): void {
  const adapter = getCommandStoreAdapter(ctx);
  const history = ctx.getHistory();
  const commands = [];

  for (const { rackId, updates } of targets) {
    const targetRack = getRackById(ctx, rackId);
    if (!targetRack) continue;
    const constrainedUpdates = filterUnchangedRackUpdates(
      targetRack,
      constrainRackProfileUpdates(targetRack, updates),
    );
    if (Object.keys(constrainedUpdates).length === 0) continue;

    const before: Partial<Omit<Rack, "devices" | "view">> = {};
    for (const key of Object.keys(constrainedUpdates) as (keyof Omit<
      Rack,
      "devices" | "view"
    >)[]) {
      const current = targetRack[key];
      before[key] = current as never;
    }

    // Each sub-command activates its target rack because history replay targets
    // whichever rack is active, then restores the previous one.
    commands.push({
      ...bindCommandToRack(
        ctx,
        rackId,
        createUpdateRackCommand(before, constrainedUpdates, adapter),
      ),
      description,
    });
  }

  if (commands.length === 0) return;

  const batch = createBatchCommand(description, commands);
  history.execute(batch);
  ctx.markDirty();
}

/**
 * Clear rack devices with undo/redo support
 * Uses active rack unless a rackId override is provided
 * @param ctx - Layout state access
 * @param rackId - Optional rack ID override
 */
export function clearRackRecorded(
  ctx: LayoutStateAccess,
  rackId?: string,
): void {
  const targetRack = getTargetRack(ctx, rackId)?.rack;
  if (!targetRack || targetRack.devices.length === 0) return;

  const devices = [...targetRack.devices];
  const history = ctx.getHistory();
  const adapter = getCommandStoreAdapter(ctx);

  const command = bindCommandToRack(
    ctx,
    targetRack.id,
    createClearRackCommand(devices, adapter),
  );
  history.execute(command);
  ctx.markDirty();
}
