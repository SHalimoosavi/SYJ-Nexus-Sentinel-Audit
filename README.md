# SYJ-Nexus-Sentinel-Audit

A lightweight, open-source security observability daemon for local networks.

It answers one question continuously: **"What is actually connected to my
network right now, and is it something I recognize?"**

It periodically reads your system's ARP/neighbor table, fingerprints every
device it sees (MAC, IP, hostname), checks each one against a `whitelist.json`
you control, and writes a daily `security_audit.json` report of connections,
status changes, and anomalies. No agents on other machines, no cloud
dependency, no heavy SIEM stack — just a local process and a local database.

## Highlights

- **Zero native binaries.** Built entirely in TypeScript/JavaScript. Device
  data is stored via [Drizzle ORM](https://orm.drizzle.team/) on top of
  Node's built-in `node:sqlite` module — no `node-gyp`, no prebuilt binary
  downloads. On older Node versions it falls back automatically to a plain
  JSON file store with the same schema shape, so the tool never fails to run.
- **Cross-platform.** Works on Linux, Windows, and Android via Termux, using
  whatever native tool is available (`ip neigh`, `arp -a`).
- **Whitelist-driven anomaly detection.** Anything not in `whitelist.json` is
  flagged `unknown` and logged as a warning-severity event.
- **Structured, append-only audit trail.** Every scan cycle, new device,
  IP change, and anomaly is recorded and rolled up into a daily JSON report.

## Requirements

- Node.js 18 or later (Node **22.5+** recommended to use the built-in SQLite
  backend; earlier versions automatically use the JSON fallback store).
- One of `ip` (iproute2) or `arp` (net-tools) available on the host.

## Installation

```bash
git clone https://github.com/SHalimoosavi/SYJ-Nexus-Sentinel-Audit.git
cd SYJ-Nexus-Sentinel-Audit
chmod +x init.sh
./init.sh
```

`init.sh` detects your environment (including Termux), verifies Node.js,
installs missing network tools where it safely can, installs npm
dependencies, creates `data/`, `logs/`, and a starter `whitelist.json`, and
compiles the TypeScript source.

### Windows (no bash)

```powershell
npm install
npm run build
```

Then edit `whitelist.json` manually before starting the daemon.

## Configuring your whitelist

Edit `whitelist.json` in the project root:

```json
[
  { "mac": "aa:bb:cc:dd:ee:ff", "name": "My Laptop" },
  { "mac": "11:22:33:44:55:66", "name": "Office Router", "notes": "Uplink" }
]
```

MAC addresses are matched case-insensitively. Anything on the network that
isn't listed here is tracked with `status: "unknown"` and generates a
warning-level event the first time it's seen.

## Running

```bash
# One-off scan (useful for testing / cron jobs)
node dist/monitor.js --once

# Continuous daemon, default 60s interval
node dist/monitor.js

# Continuous daemon, custom interval (in seconds)
node dist/monitor.js --interval=30
```

Each cycle updates `data/sentinel.db` (or `data/sentinel.json` on the
fallback backend) and regenerates `logs/security_audit.json`.

## Running as a background process / service

### Linux & Termux — `nohup` (simplest)

```bash
nohup node dist/monitor.js > logs/daemon.log 2>&1 &
echo $! > sentinel.pid
```

Stop it with:

```bash
kill "$(cat sentinel.pid)"
```

### Linux & Termux — `pm2` (recommended for long-running use)

```bash
npm install -g pm2
pm2 start dist/monitor.js --name syj-sentinel
pm2 save
pm2 logs syj-sentinel
```

### Termux — run at boot

Install [Termux:Boot](https://wiki.termux.com/wiki/Termux:Boot) from
F-Droid, then create `~/.termux/boot/start-sentinel.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/SYJ-Nexus-Sentinel-Audit
nohup node dist/monitor.js > logs/daemon.log 2>&1 &
```

```bash
chmod +x ~/.termux/boot/start-sentinel.sh
```

### Linux — systemd (persistent service)

Create `/etc/systemd/system/syj-sentinel.service`:

```ini
[Unit]
Description=SYJ-Nexus-Sentinel-Audit
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/SYJ-Nexus-Sentinel-Audit
ExecStart=/usr/bin/node dist/monitor.js
Restart=on-failure
User=youruser

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now syj-sentinel
sudo journalctl -u syj-sentinel -f
```

### Windows — background task

```powershell
Start-Process -NoNewWindow node "dist/monitor.js" -RedirectStandardOutput logs\daemon.log
```

Or register it as a Scheduled Task set to run at logon for a persistent
background daemon.

## Output: `logs/security_audit.json`

Regenerated on every scan cycle. Shape:

```json
{
  "generatedAt": "2026-07-18T10:00:00.000Z",
  "reportDate": "2026-07-18",
  "summary": {
    "totalDevicesKnown": 5,
    "knownDevices": 3,
    "unknownDevices": 2,
    "eventsToday": 14,
    "newDevicesToday": 1,
    "anomaliesToday": 2
  },
  "deviceInventory": [ { "mac": "...", "ip": "...", "status": "known", "...": "..." } ],
  "connectionAttemptsToday": [ { "timestamp": "...", "type": "scan", "...": "..." } ],
  "anomalies": [ { "timestamp": "...", "type": "new_device", "severity": "warning", "...": "..." } ]
}
```

Generate a report on demand without waiting for the next cycle:

```bash
npm run report
```

## Project structure

```
SYJ-Nexus-Sentinel-Audit/
├── src/
│   ├── monitor.ts        # Core daemon — scan loop, whitelist checks, orchestration
│   ├── scanner.ts         # Cross-platform arp/ip invocation and parsing
│   ├── whitelist.ts       # whitelist.json loader and matcher
│   ├── report.ts          # Daily security_audit.json generator
│   └── db/
│       ├── schema.ts      # Drizzle ORM schema (devices, events)
│       ├── client.ts      # SQLite driver (node:sqlite + Drizzle sqlite-proxy)
│       ├── jsonStore.ts   # Dependency-free JSON fallback store
│       └── store.ts       # Unified store facade used by the rest of the app
├── init.sh                 # Setup script (Linux/Termux/macOS)
├── whitelist.json           # Trusted device list (edit this)
├── drizzle.config.ts        # Drizzle Kit config
├── package.json
├── tsconfig.json
└── LICENSE                  # MIT
```

## How device tracking works

1. Each scan cycle runs the best available OS command (`ip neigh show`, then
   `arp -a` as a fallback) and extracts `(ip, mac, hostname?)` tuples.
2. Each device is upserted by MAC address: first-seen/last-seen timestamps
   and a seen-count are maintained.
3. The MAC is checked against `whitelist.json`. Devices not listed are
   marked `unknown` and logged as a `new_device` warning event the first
   time they appear.
4. IP changes on an already-known MAC are logged as `ip_change` events
   (useful for spotting DHCP reassignment or spoofing attempts).
5. `logs/security_audit.json` is rebuilt from the event log and device
   table after every cycle.

## Security notes

- This tool reads local ARP/neighbor tables only — it does not perform
  active network scanning, packet capture, or intrusion beyond what the
  OS already exposes via `ip`/`arp`. It is an observability layer, not an
  IDS/IPS.
- Treat `data/sentinel.db` (or `data/sentinel.json`) and `whitelist.json`
  as sensitive: they describe the devices on your network.
- Review `logs/security_audit.json` regularly, or wire it into your own
  alerting pipeline.

## License

MIT — see [LICENSE](LICENSE).
