/**
 * SYJ-Nexus-Sentinel-Audit
 * SQLite client.
 *
 * Uses Node's built-in `node:sqlite` module (available from Node 22.5+,
 * no native compilation, no prebuilt binaries to fetch) wired into
 * Drizzle ORM through the driver-agnostic `sqlite-proxy` adapter.
 *
 * This keeps the tool 100% pure JS/TS — nothing to `node-gyp` rebuild,
 * which is what makes it reliable on Termux/Android, Windows, and
 * minimal Linux containers alike.
 */

import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "sentinel.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * True once we've confirmed `node:sqlite` is usable on this runtime.
 * Exposed so callers (e.g. monitor.ts) can decide whether to fall back
 * to the JSON store on older Node builds.
 */
export let sqliteAvailable = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseSyncCtor: any = null;

try {
  const nodeSqlite = await import("node:sqlite");
  DatabaseSyncCtor = nodeSqlite.DatabaseSync;
} catch {
  sqliteAvailable = false;
}

function createSchemaIfNeeded(sqlite: InstanceType<typeof DatabaseSyncCtor>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mac TEXT NOT NULL UNIQUE,
      ip TEXT NOT NULL,
      hostname TEXT,
      vendor_hint TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      mac TEXT,
      ip TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      details TEXT
    );
  `);
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily initializes and returns the Drizzle database handle.
 * Throws if `node:sqlite` is unavailable — callers should catch this
 * and fall back to the JSON store (see db/jsonStore.ts).
 */
export function getDb() {
  if (!sqliteAvailable) {
    throw new Error(
      "node:sqlite is not available on this Node.js runtime (requires Node >= 22.5). " +
        "Falling back to the JSON store."
    );
  }

  if (dbInstance) return dbInstance;

  const sqlite = new DatabaseSyncCtor(DB_PATH);
  createSchemaIfNeeded(sqlite);

  dbInstance = drizzle(async (sql, params, method) => {
    try {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...params);
        return { rows: [] };
      }
      // node:sqlite returns rows as plain objects (column -> value); Drizzle's
      // sqlite-proxy protocol expects positional arrays, so we convert here.
      const toArray = (row: unknown) => (row ? Object.values(row as object) : row);

      if (method === "get") {
        const row = stmt.get(...params);
        return { rows: row ? [toArray(row)] : [] };
      }

      const rawRows = stmt.all(...params);
      return { rows: rawRows.map(toArray) as any[] };
    } catch (err) {
      // Surface driver errors clearly rather than swallowing them.
      throw new Error(`SQLite proxy error executing "${sql}": ${(err as Error).message}`);
    }
  }, { schema });

  return dbInstance;
}

export { DB_PATH, DATA_DIR };
