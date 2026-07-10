export const PROJECT_REPOSITORY_URL = "https://github.com/MrSandman03/Rackula";

export const UPSTREAM_REPOSITORY_URL =
  "https://github.com/RackulaLives/Rackula";

export const PROJECT_DOCS_URL = "https://docs.racku.la";

export function projectCommitUrl(commitHash: string): string {
  return commitHash ? `${PROJECT_REPOSITORY_URL}/commit/${commitHash}` : "";
}
