<!--
  RackEditSheet Component
  Mobile bottom sheet for editing rack properties
  Feature parity with EditPanel's rack editing section
-->
<script lang="ts">
  import { untrack } from "svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import {
    canFitRackDimensions,
    canResizeRackTo,
    getConflictDetails,
    formatConflictMessage,
  } from "$lib/utils/rack-resize";
  import {
    COMMON_RACK_HEIGHTS,
    DEFAULT_RACK_DEPTH_MM,
    MINI_RACK_HEIGHTS,
    RACKMATE_T1_PLUS_HEIGHT,
    RACKMATE_T1_PLUS_DEPTH_MM,
  } from "$lib/types/constants";
  import { isRackMateT1Plus } from "$lib/utils/rack-profile";
  import { planRackProfileChange } from "$lib/utils/rack-profile-change";
  import type { Rack } from "$lib/types";

  interface Props {
    rack: Rack;
    onclose?: () => void;
  }

  let { rack, onclose }: Props = $props();

  const layoutStore = getLayoutStore();
  const canvasStore = getCanvasStore();
  const widthOptions = [10, 19, 21, 23] as const;

  type ResizeErrorSource = "height" | "width" | "profile";

  // Local state for form fields (synced from rack prop)
  // Using untrack() to capture initial values - the $effect below handles reactive updates
  let rackName = $state(untrack(() => rack.name));
  let rackHeight = $state(untrack(() => rack.height));
  let rackDepth = $state(untrack(() => rack.depth_mm ?? DEFAULT_RACK_DEPTH_MM));
  let rackNotes = $state(untrack(() => rack.notes ?? ""));
  let resizeError = $state<string | null>(null);
  let resizeErrorSource = $state<ResizeErrorSource | null>(null);
  let depthError = $state<string | null>(null);

  function clearResizeError() {
    resizeError = null;
    resizeErrorSource = null;
  }

  function setResizeError(source: ResizeErrorSource, message: string) {
    resizeError = message;
    resizeErrorSource = source;
  }

  // Check if this rack is part of a bayed group
  const rackGroup = $derived(layoutStore.getRackGroupForRack(rack.id));
  const isBayedRack = $derived(rackGroup?.layout_preset === "bayed");
  const isRackMateRack = $derived(isRackMateT1Plus(rack));
  const bayCount = $derived(rackGroup?.rack_ids.length ?? 1);
  const heightPresets = $derived(
    isRackMateRack ? MINI_RACK_HEIGHTS : COMMON_RACK_HEIGHTS,
  );

  // State for bay count changes
  let bayCountError = $state<string | null>(null);

  // State for clear rack confirmation
  let showClearConfirm = $state(false);

  // Device count for clear confirmation
  const deviceCount = $derived(rack.devices.length);

  // Sync form fields when rack prop changes
  $effect(() => {
    rackName = rack.name;
    rackHeight = rack.height;
    rackDepth = rack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
    rackNotes = rack.notes ?? "";
    clearResizeError();
    depthError = null;
  });

  $effect(() => {
    if (!isRackMateRack) return;
    if (rack.depth_mm !== RACKMATE_T1_PLUS_DEPTH_MM) {
      rackDepth = RACKMATE_T1_PLUS_DEPTH_MM;
      depthError = null;
      layoutStore.updateRack(rack.id, {
        depth_mm: RACKMATE_T1_PLUS_DEPTH_MM,
      });
    }
    if (rack.height === RACKMATE_T1_PLUS_HEIGHT) return;

    const validation = canResizeRackTo(
      rack,
      RACKMATE_T1_PLUS_HEIGHT,
      layoutStore.device_types,
    );
    if (validation.allowed) {
      rackHeight = RACKMATE_T1_PLUS_HEIGHT;
      layoutStore.updateRack(rack.id, { height: RACKMATE_T1_PLUS_HEIGHT });
    } else {
      const conflicts = getConflictDetails(
        validation.conflicts,
        layoutStore.device_types,
      );
      setResizeError(
        "height",
        `RackMate T1 Plus is 8U; ${formatConflictMessage(conflicts)}`,
      );
      rackHeight = rack.height;
    }
  });

  // Update rack name on blur
  function handleNameBlur() {
    if (rackName !== rack.name) {
      layoutStore.updateRack(rack.id, { name: rackName });
    }
  }

  // Update rack name on Enter
  function handleNameKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      (event.target as HTMLInputElement).blur();
    }
  }

  // Update rack notes on blur
  function handleNotesBlur() {
    const trimmedNotes = rackNotes.trim();
    const notesToSave = trimmedNotes === "" ? undefined : trimmedNotes;
    if (notesToSave !== rack.notes) {
      layoutStore.updateRack(rack.id, { notes: notesToSave });
    }
  }

  // Validate and apply height change
  function attemptHeightChange(newHeight: number): boolean {
    if (isRackMateRack && newHeight !== RACKMATE_T1_PLUS_HEIGHT) {
      setResizeError("height", "RackMate T1 Plus is fixed at 8U");
      rackHeight = rack.height;
      return false;
    }

    // Validate the resize
    const validation = canResizeRackTo(
      rack,
      newHeight,
      layoutStore.device_types,
    );

    if (!validation.allowed) {
      const conflicts = getConflictDetails(
        validation.conflicts,
        layoutStore.device_types,
      );
      setResizeError("height", formatConflictMessage(conflicts));
      rackHeight = rack.height; // Reset to current
      return false;
    }

    // Clear error and apply change
    clearResizeError();
    layoutStore.updateRack(rack.id, { height: newHeight });
    // Reset view to center the resized rack
    canvasStore.fitAll(layoutStore.rack ? [layoutStore.rack] : []);
    return true;
  }

  // Update rack height on input change
  function handleHeightChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const newHeight = parseInt(target.value, 10);
    if (newHeight >= 1 && newHeight <= 100) {
      attemptHeightChange(newHeight);
    }
  }

  // Handle preset button click
  function handlePresetClick(preset: number) {
    rackHeight = preset;
    attemptHeightChange(preset);
  }

  function handleWidthPresetClick(width: Rack["width"]) {
    if (width === rack.width) {
      clearResizeError();
      return;
    }

    if (isBayedRack) {
      setResizeError("width", "Bayed rack widths must be changed as a group.");
      return;
    }

    const result = canFitRackDimensions(
      rack,
      {
        width,
        height: rack.height,
        depth_mm: rack.depth_mm,
      },
      layoutStore.device_types,
    );
    if (!result.allowed) {
      const conflicts = getConflictDetails(
        result.conflicts,
        layoutStore.device_types,
      );
      setResizeError(
        "width",
        `${width}-inch rails cannot contain ${formatConflictMessage(conflicts)}`,
      );
      return;
    }

    clearResizeError();
    layoutStore.updateRack(rack.id, {
      width,
      ...(isRackMateRack ? { profile: "generic" as const } : {}),
    });
  }

  function handleProfileChange(profile: "generic" | "rackmate") {
    const plan = planRackProfileChange(
      rack,
      layoutStore.device_types,
      profile,
      isBayedRack,
    );

    if (plan.kind === "noop") {
      clearResizeError();
      return;
    }
    if (plan.kind === "error") {
      setResizeError("profile", plan.message);
      rackHeight = rack.height;
      rackDepth = rack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
      return;
    }

    rackHeight = plan.updates.height ?? rack.height;
    rackDepth = plan.updates.depth_mm ?? rack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
    clearResizeError();
    depthError = null;
    layoutStore.updateRack(rack.id, plan.updates);
  }

  function applyDepth(value: number) {
    if (isRackMateRack && value !== RACKMATE_T1_PLUS_DEPTH_MM) {
      depthError = "RackMate T1 Plus depth is locked to 260 mm.";
      rackDepth = RACKMATE_T1_PLUS_DEPTH_MM;
      return;
    }

    if (!Number.isFinite(value) || value <= 0) {
      depthError = "Depth must be a positive number in millimetres.";
      rackDepth = rack.depth_mm ?? DEFAULT_RACK_DEPTH_MM;
      return;
    }

    depthError = null;
    rackDepth = value;
    if (value !== rack.depth_mm) {
      layoutStore.updateRack(rack.id, { depth_mm: value });
    }
  }

  function handleDepthChange(event: Event) {
    const raw = (event.target as HTMLInputElement).value;
    applyDepth(raw.trim() === "" ? Number.NaN : Number(raw));
  }

  // Handle bay count change atomically
  function handleBayCountChange(newCount: number) {
    if (!rackGroup) return;

    bayCountError = null;

    // Use atomic setBayCount which validates upfront before making changes
    const result = layoutStore.setBayCount(rackGroup.id, newCount);
    if (result.error) {
      bayCountError = result.error;
    }
  }

  // Clear all devices from rack
  function handleClearRack() {
    showClearConfirm = true;
  }

  function confirmClearRack() {
    layoutStore.clearRackRecorded(rack.id);
    showClearConfirm = false;
    onclose?.();
  }
</script>

<div class="rack-edit-sheet">
  <div class="edit-form">
    <!-- Rack Name -->
    <div class="form-group">
      <label for="rack-name-mobile">Name</label>
      <input
        type="text"
        id="rack-name-mobile"
        class="input-field"
        bind:value={rackName}
        onblur={handleNameBlur}
        onkeydown={handleNameKeydown}
        maxlength="50"
      />
    </div>

    <!-- Rack Height -->
    <div class="form-group">
      <label for="rack-height-mobile">Height</label>
      <input
        type="number"
        id="rack-height-mobile"
        class="input-field"
        class:error={resizeErrorSource === "height"}
        bind:value={rackHeight}
        onchange={handleHeightChange}
        min="1"
        max="100"
        disabled={isRackMateRack}
        aria-invalid={resizeErrorSource === "height"}
        aria-describedby={resizeErrorSource === "height"
          ? "rack-height-error-mobile"
          : undefined}
      />
      {#if resizeErrorSource === "height" && resizeError}
        <p id="rack-height-error-mobile" class="helper-text error" role="alert">
          Cannot resize: {resizeError}
        </p>
      {:else if isRackMateRack}
        <p class="helper-text">RackMate T1 Plus is fixed at 8U / 260mm</p>
      {/if}
      <div class="height-presets">
        {#each heightPresets as preset (preset)}
          <button
            type="button"
            class="preset-btn"
            data-testid="btn-preset-height-{preset}"
            class:active={rackHeight === preset}
            onclick={() => handlePresetClick(preset)}
          >
            {preset}U
          </button>
        {/each}
      </div>
    </div>

    <!-- Width (read-only for bayed and RackMate racks) -->
    {#if isBayedRack || isRackMateRack}
      <div class="form-group">
        <span class="form-label">Width</span>
        <div class="read-only-value">
          {rack.width}"{isRackMateRack ? " (RackMate T1 Plus)" : " (Bayed)"}
        </div>
      </div>
    {:else}
      <div class="form-group">
        <span class="form-label">Width</span>
        <div
          class="preset-row"
          role="group"
          aria-label="Rack width in inches"
          aria-describedby={resizeErrorSource === "width"
            ? "rack-width-error-mobile"
            : undefined}
        >
          {#each widthOptions as option (option)}
            <button
              type="button"
              class="preset-btn"
              class:active={rack.width === option}
              aria-pressed={rack.width === option}
              onclick={() => handleWidthPresetClick(option)}
            >
              {option}"
            </button>
          {/each}
        </div>
        {#if resizeErrorSource === "width" && resizeError}
          <p
            id="rack-width-error-mobile"
            class="helper-text error"
            role="alert"
          >
            Cannot resize: {resizeError}
          </p>
        {/if}
      </div>
    {/if}

    <div class="form-group">
      <span class="form-label">Profile</span>
      <SegmentedControl
        options={[
          { value: "generic", label: "Generic" },
          { value: "rackmate", label: "RackMate T1 Plus" },
        ]}
        value={isRackMateRack ? "rackmate" : "generic"}
        onchange={(value) =>
          handleProfileChange(value as "generic" | "rackmate")}
        ariaLabel="Rack profile"
        ariaDescribedBy={resizeErrorSource === "profile"
          ? "rack-profile-error-mobile"
          : undefined}
      />
      {#if resizeErrorSource === "profile" && resizeError}
        <p
          id="rack-profile-error-mobile"
          class="helper-text error"
          role="alert"
        >
          Cannot resize: {resizeError}
        </p>
      {/if}
    </div>

    <div class="form-group">
      <label for="rack-depth-mobile">Depth (mm)</label>
      <input
        type="number"
        id="rack-depth-mobile"
        class="input-field"
        class:error={depthError !== null}
        bind:value={rackDepth}
        onchange={handleDepthChange}
        min="1"
        step="1"
        readonly={isRackMateRack}
        aria-invalid={depthError !== null}
        aria-describedby={depthError ? "rack-depth-error-mobile" : undefined}
      />
      {#if depthError}
        <p id="rack-depth-error-mobile" class="helper-text error" role="alert">
          {depthError}
        </p>
      {/if}
    </div>

    <!-- Bay Count (only for bayed racks) -->
    {#if isBayedRack}
      <div class="form-group">
        <span class="form-label">Bay Count</span>
        <div
          class="bay-count-controls"
          role="group"
          aria-label="Bay count controls"
        >
          <button
            type="button"
            class="bay-btn"
            onclick={() => handleBayCountChange(bayCount - 1)}
            disabled={bayCount <= 2}
            aria-label="Remove bay"
          >
            −
          </button>
          <span class="bay-count-display">{bayCount}</span>
          <button
            type="button"
            class="bay-btn"
            onclick={() => handleBayCountChange(bayCount + 1)}
            aria-label="Add bay"
          >
            +
          </button>
        </div>
        {#if bayCountError}
          <p class="helper-text error">{bayCountError}</p>
        {/if}
      </div>
    {/if}

    <!-- U Numbering Direction -->
    <div class="form-group">
      <label for="rack-numbering-mobile">U Numbering</label>
      <SegmentedControl
        options={[
          { value: "bottom", label: "U1 at bottom" },
          { value: "top", label: "U1 at top" },
        ]}
        value={rack.desc_units ? "top" : "bottom"}
        onchange={(value) =>
          layoutStore.updateRack(rack.id, {
            desc_units: value === "top",
          })}
        ariaLabel="U numbering direction"
      />
    </div>

    <!-- Show Rear View Toggle -->
    <div class="form-group">
      <label for="show-rear-view-mobile">Show Rear View</label>
      <SegmentedControl
        options={[
          { value: "show", label: "Show" },
          { value: "hide", label: "Hide" },
        ]}
        value={rack.show_rear ? "show" : "hide"}
        onchange={(value) => {
          const showRear = value === "show";
          if (rackGroup) {
            // For bayed racks, update all racks in the group
            for (const rackId of rackGroup.rack_ids) {
              layoutStore.updateRack(rackId, { show_rear: showRear });
            }
          } else {
            layoutStore.updateRack(rack.id, { show_rear: showRear });
          }
        }}
        ariaLabel="Show rear view on canvas"
      />
    </div>

    <!-- Notes -->
    <div class="form-group">
      <label for="rack-notes-mobile">Notes</label>
      <textarea
        id="rack-notes-mobile"
        class="input-field textarea"
        bind:value={rackNotes}
        onblur={handleNotesBlur}
        rows="3"
        placeholder="Add notes about this rack..."></textarea>
    </div>

    <!-- Clear Rack Action -->
    <div class="actions">
      <button
        type="button"
        class="btn-danger"
        onclick={handleClearRack}
        disabled={deviceCount === 0}
        aria-label="Clear all devices from rack"
      >
        Clear Rack ({deviceCount}
        {deviceCount === 1 ? "device" : "devices"})
      </button>
    </div>
  </div>
</div>

<!-- Clear Rack Confirmation Dialog -->
<ConfirmDialog
  open={showClearConfirm}
  title="Clear Rack"
  message="Remove all {deviceCount} {deviceCount === 1
    ? 'device'
    : 'devices'} from this rack? This action can be undone."
  confirmLabel="Clear"
  destructive={true}
  onconfirm={confirmClearRack}
  oncancel={() => {
    showClearConfirm = false;
  }}
/>

<style>
  .rack-edit-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    overflow-y: auto;
    padding-top: var(--space-2);
  }

  .edit-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .form-group label,
  .form-group .form-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-secondary);
  }

  .input-field {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-base);
    color: var(--colour-text);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
    /* Ensure touch-friendly sizing */
    min-height: var(--touch-target-min);
  }

  .input-field:focus {
    outline: none;
    border-color: var(--colour-focus-ring);
    box-shadow: 0 0 0 2px var(--colour-focus-ring-alpha);
  }

  .input-field.error {
    border-color: var(--colour-error);
  }

  .input-field.textarea {
    resize: vertical;
    min-height: calc(var(--touch-target-min) * 2);
  }

  .helper-text {
    font-size: var(--font-size-xs);
    margin: 0;
  }

  .helper-text.error {
    color: var(--colour-error);
  }

  .read-only-value {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-base);
    color: var(--colour-text-secondary);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    min-height: var(--touch-target-min);
    display: flex;
    align-items: center;
  }

  .height-presets {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-2);
    flex-wrap: wrap;
  }

  .preset-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .bay-count-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .bay-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--touch-target-min);
    height: var(--touch-target-min);
    font-size: var(--font-size-xl);
    font-weight: 500;
    color: var(--colour-text);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .bay-btn:hover:not(:disabled) {
    background: var(--colour-surface-hover);
    border-color: var(--colour-selection);
  }

  .bay-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bay-btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .bay-count-display {
    font-size: var(--font-size-xl);
    font-weight: 600;
    min-width: 2ch;
    text-align: center;
  }

  .preset-btn {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--colour-text-secondary);
    background: var(--colour-surface-secondary);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      border-color 0.15s ease,
      color 0.15s ease;
    /* Touch-friendly size */
    min-height: var(--touch-target-min);
    min-width: var(--touch-target-min);
  }

  .preset-btn:hover,
  .preset-btn:focus-visible {
    background: var(--colour-surface-hover);
    border-color: var(--colour-border-hover);
  }

  .preset-btn.active {
    background: var(--colour-selection);
    border-color: var(--colour-selection);
    color: var(--colour-text-on-selection);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid var(--colour-border);
  }

  .btn-danger {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--colour-error);
    background: transparent;
    border: 1px solid var(--colour-error);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;
    /* Touch-friendly size */
    min-height: var(--touch-target-min);
  }

  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    background: var(--colour-error);
    color: var(--colour-text-on-primary);
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger:focus-visible {
    outline: 2px solid var(--colour-focus-ring);
    outline-offset: 2px;
  }
</style>
