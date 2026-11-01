#!/usr/bin/env bash
# One-shot setup for the AgentReady demo laptop (Linux or macOS).
# Clones/updates the repo, installs, writes .env (asks for the key; nothing is printed), builds the dashboard,
# then starts the server: open http://localhost:4000
# Usage:  bash setup-demo.sh            (first time: curl it or copy it anywhere)
#         bash setup-demo.sh --reset-env (ask for the key / webhook again)
set -euo pipefail

REPO_URL="https://github.com/Manideep-2007-ok/Agent-Ready.git"
DIR="${AGENTREADY_DIR:-$HOME/Agent-Ready}"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

say "1/6 Checking tools"
command -v git >/dev/null || die "git is not installed."
command -v node >/dev/null || die "Node.js is not installed. Install Node 20+ (https://nodejs.org) and run this again."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old: AgentReady needs Node 20 or newer."
echo "git ok, node $(node -v), npm $(npm -v)"
if command -v cloudflared >/dev/null; then echo "cloudflared ok (CLI localhost demo will work)";
else echo "cloudflared not found: only needed for the CLI localhost demo (brew install cloudflared / sudo pacman -S cloudflared)"; fi

say "2/6 Getting the code ($DIR)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin main
  git -C "$DIR" checkout main
  git -C "$DIR" pull --ff-only origin main || die "Local changes block the update. Commit or stash them in $DIR first."
else
  git clone "$REPO_URL" "$DIR"
fi
cd "$DIR"

say "3/6 Installing packages"
npm install --no-audit --no-fund

say "4/6 Settings (.env, never committed)"
if [ ! -f .env ] || [ "${1:-}" = "--reset-env" ]; then
  KEY=""; HOOK=""
  read -r -s -p "TinyFish API key (press Enter to skip = replay/mock mode, no credits): " KEY; echo
  read -r -s -p "Slack/Discord webhook URL for Watch alerts (Enter to skip): " HOOK; echo
  umask 077
  {
    if [ -n "$KEY" ]; then echo "TINYFISH_API_KEY=$KEY"; echo "TINYFISH_MOCK=0"; else echo "TINYFISH_MOCK=1"; fi
    echo "TINYFISH_MAX_PARALLEL=2"
    echo "TINYFISH_MAX_DURATION_SECONDS=150"
    echo "DEMO_STORE_URL=https://agent-ready-demo.vercel.app"
    echo "PORT=4000"
    if [ -n "$HOOK" ]; then echo "ALERT_WEBHOOK_URL=$HOOK"; fi
  } > .env
  echo ".env written ($( [ -n "$KEY" ] && echo 'real agents' || echo 'mock mode' ))."
else
  echo ".env already exists, kept it (run with --reset-env to change it)."
fi
grep -q '^TINYFISH_MOCK=1' .env && echo "Note: mock mode is ON (replays saved runs, no credits)."

say "5/6 Building the dashboard"
npm run build -w @agentready/web

say "6/6 Starting the server"
if (command -v lsof >/dev/null && lsof -iTCP:4000 -sTCP:LISTEN >/dev/null 2>&1); then
  die "Port 4000 is already in use. Stop the other server (Ctrl+C in its terminal) and run this again."
fi
cat <<'EOF'

  Dashboard:   http://localhost:4000
  Demo pages:  http://localhost:4000/#/test/rep_demo_flaws_off/rep_demo_flaws_on   (before/after)
               http://localhost:4000/#/test/rep_20261031_demo_myntra              (bot wall)
  Stop:        Ctrl+C          Start again later:  cd ~/Agent-Ready && npm start -w @agentready/server

EOF
# Unset shell copies so .env wins (Node's --env-file never overrides variables that are already set).
unset TINYFISH_MOCK TINYFISH_API_KEY PORT 2>/dev/null || true
exec npm start -w @agentready/server
