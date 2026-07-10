<script lang="ts">
  import { SvelteMap } from "svelte/reactivity";
  import type { DeviceType, PlacedDevice } from "$lib/types";
  import { buildSlotGeometry } from "$lib/utils/slot-geometry";
  import {
    createRackDeviceDragData,
    setCurrentDragData,
  } from "$lib/utils/dragdrop";
  import {
    hideDragTooltip,
    showDragTooltip,
    updateDragTooltipPosition,
  } from "$lib/stores/dragTooltip.svelte";
  import { getContextMenuCoordinates } from "$lib/utils/context-menu-position";
  import { hapticTap } from "$lib/utils/haptics";

  interface ChildPlacement {
    placedDevice: PlacedDevice;
    originalIndex: number;
  }

  interface SlotGeometry {
    x: number;
    y: number;
    width: number;
    height: number;
    heightUnits: number;
  }

  interface Props {
    containerType: DeviceType;
    containerWidth: number;
    containerHeight: number;
    uHeight: number;
    children: ChildPlacement[];
    deviceLibrary: DeviceType[];
    selectedChildId: string | null;
    parentDisplayName: string;
    rackId: string;
    currentFace: "front" | "rear";
    onselect?: (
      event: CustomEvent<{
        deviceId?: string;
        slug: string;
        position: number;
        face: "front" | "rear";
      }>,
    ) => void;
    ondragstart?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    ondragend?: () => void;
    onduplicate?: (
      event: CustomEvent<{ rackId: string; deviceIndex: number }>,
    ) => void;
    oncontextmenuopen?: (
      event: CustomEvent<{
        rackId: string;
        deviceIndex: number;
        deviceId: string;
        x: number;
        y: number;
      }>,
    ) => void;
  }

  let {
    containerType,
    containerWidth,
    containerHeight,
    uHeight,
    children,
    deviceLibrary,
    selectedChildId,
    parentDisplayName,
    rackId,
    currentFace,
    onselect,
    ondragstart,
    ondragend,
    onduplicate,
    oncontextmenuopen,
  }: Props = $props();

  type PointerState = "idle" | "pressing" | "dragging";
  const DRAG_THRESHOLD = 3;
  let pointerState = $state<PointerState>("idle");
  let pointerStartPos = $state<{ x: number; y: number } | null>(null);
  let activePointerId = $state<number | null>(null);
  let activeChildId = $state<string | null>(null);
  let draggingChildId = $state<string | null>(null);
  let activeChildRectElement = $state<SVGRectElement | null>(null);

  const slotGeometry = $derived.by(() => {
    if (!containerType.slots?.length) {
      return new SvelteMap<string, SlotGeometry>();
    }
    return new SvelteMap<string, SlotGeometry>(
      buildSlotGeometry(
        containerType.slots,
        containerWidth,
        containerHeight,
        containerType.u_height,
      ),
    );
  });

  function getChildDeviceType(slug: string): DeviceType | undefined {
    return deviceLibrary.find((device) => device.slug === slug);
  }

  function getChildY(child: PlacedDevice, childUHeight: number): number {
    const slot = child.slot_id ? slotGeometry.get(child.slot_id) : undefined;
    if (slot) {
      return slot.y + slot.height - (child.position + childUHeight) * uHeight;
    }
    return containerHeight - (child.position + childUHeight) * uHeight;
  }

  function emitSelection(child: PlacedDevice, childType: DeviceType): void {
    onselect?.(
      new CustomEvent("select", {
        detail: {
          deviceId: child.id,
          slug: childType.slug,
          position: child.position,
          face: currentFace,
        },
      }),
    );
  }

  function handleClick(
    event: MouseEvent,
    child: PlacedDevice,
    childType: DeviceType,
  ): void {
    event.stopPropagation();
    if (event.button !== 0 || event.detail !== 0) return;
    emitSelection(child, childType);
  }

  function handleKeyDown(
    event: KeyboardEvent,
    child: PlacedDevice,
    childType: DeviceType,
  ): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    emitSelection(child, childType);
  }

  function handleContextMenu(
    event: MouseEvent,
    child: PlacedDevice,
    originalIndex: number,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const { x, y } = getContextMenuCoordinates(
      event,
      event.currentTarget as Element,
    );
    if (oncontextmenuopen) {
      oncontextmenuopen(
        new CustomEvent("contextmenuopen", {
          detail: {
            rackId,
            deviceIndex: originalIndex,
            deviceId: child.id,
            x,
            y,
          },
        }),
      );
    } else {
      onduplicate?.(
        new CustomEvent("duplicate", {
          detail: { rackId, deviceIndex: originalIndex },
        }),
      );
    }
  }

  function handlePointerDown(event: PointerEvent, child: PlacedDevice): void {
    if (!event.isPrimary) return;
    if (
      (event.pointerType === "mouse" || event.pointerType === "pen") &&
      event.button !== 0
    ) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    pointerStartPos = { x: event.clientX, y: event.clientY };
    pointerState = "pressing";
    activePointerId = event.pointerId;
    activeChildId = child.id;
    activeChildRectElement = (
      event.currentTarget as SVGGElement
    ).querySelector<SVGRectElement>(".child-device-rect");
    try {
      activeChildRectElement?.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be owned by the browser.
    }
  }

  function handlePointerMove(
    event: PointerEvent,
    child: PlacedDevice,
    childType: DeviceType,
    originalIndex: number,
  ): void {
    if (
      event.pointerId !== activePointerId ||
      child.id !== activeChildId ||
      !pointerStartPos
    ) {
      return;
    }

    if (pointerState === "pressing") {
      const distance = Math.hypot(
        event.clientX - pointerStartPos.x,
        event.clientY - pointerStartPos.y,
      );
      if (distance >= DRAG_THRESHOLD) {
        pointerState = "dragging";
        draggingChildId = child.id;
        setCurrentDragData(
          createRackDeviceDragData(childType, rackId, originalIndex),
        );
        showDragTooltip(childType, event.clientX, event.clientY);
        ondragstart?.(
          new CustomEvent("dragstart", {
            detail: { rackId, deviceIndex: originalIndex },
          }),
        );
      }
    }

    if (pointerState === "dragging") {
      updateDragTooltipPosition(event.clientX, event.clientY);
      document.dispatchEvent(
        new CustomEvent("rackula:dragmove", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device: childType,
            rackId,
            deviceIndex: originalIndex,
          },
        }),
      );
    }
  }

  function resetPointer(): void {
    pointerState = "idle";
    pointerStartPos = null;
    activePointerId = null;
    activeChildId = null;
    draggingChildId = null;
    activeChildRectElement = null;
  }

  function handlePointerUp(
    event: PointerEvent,
    child: PlacedDevice,
    childType: DeviceType,
    originalIndex: number,
  ): void {
    if (event.pointerId !== activePointerId || child.id !== activeChildId)
      return;
    try {
      activeChildRectElement?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released capture.
    }

    if (pointerState === "pressing") {
      event.stopPropagation();
      if (event.pointerType === "touch") hapticTap();
      emitSelection(child, childType);
    } else if (pointerState === "dragging") {
      document.dispatchEvent(
        new CustomEvent("rackula:dragend", {
          detail: {
            clientX: event.clientX,
            clientY: event.clientY,
            device: childType,
            rackId,
            deviceIndex: originalIndex,
          },
        }),
      );
      setCurrentDragData(null);
      hideDragTooltip();
      ondragend?.();
    }
    resetPointer();
  }

  function handlePointerCancel(event: PointerEvent, child: PlacedDevice): void {
    if (event.pointerId !== activePointerId || child.id !== activeChildId)
      return;
    try {
      activeChildRectElement?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may already have released capture.
    }
    if (pointerState === "dragging") {
      document.dispatchEvent(new CustomEvent("rackula:dragcancel"));
      setCurrentDragData(null);
      hideDragTooltip();
      ondragend?.();
    }
    resetPointer();
  }
</script>

<g class="container-children">
  {#each children as { placedDevice: child, originalIndex } (child.id)}
    {@const childType = getChildDeviceType(child.device_type)}
    {@const slotGeo = child.slot_id
      ? slotGeometry.get(child.slot_id)
      : undefined}
    {#if childType && slotGeo}
      {@const childHeight = childType.u_height * uHeight}
      {@const childY = getChildY(child, childType.u_height)}
      {@const childWidth = slotGeo.width}
      {@const childX = slotGeo.x}
      {@const childColour =
        child.colour_override ??
        childType.colour ??
        "var(--colour-device-default)"}
      {@const childName = child.name ?? childType.model ?? childType.slug}
      {@const isChildSelected = selectedChildId === child.id}
      <g
        class="container-child"
        class:selected={isChildSelected}
        class:dragging={draggingChildId === child.id}
        transform="translate({childX}, {childY})"
        role="button"
        tabindex="0"
        aria-label={`${childName}, ${childType.u_height}U ${childType.category}, mounted in ${parentDisplayName}${isChildSelected ? ", selected" : ""}`}
        aria-pressed={isChildSelected}
        data-device-id={childType.slug}
        data-device-uuid={child.id}
        data-testid="container-child-device"
        onclick={(event) => handleClick(event, child, childType)}
        oncontextmenu={(event) =>
          handleContextMenu(event, child, originalIndex)}
        onpointerdown={(event) => handlePointerDown(event, child)}
        onpointermove={(event) =>
          handlePointerMove(event, child, childType, originalIndex)}
        onpointerup={(event) =>
          handlePointerUp(event, child, childType, originalIndex)}
        onpointercancel={(event) => handlePointerCancel(event, child)}
        onkeydown={(event) => handleKeyDown(event, child, childType)}
      >
        <rect
          class="child-device-rect"
          data-testid="container-child-drag-surface"
          x={2}
          y={1}
          width={childWidth - 4}
          height={childHeight - 2}
          fill={childColour}
          rx="2"
          ry="2"
        />
        {#if isChildSelected}
          <rect
            class="child-selection-highlight"
            x={0}
            y={0}
            width={childWidth}
            height={childHeight}
            fill="none"
            stroke="var(--colour-selection)"
            stroke-width="2"
            rx="3"
            ry="3"
          />
        {/if}
        <text
          class="child-device-label"
          x={childWidth / 2}
          y={childHeight / 2}
          text-anchor="middle"
          dominant-baseline="middle"
          font-size={Math.min(11, childHeight * 0.6)}
          fill="var(--colour-text-on-device)"
        >
          {childName.length > 12 ? childName.slice(0, 10) + "..." : childName}
        </text>
      </g>
    {/if}
  {/each}
</g>

<style>
  .container-children {
    pointer-events: none;
  }

  .container-child {
    pointer-events: auto;
    cursor: grab;
  }

  .container-child.dragging {
    cursor: grabbing;
    opacity: 0.65;
  }

  .container-child:focus-visible {
    outline: none;
  }

  .container-child:focus-visible .child-device-rect {
    stroke: var(--colour-selection);
    stroke-width: 2;
  }

  .child-device-rect {
    stroke: var(--neutral-600);
    stroke-width: 0.5;
    transition: filter var(--duration-fast, 150ms) ease-out;
  }

  .container-child:hover .child-device-rect {
    filter: brightness(1.1);
  }

  .container-child.selected .child-device-rect {
    filter: brightness(1.05);
  }

  .child-selection-highlight {
    pointer-events: none;
  }

  .child-device-label {
    font-family: var(--font-family, system-ui, sans-serif);
    font-weight: 500;
    pointer-events: none;
    user-select: none;
    text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
  }
</style>
