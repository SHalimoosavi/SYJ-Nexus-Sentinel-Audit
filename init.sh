#!/usr/bin/env bash
#
# SYJ-Nexus-Sentinel-Audit — init.sh
# Auto-setup script for Linux, Termux, and macOS.
# (Windows users: see README.md for the PowerShell/CMD equivalent.)
#
set -e

echo "========================================"
echo " SYJ-Nexus-Sentinel-Audit — Setup"
echo "========================================"

# --- 1. Detect environment -------------------------------------------------
if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ]; then
  ENV_NAME="Termux (Android)"
else
  ENV_NAME="$(uname -s 2>/dev/null || echo Unknown)"
fi
echo "Detected environment: $ENV_NAME"

# --- 2. Verify Node.js -------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  if [ "$ENV_NAME" = "Termux (Android)" ]; then
    echo "  Install it with:  pkg install nodejs"
  else
    echo "  Install Node.js 18+ from https://nodejs.org/ or your package manager."
  fi
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_VERSION" | cut -d. -f2)
echo "Node.js version: v$NODE_VERSION"

if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 5 ]; }; then
  echo "NOTE: Node < 22.5 detected. The tool will automatically use its"
  echo "      dependency-free JSON storage fallback instead of node:sqlite."
fi

# --- 3. Ensure ARP/neighbor tools are present (best-effort) -----------------
if [ "$ENV_NAME" = "Termux (Android)" ]; then
  if ! command -v ip >/dev/null 2>&1; then
    echo "Installing iproute2 (provides 'ip')..."
    pkg install -y iproute2 || echo "  Skipped — install manually if scans return no data."
  fi
elif [ "$(uname -s)" = "Linux" ]; then
  if ! command -v ip >/dev/null 2>&1 && ! command -v arp >/dev/null 2>&1; then
    echo "NOTE: Neither 'ip' nor 'arp' found. Install iproute2 or net-tools:"
    echo "  Debian/Ubuntu: sudo apt install iproute2 net-tools"
    echo "  RHEL/Fedora:   sudo dnf install iproute net-tools"
  fi
fi

# --- 4. Install dependencies -------------------------------------------------
echo "Installing npm dependencies..."
npm install

# --- 5. Prepare runtime directories and config -------------------------------
mkdir -p data logs

if [ ! -f whitelist.json ]; then
  echo "Creating default whitelist.json..."
  cat > whitelist.json <<'EOF'
[
  {
    "mac": "aa:bb:cc:dd:ee:ff",
    "name": "Example — Primary Workstation",
    "notes": "Replace with your real trusted device MAC addresses."
  }
]
EOF
fi

# --- 6. Build TypeScript ------------------------------------------------------
echo "Compiling TypeScript..."
npm run build

echo "========================================"
echo " Setup complete."
echo ""
echo " Next steps:"
echo "   1. Edit whitelist.json with your trusted device MAC addresses."
echo "   2. Run a single test scan:   node dist/monitor.js --once"
echo "   3. Run continuously:         node dist/monitor.js"
echo "   4. See README.md for background/service setup."
echo "========================================"
