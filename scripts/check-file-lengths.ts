#!/usr/bin/env npx tsx
/** Fail when a tracked source or test file exceeds the repository hard limit. */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_FILE_LINES = 1000;

const CODE_EXTENSIONS = new Set([
  ".bats",
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".py",
  ".sh",
  ".svelte",
  ".ts",
  ".tsx",
]);

export interface SourceFile {
  path: string;
  contents: string;
}

export interface FileLengthViolation {
  path: string;
  lines: number;
}

export function isTrackedCodePath(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase());
}

export function countPhysicalLines(contents: string): number {
  if (contents.length === 0) return 0;

  let lines = 0;
  for (let index = 0; index < contents.length; index += 1) {
    if (contents.charCodeAt(index) === 10) lines += 1;
  }

  return contents.endsWith("\n") ? lines : lines + 1;
}

export function findFileLengthViolations(
  files: Iterable<SourceFile>,
  maxLines = MAX_FILE_LINES,
): FileLengthViolation[] {
  const violations: FileLengthViolation[] = [];

  for (const file of files) {
    if (!isTrackedCodePath(file.path)) continue;
    const lines = countPhysicalLines(file.contents);
    if (lines > maxLines) violations.push({ path: file.path, lines });
  }

  return violations.sort(
    (left, right) =>
      right.lines - left.lines || left.path.localeCompare(right.path),
  );
}

function trackedFiles(root: string): SourceFile[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  return output
    .split("\0")
    .filter(Boolean)
    .filter(isTrackedCodePath)
    .filter((path) => existsSync(resolve(root, path)))
    .map((path) => ({
      path,
      contents: readFileSync(resolve(root, path), "utf8"),
    }));
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const violations = findFileLengthViolations(trackedFiles(root));

  if (violations.length === 0) {
    console.log(
      `File length check passed: all tracked code files are <= ${MAX_FILE_LINES} lines.`,
    );
    return;
  }

  console.error(
    `File length check failed: ${violations.length} tracked code file(s) exceed ${MAX_FILE_LINES} lines:`,
  );
  for (const violation of violations) {
    console.error(
      `  ${violation.lines.toString().padStart(5)}  ${violation.path}`,
    );
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
