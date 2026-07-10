<!--
  DevicePalette Component
  Displays the device library with search and category grouping
  Uses exclusive accordion (only one section open at a time)
-->
<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getToastStore } from "$lib/stores/toast.svelte";
  import {
    searchDevices,
    groupDevicesByCategory,
    groupDevicesByCategoryOrdered,
    getCategoryDisplayName,
    sortDevicesByBrandThenModel,
    sortDevicesAlphabetically,
    filterPaletteDevicesByRackWidth,
    filterDevicesByAttributes,
    isDeviceCompatibleWithRackWidth,
    getRackWidthIncompatibilityReason,
    categoryOrder,
    type DeviceAttributeFilters,
  } from "$lib/utils/deviceFilters";
  import {
    loadGroupingModeFromStorage,
    saveGroupingModeToStorage,
    type DeviceGroupingMode,
  } from "$lib/utils/deviceGrouping";
  import {
    loadFavouritesFromStorage,
    saveFavouritesToStorage,
    toggleFavourite,
  } from "$lib/utils/deviceFavourites";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { debounce } from "$lib/utils/debounce";
  import { getBrandPacks, getBrandSlugs } from "$lib/data/brandPacks";
  import { getStarterLibrary, getStarterSlugs } from "$lib/data/starterLibrary";
  import { getMountRecommendation } from "$lib/utils/mount-recommendations";
  import { getRackFitSummary } from "$lib/utils/rack-fit";
  import DevicePaletteItem from "./DevicePaletteItem.svelte";
  import SegmentedControl from "./SegmentedControl.svelte";
  import DeviceFilterPopover from "./DeviceFilterPopover.svelte";
  import DevicePaletteList from "./DevicePaletteList.svelte";
  import type { DevicePaletteSection } from "./device-palette.types";
  import type { DeviceType } from "$lib/types";

  interface Props {
    ondeviceselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
    oncreatedevice?: () => void;
  }

  let { ondeviceselect, oncreatedevice }: Props = $props();

  // Fixed palette row height in pixels, shared with DevicePaletteItem's
  // --touch-target-min block size. VirtualList requires exact row geometry.
  const ROW_HEIGHT = 48;
  // Below this row count a section renders as plain DOM so the accordion's
  // height animation and the generic section's category sub-grouping stay
  // intact. Long lists (big brand packs, A-Z mode) switch to windowing.
  const VIRTUALIZE_THRESHOLD = 30;
  // Cap the windowed viewport so a long section scrolls within itself rather
  // than stretching the whole palette to thousands of pixels.
  const VIRTUAL_VIEWPORT_MAX = 480;

  const layoutStore = getLayoutStore();
  const toastStore = getToastStore();
  const uiStore = getUIStore();

  // Search state with debouncing
  let searchQueryRaw = $state("");
  let searchQuery = $state("");
  const isSearchActive = $derived(searchQuery.trim().length > 0);

  // Attribute filter state, session-only (no persistence; resets on reload).
  // SvelteSet keeps mutations to the height bucket set reactive.
  let attributeFilters = $state<DeviceAttributeFilters>({
    heights: new SvelteSet(),
    halfWidth: false,
    fullWidth: false,
    hasImage: false,
    customOnly: false,
  });

  // Custom detection injected into the attribute predicate.
  const isCustomDevice = (slug: string) => layoutStore.isCustomDeviceType(slug);

  const hasActiveAttributeFilters = $derived(
    attributeFilters.heights.size > 0 ||
      attributeFilters.halfWidth !== attributeFilters.fullWidth ||
      attributeFilters.hasImage ||
      attributeFilters.customOnly,
  );

  // Grouping mode state with localStorage persistence
  let groupingMode = $state<DeviceGroupingMode>(loadGroupingModeFromStorage());

  // Grouping mode options for SegmentedControl
  const groupingModeOptions: { value: DeviceGroupingMode; label: string }[] = [
    { value: "brand", label: "Brand" },
    { value: "category", label: "Category" },
    { value: "flat", label: "A-Z" },
  ];

  function handleGroupingModeChange(newMode: DeviceGroupingMode) {
    groupingMode = newMode;
    saveGroupingModeToStorage(newMode);
  }

  // Favourites (pinned device slugs) with localStorage persistence.
  // Insertion order drives the pinned section order.
  let favouriteSlugs = $state<Set<string>>(loadFavouritesFromStorage());

  function isFavourite(slug: string): boolean {
    return favouriteSlugs.has(slug);
  }

  function handleToggleFavourite(event: CustomEvent<{ device: DeviceType }>) {
    favouriteSlugs = toggleFavourite(favouriteSlugs, event.detail.device.slug);
    saveFavouritesToStorage(favouriteSlugs);
  }

  // Accordion mode and state tracking
  let accordionMode = $state<"single" | "multiple">("single");

  /**
   * Get the default accordion value (expanded section) based on grouping mode
   */
  function getDefaultAccordionValue(mode: DeviceGroupingMode): string {
    switch (mode) {
      case "brand":
        return "generic"; // Generic section expanded by default
      case "category":
        return "server"; // Server category expanded by default
      case "flat":
        return "all"; // Single "All Devices" section expanded
      default:
        return "generic";
    }
  }

  // Keep single/multiple values separate to satisfy bits-ui's discriminated prop types.
  let accordionSingleValue = $state("generic");
  let accordionMultipleValue = $state<string[]>(["generic"]);
  let preSearchSingleValue = $state("generic");

  // Sync accordion value when grouping mode changes
  $effect(() => {
    // Reset accordion to default expanded section when mode changes
    const defaultValue = getDefaultAccordionValue(groupingMode);
    accordionSingleValue = defaultValue;
    accordionMultipleValue = [defaultValue];
    preSearchSingleValue = defaultValue;
    accordionMode = "single";
  });

  // Debounce search input
  const updateSearchQuery = debounce((value: string) => {
    searchQuery = value;
  }, 150);

  // Get brand packs
  const brandPacks = getBrandPacks();

  // Get active rack width for filtering (defaults to 19" standard if no active rack)
  const activeRackWidth = $derived(layoutStore.activeRack?.width ?? 19);

  // Get unused custom device type slugs for showing delete buttons
  // This is reactive and updates when devices are placed/removed
  const unusedCustomDeviceSlugs = $derived.by(() => {
    const unused = layoutStore.getUnusedCustomDeviceTypes();
    return new Set(unused.map((d) => d.slug));
  });

  /**
   * Check if a device type can be deleted (is an unused custom type)
   */
  function canDeleteDevice(device: DeviceType): boolean {
    return unusedCustomDeviceSlugs.has(device.slug);
  }

  // Batch delete state for grouping rapid successive deletes
  // Using $state for HMR compatibility and proper reactivity
  let pendingDeletes = $state<DeviceType[]>([]);
  let pendingToastId = $state<string | null>(null);
  let batchTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  const BATCH_DELAY = 500; // ms to wait before showing toast

  /**
   * Show batch toast for pending deletes
   */
  function showBatchToast() {
    if (pendingDeletes.length === 0) return;

    const deletedTypes = [...pendingDeletes];
    pendingDeletes = [];

    // Dismiss any existing pending toast
    if (pendingToastId) {
      toastStore.dismissToast(pendingToastId);
      pendingToastId = null;
    }

    const firstDeleted = deletedTypes[0];
    const singleDeleteMessage =
      deletedTypes.length === 1 && firstDeleted
        ? `Deleted "${firstDeleted.model ?? firstDeleted.slug}"`
        : null;
    const message =
      singleDeleteMessage ?? `Deleted ${deletedTypes.length} device types`;

    const actionLabel = deletedTypes.length === 1 ? "Undo" : "Undo All";

    // Capture current toast ID for race condition check
    const thisToastId = toastStore.showToast(message, "info", 5000, {
      label: actionLabel,
      onClick: () => {
        // Undo: call undo() for each deleted device type to maintain history consistency
        // This properly removes the delete actions from history
        for (let i = 0; i < deletedTypes.length; i++) {
          layoutStore.undo();
        }
        pendingToastId = null;
      },
    });
    pendingToastId = thisToastId;

    // Clear toast ID after it auto-dismisses, with race condition check
    setTimeout(() => {
      // Only clear if this is still the active toast (wasn't manually dismissed or replaced)
      if (pendingToastId === thisToastId) {
        pendingToastId = null;
      }
    }, 5500);
  }

  /**
   * Handle device type deletion with toast undo support
   * Groups rapid successive deletes into a batch toast
   */
  function handleDeviceDelete(event: CustomEvent<{ device: DeviceType }>) {
    const device = event.detail.device;

    // Store the device type for potential undo
    const deletedDeviceType = { ...device };
    pendingDeletes.push(deletedDeviceType);

    // Delete the device type (each delete is recorded for Ctrl+Z undo)
    layoutStore.deleteDeviceTypeRecorded(device.slug);

    // Reset batch timer - wait for more potential deletes
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
    batchTimeout = setTimeout(showBatchToast, BATCH_DELAY);
  }

  // Merge starter library with layout device types for display
  // Starter library is always available; layout.device_types contains placed/custom devices
  // Custom devices with same slug as starter will shadow (replace) the starter version
  // Brand devices are excluded - they appear in their respective brand sections
  const allGenericDevices = $derived.by(() => {
    const starter = getStarterLibrary();
    const placed = layoutStore.device_types;
    const placedSlugs = new Set(placed.map((d) => d.slug));
    const starterSlugs = getStarterSlugs();
    const brandSlugs = getBrandSlugs();

    // Starter devices (excluding any shadowed by placed), then custom devices not in starter or brands
    return [
      ...starter.filter((d) => !placedSlugs.has(d.slug)),
      ...placed.filter((d) => starterSlugs.has(d.slug)), // Placed versions of starter devices
      ...placed.filter(
        (d) => !starterSlugs.has(d.slug) && !brandSlugs.has(d.slug),
      ), // Custom devices only
    ];
  });

  // Filter and search generic devices - only show devices compatible with active rack
  const allPaletteDevices = $derived([
    ...allGenericDevices,
    ...brandPacks.flatMap((pack) => pack.devices),
  ]);
  const fitSummaryBySlug = $derived.by(() => {
    const summaries: Record<string, ReturnType<typeof getRackFitSummary>> = {};

    for (const device of allPaletteDevices) {
      summaries[device.slug] = getRackFitSummary(
        device,
        activeRackWidth,
        allPaletteDevices,
        layoutStore.activeRack?.profile,
        layoutStore.activeRack?.depth_mm,
        layoutStore.activeRack?.height,
      );
    }

    return summaries;
  });
  const deviceCompatibilityBySlug = $derived.by(() => {
    const compatibility: Record<
      string,
      { isCompatible: boolean; incompatibilityReason: string | null }
    > = {};

    for (const device of allPaletteDevices) {
      const widthCompatible = isDeviceCompatibleWithRackWidth(
        device,
        activeRackWidth,
      );
      const blockedSummary =
        fitSummaryBySlug[device.slug]?.tone === "blocked"
          ? fitSummaryBySlug[device.slug]
          : null;
      const compatible = widthCompatible && !blockedSummary;
      compatibility[device.slug] = {
        isCompatible: compatible,
        incompatibilityReason: compatible
          ? null
          : (blockedSummary?.title ??
            getRackWidthIncompatibilityReason(device, activeRackWidth)),
      };
    }

    return compatibility;
  });

  const placementRequirementBySlug = $derived.by(() => {
    const requirements: Record<string, string | null> = {};

    for (const device of allPaletteDevices) {
      requirements[device.slug] =
        getMountRecommendation(device, activeRackWidth, allPaletteDevices)
          ?.summary ?? null;
    }

    return requirements;
  });

  const visibleGenericDevices = $derived(
    filterDevicesByAttributes(
      filterPaletteDevicesByRackWidth(
        allGenericDevices,
        activeRackWidth,
        uiStore.compatibleOnly,
      ),
      attributeFilters,
      isCustomDevice,
    ).filter((device) => !uiStore.compatibleOnly || isCompatible(device)),
  );
  const filteredGenericDevices = $derived(
    searchDevices(visibleGenericDevices, searchQuery),
  );
  // Ordered [category, devices] entries (#2723). While browsing, categories
  // follow categoryOrder and devices sort A-Z within each. During a search,
  // preserve the Fuse relevance order (insertion order) within each category so
  // the generic section stays relevance-ranked like the brand sections.
  const groupedGenericDevices = $derived(
    isSearchActive
      ? [...groupDevicesByCategory(filteredGenericDevices).entries()]
      : groupDevicesByCategoryOrdered(filteredGenericDevices),
  );

  // Filter and search brand pack devices - only show compatible devices
  const filteredBrandPacks = $derived(
    brandPacks.map((pack) => ({
      ...pack,
      devices: searchDevices(
        filterDevicesByAttributes(
          filterPaletteDevicesByRackWidth(
            pack.devices,
            activeRackWidth,
            uiStore.compatibleOnly,
          ),
          attributeFilters,
          isCustomDevice,
        ),
        searchQuery,
      ).filter((device) => !uiStore.compatibleOnly || isCompatible(device)),
    })),
  );

  // Brand packs arrive A-Z by title from getBrandPacks(); filteredBrandPacks is
  // a map that preserves that order, so no render-time re-sort is needed (#2723).

  // All devices combined (for category and flat modes) - filtered by rack width
  const allDevicesCombined = $derived(
    filterDevicesByAttributes(
      filterPaletteDevicesByRackWidth(
        allPaletteDevices,
        activeRackWidth,
        uiStore.compatibleOnly,
      ),
      attributeFilters,
      isCustomDevice,
    ).filter((device) => !uiStore.compatibleOnly || isCompatible(device)),
  );
  const filteredAllDevices = $derived(
    searchDevices(allDevicesCombined, searchQuery),
  );

  // Flat A-Z mode renders a single windowed section. Unlike grouped views,
  // where many sections share the panel under the VIRTUAL_VIEWPORT_MAX cap,
  // this lone section should grow to fill the panel and scroll within itself.
  // Gate the fill on the virtualized path: short, search-filtered results stay
  // on the plain-DOM branch and keep their natural height + the list scroll.
  const flatFill = $derived(
    groupingMode === "flat" && filteredAllDevices.length > VIRTUALIZE_THRESHOLD,
  );

  // Pinned devices: resolve favourite slugs against the same width/compat/search
  // filtered pool the rest of the palette uses, preserving favourite order.
  // Collect only the matching devices (favourites are few) rather than indexing
  // the whole pool, so the search hot path stays cheap.
  const pinnedDevices = $derived.by<DeviceType[]>(() => {
    if (favouriteSlugs.size === 0) return [];
    const matches: Record<string, DeviceType> = {};
    for (const device of filteredAllDevices) {
      if (favouriteSlugs.has(device.slug)) matches[device.slug] = device;
    }
    const result: DeviceType[] = [];
    for (const slug of favouriteSlugs) {
      const device = matches[slug];
      if (device) result.push(device);
    }
    return result;
  });

  // Sections for brand mode - filter out empty sections (no compatible devices)
  const brandModeSections = $derived<DevicePaletteSection[]>(
    [
      {
        id: "generic",
        title: "Generic",
        devices: filteredGenericDevices,
        defaultExpanded: true,
      },
      ...filteredBrandPacks,
    ]
      .filter((section) => section.devices.length > 0)
      .map((section) => {
        if (!isSearchActive) {
          return section;
        }

        // During search, compute match info
        const matchCount = section.devices.length;
        const firstMatch = section.devices[0];
        const isEmpty = matchCount === 0;

        return {
          ...section,
          matchCount,
          firstMatch,
          isEmpty,
        };
      }),
  );

  // Sections for category mode
  const categoryModeSections = $derived.by<DevicePaletteSection[]>(() => {
    const grouped = groupDevicesByCategory(filteredAllDevices);

    return categoryOrder
      .filter((cat) => grouped.has(cat))
      .map((cat) => {
        const devices = sortDevicesByBrandThenModel(grouped.get(cat) ?? []);
        const matchCount = devices.length;
        const firstMatch = devices[0];
        const isEmpty = matchCount === 0;

        return {
          id: cat,
          title: getCategoryDisplayName(cat),
          devices,
          defaultExpanded: cat === "server",
          matchCount: isSearchActive ? matchCount : undefined,
          firstMatch: isSearchActive ? firstMatch : undefined,
          isEmpty: isSearchActive ? isEmpty : undefined,
        };
      });
  });

  // Sections for flat mode (single "All Devices" section)
  const flatModeSections = $derived.by<DevicePaletteSection[]>(() => [
    {
      id: "all",
      title: "All Devices",
      devices: sortDevicesAlphabetically(filteredAllDevices),
      defaultExpanded: true,
      matchCount: isSearchActive ? filteredAllDevices.length : undefined,
      firstMatch: isSearchActive ? filteredAllDevices[0] : undefined,
      isEmpty: isSearchActive ? filteredAllDevices.length === 0 : undefined,
    },
  ]);

  // Select sections based on grouping mode
  const sections = $derived.by<DevicePaletteSection[]>(() => {
    switch (groupingMode) {
      case "category":
        return categoryModeSections;
      case "flat":
        return flatModeSections;
      case "brand":
      default:
        return brandModeSections;
    }
  });

  // Check if any section has devices (filtered by search)
  const totalDevicesCount = $derived(
    sections.reduce((acc, s) => acc + s.devices.length, 0),
  );
  const hasDevices = $derived(
    allGenericDevices.length > 0 || brandPacks.length > 0,
  );
  const hasResults = $derived(totalDevicesCount > 0);

  // Reactive accordion mode switching based on search state
  $effect(() => {
    if (isSearchActive) {
      // Entering search: save current state and switch to multi-mode
      if (accordionMode === "single") {
        preSearchSingleValue = accordionSingleValue;
      }
      accordionMode = "multiple";

      // Auto-expand all sections with matches
      const sectionsWithMatches = sections
        .filter((s) => !s.isEmpty && s.devices.length > 0)
        .map((s) => s.id);
      accordionMultipleValue = sectionsWithMatches;
    } else if (accordionMode === "multiple") {
      // Exiting search: restore previous state but stay in multi-mode
      // (will switch back to single on user interaction)
      accordionMultipleValue = [preSearchSingleValue];
    }
  });

  function handleDeviceSelect(event: CustomEvent<{ device: DeviceType }>) {
    if (!isCompatible(event.detail.device)) return;
    ondeviceselect?.(event);
  }

  function isCompatible(device: DeviceType): boolean {
    return deviceCompatibilityBySlug[device.slug]?.isCompatible ?? true;
  }

  function incompatibilityReason(device: DeviceType): string | null {
    return (
      deviceCompatibilityBySlug[device.slug]?.incompatibilityReason ?? null
    );
  }

  function placementRequirement(device: DeviceType): string | null {
    return placementRequirementBySlug[device.slug] ?? null;
  }

  function fitSummary(device: DeviceType) {
    return fitSummaryBySlug[device.slug] ?? null;
  }
</script>

<div class="device-palette">
  <!-- Grouping Mode and Search -->
  <div class="search-container">
    <div class="grouping-toggle">
      <SegmentedControl
        options={groupingModeOptions}
        value={groupingMode}
        onchange={handleGroupingModeChange}
        ariaLabel="Grouping mode"
      />
    </div>
    <div class="search-row">
      <input
        type="search"
        class="search-input"
        placeholder="Search devices..."
        bind:value={searchQueryRaw}
        oninput={() => updateSearchQuery(searchQueryRaw)}
        aria-label="Search devices"
        data-testid="search-devices"
      />
      <DeviceFilterPopover bind:filters={attributeFilters} />
    </div>
  </div>

  <!-- Search outcome for screen readers. The visual list filters live, but
       AT users need the result announced; polite so it never interrupts
       typing. Text settles at most once per debounce (150ms). -->
  <div class="sr-only" role="status" data-testid="palette-search-announcer">
    {#if isSearchActive}
      {hasResults
        ? `${totalDevicesCount} ${totalDevicesCount === 1 ? "device" : "devices"} found`
        : "No devices match"}
    {/if}
  </div>

  {#snippet deviceRow(device: DeviceType)}
    <DevicePaletteItem
      {device}
      searchQuery={isSearchActive ? searchQuery : ""}
      isCompatible={isCompatible(device)}
      incompatibilityReason={incompatibilityReason(device)}
      placementRequirement={placementRequirement(device)}
      fitSummary={fitSummary(device)}
      canDelete={canDeleteDevice(device)}
      isFavourite={isFavourite(device.slug)}
      onselect={handleDeviceSelect}
      ondelete={handleDeviceDelete}
      ontogglefavourite={handleToggleFavourite}
    />
  {/snippet}

  <DevicePaletteList
    {sections}
    {groupedGenericDevices}
    {pinnedDevices}
    {groupingMode}
    {flatFill}
    {isSearchActive}
    {hasActiveAttributeFilters}
    {hasDevices}
    {hasResults}
    {preSearchSingleValue}
    rowHeight={ROW_HEIGHT}
    virtualizeThreshold={VIRTUALIZE_THRESHOLD}
    virtualViewportMax={VIRTUAL_VIEWPORT_MAX}
    {deviceRow}
    bind:accordionMode
    bind:accordionSingleValue
    bind:accordionMultipleValue
  />

  {#if oncreatedevice}
    <div class="palette-footer">
      <button
        type="button"
        class="add-device-btn"
        onclick={oncreatedevice}
        data-testid="btn-create-custom-device"
      >
        <span class="add-device-glyph" aria-hidden="true">+</span>
        Add custom device
      </button>
    </div>
  {/if}
</div>

<style>
  .device-palette {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .search-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-3);
  }

  /* The Brand/Category/A-Z grouping toggle is sized to 44px here (the device
     palette's own touch-target standard, #2397), without changing the shared
     SegmentedControl used elsewhere in the app. */
  .grouping-toggle :global(.segment) {
    min-height: 44px;
  }

  .search-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .search-input {
    flex: 1;
    /* 44px control height, matching the tab rows and the touch standard (#2397). */
    height: 44px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--colour-text);
    background-color: var(--input-bg);
    border: 1px solid var(--colour-border);
    border-radius: var(--radius-sm);
    outline: none;
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  /* Footer pinned below the scrolling device list: .device-list takes the
     remaining height (flex: 1), so this block sits flush at the panel bottom.
     A top border separates it from the list as it scrolls. */
  .palette-footer {
    flex-shrink: 0;
    padding: var(--space-2);
    border-top: 1px solid var(--colour-border);
  }

  /* Neutral form-control vocabulary shared with the edit panel's colour swatch
     and name-edit controls (#2524): input-bg fill, input-border, selection
     border on hover and focus. 44px height keeps the touch standard (#2397). */
  .add-device-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    min-height: 44px;
    padding: 0 var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1;
    color: var(--colour-text-muted);
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  .add-device-glyph {
    font-size: var(--font-size-lg);
    font-weight: 400;
  }

  .add-device-btn:hover {
    color: var(--colour-text);
    border-color: var(--colour-selection);
  }

  .add-device-btn:focus-visible {
    outline: 2px solid var(--colour-selection);
    outline-offset: 2px;
  }

  .add-device-btn:active {
    background: var(--colour-surface-active);
  }

  .search-input::placeholder {
    color: var(--colour-text-muted);
  }

  .search-input:focus {
    border-color: var(--colour-selection);
    box-shadow: var(--glow-pink-sm);
  }
</style>
