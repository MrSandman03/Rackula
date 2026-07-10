<script lang="ts">
  import type { Snippet } from "svelte";
  import { Accordion } from "bits-ui";
  import type { DeviceType } from "$lib/types";
  import type { DeviceGroupingMode } from "$lib/utils/deviceGrouping";
  import { getCategoryDisplayName } from "$lib/utils/deviceFilters";
  import { truncateWithEllipsis } from "$lib/utils/searchHighlight";
  import { ICON_SIZE } from "$lib/constants/sizing";
  import VirtualList from "./VirtualList.svelte";
  import BrandIcon from "./BrandIcon.svelte";
  import IconPin from "./icons/IconPin.svelte";
  import type { DevicePaletteSection } from "./device-palette.types";

  interface Props {
    sections: DevicePaletteSection[];
    groupedGenericDevices: Array<[DeviceType["category"], DeviceType[]]>;
    pinnedDevices: DeviceType[];
    groupingMode: DeviceGroupingMode;
    flatFill: boolean;
    isSearchActive: boolean;
    hasActiveAttributeFilters: boolean;
    hasDevices: boolean;
    hasResults: boolean;
    preSearchSingleValue: string;
    rowHeight: number;
    virtualizeThreshold: number;
    virtualViewportMax: number;
    deviceRow: Snippet<[DeviceType]>;
    accordionMode?: "single" | "multiple";
    accordionSingleValue?: string;
    accordionMultipleValue?: string[];
  }

  let {
    sections,
    groupedGenericDevices,
    pinnedDevices,
    groupingMode,
    flatFill,
    isSearchActive,
    hasActiveAttributeFilters,
    hasDevices,
    hasResults,
    preSearchSingleValue,
    rowHeight,
    virtualizeThreshold,
    virtualViewportMax,
    deviceRow,
    accordionMode = $bindable("single"),
    accordionSingleValue = $bindable("generic"),
    accordionMultipleValue = $bindable(["generic"]),
  }: Props = $props();

  function handleAccordionTriggerClick() {
    if (accordionMode === "multiple" && !isSearchActive) {
      accordionMode = "single";
      accordionSingleValue = accordionMultipleValue[0] ?? preSearchSingleValue;
    }
  }

  function isSectionExpanded(sectionId: string): boolean {
    return accordionMode === "multiple"
      ? accordionMultipleValue.includes(sectionId)
      : accordionSingleValue === sectionId;
  }
</script>

<div class="device-list" class:fill-flat={flatFill}>
  {#snippet deviceList(devices: DeviceType[], label: string, fill = false)}
    {#if devices.length > virtualizeThreshold}
      <div
        class="virtual-section"
        class:fill
        style:height={fill
          ? null
          : `${Math.min(devices.length * rowHeight, virtualViewportMax)}px`}
      >
        <VirtualList
          items={devices}
          itemHeight={rowHeight}
          key={(device) => device.slug}
          ariaLabel={label}
        >
          {#snippet row(device)}
            {@render deviceRow(device)}
          {/snippet}
        </VirtualList>
      </div>
    {:else}
      <div class="section-devices" role="list" aria-label={label}>
        {#each devices as device (device.slug)}
          {@render deviceRow(device)}
        {/each}
      </div>
    {/if}
  {/snippet}

  {#if !hasDevices}
    <div class="empty-state">
      <p class="empty-message">No devices in library</p>
      <p class="empty-hint">Add a device to get started</p>
    </div>
  {:else if !hasResults}
    <div class="empty-state">
      <p class="empty-message">
        {#if isSearchActive && hasActiveAttributeFilters}
          No devices match your search and filters
        {:else if hasActiveAttributeFilters}
          No devices match your filters
        {:else}
          No devices match your search
        {/if}
      </p>
    </div>
  {:else}
    {#if pinnedDevices.length > 0}
      <section class="pinned-section" aria-label="Pinned devices">
        <h3 class="pinned-header">
          <IconPin size={ICON_SIZE.sm} filled />
          <span>Pinned</span>
          <span class="section-count">({pinnedDevices.length})</span>
        </h3>
        {@render deviceList(pinnedDevices, "Pinned devices")}
      </section>
    {/if}

    {#snippet accordionSections()}
      {#each sections as section (section.id)}
        <Accordion.Item value={section.id} class="accordion-item">
          <Accordion.Header>
            <Accordion.Trigger
              class="accordion-trigger{section.isEmpty
                ? ' has-no-matches'
                : ''}"
              onclick={handleAccordionTriggerClick}
            >
              <span class="section-header">
                {#if section.icon || section.id === "apc"}
                  <BrandIcon slug={section.icon} size={ICON_SIZE.sm} />
                {/if}
                <span class="section-title">{section.title}</span>
              </span>

              {#if isSearchActive && section.matchCount !== undefined}
                <span class="match-info">
                  <span class="match-count">({section.matchCount})</span>
                  {#if section.firstMatch && !isSectionExpanded(section.id)}
                    <span class="match-preview">
                      -
                      {truncateWithEllipsis(
                        section.firstMatch.model ?? section.firstMatch.slug,
                        30,
                      )}
                    </span>
                  {/if}
                </span>
              {:else}
                <span class="section-count">({section.devices.length})</span>
              {/if}
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content class="accordion-content">
            <div class="accordion-content-inner">
              {#if section.id === "generic" && groupingMode === "brand"}
                {#each groupedGenericDevices as [category, devices] (category)}
                  {#if !isSearchActive || devices.length > 0}
                    <div class="category-group">
                      <h3 class="category-header">
                        {getCategoryDisplayName(category)}
                      </h3>
                      {@render deviceList(
                        devices,
                        getCategoryDisplayName(category),
                      )}
                    </div>
                  {/if}
                {/each}
              {:else}
                {@render deviceList(section.devices, section.title, flatFill)}
              {/if}
            </div>
          </Accordion.Content>
        </Accordion.Item>
      {/each}
    {/snippet}

    {#if accordionMode === "multiple"}
      <Accordion.Root
        type="multiple"
        bind:value={accordionMultipleValue}
        class="device-accordion"
      >
        {@render accordionSections()}
      </Accordion.Root>
    {:else}
      <Accordion.Root
        type="single"
        bind:value={accordionSingleValue}
        class="device-accordion"
      >
        {@render accordionSections()}
      </Accordion.Root>
    {/if}
  {/if}
</div>

<style>
  .device-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2) 0;
  }

  :global(.accordion-trigger) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: calc(100% - var(--space-4));
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-align: left;
    background: var(--colour-surface-secondary);
    border: none;
    border-radius: var(--radius-sm);
    margin: var(--space-1) var(--space-2);
    cursor: pointer;
    color: var(--colour-text);
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }

  :global(.accordion-trigger:hover) {
    background: var(--colour-surface-hover);
  }

  :global(.accordion-trigger:focus-visible) {
    outline: 2px solid var(--colour-selection);
    outline-offset: -2px;
  }

  :global(.accordion-trigger[data-state="open"]) {
    background: var(--colour-surface-active);
  }

  :global(.accordion-trigger.has-no-matches) {
    opacity: 0.5;
    color: var(--colour-text-muted);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
  }

  .section-title {
    flex: 1;
  }

  .section-count {
    margin-left: var(--space-2);
    font-weight: 400;
    color: var(--colour-text-muted);
  }

  .match-info {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: var(--space-2);
  }

  .match-count {
    font-weight: 400;
    color: var(--colour-text-muted);
  }

  .match-preview {
    font-style: italic;
    font-weight: 400;
    color: var(--colour-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  :global(.accordion-content) {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 200ms ease-out;
    overflow: hidden;
  }

  :global(.accordion-content[data-state="open"]) {
    grid-template-rows: 1fr;
  }

  :global(.accordion-content[data-state="closed"]) {
    grid-template-rows: 0fr;
  }

  :global(.accordion-content-inner) {
    min-height: 0;
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.accordion-content) {
      transition: none;
    }
  }

  .category-group {
    margin-bottom: var(--space-2);
  }

  .category-header {
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--colour-text-muted);
  }

  .section-devices {
    display: flex;
    flex-direction: column;
  }

  .virtual-section {
    overflow: hidden;
  }

  .device-list.fill-flat {
    display: flex;
    flex-direction: column;
  }

  .device-list.fill-flat > .pinned-section {
    flex: 0 1 auto;
    min-height: 0;
    max-height: 45%;
    overflow-y: auto;
  }

  .device-list.fill-flat :global(.device-accordion) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .device-list.fill-flat
    :global(.device-accordion .accordion-item[data-state="open"]) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .device-list.fill-flat
    :global(.device-accordion .accordion-content[data-state="open"]) {
    flex: 1;
    min-height: 0;
  }

  .device-list.fill-flat :global(.accordion-content-inner) {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .virtual-section.fill {
    flex: 1;
    min-height: 0;
  }

  .device-list.fill-flat :global(.accordion-content) {
    transition: none;
  }

  .pinned-section {
    margin: var(--space-1) var(--space-2) var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--colour-border);
  }

  .pinned-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) var(--space-3) var(--space-1);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--colour-text-muted);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-6);
    text-align: center;
  }

  .empty-message {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--colour-text);
  }

  .empty-hint {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--colour-text-muted);
  }
</style>
