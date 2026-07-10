import { describe, expect, it } from "bun:test";
import { resolveApiSecurityConfig } from "./security";
import {
  TEST_AUTH_SECRET,
  TEST_TOKEN,
  buildAuthEnabledEnv,
  buildEnv,
} from "./test-support/security";

describe("resolveApiSecurityConfig", () => {
  it("uses wildcard CORS in non-production by default", () => {
    const config = resolveApiSecurityConfig(buildEnv());
    expect(config.corsOrigin).toBe("*");
    expect(config.isProduction).toBe(false);
    expect(config.authMode).toBe("none");
    expect(config.authEnabled).toBe(false);
  });

  it("treats blank auth mode as none", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        RACKULA_AUTH_MODE: "   ",
      }),
    );

    expect(config.authMode).toBe("none");
    expect(config.authEnabled).toBe(false);
  });

  it("rejects invalid auth mode", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "jwt",
        }),
      ),
    ).toThrow("Invalid auth mode");
  });

  it("ignores unprefixed env vars so security config cannot diverge from createAuth", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        AUTH_MODE: "oidc",
        AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
        AUTH_SESSION_COOKIE_NAME: "shadow_session",
        AUTH_LOG_HASH_KEY: "rackula-auth-log-key-override",
        API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    expect(config.authMode).toBe("none");
    expect(config.authSessionCookieName).toBe("rackula_auth_session");
    expect(config.writeAuthToken).toBeUndefined();
  });

  it("requires auth session secret and references RACKULA_AUTH_MODE when auth is enabled", () => {
    const run = () =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          CORS_ORIGIN: "https://rack.example.com",
        }),
      );

    expect(run).toThrow(
      /(?=.*RACKULA_AUTH_SESSION_SECRET)(?=.*RACKULA_AUTH_MODE is enabled)/,
    );
  });

  it("rejects short auth session secret when auth mode is enabled", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          CORS_ORIGIN: "https://rack.example.com",
          RACKULA_AUTH_SESSION_SECRET: "too-short",
        }),
      ),
    ).toThrow("at least 32 characters");
  });

  it("rejects auth-enabled CSRF enforcement with wildcard CORS", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          RACKULA_AUTH_MODE: "oidc",
          RACKULA_AUTH_SESSION_SECRET: TEST_AUTH_SECRET,
          CORS_ORIGIN: "*",
        }),
      ),
    ).toThrow("requires explicit CORS_ORIGIN");
  });

  it("rejects idle timeout values above max session age", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "300",
          RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "301",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS must be <= 300");
  });

  it("rejects malformed session timeout values with trailing characters", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "300s",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_MAX_AGE_SECONDS must be an integer >= 60");
  });

  it("rejects malformed session generation values with trailing characters", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_GENERATION: "0abc",
        }),
      ),
    ).toThrow("RACKULA_AUTH_SESSION_GENERATION must be an integer >= 0");
  });

  it("rejects auth login paths that begin with double slash", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_LOGIN_PATH: "//evil.example.com/login",
        }),
      ),
    ).toThrow("External URLs are not allowed");
  });

  it("rejects SameSite=None without Secure cookie flag", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_SESSION_COOKIE_SAMESITE: "None",
          RACKULA_AUTH_SESSION_COOKIE_SECURE: "false",
        }),
      ),
    ).toThrow("SAMESITE=None requires");
  });

  it("defaults auth cookies to secure in production", () => {
    const config = resolveApiSecurityConfig(
      buildAuthEnabledEnv({
        NODE_ENV: "production",
      }),
    );

    expect(config.authSessionCookieSecure).toBe(true);
    expect(config.authSessionCookieSameSite).toBe("Lax");
    expect(config.csrfTrustedOrigins).toEqual(["https://rack.example.com"]);
  });

  it("derives auth log hash key from auth session secret by default", () => {
    const first = resolveApiSecurityConfig(buildAuthEnabledEnv());
    const second = resolveApiSecurityConfig(buildAuthEnabledEnv());
    expect(first.authLogHashKey).toBe(second.authLogHashKey);
    expect(first.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.authLogHashKey).not.toBe(TEST_AUTH_SECRET);
  });

  it("accepts explicit auth log hash key override", () => {
    const config = resolveApiSecurityConfig(
      buildAuthEnabledEnv({
        RACKULA_AUTH_LOG_HASH_KEY: "rackula-auth-log-key-override",
      }),
    );

    expect(config.authLogHashKey).toBe("rackula-auth-log-key-override");
  });

  it("rejects short auth log hash key overrides", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildAuthEnabledEnv({
          RACKULA_AUTH_LOG_HASH_KEY: "too-short",
        }),
      ),
    ).toThrow("RACKULA_AUTH_LOG_HASH_KEY must be at least 16 characters.");
  });

  it("generates ephemeral auth log hash keys without configured secrets", () => {
    const first = resolveApiSecurityConfig(buildEnv());
    const second = resolveApiSecurityConfig(buildEnv());

    expect(first.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(second.authLogHashKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.authLogHashKey).not.toBe(second.authLogHashKey);
  });

  it("rejects production startup when CORS_ORIGIN is missing", () => {
    expect(() =>
      resolveApiSecurityConfig(buildEnv({ NODE_ENV: "production" })),
    ).toThrow("CORS_ORIGIN");
  });

  it("rejects wildcard CORS in production unless insecure mode is explicit", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({
          NODE_ENV: "production",
          CORS_ORIGIN: "*",
        }),
      ),
    ).toThrow("ALLOW_INSECURE_CORS=true");
  });

  it("allows wildcard CORS in production only with explicit insecure opt-in", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        NODE_ENV: "production",
        ALLOW_INSECURE_CORS: "true",
      }),
    );
    expect(config.corsOrigin).toBe("*");
  });

  it("accepts explicit production origins", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );
    expect(config.corsOrigin).toBe("https://rack.example.com");
  });
});

describe("resolveApiSecurityConfig rate limiting", () => {
  it("includes rate limit config with defaults when no env vars set", () => {
    const config = resolveApiSecurityConfig(buildEnv());
    expect(config.rateLimitEnabled).toBe(true);
    expect(config.rateLimitWriteMaxRequests).toBe(30);
    expect(config.rateLimitWriteWindowMs).toBe(60_000);
    expect(config.rateLimitReadMaxRequests).toBe(120);
    expect(config.rateLimitReadWindowMs).toBe(60_000);
  });

  it("disables rate limiting when RACKULA_RATE_LIMIT_ENABLED is false", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({ RACKULA_RATE_LIMIT_ENABLED: "false" }),
    );
    expect(config.rateLimitEnabled).toBe(false);
  });

  it("parses custom rate limit values from env", () => {
    const config = resolveApiSecurityConfig(
      buildEnv({
        RACKULA_RATE_LIMIT_WRITE_MAX: "100",
        RACKULA_RATE_LIMIT_WRITE_WINDOW_MS: "120000",
        RACKULA_RATE_LIMIT_READ_MAX: "500",
        RACKULA_RATE_LIMIT_READ_WINDOW_MS: "300000",
      }),
    );
    expect(config.rateLimitWriteMaxRequests).toBe(100);
    expect(config.rateLimitWriteWindowMs).toBe(120_000);
    expect(config.rateLimitReadMaxRequests).toBe(500);
    expect(config.rateLimitReadWindowMs).toBe(300_000);
  });

  it("rejects rate limit write max below minimum", () => {
    expect(() =>
      resolveApiSecurityConfig(buildEnv({ RACKULA_RATE_LIMIT_WRITE_MAX: "0" })),
    ).toThrow();
  });

  it("rejects rate limit write max above maximum", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({ RACKULA_RATE_LIMIT_WRITE_MAX: "10001" }),
      ),
    ).toThrow();
  });

  it("rejects rate limit window below minimum", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({ RACKULA_RATE_LIMIT_WRITE_WINDOW_MS: "999" }),
      ),
    ).toThrow();
  });

  it("rejects rate limit window above maximum", () => {
    expect(() =>
      resolveApiSecurityConfig(
        buildEnv({ RACKULA_RATE_LIMIT_READ_WINDOW_MS: "3600001" }),
      ),
    ).toThrow();
  });
});
