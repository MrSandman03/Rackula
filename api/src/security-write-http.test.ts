import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createApp } from "./app";
import {
  clearInvalidatedAuthSessions,
  createWriteAuthMiddleware,
} from "./security";
import {
  TEST_TOKEN,
  buildAuthCookie,
  buildAuthEnabledEnv,
  buildEnv,
} from "./test-support/security";

beforeEach(() => {
  clearInvalidatedAuthSessions();
});

describe("write-route authentication", () => {
  it("returns 401 for write request without token when token auth is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Missing write auth token. Provide Authorization: Bearer <token>.",
    });
  });

  it("returns 403 for write request with wrong token", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "DELETE",
      headers: { Authorization: "Bearer wrong-token" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Forbidden",
      message: "Invalid write auth token.",
    });
  });

  it("returns 401 for malformed Authorization header on write route", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        "Content-Type": "text/plain",
        Authorization: "Basic some-token",
      },
      body: "version: 1.0.0",
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Malformed Authorization header. Expected format: Bearer <token>.",
    });
  });

  it("returns 401 for asset PUT without token when token auth is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/assets/bad-layout/device/front", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
      },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      message:
        "Missing write auth token. Provide Authorization: Bearer <token>.",
    });
  });

  it("allows authorized write request to reach route validation", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    // Auth passed; route-level UUID validation should run.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("requires write token in auth-enabled mode when configured", async () => {
    const app = await createApp(
      buildAuthEnabledEnv({
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const withoutToken = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "write-auth-session" }),
        Origin: "https://rack.example.com",
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(withoutToken.status).toBe(401);

    const withToken = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: {
        Cookie: buildAuthCookie({ sid: "write-auth-session-2" }),
        Origin: "https://rack.example.com",
        Authorization: `Bearer ${TEST_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body: "version: 1.0.0",
    });

    expect(withToken.status).toBe(400);
    expect(await withToken.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps read routes public when write token is enabled", async () => {
    const app = await createApp(
      buildEnv({
        CORS_ORIGIN: "https://rack.example.com",
        RACKULA_API_WRITE_TOKEN: TEST_TOKEN,
      }),
    );

    const response = await app.request("/layouts/not-a-uuid");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("keeps local dev write workflow working without token", async () => {
    const app = await createApp(
      buildEnv({
        NODE_ENV: "development",
      }),
    );

    const response = await app.request("/layouts/not-a-uuid", {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: "version: 1.0.0",
    });

    // No token configured in dev: request reaches route handler.
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid layout UUID format",
    });
  });

  it("propagates async next() for authorized write requests", async () => {
    const app = new Hono();
    app.use("/protected/*", createWriteAuthMiddleware(TEST_TOKEN));
    app.put("/protected/check", async (c) => {
      await Promise.resolve();
      return c.json({ ok: true }, 200);
    });

    const response = await app.request("/protected/check", {
      method: "PUT",
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe("CORS behavior", () => {
  it("returns configured production origin in CORS header", async () => {
    const app = await createApp(
      buildEnv({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://rack.example.com",
      }),
    );

    const response = await app.request("/health", {
      method: "GET",
      headers: {
        Origin: "https://rack.example.com",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://rack.example.com",
    );
  });
});

describe("health endpoints", () => {
  it("returns structured JSON payload for both health routes", async () => {
    const app = await createApp(buildEnv());
    const assertHealthPayload = (payload: unknown): void => {
      expect(payload).toMatchObject({ ok: true, status: "ok" });
      expect(payload).toEqual(
        expect.objectContaining({
          service: expect.any(String),
          version: expect.any(Number),
        }),
      );
      expect((payload as { service: string }).service.length).toBeGreaterThan(
        0,
      );
    };

    const rootHealth = await app.request("/health");
    expect(rootHealth.status).toBe(200);
    expect(rootHealth.headers.get("content-type")).toContain(
      "application/json",
    );
    assertHealthPayload(await rootHealth.json());

    const apiHealth = await app.request("/api/health");
    expect(apiHealth.status).toBe(200);
    expect(apiHealth.headers.get("content-type")).toContain("application/json");
    assertHealthPayload(await apiHealth.json());
  });
});
