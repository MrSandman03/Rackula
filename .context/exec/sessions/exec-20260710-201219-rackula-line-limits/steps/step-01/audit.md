# Step 1 Baseline Audit

Base commit: `f43cae16cdb2db3b45426765ae43552256f766a2`

Hard limit: 1,000 physical lines per tracked code/test file.

| Lines | File                                           |
| ----: | ---------------------------------------------- |
| 2,772 | `src/tests/schemas.test.ts`                    |
| 2,615 | `src/lib/data/bundledImages.ts`                |
| 1,985 | `src/tests/layout-device-actions.test.ts`      |
| 1,518 | `src/lib/stores/layout.svelte.ts`              |
| 1,503 | `src/lib/utils/export/svg.ts`                  |
| 1,464 | `src/lib/schemas/index.ts`                     |
| 1,369 | `src/lib/components/RackDevice.svelte`         |
| 1,278 | `src/lib/data/brandPacks/ubiquiti.ts`          |
| 1,161 | `src/lib/components/DevicePalette.svelte`      |
| 1,137 | `src/lib/components/RackCanvasView.svelte`     |
| 1,120 | `api/src/security.test.ts`                     |
| 1,058 | `src/lib/components/DialogOrchestrator.svelte` |
| 1,051 | `src/lib/stores/layout/rack-groups.ts`         |
| 1,050 | `src/lib/components/ExportDialog.svelte`       |
| 1,016 | `api/src/storage/filesystem.ts`                |
| 1,013 | `scripts/bulk-import-netbox.ts`                |

Audit command:

```bash
find . -type f \( -name '*.ts' -o -name '*.js' -o -name '*.svelte' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sh' -o -name '*.bats' \) \
  -not -path './node_modules/*' -not -path './dist/*' -not -path './coverage/*' -not -path './.git/*' -print0 \
  | xargs -0 wc -l | sort -nr | awk '$1 > 1000 && $2 != "total" {print}'
```
