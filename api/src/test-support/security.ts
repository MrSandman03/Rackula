import {
  createSignedAuthSessionToken,
  type AuthSessionClaimsInput,
  type EnvMap,
} from "../security";

export const TEST_TOKEN = "test-write-token";
export const TEST_AUTH_SECRET =
  "rackula-auth-session-secret-for-tests-0123456789";

export function buildEnv(overrides: EnvMap = {}): EnvMap {
  return {
    NODE_ENV: "test",
    ...overrides,
  };
}

export function buildAuthEnabledEnv(overrides: EnvMap = {}): EnvMap {
  return buildEnv({
    RACKULA_AUTH_MODE: "oidc",
    RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
    CORS_ORIGIN: "https://rack.example.com",
    RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "3600",
    RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "300",
    ...overrides,
  });
}

// Default cookie carries role: "admin" so existing integration tests covering
// the auth gate and CSRF layer also pass the admin authorization check on write
// routes. Override role explicitly when testing non-admin behaviour.
export function buildAuthCookie(
  overrides: Partial<AuthSessionClaimsInput> = {},
): string {
  const now = Math.floor(Date.now() / 1000);
  const token = createSignedAuthSessionToken(
    {
      sub: "admin@example.com",
      sid: "session-default",
      role: "admin",
      iat: now - 30,
      exp: now + 600,
      idleExp: now + 120,
      generation: 0,
      ...overrides,
    },
    TEST_AUTH_SECRET,
    {
      sessionMaxAgeSeconds: 3600,
      sessionIdleTimeoutSeconds: 300,
      sessionGeneration: 0,
    },
  );

  return `rackula_auth_session=${token}`;
}
