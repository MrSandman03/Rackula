# Dependency Management

## Overview

Rackula uses Dependabot to open dependency update pull requests. Dependency changes never merge automatically: every PR must pass applicable checks, receive independent review, and receive explicit human merge approval.

## Configuration

- **Location**: `.github/dependabot.yml`
- **Merge policy**: the review and merge gate in `CLAUDE.md`

## Update Strategy

All update types require human approval. Review depth scales with risk:

| Update Type    | Required review focus                               |
| -------------- | --------------------------------------------------- |
| Patch versions | Changelog, lockfile scope, focused tests            |
| Minor versions | API changes, behavior changes, full applicable CI   |
| Major versions | Migration plan, breaking changes, full verification |
| GitHub Actions | Action provenance, pinned SHA, permission changes   |

## Package Grouping

Related packages are grouped to prevent version mismatches:

| Group        | Packages                                     |
| ------------ | -------------------------------------------- |
| `vitest`     | `vitest`, `@vitest/*`                        |
| `eslint`     | `eslint`, `@eslint/*`, `eslint-*`, `globals` |
| `svelte`     | `svelte`, `@sveltejs/*`, `svelte-*`          |
| `typescript` | `typescript`, `@types/*`                     |

## Schedule

- **npm packages**: Daily (prevents batch accumulation)
- **GitHub Actions**: Weekly on Mondays

## Handling Updates

When dependency PRs arrive:

1. Read the changelog/release notes
2. Check for breaking changes that affect our usage
3. Test locally: `npm install <package>@latest && npm test`
4. Record the independent review verdict and exact SHA
5. Merge only after applicable checks pass and a human explicitly approves

## Troubleshooting

### "claude-review" check failing on Dependabot PRs

This is expected. The Claude Code Review workflow skips Dependabot PRs because GitHub does not expose secrets to them. Rely on the dependency, build, and test checks, then require maintainer review before merge.

### Multiple related PRs not grouped

Dependabot opened PRs before the grouping config was in place. Options:

1. Close the individual PRs and let Dependabot recreate grouped ones
2. Merge them manually in the correct order

### Version mismatch after partial merge

If you merged `vitest` but not `@vitest/coverage-v8`:

```bash
npm install @vitest/coverage-v8@latest
```
