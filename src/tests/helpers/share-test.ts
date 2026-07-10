import * as pako from "pako";
import { base64UrlEncode, decodeLayout, encodeLayout } from "$lib/utils/share";
import type { Layout } from "$lib/types";
import {
  createTestDevice,
  createTestDeviceType,
  createTestLayout,
  createTestRack,
} from "../factories";

export function requireEncoded(layout: Layout): string {
  const encoded = encodeLayout(layout);
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("encodeLayout returned null or empty string");
  }
  return encoded;
}

export function requireDecoded(encoded: string): Layout {
  const { layout } = decodeLayout(encoded);
  if (!layout) {
    throw new Error("decodeLayout returned null layout");
  }
  return layout;
}

export function encodeLegacyPayload(payload: unknown): string {
  return base64UrlEncode(pako.deflate(JSON.stringify(payload)));
}

export function createLayoutWithDevices(): Layout {
  const deviceType = createTestDeviceType({
    slug: "test-server",
    u_height: 2,
    category: "server",
    model: "Test Server",
  });

  const device = createTestDevice({
    device_type: "test-server",
    position: 5,
    face: "front",
  });

  return createTestLayout({
    name: "Test Layout",
    racks: [
      createTestRack({
        name: "Main Rack",
        height: 42,
        width: 19,
        devices: [device],
      }),
    ],
    device_types: [deviceType],
  });
}
