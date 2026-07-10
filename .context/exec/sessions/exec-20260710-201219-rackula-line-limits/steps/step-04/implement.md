# Step 4 Implementation: Core, API, and Scripts

Extracted cohesive leaf modules while retaining compatibility facades and public imports:

- Layout store actions and active-workspace facade.
- Rack-group state and command adapter.
- SVG constants, category icons, and rack-view renderer.
- Schema primitives and cross-layout refinements.
- Filesystem path and snapshot helpers.
- NetBox importer types and category logic.

Direct leaf imports replace the two potential cycles: workspace -> store instance and rack actions -> rack-group state. Existing facade exports remain stable.

Largest resulting core file: `src/lib/stores/layout/rack-groups.ts` at 922 lines.
