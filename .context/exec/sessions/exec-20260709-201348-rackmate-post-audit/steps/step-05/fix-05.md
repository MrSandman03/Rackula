# Fix 05: Remove Inherited External Review Gate

## Owner Decision

The owner explicitly rejected the external AI review service inherited from upstream Rackula. The fork does not install or require a repository review app or vendor-specific review CLI as a merge gate.

## Repository Changes

- Deleted the service configuration, Husky pre-push hook, gate implementation, and dedicated gate tests.
- Replaced active agent instructions with commit-before-review, exact-head evidence, applicable hosted CI, and explicit human merge approval.
- Removed unattended Dependabot merging and aligned dependency guidance.
- Corrected fork CI documentation and marked optional Claude review as non-gating.
- Preserved historical plans, changelog entries, and contributor bot exclusions because they describe upstream history or maintain output compatibility.

## Local Cleanup

- No GitHub App authorization completed.
- Removed the unauthenticated CLI, generated local state, global Git config entry, and unanswered PR trigger comment.

## Verification and Review

- Formatting, lint, Svelte diagnostics, 3,577 unit tests, production build, contributor regression tests, changed-workflow `actionlint`, and diff checks passed.
- The first exact-head review found policy contradictions; commit `593b63b5` resolved them.
- The second review cycle returned one PASS and one minor stale documentation finding, resolved in the ledger closure commit.

PR #2 remains draft and unmerged. Fresh hosted checks and explicit human merge approval remain required.
