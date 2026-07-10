/**
 * Public layout-store compatibility entrypoint.
 *
 * Workspace construction imports the instance leaf directly so the facade can
 * resolve the active workspace without creating a module cycle.
 */

export {
  createLayoutStore,
  type LayoutStore,
  type BackupState,
  HAS_STARTED_KEY,
} from "./layout/store-instance.svelte";
export { getLayoutStore, resetLayoutStore } from "./layout/store-facade.svelte";
