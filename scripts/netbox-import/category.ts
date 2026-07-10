/** Category inference for imported NetBox device definitions. */

import type { DeviceCategory, NetBoxDevice, VendorConfig } from "./types";

export function inferCategory(
  device: NetBoxDevice,
  vendorConfig: VendorConfig,
): DeviceCategory {
  const model = device.model.toLowerCase();
  const slug = device.slug.toLowerCase();

  if (vendorConfig.categoryOverrides) {
    for (const [pattern, category] of Object.entries(
      vendorConfig.categoryOverrides,
    )) {
      if (
        model.includes(pattern.toLowerCase()) ||
        slug.includes(pattern.toLowerCase())
      ) {
        return category;
      }
    }
  }

  if (model.includes("pdu") || slug.includes("pdu")) return "power";
  if (model.includes("ups") || slug.includes("ups")) return "power";
  if (model.includes("patch") && model.includes("panel")) return "patch-panel";
  if (model.includes("switch") || slug.includes("switch")) return "network";
  if (model.includes("router") || slug.includes("router")) return "network";
  if (model.includes("firewall") || model.includes("gateway")) return "network";
  if (
    model.includes("nas") ||
    model.includes("diskstation") ||
    model.includes("rackstation") ||
    model.includes("powervault") ||
    model.includes("storage")
  ) {
    return "storage";
  }
  if (model.includes("kvm") || model.includes("console")) return "kvm";
  if (
    model.includes("atem") ||
    model.includes("receiver") ||
    model.includes("amplifier")
  ) {
    return "av-media";
  }

  return vendorConfig.defaultCategory;
}
