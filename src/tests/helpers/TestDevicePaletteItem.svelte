<script lang="ts">
  import { Tooltip } from "bits-ui";
  import DevicePaletteItem from "$lib/components/DevicePaletteItem.svelte";
  import type { DeviceType } from "$lib/types";
  import type { RackFitSummary } from "$lib/utils/rack-fit";

  interface Props {
    device: DeviceType;
    isCompatible?: boolean;
    incompatibilityReason?: string | null;
    placementRequirement?: string | null;
    fitSummary?: RackFitSummary | null;
    onselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
  }

  let {
    device,
    isCompatible = true,
    incompatibilityReason = null,
    placementRequirement = null,
    fitSummary = null,
    onselect,
  }: Props = $props();
</script>

<Tooltip.Provider>
  <DevicePaletteItem
    {device}
    {isCompatible}
    {incompatibilityReason}
    {placementRequirement}
    {fitSummary}
    {onselect}
  />
</Tooltip.Provider>
