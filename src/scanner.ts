/**
 * SYJ-Nexus-Sentinel-Audit
 * Network scanner.
 *
 * Shells out to whichever native address-resolution command is available
 * on the host (`ip neigh`, `arp -a`) and parses the output into a
 * normalized device list. No packages, no compiled binaries — just the
 * OS tools that already ship with Linux, Termux, and Windows.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";

const execAsync = promisify(exec);

export interface ScannedDevice {
  ip: string;
  mac: string;
  hostname?: string;
}

interface Command {
  cmd: string;
  parser: (stdout: string) => ScannedDevice[];
}

const MAC_REGEX = /([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/;
const IPV4_REGEX = /((?:\d{1,3}\.){3}\d{1,3})/;

/** Parses `ip neigh show` output (modern Linux / Termux with iproute2). */
function parseIpNeigh(stdout: string): ScannedDevice[] {
  const devices: ScannedDevice[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const ipMatch = line.match(IPV4_REGEX);
    const macMatch = line.match(MAC_REGEX);
    if (ipMatch && macMatch) {
      devices.push({ ip: ipMatch[1], mac: macMatch[1].toLowerCase() });
    }
  }
  return devices;
}

/** Parses `arp -a` output (Linux net-tools, macOS, and Windows). */
function parseArp(stdout: string): ScannedDevice[] {
  const devices: ScannedDevice[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const ipMatch = line.match(IPV4_REGEX);
    const macMatch = line.match(MAC_REGEX) ?? line.match(/([0-9A-Fa-f]{2}(?:-[0-9A-Fa-f]{2}){5})/);
    if (ipMatch && macMatch) {
      const hostnameMatch = line.match(/^([^\s(]+)\s*\(/);
      devices.push({
        ip: ipMatch[1],
        mac: macMatch[1].replace(/-/g, ":").toLowerCase(),
        hostname: hostnameMatch?.[1],
      });
    }
  }
  return devices;
}

function commandsForPlatform(): Command[] {
  const platform = os.platform();

  if (platform === "win32") {
    return [{ cmd: "arp -a", parser: parseArp }];
  }

  // Linux / Termux / Android / macOS: prefer `ip neigh`, fall back to `arp`.
  return [
    { cmd: "ip neigh show", parser: parseIpNeigh },
    { cmd: "arp -a", parser: parseArp },
    { cmd: "arp -an", parser: parseArp },
  ];
}

/**
 * Runs the best available address-resolution command for this platform
 * and returns a de-duplicated list of devices currently in the ARP/neighbor
 * table. Returns an empty array (never throws) if no command succeeds —
 * callers should treat that as "no data this cycle", not a fatal error.
 */
export async function scanLocalNetwork(): Promise<ScannedDevice[]> {
  const commands = commandsForPlatform();
  const seen = new Map<string, ScannedDevice>();
  let anySucceeded = false;

  for (const { cmd, parser } of commands) {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 8000 });
      anySucceeded = true;
      for (const device of parser(stdout)) {
        if (device.mac && device.mac !== "00:00:00:00:00:00") {
          seen.set(device.mac, { ...seen.get(device.mac), ...device });
        }
      }
      // `ip neigh` alone is usually sufficient; only fall through to arp
      // variants if it produced nothing.
      if (seen.size > 0) break;
    } catch {
      // Command not found or failed — try the next one in the chain.
      continue;
    }
  }

  if (!anySucceeded) {
    console.warn(
      "[scanner] No network command succeeded (ip/arp unavailable). " +
        "On Termux run: pkg install iproute2 (or net-tools for arp)."
    );
  }

  return Array.from(seen.values());
}
