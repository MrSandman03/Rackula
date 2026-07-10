# Step 2 Implementation: Tests and Generated Data

Implemented the test/data split without changing test declarations, generated mappings, or registry order.

## Test Suites

- Replaced `src/tests/schemas.test.ts` with five schema suites, each 445-650 lines.
- Replaced `src/tests/layout-device-actions.test.ts` with four action suites, each 289-670 lines.
- Replaced `api/src/security.test.ts` with three suites plus shared test support, each 56-532 lines.
- Preserved declaration counts: schema 211, layout actions 81, API security 66.

## Data Registries

- Split the Ubiquiti registry into three ordered leaf modules behind the existing `ubiquitiDevices` facade.
- Refactored the bundled-image generator to emit a stable facade plus 19 vendor modules.
- Added stale-module cleanup, collision checks, and a generated-file 1,000-line assertion.
- Preserved all 576 bundled slug/face/path mappings and their order.

Largest resulting file: `src/tests/layout-device-placement-actions.test.ts` at 670 lines.
