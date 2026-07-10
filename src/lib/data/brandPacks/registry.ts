import type { DeviceType } from "$lib/types";
import { acInfinityDevices } from "./ac-infinity";
import { apcDevices } from "./apc";
import { appleDevices } from "./apple";
import { aristaDevices } from "./arista";
import { beelinkDevices } from "./beelink";
import { blackmagicdesignDevices } from "./blackmagicdesign";
import { ciscoDevices } from "./cisco";
import { cyberpowerDevices } from "./cyberpower";
import { dellDevices } from "./dell";
import { deskpiDevices } from "./deskpi";
import { eatonDevices } from "./eaton";
import { ecoflowDevices } from "./ecoflow";
import { fortinetDevices } from "./fortinet";
import { fsDevices } from "./fs";
import { guitkDevices } from "./guitk";
import { hpeDevices } from "./hpe";
import { intelDevices } from "./intel";
import { juniperDevices } from "./juniper";
import { kwsDevices } from "./kws";
import { lenovoDevices } from "./lenovo";
import { mikrotikDevices } from "./mikrotik";
import { minisforumDevices } from "./minisforum";
import { netgateDevices } from "./netgate";
import { netgearDevices } from "./netgear";
import { paloaltoDevices } from "./palo-alto";
import { pecronDevices } from "./pecron";
import { qnapDevices } from "./qnap";
import { raspberryPiDevices } from "./raspberry-pi";
import { supermicroDevices } from "./supermicro";
import { synologyDevices } from "./synology";
import { tplinkDevices } from "./tp-link";
import { ubiquitiDevices } from "./ubiquiti";
import { vertivDevices } from "./vertiv";
import { zimaDevices } from "./zima";

/** Schema-safe registry of every built-in brand device. */
export const BRAND_DEVICE_REGISTRY: DeviceType[] = [
  ...ubiquitiDevices,
  ...mikrotikDevices,
  ...tplinkDevices,
  ...synologyDevices,
  ...apcDevices,
  ...dellDevices,
  ...supermicroDevices,
  ...hpeDevices,
  ...fortinetDevices,
  ...eatonDevices,
  ...ecoflowDevices,
  ...guitkDevices,
  ...netgearDevices,
  ...pecronDevices,
  ...paloaltoDevices,
  ...qnapDevices,
  ...lenovoDevices,
  ...cyberpowerDevices,
  ...netgateDevices,
  ...blackmagicdesignDevices,
  ...deskpiDevices,
  ...kwsDevices,
  ...acInfinityDevices,
  ...appleDevices,
  ...ciscoDevices,
  ...aristaDevices,
  ...juniperDevices,
  ...vertivDevices,
  ...fsDevices,
  ...intelDevices,
  ...minisforumDevices,
  ...beelinkDevices,
  ...raspberryPiDevices,
  ...zimaDevices,
];

export function findRegisteredBrandDevice(
  slug: string,
): DeviceType | undefined {
  return BRAND_DEVICE_REGISTRY.find((device) => device.slug === slug);
}
