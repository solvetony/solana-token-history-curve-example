# Solana Index token history

Separate Preact/Vite frontend and Fastify backend, using StandardJS. The backend calls the **production** [Solana Index API](https://solanaindex.top/api-reference) directly, with a server-side Bearer key. No mock balances or local indexer are used by the application.

## Run

Requires Node.js 24 or later.

```sh
cd backend
npm ci
cp .env.example .env
# Set SOLANA_INDEX_API_KEY, PRIVY_APP_ID and PRIVY_VERIFICATION_KEY.
npm run dev
```

In a second terminal:

```sh
cd frontend
npm ci
cp .env.example .env
# Set VITE_PRIVY_APP_ID to the same Privy app ID.
npm run dev
```

Open http://localhost:5173. Configure this origin in the Privy dashboard and enable Solana wallet login. `PRIVY_VERIFICATION_KEY` is the app's public PEM verification key from the Privy dashboard; literal `\n` escapes are supported. The Privy app secret is unnecessary. Without Privy configuration, the public example remains available and wallet changes require configuration. Without the Solana Index key, the UI displays a configuration error.

## Behavior

- White and dark themes, persisted locally, using the palette from `../solana-token-api/fe`.
- USDC, wrapped SOL and arbitrary SPL mint selection; 1D, 7D, 1M, 3M, 1Y and all-history views.
- Up to 10 uniformly spaced slot samples. Range boundaries use an estimated 400 ms slot duration. Every displayed timestamp comes from the slot timestamp API; skipped slots use an explicitly identified preceding produced block timestamp; balances retain their original decimal strings in slot details and the table.
- Hover to inspect, click to select, keyboard-accessible sample slider and sample table, and exact slot lookup.
- Gaps are shown for unavailable samples. Chart and balance-change calculations use JavaScript numbers for visualization; exact balances are also displayed without numeric conversion.
- Balance-change bars represent differences between samples, not transfers. USD pricing, counterparty distribution and transfer heatmaps are omitted because the documented API does not provide their underlying data.
- The example is `86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY`, resolved from `toly.sol` using the [SNS proxy](https://sdk-proxy.sns.id/resolve/toly.sol). Attribution to Anatoly Yakovenko is unverified and labeled accordingly. Override `EXAMPLE_ADDRESS` with a confirmed address if available.

## Authentication and demo allowance

The frontend sends the current Privy access token. The backend verifies its ES106 signature, issuer, app audience and expiration, and binds the selected address to the signed `sub` (user) and `sid` (session) claims. [Privy documents these session claims](https://docs.privy.io/authentication/user-authentication/access-tokens).

Each session can change the example wallet **once**. Reloads, new tabs and token refreshes do not reset the allowance. A new session receives a new allowance. Submitting the current address is a no-op. Invalid addresses do not consume the allowance. A second change is rejected server-side with `DEMO_LIMIT` and opens a styled, accessible subscription dialog.

The allowance and selected wallet are held in backend memory, with no database or `SESSION_DB` configuration. Browser refreshes and token refreshes preserve them while the backend is running. Backend restarts reset them. Run a single backend instance; multiple replicas need shared session storage and an upstream request limiter. Bearer tokens and API keys stay out of application logs. Public reads are restricted to the configured example; authenticated reads use the wallet stored for the verified session, never an arbitrary address parameter.

## Structure and endpoints

`backend/app.js` autoloads separate `plugins/` and `routes/`, following `../voting-example-solana`. `frontend/` is independently built and deployed.

| Route | Purpose |
| --- | --- |
| `GET /history-api/config` | Public example configuration |
| `GET /history-api/session` | Verified session and allowance |
| `POST /history-api/session/address` | One address change, JSON `{ "address": "..." }` |
| `GET /history-api/history?token=...&range=1M` | Sampled history for the allowed wallet |
| `GET /history-api/point?token=...&slot=...` | Exact balance and timestamp |

Successful historical samples are cached in memory for 24 hours; current slot for 30 seconds. A cold chart can use 21 upstream requests (one current slot, 10 balances, 10 timestamps). The frontend fetches a fresh slot plan, then loads slots sequentially and displays progress. Successful exact balances and timestamps are cached in localStorage for 24 hours, keyed by wallet, token mint and slot, with a maximum of 500 entries. Cached points also advance progress; missing or failed points are not cached. Exact slot lookup uses the same cache. Storage failures fall back to network requests. The backend also supports NDJSON streaming for history consumers. Reverse proxies must allow streaming without buffering. Rate limits and subscription allowances can interrupt loading and are reported to the user.

## Checks and deployment

```sh
cd backend
npm run lint
npm test
```

```sh
cd frontend
npm run lint
npm run build
npx playwright install chromium
npm test
```

Tests use isolated fixtures, signed test JWTs and in-memory sessions. They never spend the production API allowance. Browser screenshots are written to `frontend/test-results/`.

For deployment, serve `frontend/dist/` and reverse-proxy `/history-api/` to a single backend instance on the same origin. Set `APP_ORIGIN` to the public frontend origin, use HTTPS, and set the Privy allowed origin. Vite's development and preview proxy targets port 3102. Start the backend with `npm start`; build the frontend with `npm run build`. Keep all secrets in the backend environment, never in `VITE_*` variables.
