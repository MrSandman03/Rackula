/**
 * Version-specific compatibility and reference-integrity tests for share links.
 */

import { describe, expect, it } from "vitest";
import { decodeLayout } from "$lib/utils/share";
import { encodeLegacyPayload, requireDecoded } from "./helpers/share-test";

const emptyRack = { i: "0", n: "Rack", h: 8, w: 19, d: [] };

describe("legacy share compatibility", () => {
  it("sanitizes unknown fit metadata instead of rejecting format v2", () => {
    const decoded = requireDecoded(
      encodeLegacyPayload({
        v: "1.0",
        fv: 2,
        n: "Legacy fit metadata",
        rs: [emptyRack],
        dt: [
          {
            s: "legacy-fit-device",
            h: 1,
            c: "#336699",
            x: "n",
            rf: {
              status: "candidate",
              concern: "legacy note",
              dimensions_mm: { width: 141.8, private_measurement: 999 },
            },
          },
        ],
      }),
    );

    expect(decoded.device_types[0]?.custom_fields?.rackula_fit).toEqual({
      status: "candidate",
      dimensions_mm: { width: 141.8 },
    });
  });

  it("keeps the unknown slot-category fallback for format v2", () => {
    const decoded = requireDecoded(
      encodeLegacyPayload({
        v: "1.0",
        fv: 2,
        n: "Legacy slot category",
        rs: [emptyRack],
        dt: [
          {
            s: "legacy-carrier",
            h: 1,
            c: "#336699",
            x: "h",
            sl: [{ id: "main", r: 0, cl: 0, a: ["q"] }],
          },
        ],
      }),
    );

    expect(decoded.device_types[0]?.slots?.[0]?.accepts).toEqual(["other"]);
  });

  it("continues to load duplicate nested collections in format v2", () => {
    const decoded = requireDecoded(
      encodeLegacyPayload({
        v: "1.0",
        fv: 2,
        n: "Legacy duplicate collections",
        rs: [emptyRack],
        dt: [
          {
            s: "legacy-duplicate-device",
            h: 1,
            c: "#336699",
            x: "n",
            rw: [10, 10],
            sl: [{ id: "main", r: 0, cl: 0, a: ["n", "n"] }],
          },
        ],
      }),
    );

    expect(decoded.device_types[0]?.rack_widths).toEqual([10, 10]);
    expect(decoded.device_types[0]?.slots?.[0]?.accepts).toEqual([
      "network",
      "network",
    ]);
  });
});

describe("authoritative share references", () => {
  it("rejects unknown nested fit metadata in format v3", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Unknown nested fit metadata",
      rs: [emptyRack],
      dt: [
        {
          s: "strict-fit-device",
          h: 1,
          c: "#336699",
          x: "n",
          o: 1,
          rf: { dimensions_mm: { width: 141.8, private_measurement: 999 } },
        },
      ],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects an unknown rack-group reference in format v3", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Unknown group reference",
      rs: [emptyRack],
      rg: [{ n: "Invalid group", rs: ["0", "missing"] }],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it.each([
    ["an out-of-range parent", { ci: 99, si: "main" }],
    ["a missing slot reference", { ci: 0 }],
    ["a slot without a parent", { si: "main" }],
  ])("rejects a child with %s in format v3", (_label, childFields) => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Invalid child reference",
      rs: [
        {
          ...emptyRack,
          d: [
            {
              t: "plain-device",
              p: 1,
              f: "front",
              ...childFields,
            },
          ],
        },
      ],
      dt: [
        {
          s: "plain-device",
          h: 1,
          c: "#336699",
          x: "n",
          o: 1,
        },
      ],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects duplicate references within a format v3 rack group", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Duplicate group members",
      rs: [emptyRack],
      rg: [{ n: "Duplicate group", rs: ["0", "0"] }],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });

  it("rejects a rack assigned to multiple format v3 groups", () => {
    const encoded = encodeLegacyPayload({
      v: "1.0",
      fv: 3,
      n: "Overlapping groups",
      rs: [emptyRack],
      rg: [
        { n: "First group", rs: ["0"] },
        { n: "Second group", rs: ["0"] },
      ],
      dt: [],
    });

    expect(decodeLayout(encoded).layout).toBeNull();
  });
});
