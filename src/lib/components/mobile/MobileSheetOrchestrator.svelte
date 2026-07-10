<script lang="ts">
  import type { DisplayMode, Layout } from "$lib/types";
  import type { ImageStoreMap } from "$lib/types/images";
  import { getLayoutStore } from "$lib/stores/layout.svelte";
  import { getUIStore } from "$lib/stores/ui.svelte";
  import { getCanvasStore } from "$lib/stores/canvas.svelte";
  import { getPlacementStore } from "$lib/stores/placement.svelte";
  import { dialogStore } from "$lib/stores/dialogs.svelte";
  import { getViewportStore } from "$lib/utils/viewport.svelte";
  import { handleFitAll } from "$lib/utils/app-actions";
  import { handleNewRack } from "$lib/utils/dialog-actions";
  import { hapticTap } from "$lib/utils/haptics";
  import Dialog from "$lib/components/Dialog.svelte";
  import LayoutYamlPanel from "$lib/components/LayoutYamlPanel.svelte";
  import RackEditSheet from "$lib/components/RackEditSheet.svelte";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import MobileBottomNav from "./MobileBottomNav.svelte";
  import MobileViewSheet from "./MobileViewSheet.svelte";
  import MobileLayoutsSheet from "./MobileLayoutsSheet.svelte";
  import MobileRacksSheet from "./MobileRacksSheet.svelte";

  interface Props {
    onyamlapply?: (
      layout: Layout,
      images?: ImageStoreMap,
      failedImagesCount?: number,
    ) => void | Promise<void>;
    onadddevice?: () => void;
  }

  let { onyamlapply, onadddevice }: Props = $props();

  const layoutStore = getLayoutStore();
  const uiStore = getUIStore();
  const canvasStore = getCanvasStore();
  const placementStore = getPlacementStore();
  const viewportStore = getViewportStore();

  const deviceLibrarySheetOpen = $derived(
    dialogStore.isSheetOpen("deviceLibrary"),
  );
  const yamlEditorSheetOpen = $derived(dialogStore.isSheetOpen("yamlEditor"));
  const rackEditSheetOpen = $derived(dialogStore.isSheetOpen("rackEdit"));
  const layoutsSheetOpen = $derived(dialogStore.isSheetOpen("layouts"));
  const racksSheetOpen = $derived(dialogStore.isSheetOpen("racks"));
  const viewSheetOpen = $derived(dialogStore.isSheetOpen("view"));

  function closeAndFit() {
    dialogStore.closeSheet();
    handleFitAll();
  }

  function handleViewSheetClick() {
    dialogStore.openSheet("view");
  }

  function handleDeviceLibraryTabClick() {
    dialogStore.openSheet("deviceLibrary");
  }

  function handleLayoutsTabClick() {
    dialogStore.openSheet("layouts");
  }

  function handleRacksTabClick() {
    dialogStore.openSheet("racks");
  }

  function handleMobileDeviceSelect(
    event: CustomEvent<{ device: import("$lib/types").DeviceType }>,
  ) {
    if (uiStore.readOnly) return;
    hapticTap();
    placementStore.startPlacement(event.detail.device);
    dialogStore.closeSheet();
  }

  function handleSetDisplayMode(mode: DisplayMode) {
    if (uiStore.displayMode === mode) return;
    uiStore.setDisplayMode(mode);
    layoutStore.updateDisplayMode(uiStore.displayMode);
    layoutStore.updateShowLabelsOnImages(uiStore.showLabelsOnImages);
  }

  function handleSetAnnotations(enabled: boolean) {
    uiStore.setAnnotations(enabled);
  }
</script>

<MobileBottomNav
  activeTab={layoutsSheetOpen
    ? "layouts"
    : racksSheetOpen
      ? "racks"
      : deviceLibrarySheetOpen
        ? "devices"
        : viewSheetOpen
          ? "view"
          : null}
  hidden={false}
  onlayoutsclick={handleLayoutsTabClick}
  onracksclick={handleRacksTabClick}
  ondevicesclick={handleDeviceLibraryTabClick}
  onviewclick={handleViewSheetClick}
/>

{#if viewportStore.isMobile && layoutsSheetOpen}
  <Dialog
    open={layoutsSheetOpen}
    title="Layouts"
    size="M"
    onclose={() => dialogStore.closeSheet()}
  >
    <MobileLayoutsSheet
      onnewlayout={handleNewRack}
      onclose={() => dialogStore.closeSheet()}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && racksSheetOpen}
  <Dialog
    open={racksSheetOpen}
    title="Racks"
    size="M"
    onclose={() => dialogStore.closeSheet()}
  >
    <MobileRacksSheet
      onnewrack={handleNewRack}
      onclose={() => dialogStore.closeSheet()}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && yamlEditorSheetOpen}
  <Dialog
    open={yamlEditorSheetOpen}
    title="Layout YAML"
    size="L"
    onclose={closeAndFit}
  >
    <LayoutYamlPanel
      open={yamlEditorSheetOpen}
      layout={layoutStore.layout}
      onapply={onyamlapply}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && viewSheetOpen}
  <Dialog open={viewSheetOpen} title="View" size="M" onclose={closeAndFit}>
    <MobileViewSheet
      displayMode={uiStore.displayMode}
      showAnnotations={uiStore.showAnnotations}
      ondisplaymodechange={handleSetDisplayMode}
      onannotationschange={handleSetAnnotations}
      onfitall={handleFitAll}
      onresetzoom={() => canvasStore.resetZoom()}
      onclose={() => dialogStore.closeSheet()}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && deviceLibrarySheetOpen}
  <Dialog
    open={deviceLibrarySheetOpen}
    title="Device Library"
    size="M"
    onclose={closeAndFit}
  >
    <DevicePalette
      ondeviceselect={handleMobileDeviceSelect}
      oncreatedevice={onadddevice}
    />
  </Dialog>
{/if}

{#if viewportStore.isMobile && rackEditSheetOpen && layoutStore.activeRack}
  <Dialog
    open={rackEditSheetOpen}
    title="Edit Rack"
    size="M"
    onclose={closeAndFit}
  >
    <RackEditSheet rack={layoutStore.activeRack} onclose={closeAndFit} />
  </Dialog>
{/if}
