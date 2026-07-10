# Step 2 Implementation

Commit: `79226558664ea6ad3e6f5ab87bd78090c2c66ba4`

## Profile Model

- Added `profile: rackmate-t1-plus` as explicit product identity instead of treating every 10-inch rack as a RackMate.
- Locked profiled racks to 10-inch, 8U, and 260mm across schema parsing, rack creation, recorded updates, raw replacement, mobile and desktop editors, rack groups, and resize paths.
- Preserved arbitrary dimensions for generic 10-inch racks.
- Migrated only the exact pre-profile signature `RackMate T1 Plus` plus 10-inch, 8U, and 260mm.
- Preserved the profile through YAML, share links, templates, and the published JSON Schema.

## Compatibility

- Centralized minimum-width semantics so 19-inch hardware remains valid in 21-inch and 23-inch racks.
- Hydrated fit-critical fields for built-in device types loaded from compact or stripped payloads.
- Kept unknown extension fields and older generic layouts backward compatible.
