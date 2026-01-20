# InstinctFi Backend (Cloudflare Worker)

This repo contains the Cloudflare Worker that proxies the Drift DLOB WebSocket.

## How it is deployed
- Deployed with `wrangler` to Cloudflare Workers.
- Main entrypoint: `src/worker.js`.

## How it connects to the frontend
- The frontend uses the Worker WebSocket URL from `wrangler.toml`.
- Update `CONFIG.DRIFT_DLOB_WS_URL` in the frontend repo to point at the Worker URL.

## Deploy steps
1. Install Wrangler: `npm i -g wrangler`.
2. Authenticate: `wrangler login`.
3. Deploy: `wrangler deploy`.
