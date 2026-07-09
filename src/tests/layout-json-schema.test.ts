import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { z } from "$lib/zod";
import { LayoutSchema } from "$lib/schemas";
import {
  assembleSchema,
  SCHEMA_ID,
  SCHEMA_DESCRIPTION,
  JSON_SCHEMA_DIALECT,
} from "../../scripts/generate-schema";

/**
 * Guards the generated JSON Schema artifact (issue #2226).
 *
 * The real failure mode is a stale artifact: someone changes the Zod schema in
 * src/lib/schemas and forgets to re-run `npm run generate-schema`, so the
 * published contract drifts from the source of truth. These tests reuse the
 * generator's own assembleSchema(), so the comparison covers the full schema
 * including the envelope, with no duplicated projection to drift out of sync.
 */
const ARTIFACT_PATH = join(
  process.cwd(),
  "static",
  "schemas",
  "rackula-layout.schema.json",
);

function findRackMateRackSchemas(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(findRackMateRackSchemas);
  }
  if (!value || typeof value !== "object") return [];

  const schema = value as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown> | undefined;
  const profile = properties?.profile as Record<string, unknown> | undefined;
  const matchesRackShape =
    schema.type === "object" &&
    profile?.const === "rackmate-t1-plus" &&
    properties?.height !== undefined &&
    properties?.width !== undefined &&
    properties?.depth_mm !== undefined;

  return [
    ...(matchesRackShape ? [schema] : []),
    ...Object.values(schema).flatMap(findRackMateRackSchemas),
  ];
}

describe("layout JSON Schema artifact", () => {
  const raw = readFileSync(ARTIFACT_PATH, "utf8");
  const artifact = JSON.parse(raw) as Record<string, unknown>;

  it("is in sync with the Zod source schema", () => {
    expect(artifact).toEqual(assembleSchema(z, LayoutSchema));
  });

  it("matches `npm run generate-schema` output byte for byte", () => {
    // Structural equality above misses key-order and formatting drift; the
    // published file is what ships, so compare its exact bytes against what the
    // generator would write. If this fails, run `npm run generate-schema`.
    const expected =
      JSON.stringify(assembleSchema(z, LayoutSchema), null, 2) + "\n";
    expect(raw).toBe(expected);
  });

  it("carries the published schema envelope", () => {
    expect(artifact.$schema).toBe(JSON_SCHEMA_DIALECT);
    expect(artifact.$id).toBe(SCHEMA_ID);
    expect(artifact.$description).toBe(SCHEMA_DESCRIPTION);
  });

  it("constrains every RackMate profile rack to its physical envelope", () => {
    const rackSchemas = findRackMateRackSchemas(artifact);

    // The public layout accepts both legacy `rack` and modern `racks[]` input.
    // eslint-disable-next-line no-restricted-syntax
    expect(rackSchemas).toHaveLength(2);
    for (const rackSchema of rackSchemas) {
      expect(rackSchema.allOf).toContainEqual({
        if: {
          properties: {
            profile: { const: "rackmate-t1-plus" },
          },
          required: ["profile"],
        },
        then: {
          properties: {
            depth_mm: { const: 260, default: 260, type: "number" },
            height: { const: 8, type: "integer" },
            width: { const: 10, type: "number" },
          },
        },
      });
    }
  });
});
