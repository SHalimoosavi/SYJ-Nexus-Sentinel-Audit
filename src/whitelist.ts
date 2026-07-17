/**
 * SYJ-Nexus-Sentinel-Audit
 * Whitelist loader — compares observed devices against a trusted list.
 */

import fs from "node:fs";
import path from "node:path";

export interface WhitelistEntry {
  mac: string;
  name: string;
  notes?: string;
}

const WHITELIST_PATH = path.resolve(process.cwd(), "whitelist.json");

export function loadWhitelist(): WhitelistEntry[] {
  if (!fs.existsSync(WHITELIST_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(WHITELIST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.mac === "string")
      .map((e) => ({ mac: e.mac.toLowerCase(), name: e.name ?? "Unnamed", notes: e.notes }));
  } catch (err) {
    console.error(`[whitelist] Failed to parse whitelist.json: ${(err as Error).message}`);
    return [];
  }
}

export function isWhitelisted(mac: string, whitelist: WhitelistEntry[]): boolean {
  const normalized = mac.toLowerCase();
  return whitelist.some((entry) => entry.mac === normalized);
}

export function whitelistName(mac: string, whitelist: WhitelistEntry[]): string | undefined {
  return whitelist.find((entry) => entry.mac === mac.toLowerCase())?.name;
}
