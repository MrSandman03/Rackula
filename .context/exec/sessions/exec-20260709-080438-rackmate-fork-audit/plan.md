# Exec Plan: RackMate Fork Audit Pass

Task: complete the RackMate/Rackula fork audit execution plan end to end on our fork.

Approval context: user instructed that this work must happen on our own fork/project, not upstream, then said "do it" after cleanup. Upstream is read-only reference only.

Branch strategy: solo fork workflow.

- Base branch: `main`
- Target branch: `main`
- Working branch: `work/rackmate-fork-audit`
- Origin: `git@github.com:MrSandman03/Rackula.git`
- Upstream: `https://github.com/RackulaLives/Rackula.git`, push disabled
- Merge mode: PR-first into fork `main`; no upstream PR

## Steps

| # | Step | Files | Depends | Verify | Risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Clean fork and exec truth surfaces so agents stop targeting upstream or stale sessions. | `package.json`, `README.md`, `docs/reference/SPEC.md`, `.context/exec/**`, e2e helper comments | - | `git diff --check`; targeted text scan | Low |
| 2 | Fix RackMate placement correctness: dimensional slot fit, child position bounds, slot topology validation, and starter layout truth. | `src/lib/utils/collision.ts`, `src/lib/utils/slot-geometry.ts`, `src/lib/schemas/index.ts`, `static/templates/rackmate-t1-plus.rackula.yaml`, RackMate tests | 1 | RackMate unit tests and schema tests | High |
| 3 | Improve agentic and visual fit guidance for RackMate planning. | palette, command-palette, edit panel, rack edit sheet, fit utility/tests | 2 | component/unit tests, typecheck | Medium |
| 4 | Add RackMate-specific browser merge gates. | `package.json`, Playwright configs/specs/helpers | 2,3 | RackMate e2e command; smoke/e2e targeted | Medium |
| 5 | Run final verification, push branch, open fork PR, and hold the final merge gate for user approval. | no product files expected | 1-4 | `npm run check`, `npm run lint -- --quiet`, `npm run build`, tests/e2e gates | Medium |

## Audit Findings Driving This Plan

- Fork truth was split: git remotes now point correctly, but package metadata and docs still referenced upstream.
- The prior exec state was legacy-shaped and mixed terminal state with an active-session field.
- RackMate starter placed UCG-Max in a half-width tray slot despite dimensions exceeding half of a nominal 10-inch rack.
- Slot placement logic checked abstract `slot_width` but not physical dimensions.
- Child device positions could exceed slot height in schema validation.
- Slot topology allowed overlapping rows.
- RackMate command/browser workflow was only manually run, not packaged as a merge gate.
- UI fit confidence remained mostly rack-width based and did not expose enough bay, mount, depth, or provisional information for agentic planning.
