/**
 * SYJ-Nexus-Sentinel-Audit
 * Store facade.
 *
 * Tries the Drizzle + node:sqlite backend first (src/db/client.ts).
 * If `node:sqlite` isn't available on the current Node build, transparently
 * falls back to the dependency-free JSON store (src/db/jsonStore.ts).
 *
 * Every other module in the project talks to *this* file only — they never
 * need to know which backend is actually active.
 */

import { eq, desc } from "drizzle-orm";
import { getDb, sqliteAvailable } from "./client.js";
import { devices, events, type Device, type SentinelEvent } from "./schema.js";
import {
  jsonGetDeviceByMac,
  jsonGetAllDevices,
  jsonGetAllEvents,
  jsonUpsertDevice,
  jsonLogEvent,
} from "./jsonStore.js";

export type Backend = "sqlite" | "json";

export function activeBackend(): Backend {
  return sqliteAvailable ? "sqlite" : "json";
}

export interface UpsertDeviceInput {
  mac: string;
  ip: string;
  hostname?: string | null;
  vendorHint?: string | null;
  status: string;
  firstSeen: string;
  lastSeen: string;
}

export async function getDeviceByMac(mac: string): Promise<Device | undefined> {
  if (!sqliteAvailable) return jsonGetDeviceByMac(mac);
  const db = getDb();
  const rows = await db.select().from(devices).where(eq(devices.mac, mac.toLowerCase())).limit(1);
  return rows[0];
}

export async function upsertDevice(input: UpsertDeviceInput): Promise<{ device: Device; wasNew: boolean }> {
  if (!sqliteAvailable) {
    const before = jsonGetDeviceByMac(input.mac);
    const device = jsonUpsertDevice(input as any);
    return { device, wasNew: !before };
  }

  const db = getDb();
  const existing = await getDeviceByMac(input.mac);

  if (existing) {
    await db
      .update(devices)
      .set({
        ip: input.ip,
        hostname: input.hostname ?? existing.hostname,
        vendorHint: input.vendorHint ?? existing.vendorHint,
        status: input.status,
        lastSeen: input.lastSeen,
        seenCount: (existing.seenCount ?? 0) + 1,
      })
      .where(eq(devices.mac, input.mac.toLowerCase()));
    const updated = await getDeviceByMac(input.mac);
    return { device: updated as Device, wasNew: false };
  }

  await db.insert(devices).values({
    mac: input.mac.toLowerCase(),
    ip: input.ip,
    hostname: input.hostname ?? null,
    vendorHint: input.vendorHint ?? null,
    status: input.status,
    firstSeen: input.firstSeen,
    lastSeen: input.lastSeen,
    seenCount: 1,
  });
  const created = await getDeviceByMac(input.mac);
  return { device: created as Device, wasNew: true };
}

export async function logEvent(input: Omit<SentinelEvent, "id">): Promise<void> {
  if (!sqliteAvailable) {
    jsonLogEvent(input);
    return;
  }
  const db = getDb();
  await db.insert(events).values(input);
}

export async function getAllDevices(): Promise<Device[]> {
  if (!sqliteAvailable) return jsonGetAllDevices();
  const db = getDb();
  return db.select().from(devices).orderBy(desc(devices.lastSeen));
}

export async function getAllEvents(): Promise<SentinelEvent[]> {
  if (!sqliteAvailable) return jsonGetAllEvents();
  const db = getDb();
  return db.select().from(events).orderBy(desc(events.timestamp));
}

export async function getEventsSince(isoTimestamp: string): Promise<SentinelEvent[]> {
  const all = await getAllEvents();
  return all.filter((e) => e.timestamp >= isoTimestamp);
}
