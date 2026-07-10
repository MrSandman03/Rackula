import { describe, expect, it } from "vitest";
import {
  PROJECT_DOCS_URL,
  PROJECT_REPOSITORY_URL,
  UPSTREAM_REPOSITORY_URL,
  projectCommitUrl,
} from "./project";

describe("project links", () => {
  it("routes active project links to the RackMate fork", () => {
    expect(PROJECT_REPOSITORY_URL).toBe(
      "https://github.com/MrSandman03/Rackula",
    );
    expect(projectCommitUrl("abc123")).toBe(
      "https://github.com/MrSandman03/Rackula/commit/abc123",
    );
  });

  it("keeps upstream and documentation links explicit", () => {
    expect(UPSTREAM_REPOSITORY_URL).toBe(
      "https://github.com/RackulaLives/Rackula",
    );
    expect(PROJECT_DOCS_URL).toBe("https://docs.racku.la");
    expect(projectCommitUrl("")).toBe("");
  });
});
