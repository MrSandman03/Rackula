import { beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp } from "./app";
import {
  clearInvalidatedAuthSessions,
  createSignedAuthSessionToken,
  invalidateAuthSession,
  verifySignedAuthSessionToken,
} from "./security";
import {
  TEST_AUTH_SECRET,
  TEST_TOKEN,
  buildAuthCookie,
  buildAuthEnabledEnv,
  buildEnv,
} from "./test-support/security";

beforeEach(() => {
  clearInvalidatedAuthSessions();
});

describe("signed session tokens", () => {
  it("rejects oversized token payloads before parsing", () => {
    const oversized = "a".repeat(8193);
    const claims = verifySignedAuthSessionToken(oversized, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects expired signed auth session tokens", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "expired-session",
        iat: now - 120,
        exp: now - 30,
        idleExp: now - 30,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects tokens when idle timeout has elapsed", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "idle-expired-session",
        iat: now - 120,
        exp: now + 120,
        idleExp: now - 1,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET);
    expect(claims).toBeNull();
  });

  it("rejects tokens from older session generation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "generation-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
        generation: 0,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 1,
    });
    expect(claims).toBeNull();
  });

  it("rejects tokens invalidated by logout/session revocation", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "revoked-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
      },
      TEST_AUTH_SECRET,
    );

    const beforeRevocation = verifySignedAuthSessionToken(
      token,
      TEST_AUTH_SECRET,
    );
    expect(beforeRevocation).not.toBeNull();

    invalidateAuthSession("revoked-session", now + 300);

    const afterRevocation = verifySignedAuthSessionToken(
      token,
      TEST_AUTH_SECRET,
    );
    expect(afterRevocation).toBeNull();
  });

  it("rejects tokens signed without the session signature context prefix", () => {
    const now = Math.floor(Date.now() / 1000);
    const payloadPart = Buffer.from(
      JSON.stringify({
        v: 2,
        sub: "admin@example.com",
        sid: "legacy-signature-session",
        iat: now - 30,
        exp: now + 300,
        idleExp: now + 120,
        generation: 0,
      }),
      "utf-8",
    ).toString("base64url");
    const legacySignature = createHmac("sha256", TEST_AUTH_SECRET)
      .update(payloadPart)
      .digest("base64url");
    const token = `${payloadPart}.${legacySignature}`;

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 0,
      maxSessionMaxAgeSeconds: 3600,
      nowSeconds: now,
    });

    expect(claims).toBeNull();
  });

  it("accepts non-expired signed auth session tokens", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createSignedAuthSessionToken(
      {
        sub: "admin@example.com",
        sid: "valid-session",
        iat: now,
        exp: now + 300,
        idleExp: now + 120,
        generation: 2,
      },
      TEST_AUTH_SECRET,
    );

    const claims = verifySignedAuthSessionToken(token, TEST_AUTH_SECRET, {
      expectedGeneration: 2,
      maxSessionMaxAgeSeconds: 3600,
    });

    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("admin@example.com");
    expect(claims?.sid).toBe("valid-session");
    expect(claims?.generation).toBe(2);
  });
});

describe("authentication gate", () => {
  it("rejects anonymous API request when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message: "Authentication required.",
    });
  });

  it("redirects anonymous app routes to login when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/dashboard");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/login?next=%2Fdashboard",
    );
  });

  it("normalizes leading slashes in redirect next path", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request(
      "https://rack.example.com//dashboard?tab=1",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/auth/login?next=%2Fdashboard%3Ftab%3D1",
    );
  });

  it("allows signed-session requests through the auth gate", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: buildAuthCookie(),
      },
    });

    // Auth gate passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("accepts quoted auth session cookie values", async () => {
    const app = await createApp(buildAuthEnabledEnv());
    const cookie = buildAuthCookie({ sid: "quoted-cookie-session" });
    const separatorIndex = cookie.indexOf("=");
    const cookieName = cookie.slice(0, separatorIndex);
    const cookieValue = cookie.slice(separatorIndex + 1);

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: `${cookieName}="${cookieValue}"`,
      },
    });

    // Auth gate passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps health/login/callback routes reachable when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const health = await app.request("/health");
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, status: "ok" });

    const login = await app.request("/auth/login");
    expect(login.status).toBe(501);

    const callback = await app.request("/auth/callback");
    expect(callback.status).toBe(501);
  });

  it("refreshes auth cookies with secure defaults on auth check", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({
        NODE_ENV: "production",
        RACKULA_AUTH_SESSION_MAX_AGE_SECONDS: "1800",
        RACKULA_AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "120",
      }),
    );

    const now = Math.floor(Date.now() / 1000);
    const cookie = buildAuthCookie({
      sid: "refresh-session",
      iat: now - 300,
      exp: now + 600,
      idleExp: now + 10,
    });

    const response = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(204);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("invalidates sessions on logout and rejects replayed cookies", async () => {
    const app = await createApp(buildAuthEnabledEnv());
    const cookie = buildAuthCookie({ sid: "logout-session" });

    const authorizedBeforeLogout = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });
    expect(authorizedBeforeLogout.status).toBe(204);

    const logout = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const replay = await app.request("/auth/check", {
      headers: {
        Cookie: cookie,
        Origin: "https://rack.example.com",
      },
    });

    expect(replay.status).toBe(401);
  });

  it("preserves existing behavior when auth mode is disabled", async () => {
    const app = await createApp(buildEnv());

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });
});

describe("csrf protection", () => {
  it("rejects state-changing session requests without origin headers", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-missing-origin" }),
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: missing Origin or Referer header.",
    });
  });

  it("rejects state-changing session requests from untrusted origins", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-bad-origin" }),
        Origin: "https://evil.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: request origin is not allowed.",
    });
  });

  it("rejects logout requests without origin headers", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-logout-missing-origin" }),
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "CSRF validation failed: missing Origin or Referer header.",
    });
  });

  it("allows trusted-origin authenticated writes to continue", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "csrf-good-origin" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // CSRF + auth passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });
});

describe("authorization", () => {
  it("allows admin to write layouts", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie(),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // Admin passes auth gate and authorization; hits route-level UUID validation
    expect(response.status).toBe(400);
  });

  it("returns 403 for authenticated non-admin on write", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ role: "viewer", sid: "viewer-session" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });

  it("returns 403 for authenticated user with no role on write", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "DELETE",
      headers: {
        Cookie: buildAuthCookie({ role: undefined, sid: "no-role-session" }),
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });

  it("allows non-admin to read when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      headers: {
        Cookie: buildAuthCookie({ role: "viewer", sid: "viewer-read" }),
      },
    });

    // Auth gate passes, authorization skips for GET, hits route validation
    expect(response.status).toBe(400);
  });

  it("returns 401 for unauthenticated write when auth is enabled", async () => {
    const app = await createApp(buildAuthEnabledEnv());

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // Auth gate blocks before authorization runs
    expect(response.status).toBe(401);
  });

  it("skips authorization when auth is disabled", async () => {
    const app = await createApp(
      buildEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // No auth gate, no admin check, hits route validation
    expect(response.status).toBe(400);
  });

  it("writeAuth accepts token but requireAdmin blocks non-admin", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({ RACKULA_API_WRITE_TOKEN: TEST_TOKEN }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${TEST_TOKEN}`,
        Cookie: buildAuthCookie({
          role: "viewer",
          sid: "non-admin-token-session",
        }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    // writeAuth passes (valid token), requireAdmin rejects (not admin)
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Admin role required.",
    });
  });
});
