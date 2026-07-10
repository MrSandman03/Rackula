import { describe, expect, it } from "vitest";
import {
  countPhysicalLines,
  findFileLengthViolations,
  isTrackedCodePath,
  MAX_FILE_LINES,
} from "../../scripts/check-file-lengths";

describe("file length guard", () => {
  it("counts empty, terminated, and unterminated files like physical lines", () => {
    expect(countPhysicalLines("")).toBe(0);
    expect(countPhysicalLines("one")).toBe(1);
    expect(countPhysicalLines("one\n")).toBe(1);
    expect(countPhysicalLines("one\ntwo")).toBe(2);
    expect(countPhysicalLines("one\ntwo\n")).toBe(2);
  });

  it("covers source, component, script, and test extensions", () => {
    expect(isTrackedCodePath("src/example.ts")).toBe(true);
    expect(isTrackedCodePath("src/Example.svelte")).toBe(true);
    expect(isTrackedCodePath("scripts/check.sh")).toBe(true);
    expect(isTrackedCodePath("scripts/check.bats")).toBe(true);
    expect(isTrackedCodePath("docs/example.md")).toBe(false);
    expect(isTrackedCodePath("package-lock.json")).toBe(false);
  });

  it("reports only files above the hard limit in deterministic order", () => {
    const exactLimit = `${"line\n".repeat(MAX_FILE_LINES - 1)}line\n`;
    const oneOver = `${exactLimit}extra\n`;
    const twoOver = `${oneOver}extra\n`;

    expect(
      findFileLengthViolations([
        { path: "src/exact.ts", contents: exactLimit },
        { path: "src/z.ts", contents: oneOver },
        { path: "src/a.ts", contents: oneOver },
        { path: "src/largest.svelte", contents: twoOver },
        { path: "docs/ignored.md", contents: twoOver },
      ]),
    ).toEqual([
      { path: "src/largest.svelte", lines: MAX_FILE_LINES + 2 },
      { path: "src/a.ts", lines: MAX_FILE_LINES + 1 },
      { path: "src/z.ts", lines: MAX_FILE_LINES + 1 },
    ]);
  });
});
