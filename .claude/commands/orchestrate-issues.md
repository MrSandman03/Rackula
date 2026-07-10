---
description: Orchestrate Rackula GitHub issues through reviewed PRs via parallel per-issue subagents
argument-hint: <issue numbers, e.g. 2295 2296 2165>
---

# Rackula Issue Orchestrator

Act as an orchestrator. Work these GitHub issues through to a merged PR, one subagent per issue, running concurrently:

ISSUES: $ARGUMENTS

If no issue numbers were provided, ask which issues to work before doing anything else.

## Per-issue pipeline (each subagent does this for its own issue)

1. **Set up** — Use `/gh-dev` to pick up the issue and create an isolated worktree (`.worktree/Rackula-issue-<N>`, branch `fix/<N>-desc` or `feat/<N>-desc`, cut from LOCAL `main`). Read the issue's Acceptance Criteria, Technical Notes, Test Requirements.
2. **Triage type** — Classify the issue so you know which skills apply:
   - UI / component / styling → frontend work
   - auth / API / input / data / serialization → security-sensitive
   - docs / chore / refactor → neither domain skill needed
3. **Implement** — Invoke skills by type (process skills first):
   - ALWAYS: superpowers routing (brainstorming / systematic-debugging / TDD as the task fits)
   - IF security-sensitive: `/secure-coding`
   - IF frontend: `/frontend-design:frontend-design` Follow the project TDD protocol (test only high-value behaviour; skip low-value tests).
4. **Self-review** — Run `/code-review` on the diff BEFORE opening the PR. Fix what it finds.
5. **Open PR** — Verify local gates first (`npm run lint`, `npm run test:run`, `npm run build`), then push and `gh pr create`. Include `Co-Authored-By`.

## Review-feedback loop (mandatory)

When a reviewer, CI analyzer, or `/code-review` returns feedback on the PR, invoke `/superpowers:receiving-code-review` to process it. Do not performatively agree or blindly apply suggestions. Verify each finding technically, rebut false positives with reasoning, and commit only genuine fixes. Re-request review after pushing changes.

## Merge gate (ALL must be true)

- CI fully green AND `mergeStateStatus` is CLEAN (a DIRTY/conflicted PR silently skips CI — check `gh pr view <N> --json mergeable,mergeStateStatus` before trusting green checks).
- The complete diff has a clean independent review. High-risk or cross-cutting changes have at least two independent reviews.
- Every review item is resolved or rebutted via `/superpowers:receiving-code-review`.
- A human has explicitly approved the merge.

When the gate passes: `gh pr merge` (squash), then `gh issue close <N> --comment "Implemented in <commit>"`. Never merge on green CI alone or without human approval.

## Orchestration rules

- Dispatch all issues in parallel as independent subagents — each in its OWN worktree, with its OWN `blockers-<N>.md`. No shared state between them.
- NEVER edit files in the main working directory; all work happens in per-issue worktrees.
- Git over HTTPS, not SSH (the 1Password SSH agent can't sign here). Verify branch HEAD against remote with `gh api repos/RackulaLives/Rackula/commits/main` rather than trusting local refs.
- Don't routinely `--no-verify`; the husky pre-commit hook is fixed. Only bypass for a verified reason, and say why.

## Stop conditions (per issue)

Stop and record in `blockers-<N>.md` if: a test fails twice with no resolution, the issue is genuinely ambiguous and needs a human decision, or a merge conflict you can't cleanly resolve. Otherwise proceed autonomously to merge.

## Final report

Per issue: status (MERGED / blocked / needs-decision), PR link, merge commit, and any follow-up issues filed.
