<div align="center">

# 🛰️ SYJ-Nexus-Sentinel-Audit

### Know exactly what's on your network — before someone else does.

**A zero-dependency, cross-platform security observability daemon that watches your local network, flags unrecognized devices, and writes a daily audit trail — no cloud, no SIEM, no native binaries.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-100%25-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/ORM-Drizzle-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS%20%7C%20Termux-informational)](#-requirements)
[![No Native Binaries](https://img.shields.io/badge/Native%20Binaries-0-success)](#-key-features)
[![Version](https://img.shields.io/badge/version-1.0.0-8A63D2)](https://github.com/SHalimoosavi/SYJ-Nexus-Sentinel-Audit/releases/tag/v1.0.0)
[![Maintained by](https://img.shields.io/badge/Maintained%20by-Sayanjali%20Nexus-8A63D2)](https://github.com/SHalimoosavi)

*"What is actually connected to my network right now, and is it something I recognize?"*

[Quick Start](#-quick-start) • [Key Features](#-key-features) • [Architecture](#-architecture) • [Installation](#-installation) • [Running as a Service](#-running-as-a-background-service) • [Ecosystem](#-part-of-the-sayanjali-nexus-ecosystem)

</div>

---

## 📺 Demo

<div align="center">

```text
┌─────────────────────────────────────────────────────────────────┐
│  $ node dist/monitor.js                                         │
│  ========================================                       │
│   SYJ-Nexus-Sentinel-Audit — starting up                        │
│    Storage backend : sqlite                                     │
│    Mode            : continuous (every 60s)                     │
│  ========================================                       │
│  [monitor] 2026-07-18T10:00:00Z — scanned 6 device(s):          │
│            5 known, 1 unknown, 1 newly seen. (backend: sqlite)  │
│  [monitor] ⚠ 1 unrecognized device(s) detected on the network.  │
└─────────────────────────────────────────────────────────────────┘
```

</div>

> **Want an animated terminal demo here?** This repo intentionally ships with zero binary assets to stay dependency-free. Record your own in under a minute:
>
> ```bash
> npm install -g terminalizer
> terminalizer record demo
> terminalizer render demo -o demo.gif
> ```
>
> Then drop it at the very top of this file:
>
> ```markdown
> ![SYJ-Nexus-Sentinel-Audit demo](demo.gif)
> ```

---

## 📖 Overview

`SYJ-Nexus-Sentinel-Audit` periodically reads your system's ARP/neighbor table, fingerprints every device it sees (MAC, IP, hostname), checks each one against a `whitelist.json` you control, and writes a daily `security_audit.json` report of connections, status changes, and anomalies.

No agents on other machines. No cloud dependency. No heavy SIEM stack — just a local process and a local database, doing one job well.

## ✨ Key Features

- 🧩 **Zero native binaries** — Pure TypeScript/JavaScript. Storage runs on Node's built-in `node:sqlite` via [Drizzle ORM](https://orm.drizzle.team/) — no `node-gyp`, no prebuilt binary downloads.
- 🌍 **Truly cross-platform** — Linux, Windows, macOS, and Android (Termux). Auto-detects `ip neigh` or `arp -a` depending on what's available.
- 🔄 **Automatic storage fallback** — Node < 22.5 without `node:sqlite`? It transparently switches to a dependency-free JSON store with the same schema shape.
- 🛡️ **Whitelist-driven detection** — Anything absent from `whitelist.json` is flagged `unknown` and logged as a warning-severity event the moment it's seen.
- 📊 **Structured audit trail** — Every scan, new device, IP change, and anomaly rolls into a daily JSON report, ready for your own alerting pipeline.
- ⚡ **Low-resource footprint** — No SIEM, no containers, no external database. Runs comfortably on a phone.
- 📱 **Termux-first citizenship** — First-class support for running as a persistent daemon on Android, including boot-time autostart.

## ⚙️ Requirements

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Node **22.5+** recommended to use the built-in SQLite backend — earlier versions auto-fall back to the JSON store |
| **`ip` or `arp`** | One of `iproute2` (`ip`) or `net-tools` (`arp`) must be available on the host |

---

## 🏗️ Architecture

Sentinel runs a single scan-and-report loop. Each cycle reads the OS neighbor table, reconciles it against your whitelist, persists the result, and rebuilds the audit report.

```mermaid
flowchart LR
    A["⏱️ Scan Trigger\n(interval or --once)"] --> B["scanner.ts\nip neigh / arp -a"]
    B --> C["Parsed Devices\n(ip, mac, hostname)"]
    C --> D["whitelist.ts\nMatch against whitelist.json"]
    D -->|known| E[("Device Store\nsqlite / JSON")]
    D -->|unknown| E
    D -->|unknown| F["⚠️ new_device Event"]
    C -->|IP changed on known MAC| G["🔁 ip_change Event"]
    E --> H["report.ts"]
    F --> H
    G --> H
    H --> I["📄 logs/security_audit.json"]

    style F fill:#f59e0b,color:#0d1117
    style G fill:#818cf8,color:#0d1117
    style I fill:#22c55e,color:#0d1117
```

### Storage backend selection

```mermaid
flowchart TD
    Start(["Daemon starts"]) --> Check{"Node >= 22.5\nwith node:sqlite?"}
    Check -->|Yes| Sqlite["✅ SQLite backend\n(Drizzle ORM, data/sentinel.db)"]
    Check -->|No| Json["🗂️ JSON fallback backend\n(data/sentinel.json)"]
    Sqlite --> Facade["store.ts\nUnified store facade"]
    Json --> Facade
    Facade --> App["monitor.ts orchestration"]

    style Sqlite fill:#c5f74f,color:#0d1117
    style Json fill:#818cf8,color:#0d1117
```

### Component map

```mermaid
graph TD
    subgraph Core["src/"]
        M[monitor.ts]
        S[scanner.ts]
        W[whitelist.ts]
        R[report.ts]
    end
    subgraph DB["src/db/"]
        Schema[schema.ts]
        Client[client.ts]
        JsonStore[jsonStore.ts]
        Store[store.ts]
    end

    M --> S
    M --> W
    M --> R
    M --> Store
    Store --> Client
    Store --> JsonStore
    Client --> Schema

    style M fill:#f59e0b,color:#0d1117
```

---

## 🚀 Quick Start

```bash
git clone https://github.com/SHalimoosavi/SYJ-Nexus-Sentinel-Audit.git
cd SYJ-Nexus-Sentinel-Audit
chmod +x init.sh
./init.sh
node dist/monitor.js --once
```

That's it — you now have a `logs/security_audit.json` report of every device currently on your network.

## 📦 Installation

### 1. Clone the repository

```bash
git clone https://github.com/SHalimoosavi/SYJ-Nexus-Sentinel-Audit.git
cd SYJ-Nexus-Sentinel-Audit
```

### 2. Run the setup script (Linux, macOS, Termux)

```bash
chmod +x init.sh
./init.sh
```

`init.sh` will automatically:

- ✅ Detect your environment, including Termux
- ✅ Verify your Node.js version
- ✅ Install missing network tools where it safely can
- ✅ Install npm dependencies
- ✅ Create `data/`, `logs/`, and a starter `whitelist.json`
- ✅ Compile the TypeScript source

### 3. Windows (no bash shell)

```powershell
npm install
npm run build
```

Then edit `whitelist.json` manually before starting the daemon.

### 4. Verify the install

```bash
node dist/monitor.js --once
```

If this produces a `logs/security_audit.json` file, you're good to go.

> **Troubleshooting:** if `init.sh` reports a missing `ip` or `arp` binary, install `iproute2` or `net-tools` via your platform's package manager (`pkg install net-tools` on Termux, `apt install iproute2` on Debian/Ubuntu) and re-run the script.

---

## 🔐 Configuring Your Whitelist

Edit `whitelist.json` in the project root:

```json
[
  { "mac": "aa:bb:cc:dd:ee:ff", "name": "My Laptop" },
  { "mac": "11:22:33:44:55:66", "name": "Office Router", "notes": "Uplink" }
]
```

MAC addresses are matched case-insensitively. Anything on the network that isn't listed here is tracked with `status: "unknown"` and generates a warning-level event the first time it's seen.

## ▶️ Running

```bash
# One-off scan (useful for testing / cron jobs)
node dist/monitor.js --once

# Continuous daemon, default 60s interval
node dist/monitor.js

# Continuous daemon, custom interval (in seconds)
node dist/monitor.js --interval=30
```

Each cycle updates `data/sentinel.db` (or `data/sentinel.json` on the fallback backend) and regenerates `logs/security_audit.json`.

## 🧰 Running as a Background Service

<details>
<summary><strong>🐧 Linux & Termux — <code>nohup</code> (simplest)</strong></summary>

```bash
nohup node dist/monitor.js > logs/daemon.log 2>&1 &
echo $! > sentinel.pid
```

Stop it with:

```bash
kill "$(cat sentinel.pid)"
```
</details>

<details>
<summary><strong>🐧 Linux & Termux — <code>pm2</code> (recommended for long-running use)</strong></summary>

```bash
npm install -g pm2
pm2 start dist/monitor.js --name syj-sentinel
pm2 save
pm2 logs syj-sentinel
```
</details>

<details>
<summary><strong>📱 Termux — run at boot</strong></summary>

Install [Termux:Boot](https://wiki.termux.com/wiki/Termux:Boot) from F-Droid, then create `~/.termux/boot/start-sentinel.sh`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/SYJ-Nexus-Sentinel-Audit
nohup node dist/monitor.js > logs/daemon.log 2>&1 &
```

```bash
chmod +x ~/.termux/boot/start-sentinel.sh
```
</details>

<details>
<summary><strong>🐧 Linux — systemd (persistent service)</strong></summary>

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
</details>

<details>
<summary><strong>🪟 Windows — background task</strong></summary>

```powershell
Start-Process -NoNewWindow node "dist/monitor.js" -RedirectStandardOutput logs\daemon.log
```

Or register it as a Scheduled Task set to run at logon for a persistent background daemon.
</details>

## 📄 Output: `logs/security_audit.json`

Regenerated on every scan cycle:

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

## 🗂️ Project Structure

```text
SYJ-Nexus-Sentinel-Audit/
├── src/
│   ├── monitor.ts        # Core daemon — scan loop, whitelist checks, orchestration
│   ├── scanner.ts        # Cross-platform arp/ip invocation and parsing
│   ├── whitelist.ts      # whitelist.json loader and matcher
│   ├── report.ts         # Daily security_audit.json generator
│   └── db/
│       ├── schema.ts     # Drizzle ORM schema (devices, events)
│       ├── client.ts     # SQLite driver (node:sqlite + Drizzle sqlite-proxy)
│       ├── jsonStore.ts  # Dependency-free JSON fallback store
│       └── store.ts      # Unified store facade used by the rest of the app
├── init.sh                # Setup script (Linux/Termux/macOS)
├── whitelist.json          # Trusted device list (edit this)
├── drizzle.config.ts       # Drizzle Kit config
├── package.json
├── tsconfig.json
└── LICENSE                 # MIT
```

## 🔍 How Device Tracking Works

```mermaid
sequenceDiagram
    participant OS as OS Neighbor Table
    participant Scanner as scanner.ts
    participant Whitelist as whitelist.ts
    participant Store as Device Store
    participant Report as report.ts

    OS->>Scanner: ip neigh show / arp -a
    Scanner->>Scanner: Parse (ip, mac, hostname)
    Scanner->>Whitelist: Check MAC against whitelist.json
    alt Known device
        Whitelist->>Store: Upsert, update last-seen + seen-count
    else Unknown device
        Whitelist->>Store: Upsert as "unknown"
        Whitelist->>Store: Log new_device warning event
    end
    opt IP changed on known MAC
        Scanner->>Store: Log ip_change event
    end
    Store->>Report: Rebuild from device table + event log
    Report-->>OS: Write logs/security_audit.json
```

1. Each scan cycle runs the best available OS command (`ip neigh show`, then `arp -a` as a fallback) and extracts `(ip, mac, hostname?)` tuples.
2. Each device is upserted by MAC address — first-seen/last-seen timestamps and a seen-count are maintained.
3. The MAC is checked against `whitelist.json`. Devices not listed are marked `unknown` and logged as a `new_device` warning event the first time they appear.
4. IP changes on an already-known MAC are logged as `ip_change` events — useful for spotting DHCP reassignment or spoofing attempts.
5. `logs/security_audit.json` is rebuilt from the event log and device table after every cycle.

## 📱 Android / Termux Notes

Android 10+ may restrict access to Netlink sockets and `/proc/net/arp` for unprivileged applications.

If network discovery reports:

- `Cannot bind netlink socket: Permission denied`
- `/proc/net/arp: Permission denied`

this is caused by Android security restrictions, not by SYJ-Nexus-Sentinel-Audit. The application continues running and logging normally. Full neighbor discovery is available on Linux distributions, WSL, macOS, and rooted Android devices.

## 🛡️ Security Notes

- This tool reads local ARP/neighbor tables only — it does **not** perform active network scanning, packet capture, or intrusion beyond what the OS already exposes via `ip`/`arp`. It is an observability layer, not an IDS/IPS.
- Treat `data/sentinel.db` (or `data/sentinel.json`) and `whitelist.json` as sensitive: they describe the devices on your network.
- Review `logs/security_audit.json` regularly, or wire it into your own alerting pipeline.

---

## 🌐 Part of the Sayanjali Nexus Ecosystem

This tool is one piece of a broader set of open-source and production projects built by the same team, spanning AI automation, OSINT, and applied security tooling:

| Project | Description |
|---|---|
| **SYJ NexusIntel AI** | Flagship intelligence platform — FastAPI backend + Next.js frontend, in active hardening toward a v1.0.0 commercial release |
| **SAYANJALI OSINT** | Multi-source geolocation and reconnaissance toolkit |
| **SYJ Mail Intelligence AI** | Local-first, Ollama-powered email triage and auto-reply system |
| **SYJ Scholar AI** | AI research and knowledge-retrieval assistant |
| **SYJ GitHub Optimizer** | Node.js/Octokit tool for repository and profile optimization |
| **SYJ AI** | Autonomous AI software-engineering agent (Termux-first, open source) |
| **Sayanjali: Wisdom of the 14** | Multilingual hadith research platform with strict theological source constraints |

Browse the full catalog at **[github.com/SHalimoosavi](https://github.com/SHalimoosavi)**.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome. Please open an issue on the [issues page](https://github.com/SHalimoosavi/SYJ-Nexus-Sentinel-Audit/issues) before submitting large pull requests so we can discuss scope and approach.

## 👤 Author

**Syed Ali Hasan Moosavi** ([@SHalimoosavi](https://github.com/SHalimoosavi))
Founder & Managing Director, **Sayanjali Nexus Private Limited**

- GitHub: [github.com/SHalimoosavi](https://github.com/SHalimoosavi)
- Contact: [cto@sayanjalinexus.com](mailto:cto@sayanjalinexus.com)

## 📜 License

MIT — see [LICENSE](LICENSE). Free to use, modify, and distribute, including commercially, with attribution.

---

<div align="center">

**If this tool is useful to you, consider ⭐ starring the repo — it helps others find it.**

</div>
