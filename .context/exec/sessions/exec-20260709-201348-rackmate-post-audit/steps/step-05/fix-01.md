# Step 5 Fix Cycle 1

Trigger commit: `79226558664ea6ad3e6f5ab87bd78090c2c66ba4`

Initial paranoid review verdict: FIX

## Confirmed Findings

- Fixed-profile RackMate layouts at 8U still clamped devices above U8 instead of rejecting the invalid saved position.
- Legacy RackMate share links omitted profile and depth, so decoding produced a generic 10-inch, 1000mm rack.
- Corrected multi-row slot geometry rejected a previously accepted all-omitted-height saved layout without a load-boundary compatibility path.
- Arbitrary truthy `rackula_fit` metadata could be encoded into an undecodable share link.
- Direct recorded profile assignment expanded dimensions during execution without snapshotting those fields for exact undo.
- Share links preserved 21/23-inch device constraints while collapsing the rack itself to 19 inches.
- Direct duplication and rail-level movement verbs remained available for selected carrier children.
- Cross-rack previews validated only the parent shell while the store rejected child width or assembly depth later.
- Occupied carriers exposed nested `role="button"` semantics.

## Repairs

Commit `a0904a6c7cf77908571dfb6001a319043507bdeb`:

- Preserved invalid fixed-profile positions for strict schema rejection.
- Added upgrade-corpus fixtures for exact legacy RackMate inference and prior all-omitted multi-row slot acceptance while retaining corrected runtime row geometry.
- Restored exact legacy RackMate v1/v2 share identity, preserved every supported rack width, and filtered compact fit metadata to plain records.
- Made recorded profile updates snapshot every constrained dimension for exact undo and redo.
- Centralized cross-rack assembly validation across preview, action resolution, and store execution, with a visible rejection path.
- Disabled rail-level actions for selected carrier children and added a store-level duplication guard.
- Refactored occupied carrier semantics to sibling parent/child buttons under a group and added populated RackMate axe coverage.

Commit `afb57891137024ea24831bf91920827c8aa1a969`:

- Updated the shelf E2E assertion to follow the device button semantics after the full Chromium gate identified the stale outer-group contract.

## Verification

- Focused compatibility, share, cross-rack, action, and component suites passed.
- Full static, unit, build, API, browser, accessibility, and Linux visual gates passed on the final code.
- Coverage ran every unit test and retained the existing failing global thresholds without lowering them.
