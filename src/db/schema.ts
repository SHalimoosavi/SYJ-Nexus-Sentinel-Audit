/**
 * SYJ-Nexus-Sentinel-Audit
 * Drizzle ORM schema — device fingerprint tracking and event log.
 *
 * Driver-agnostic: defined with `drizzle-orm/sqlite-core` so it can run
 * against any SQLite driver (Node's built-in `node:sqlite`, libsql, etc.)
 * without pulling in a compiled native module.
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * One row per unique device (keyed by MAC address) observed on the
 * local network. Updated in place on every scan cycle.
 */
export const devices = sqliteTable("devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mac: text("mac").notNull().unique(),
  ip: text("ip").notNull(),
  hostname: text("hostname"),
  vendorHint: text("vendor_hint"),
  status: text("status").notNull().default("unknown"), // "known" | "unknown" | "ignored"
  firstSeen: text("first_seen").notNull(),
  lastSeen: text("last_seen").notNull(),
  seenCount: integer("seen_count").notNull().default(1),
});

/**
 * Append-only audit trail: every scan, new-device detection,
 * IP change, and status transition is recorded here.
 */
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: text("timestamp").notNull(),
  type: text("type").notNull(), // "scan" | "new_device" | "ip_change" | "reconnect" | "status_change"
  mac: text("mac"),
  ip: text("ip"),
  severity: text("severity").notNull().default("info"), // "info" | "warning" | "critical"
  details: text("details"),
});

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type SentinelEvent = typeof events.$inferSelect;
export type NewSentinelEvent = typeof events.$inferInsert;
