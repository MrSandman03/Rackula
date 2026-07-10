<script lang="ts">
  import type { SvelteSet } from "svelte/reactivity";
  import type { SelectableExportItem } from "./export-dialog.types";

  interface Props {
    items: SelectableExportItem[];
    selectedRackIds: SvelteSet<string>;
    message: string | null;
    onitemtoggle?: (item: SelectableExportItem, selected: boolean) => void;
    onselectall?: () => void;
    ondeselectall?: () => void;
  }

  let {
    items,
    selectedRackIds,
    message,
    onitemtoggle,
    onselectall,
    ondeselectall,
  }: Props = $props();

  function isItemSelected(item: SelectableExportItem): boolean {
    return item.rackIds.every((id) => selectedRackIds.has(id));
  }

  function isItemPartiallySelected(item: SelectableExportItem): boolean {
    const selectedCount = item.rackIds.filter((id) =>
      selectedRackIds.has(id),
    ).length;
    return selectedCount > 0 && selectedCount < item.rackIds.length;
  }

  const selectedItemsCount = $derived(
    items.filter((item) => isItemSelected(item)).length,
  );
</script>

<div class="form-group rack-selection">
  <div class="rack-selection-header">
    <span class="section-label">Racks</span>
    <div class="rack-selection-actions">
      <button
        type="button"
        class="btn-link"
        onclick={onselectall}
        disabled={selectedItemsCount === items.length}
      >
        Select All
      </button>
      <span class="separator">|</span>
      <button
        type="button"
        class="btn-link"
        onclick={ondeselectall}
        disabled={selectedRackIds.size === 0}
      >
        Deselect All
      </button>
    </div>
  </div>
  <div class="rack-checklist">
    {#each items as item (item.id)}
      <label class="rack-item" class:bayed-group={item.isBayedGroup}>
        <input
          type="checkbox"
          checked={isItemSelected(item)}
          indeterminate={isItemPartiallySelected(item)}
          onchange={() => onitemtoggle?.(item, !isItemSelected(item))}
        />
        <span class="rack-name">{item.name}</span>
        <span class="rack-height">{item.heightDisplay}</span>
      </label>
    {/each}
  </div>
</div>

{#if message}
  <div class="info-message">
    <span class="info-icon">ℹ️</span>
    <span>{message}</span>
  </div>
{/if}

<style>
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-1-5);
  }

  .rack-selection {
    gap: var(--space-2);
  }

  .rack-selection-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .section-label {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--colour-text);
  }

  .rack-selection-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--colour-selection);
    font-size: var(--font-size-sm);
    cursor: pointer;
    padding: 0;
  }

  .btn-link:hover:not(:disabled) {
    text-decoration: underline;
  }

  .btn-link:disabled {
    color: var(--colour-text-muted);
    cursor: not-allowed;
  }

  .separator {
    color: var(--colour-text-muted);
  }

  .rack-checklist {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }

  .rack-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-normal);
  }

  .rack-item:hover {
    background: var(--colour-surface-hover);
  }

  .rack-item input[type="checkbox"] {
    width: var(--space-4);
    height: var(--space-4);
    accent-color: var(--colour-selection);
    cursor: pointer;
    flex-shrink: 0;
  }

  .rack-name {
    flex: 1;
    font-size: var(--font-size-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rack-height {
    font-size: var(--font-size-xs);
    color: var(--colour-text-muted);
    flex-shrink: 0;
  }

  .rack-item.bayed-group .rack-name::before {
    content: "";
    display: inline-block;
    width: var(--space-1-5);
    height: var(--space-1-5);
    background: var(--colour-selection);
    border-radius: 50%;
    margin-right: var(--space-1-5);
    vertical-align: middle;
  }

  .info-message {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--colour-surface-hover);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
  }

  .info-icon {
    flex-shrink: 0;
  }
</style>
