/**
 * SYJ-Nexus-Sentinel-Audit
 * JSON fallback store.
 *
 * Used automatically when `node:sqlite` is unavailable (Node < 22.5).
 * Implements the same functional surface as the SQLite-backed store so
 * `monitor.ts` and `report.ts` never need to know which one is active.
 * Zero dependencies, zero native code — a plain JSON file on disk.
 */

import fs from "node:fs";
import path from "node:path";
import type { Device, SentinelEvent } from "./schema.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "sentinel.json");

interface StoreShape {
  devices: Device[];
  events: SentinelEvent[];
  nextDeviceId: number;
  nextEventId: number;
}

function loadStore(): StoreShape {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    const empty: StoreShape = { devices: [], events: [], nextDeviceId: 1, nextEventId: 1 };
    fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2));
    return empty;
  }
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf-8")) as StoreShape;
}

function saveStore(store: StoreShape) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function jsonGetDeviceByMac(mac: string): Device | undefined {
  return loadStore().devices.find((d) => d.mac.toLowerCase() === mac.toLowerCase());
}

export function jsonGetAllDevices(): Device[] {
  return loadStore().devices;
}

export function jsonGetAllEvents(): SentinelEvent[] {
  return loadStore().events;
}

export function jsonUpsertDevice(input: Omit<Device, "id" | "seenCount"> & { seenCount?: number }) {
  const store = loadStore();
  const existing = store.devices.find((d) => d.mac.toLowerCase() === input.mac.toLowerCase());

  if (existing) {
    existing.ip = input.ip;
    existing.hostname = input.hostname ?? existing.hostname;
    existing.vendorHint = input.vendorHint ?? existing.vendorHint;
    existing.status = input.status;
    existing.lastSeen = input.lastSeen;
    existing.seenCount = (existing.seenCount ?? 0) + 1;
    saveStore(store);
    return existing;
  }

  const record: Device = {
    id: store.nextDeviceId++,
    mac: input.mac,
    ip: input.ip,
    hostname: input.hostname ?? null,
    vendorHint: input.vendorHint ?? null,
    status: input.status,
    firstSeen: input.firstSeen,
    lastSeen: input.lastSeen,
    seenCount: 1,
  };
  store.devices.push(record);
  saveStore(store);
  return record;
}

export function jsonLogEvent(input: Omit<SentinelEvent, "id">) {
  const store = loadStore();
  const record: SentinelEvent = { id: store.nextEventId++, ...input };
  store.events.push(record);
  saveStore(store);
  return record;
}
