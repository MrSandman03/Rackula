<script lang="ts">
  import { Tooltip } from "bits-ui";
  import DevicePalette from "$lib/components/DevicePalette.svelte";
  import type { DeviceType } from "$lib/types";

  interface Props {
    oncreatedevice?: () => void;
    ondeviceselect?: (event: CustomEvent<{ device: DeviceType }>) => void;
  }

  let { oncreatedevice, ondeviceselect }: Props = $props();
</script>

<!-- DevicePalette renders device rows that use Tooltip; the app supplies the
     Tooltip.Provider context at the top level (App.svelte), so mount it the
     same way here. -->
<Tooltip.Provider>
  <DevicePalette {oncreatedevice} {ondeviceselect} />
</Tooltip.Provider>
