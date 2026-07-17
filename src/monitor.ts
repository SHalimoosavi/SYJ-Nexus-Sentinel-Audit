#!/usr/bin/env node
/**
 * SYJ-Nexus-Sentinel-Audit
 * Core monitoring daemon.
 *
 * Periodically scans the local network's ARP/neighbor table, tracks each
 * device's fingerprint in the local database, flags anything not present
 * in whitelist.json, and writes a rolling daily audit report.
 *
 * Usage:
 *   node dist/monitor.js               # run continuously (default interval)
 *   node dist/monitor.js --once        # run a single scan cycle and exit
 *   node dist/monitor.js --interval=30 # scan every 30 seconds
 */

import { scanLocalNetwork } from "./scanner.js";
import { loadWhitelist, isWhitelisted, whitelistName } from "./whitelist.js";
import { upsertDevice, logEvent, activeBackend } from "./db/store.js";
import { writeDailyReport } from "./report.js";

interface CliOptions {
  once: boolean;
  intervalSeconds: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const intervalSeconds = intervalArg ? Number(intervalArg.split("=")[1]) : 60;
  return { once, intervalSeconds: Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : 60 };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function runScanCycle(): Promise<void> {
  const timestamp = nowIso();
  const whitelist = loadWhitelist();

  let scanned: Awaited<ReturnType<typeof scanLocalNetwork>> = [];
  try {
    scanned = await scanLocalNetwork();
  } catch (err) {
    console.error(`[monitor] Scan failed: ${(err as Error).message}`);
    await logEvent({
      timestamp,
      type: "scan",
      mac: null,
      ip: null,
      severity: "warning",
      details: `Scan cycle failed: ${(err as Error).message}`,
    });
    return;
  }

  await logEvent({
    timestamp,
    type: "scan",
    mac: null,
    ip: null,
    severity: "info",
    details: `Scan completed. ${scanned.length} device(s) observed.`,
  });

  let newCount = 0;
  let knownCount = 0;
  let unknownCount = 0;

  for (const device of scanned) {
    const trusted = isWhitelisted(device.mac, whitelist);
    const status = trusted ? "known" : "unknown";
    const label = trusted ? whitelistName(device.mac, whitelist) : undefined;

    const { device: record, wasNew } = await upsertDevice({
      mac: device.mac,
      ip: device.ip,
      hostname: device.hostname ?? label ?? null,
      status,
      firstSeen: timestamp,
      lastSeen: timestamp,
    });

    if (trusted) knownCount++;
    else unknownCount++;

    if (wasNew) {
      newCount++;
      await logEvent({
        timestamp,
        type: "new_device",
        mac: device.mac,
        ip: device.ip,
        severity: trusted ? "info" : "warning",
        details: trusted
          ? `New whitelisted device joined: ${label ?? device.mac}`
          : `Unrecognized device joined the network (not in whitelist.json)`,
      });
    } else if (record.ip !== device.ip) {
      await logEvent({
        timestamp,
        type: "ip_change",
        mac: device.mac,
        ip: device.ip,
        severity: "info",
        details: `Device ${device.mac} changed IP address to ${device.ip}`,
      });
    }
  }

  console.log(
    `[monitor] ${timestamp} — scanned ${scanned.length} device(s): ` +
      `${knownCount} known, ${unknownCount} unknown, ${newCount} newly seen. ` +
      `(backend: ${activeBackend()})`
  );

  if (unknownCount > 0) {
    console.warn(`[monitor] ⚠ ${unknownCount} unrecognized device(s) detected on the network.`);
  }
}

async function main() {
  const { once, intervalSeconds } = parseArgs();

  console.log("========================================");
  console.log(" SYJ-Nexus-Sentinel-Audit — starting up");
  console.log(`  Storage backend : ${activeBackend()}`);
  console.log(`  Mode            : ${once ? "single scan" : `continuous (every ${intervalSeconds}s)`}`);
  console.log("========================================");

  await runScanCycle();
  await writeDailyReport();

  if (once) {
    return;
  }

  const timer = setInterval(async () => {
    try {
      await runScanCycle();
      await writeDailyReport();
    } catch (err) {
      console.error(`[monitor] Unhandled error in scan cycle: ${(err as Error).message}`);
    }
  }, intervalSeconds * 1000);

  const shutdown = (signal: string) => {
    console.log(`\n[monitor] Received ${signal}, shutting down gracefully.`);
    clearInterval(timer);
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(`[monitor] Fatal error: ${(err as Error).message}`);
  process.exit(1);
});
