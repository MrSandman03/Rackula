# Exec Plan: RackMate Post-Merge Audit and Repair

Task: independently review the RackMate/Rackula work merged by fork PR #1, repair confirmed defects, and return a verified draft PR to the fork.

Approval context: the user confirmed that the RackMate/Rackula fork work was the intended exec session and asked for a full review followed by fixes and improvements.

Branch strategy: solo fork workflow.

- Base branch: `main`
- Target branch: `main`
- Working branch: `fix/rackmate-post-audit`
- Worktree: `/Users/gavin/projects/p-rackula-minirack-worktrees/rackmate-post-audit`
- Origin: `git@github.com:MrSandman03/Rackula.git`
- Upstream: fetch-only reference with push disabled
- Merge mode: PR-first into fork `main`; no merge without fresh user approval

## Steps

| # | Step | Verify | Risk |
| --- | --- | --- | --- |
| 1 | Cold-review fork PR #1, the product model/UI, browser coverage, and exec evidence. | Independent reviewer reports and source reproduction | High |
| 2 | Preserve generic 10-inch racks by adding an explicit RackMate T1 Plus profile that round-trips through saved and shared layouts. | Focused schema, profile, component, serialization, and share tests | High |
| 3 | Repair physical placement correctness for slot height, effective depth, asymmetric geometry, and keyboard/collision paths. | Focused model and interaction tests | High |
| 4 | Repair fit/readiness UX, incompatible activation paths, fork routing, and the blocking RackMate browser gate. | Component, E2E, accessibility, and workflow inspection | High |
| 5 | Run full verification, cold-review the final diff, push the branch, and open a draft PR. | Static checks, unit tests, build, smoke, RackMate, accessibility, visual, final SHA-bound diff check | High |

## Confirmed Findings

- Generic 10-inch racks were treated as RackMate identity and silently rewritten to 8U/260mm.
- Width- and depth-incompatible placement could bypass some drag-only checks.
- Slot grids could exceed carrier height, physical device height was ignored, and mounted-child depth was not included consistently.
- Fit summaries could mask warnings with an informational Mount or Bay marker and could crash on malformed extension metadata.
- RackMate browser coverage was not part of the blocking CI job and covered only two RackMate-specific cases.
- Fork UI links and project automation still targeted upstream surfaces.
- The prior exec session skipped its required cold review and lacked durable merge-approval and final-SHA evidence.
