# Step 2 Implementation

Fixed RackMate placement correctness.

- Added `src/lib/utils/slot-fit.ts` for shared logical/physical slot fit and slot topology validation.
- Wired runtime placement, drag/drop, smart placement, and schema validation to the shared slot-fit rules.
- Added optional depth-aware collision for opposite-face devices when both depths are known.
- Added schema-safe fallback lookup for RackMate-relevant built-in device types, so stripped layouts cannot bypass carrier-first rules for those devices.
- Corrected RackMate starter layout so UCG-Max and GS305 are on full-width trays, not a half-width dual tray.
- Updated UCG-Max recommendations to remove the dual half-width tray.

Branch: `work/rackmate-fork-audit`
