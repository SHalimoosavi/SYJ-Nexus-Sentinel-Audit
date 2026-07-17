/**
 * SYJ-Nexus-Sentinel-Audit
 * Daily report generator — writes logs/security_audit.json.
 *
 * Summarizes today's connection attempts, anomalies, and device status
 * changes into a single machine-readable file, plus a rolling snapshot
 * of the full device inventory.
 */

import fs from "node:fs";
import path from "node:path";
import { getAllDevices, getAllEvents } from "./db/store.js";

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const REPORT_PATH = path.join(LOGS_DIR, "security_audit.json");

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function writeDailyReport(): Promise<void> {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

  const [devices, events] = await Promise.all([getAllDevices(), getAllEvents()]);
  const todayStart = startOfTodayIso();
  const todaysEvents = events.filter((e) => e.timestamp >= todayStart);

  const report = {
    generatedAt: new Date().toISOString(),
    reportDate: todayStart.slice(0, 10),
    summary: {
      totalDevicesKnown: devices.length,
      knownDevices: devices.filter((d) => d.status === "known").length,
      unknownDevices: devices.filter((d) => d.status === "unknown").length,
      eventsToday: todaysEvents.length,
      newDevicesToday: todaysEvents.filter((e) => e.type === "new_device").length,
      anomaliesToday: todaysEvents.filter((e) => e.severity === "warning" || e.severity === "critical").length,
    },
    deviceInventory: devices.map((d) => ({
      mac: d.mac,
      ip: d.ip,
      hostname: d.hostname,
      status: d.status,
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
      seenCount: d.seenCount,
    })),
    connectionAttemptsToday: todaysEvents
      .filter((e) => e.type === "scan" || e.type === "new_device" || e.type === "ip_change")
      .map((e) => ({
        timestamp: e.timestamp,
        type: e.type,
        mac: e.mac,
        ip: e.ip,
        severity: e.severity,
        details: e.details,
      })),
    anomalies: todaysEvents
      .filter((e) => e.severity === "warning" || e.severity === "critical")
      .map((e) => ({
        timestamp: e.timestamp,
        type: e.type,
        mac: e.mac,
        ip: e.ip,
        severity: e.severity,
        details: e.details,
      })),
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

// Allow running standalone: `node dist/report.js`
const isMain = process.argv[1] && process.argv[1].endsWith("report.js");
if (isMain) {
  writeDailyReport()
    .then(() => console.log(`[report] Written to ${REPORT_PATH}`))
    .catch((err) => {
      console.error(`[report] Failed: ${err.message}`);
      process.exit(1);
    });
}
