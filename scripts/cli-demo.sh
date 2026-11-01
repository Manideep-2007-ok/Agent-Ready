#!/usr/bin/env bash
# CLI demo, isolated from the main demo server:
#   - its own dashboard server on :4100 with its own data folder and Watch OFF (never re-runs your watches),
#   - the demo store served on localhost:5500 (reused if already running),
#   - then the agentready CLI against it; the report link opens on :4100.
# Usage (from anywhere):
#   bash ~/Agent-Ready/scripts/cli-demo.sh                 # real agents, flaws on, 2 tasks (~₹15, 1-2 min)
#   bash ~/Agent-Ready/scripts/cli-demo.sh --mock          # free rehearsal: replays a recorded run, no tunnel
#   bash ~/Agent-Ready/scripts/cli-demo.sh --clean         # real agents on the store with flaws OFF
#   TASKS=find_price,find_returns bash .../cli-demo.sh     # pick tasks (comma list)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DASH_PORT=4100
STORE_PORT=5500
DATA_DIR="$ROOT/data-cli-demo"          # separate from data/, so the main server never sees these reports (gitignored)
TASKS="${TASKS:-find_price,add_to_cart}"
MOCK=0; FLAWS=on
for a in "$@"; do
  case "$a" in
    --mock) MOCK=1 ;;
    --clean) FLAWS=off ;;
    *) echo "Unknown option: $a (use --mock and/or --clean)"; exit 2 ;;
  esac
done

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

STARTED=()
cleanup() {
  for pid in "${STARTED[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null; done
}
trap cleanup EXIT INT TERM

cd "$ROOT" || die "Repo not found at $ROOT"
[ -f .env ] || die ".env not found in $ROOT (run scripts/setup-demo.sh once)."
command -v node >/dev/null || die "Node is not installed."
command -v python3 >/dev/null || die "python3 is needed to serve the demo store."
[ -f apps/web/dist/index.html ] || { say "Building the dashboard"; npm run build -w @agentready/web >/dev/null || die "Dashboard build failed."; }

if [ "$MOCK" = 0 ]; then
  grep -q '^TINYFISH_API_KEY=.\+' .env || die "No TINYFISH_API_KEY in .env (or run with --mock)."
  command -v cloudflared >/dev/null || die "cloudflared is not installed (Arch: sudo pacman -S cloudflared, macOS: brew install cloudflared), or run with --mock."
fi

say "1/3 Demo store on http://localhost:$STORE_PORT"
if port_busy "$STORE_PORT"; then
  echo "Something is already serving port $STORE_PORT, using it."
else
  python3 -m http.server "$STORE_PORT" -d "$ROOT/apps/demo-store" >/dev/null 2>&1 &
  STARTED+=($!)
  sleep 1
  port_busy "$STORE_PORT" || die "Could not start the demo store on port $STORE_PORT."
fi

say "2/3 Separate dashboard server on http://localhost:$DASH_PORT (Watch off, own data folder)"
if port_busy "$DASH_PORT"; then
  die "Port $DASH_PORT is already in use. Stop that process, or edit DASH_PORT in this script."
fi
mkdir -p "$DATA_DIR"
# Variables set here win over .env (Node's --env-file never overrides existing ones).
(
  cd "$ROOT/apps/server" && \
  PORT="$DASH_PORT" HOST=127.0.0.1 AGENTREADY_DATA_DIR="$DATA_DIR" FEATURE_WATCH=false \
  TINYFISH_MOCK="$MOCK" exec node --env-file=../../.env src/index.js
) > "$DATA_DIR/server.log" 2>&1 &
STARTED+=($!)
for _ in $(seq 1 30); do
  curl -s -m 2 "http://127.0.0.1:$DASH_PORT/api/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -s -m 2 "http://127.0.0.1:$DASH_PORT/api/health" >/dev/null 2>&1 || { tail -5 "$DATA_DIR/server.log"; die "Dashboard server did not start."; }
echo "Ready: $(curl -s "http://127.0.0.1:$DASH_PORT/api/health")"

TARGET="http://localhost:$STORE_PORT/?flaws=$FLAWS"
say "3/3 agentready CLI on $TARGET ($TASKS)"
EXTRA=()
[ "$MOCK" = 1 ] && EXTRA+=(--no-tunnel)
echo "\$ agentready \"$TARGET\" --tasks $TASKS"
AGENTREADY_SERVER="http://127.0.0.1:$DASH_PORT" TINYFISH_MOCK="$MOCK" \
  node "$ROOT/apps/cli/bin/agentready.js" "$TARGET" --tasks "$TASKS" "${EXTRA[@]}"
CODE=$?

echo
echo "Open the report link above (port $DASH_PORT) in your browser now."
read -r -p "Press Enter to stop the CLI demo servers (your main demo server is not touched)... " _ || true
exit "$CODE"
