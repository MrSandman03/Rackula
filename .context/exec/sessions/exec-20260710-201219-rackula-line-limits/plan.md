# Exec Plan: Rackula Legacy Line-Limit Cleanup

Task: split every inherited source or test file above the 1,000-line hard limit, add a reproducible guard, and preserve behavior and public contracts.

Approval context: the user explicitly requested, "fix all the other line violations" after the RackMate post-audit closure identified inherited oversized files.

Branch strategy: solo fork workflow.

- Base branch: `main`
- Target branch: `main`
- Working branch: `fix/legacy-line-limits`
- Worktree: `/Users/gavin/projects/p-rackula-minirack-worktrees/legacy-line-limits`
- Origin: `git@github.com:MrSandman03/Rackula.git`
- Upstream: fetch-only reference with push disabled
- Merge mode: PR-first into fork `main`; no merge without fresh user approval

## Hard-Limit Scope

The audit covers tracked code and tests with extensions `.ts`, `.js`, `.svelte`, `.mjs`, `.cjs`, `.sh`, and `.bats`, excluding dependency, build, and coverage output. Every in-scope file must contain at most 1,000 physical lines.

## Steps

| # | Step | Verify | Risk |
| --- | --- | --- | --- |
| 1 | Record the exact 16-file baseline and safe split boundaries. | Deterministic line-count audit and read-only split reviews | Medium |
| 2 | Split oversized test suites and generated/data registries. | Focused Vitest/API suites and generator byte stability | High |
| 3 | Decompose oversized Svelte components along existing UI boundaries. | Component tests, Svelte check, browser, accessibility, and visual gates | High |
| 4 | Extract oversized core, API storage, export, schema, and import-script modules. | Focused unit/API/export/schema checks and cycle/export audits | High |
| 5 | Add an enforced repository line-limit check and run full verification. | Zero violations, static checks, all unit/API/browser/visual gates | High |
| 6 | Cold-review the exact head, push the branch, and open a draft PR. | Two independent exact-SHA reviews and applicable hosted CI | High |

No test body, public export, schema compatibility path, storage behavior, generated data entry, or rendered UI behavior may be dropped merely to reduce line counts.
