#!/usr/bin/env bash
# Builds Payd for production and serves it on a public HTTPS ngrok URL that
# anyone can open on their phone. HTTPS also lets phone cameras work in Payd Lens.
#
# Usage:  SHARE_PASSWORD=<8+ chars> npm run share   (from the repo root or web/)
#         npm run share -- --no-auth                 (from web/: explicitly open to anyone with the link)
#         SHARE_NO_AUTH=1 npm run share              (same, works from the repo root too)
# Env:    SHARE_PORT=3001                   local port for the production server
#         SHARE_PASSWORD=<8+ chars>         required unless --no-auth (username: payd)
#         SHARE_SKIP_BUILD=1                reuse the last share build
#
# Stop with Ctrl+C; the server and the tunnel both shut down.
set -euo pipefail

NO_AUTH="${SHARE_NO_AUTH:-0}"
for arg in "$@"; do
  case "$arg" in
    --no-auth) NO_AUTH=1 ;;
    *) echo "Unknown option: $arg (supported: --no-auth)"; exit 1 ;;
  esac
done
if [ -n "${SHARE_PASSWORD:-}" ]; then
  [ "${#SHARE_PASSWORD}" -ge 8 ] || { echo "SHARE_PASSWORD must be at least 8 characters."; exit 1; }
elif [ "$NO_AUTH" != "1" ]; then
  echo "Refusing to open a public tunnel without a password."
  echo "Payd has no login: anyone with the URL could read and change the ledger and call AI/Careem APIs."
  echo "  Set one:   SHARE_PASSWORD='at-least-8-chars' npm run share"
  echo "  Or opt out explicitly:   SHARE_NO_AUTH=1 npm run share   (or, from web/: npm run share -- --no-auth)"
  exit 1
fi

cd "$(dirname "$0")/.."            # web/
PORT="${SHARE_PORT:-3001}"
export NEXT_DIST_DIR=".next-share" # separate from `next dev`'s .next folder
LOG_DIR="$(mktemp -d -t payd-share)"

command -v ngrok >/dev/null || { echo "ngrok not found. Install: brew install ngrok"; exit 1; }
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Set SHARE_PORT to another port."; exit 1
fi

pids=()
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  for p in "${pids[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  echo; echo "Payd share stopped."
  exit "$code"
}
trap cleanup EXIT INT TERM

if [ "${SHARE_SKIP_BUILD:-0}" != "1" ] || [ ! -d "$NEXT_DIST_DIR" ]; then
  echo "▸ Building production bundle…"
  npx next build > "$LOG_DIR/build.log" 2>&1 || { tail -40 "$LOG_DIR/build.log"; echo "Build failed (full log: $LOG_DIR/build.log)"; exit 1; }
fi

echo "▸ Starting production server on port ${PORT}…"
npx next start -p "$PORT" > "$LOG_DIR/server.log" 2>&1 &
pids+=($!)
for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:$PORT" && break
  sleep 0.5
done
curl -s -o /dev/null "http://localhost:$PORT" || { tail -20 "$LOG_DIR/server.log"; echo "Server did not start."; exit 1; }

echo "▸ Opening public ngrok tunnel…"
ngrok_args=(http "$PORT" --log=stdout --log-format=logfmt)
if [ -n "${SHARE_PASSWORD:-}" ]; then
  ngrok_args+=(--basic-auth "payd:$SHARE_PASSWORD")
fi
ngrok "${ngrok_args[@]}" > "$LOG_DIR/ngrok.log" 2>&1 &
pids+=($!)

url=""
for _ in $(seq 1 40); do
  url="$(grep -oE 'url=https://[^ ]+' "$LOG_DIR/ngrok.log" | head -1 | cut -d= -f2 || true)"
  [ -n "$url" ] && break
  grep -qE 'lvl=(eror|crit)' "$LOG_DIR/ngrok.log" && break
  sleep 0.5
done
if [ -z "$url" ]; then
  grep -E 'lvl=(eror|crit)|err=' "$LOG_DIR/ngrok.log" | tail -5
  echo "ngrok failed to start (log: $LOG_DIR/ngrok.log)."; exit 1
fi

echo
echo "════════════════════════════════════════════════════"
echo "  Payd is live:  $url"
[ -n "${SHARE_PASSWORD:-}" ] && echo "  Login:         payd / (your SHARE_PASSWORD)"
echo "  Local:         http://localhost:$PORT"
echo "  Logs:          $LOG_DIR"
echo "════════════════════════════════════════════════════"
if command -v qrencode >/dev/null; then
  qrencode -t ANSIUTF8 "$url"
else
  echo "  (brew install qrencode to show a scannable QR code here)"
fi
if [ -n "${SHARE_PASSWORD:-}" ]; then
  echo "The link is password-protected. Ctrl+C to stop."
else
  echo "WARNING: --no-auth: anyone with this link can use the app. Ctrl+C to stop."
fi

# Exit (and clean up) if either the server or ngrok dies.
while kill -0 "${pids[0]}" 2>/dev/null && kill -0 "${pids[1]}" 2>/dev/null; do sleep 2; done
echo "A share process exited unexpectedly. Logs: $LOG_DIR"
exit 1
