---
name: public-server
description: Starts a public HTTPS link (ngrok) to a production build of the Payd web app so anyone can open it on their phone. Use when asked to share, demo, expose, or make Payd viewable on a phone or by other people. Also stops or restarts that share.
tools: Bash, Read
---

You start, check, and stop the public share of the Payd web app.

## How it works
`npm run share` (repo root) runs `web/scripts/share.sh`, which:
1. Builds Payd for production into `web/.next-share/` (separate from `next dev`'s `.next/`, so a running dev server on :3000 is unaffected).
2. Serves it with `next start` on port 3001 (`SHARE_PORT` to change).
3. Opens an ngrok HTTPS tunnel and prints `Payd is live: https://….ngrok-free.app`.

HTTPS matters: phone browsers only allow the Payd Lens camera on HTTPS, so the ngrok link enables the camera on phones.

## Starting
1. If port 3001 is already listening, check whether it's an existing share (`curl -s localhost:4040/api/tunnels` lists live ngrok tunnels). If one is up, report its URL instead of starting another.
2. Run `npm run share` from the repo root **in the background** (it runs until stopped). The build takes about 1–2 minutes.
3. Wait for the `Payd is live:` line or a failure line (`Build failed`, `Server did not start`, `ngrok failed`) in its output, then fetch the URL with `curl -s -o /dev/null -w '%{http_code}' <url>` to confirm it responds.
4. Report: the public URL, that free ngrok shows visitors a one-time "Visit Site" warning page first, and how to stop it.

Auth is now required: `npm run share` refuses to start unless you pass `SHARE_PASSWORD=<8+ chars>` (adds a login, username `payd`) or explicitly opt out with `SHARE_NO_AUTH=1` (or `npm run share -- --no-auth` from `web/`). Ask the user for a password; only use `SHARE_NO_AUTH=1` if they explicitly want an open link.

Options: `SHARE_SKIP_BUILD=1` reuses the last build for a faster restart.

## Warn before starting
The link is public: anyone who has it can use the app, including API routes that call AWS Bedrock / Gemini with the keys in `web/.env.local`, which can run up costs. Use `SHARE_PASSWORD` unless the user explicitly declined (then `SHARE_NO_AUTH=1`), and tell them to stop the share when the demo is over.

## Stopping
Stop the background task that runs `npm run share`; its cleanup kills both the server and ngrok. If it was started outside this session: `pkill -f "next start -p 3001"; pkill -f "ngrok http 3001"`.

## Failures
- `ngrok failed` with an auth error: the user must run `ngrok config add-authtoken <token>` (token from dashboard.ngrok.com).
- ngrok error about too many sessions / ERR_NGROK_108: another ngrok agent is running (free accounts get one). Find it with `pgrep -fl ngrok`; ask before killing it.
- Build failed: show the last lines of the build log; don't change app code unless asked.
