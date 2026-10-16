# RealtyChain

A decentralized real estate platform built with React, Vite, and Web3 technologies.

## Features

- Browse and explore real estate properties
- JWT login against `/api/auth/login` (invalid passwords are rejected)
- Mock KYC application, admin review, and Solana wallet bind
- Admin catalog create/delete and property operations
- Property shares settled on the Solana program, with USDC as the cash leg. Each property is a Token-2022 mint with a freeze authority, a permanent delegate, and a transfer hook. The program config account stores the admin, the trusted issuer, the USDC mint, KYC claim topic 1, accredited claim topic 2, and whether holders must be verified
- Wallet connection via Phantom and Solflare
- KYC-gated secondary asks (list / fill / cancel) and P2P share transfer
- Admin occupancy, appraisal calendar, NAV per share, and monthly expense waterfall
- KYC-gated Get USDC: demo mint on the Solana program, plus optional MoonPay (not a bank)
- Listing CMS: OpenStreetMap embed, unit mix, illustrative comps (not an appraisal)
- Listing image service: landing hero from `/api/images/seed/hero.jpg`, plus admin upload/ingest
- Property-sale exit: freeze transfers, deposit USDC proceeds, holders burn shares for a snapshot payout
- Chain event indexer (buys, rent claims, fills, transfers, redemptions) with average cost basis
- Authenticated document vault and a demo tax worksheet CSV (not a K-1 or 1099)
- Solana devnet by default, with an institutional Corda desk that settles a commitment onto that program

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository and use Node.js 22:

   ```bash
   git clone <REPO_URL>
   cd DeFi-Estate-main-main
   nvm use 22
   ```

2. Start everything with one command:

   ```bash
   npm start
   ```

   The launcher automatically:

   - installs dependencies when they are missing;
   - starts the Express API on port `4000`, or the next free port if `4000` is busy;
   - starts the Vite app on port `3000`.

   Open [http://localhost:3000](http://localhost:3000). Keep the terminal open and press **Ctrl+C** to stop the complete stack.

3. Local seed accounts (created on first server start):
   - User: `test1@gmail.com` / `pass1234`
   - Admin: `admin@defi.estate` / `admin1234`
   - Property owner: `owner@defi.estate` / `owner1234`
   - Institution: `institution@defi.estate` / `institution1234` (Corda desk at `/institution`; Solana sees the settlement only)

   Sign-in calls `POST /api/auth/login`. The catalog is served from `GET /api/properties` (JWT required).

   Buy path:
   1. Submit `/kyc` and have `admin@defi.estate` approve the application under Admin → Investors.
   2. Connect Phantom or Solflare and link that address on the account.
   3. Buy, list, transfer, claim, and redeem from the demo ledger. When `VITE_SOLANA_PROGRAM_ID` is set, those actions also send the matching program instruction.
   4. Export a demo tax CSV from My Dashboard → Transactions. Admin → Properties → **Docs** for the file vault.

   Admin origination: Admin → Add property. Admin → Ops for occupancy, appraisals, and the monthly waterfall. Admin → Properties → **Edit listing** for copy, photos, map pin, unit mix, and comps.

4. Connect a Solana wallet from the app. Phantom and Solflare are supported. The default cluster is devnet (`VITE_SOLANA_RPC_URL`). On-chain actions use the RealtyChain program in `programs/realty_chain` after `VITE_SOLANA_PROGRAM_ID` is set to the deployed program address.

Optional MoonPay handoff (third-party; not a bank) can be added to `.env` with `VITE_MOONPAY_PUBLISHABLE_KEY` and `VITE_MOONPAY_SANDBOX=true`. The default local run uses the demo USDC mint on the Solana program.

## Deploy on Netlify

This repo is set up as a Vite static site plus a Netlify Function that wraps the Express API (`netlify.toml`, `netlify/functions/api.js`). Catalog, KYC, settings, listing images, and the document vault persist in [Netlify Blobs](https://docs.netlify.com/blobs/overview/) because Functions have no writable filesystem.

1. Push the repo and import it in Netlify (build command `npm run build`, publish directory `dist`, Node 22).
2. Set environment variables in the Netlify UI. At minimum:
   - `JWT_SECRET` — long random string
   - `DEMO_MODE=true` and `VITE_DEMO_MODE=true` (already defaulted in `netlify.toml`)
   - `VITE_SOLANA_RPC_URL` — Solana cluster URL (devnet by default). Phantom and Solflare connect without a WalletConnect id.
   - `VITE_SOLANA_PROGRAM_ID` — deployed `programs/realty_chain` address, when transactions should land.
   - `ALLOWED_LOGIN_IPS` — comma-separated IPs that may sign in (for example `203.0.113.10,198.51.100.22`). Redeploy after changing this so the function picks it up.
3. See `.env.example` for the Solana mint and RPC variables.
4. Redeploy after changing any `VITE_*` variable so the frontend rebuilds.

Login is limited to the allowlist. Configure it in either place:

- **Netlify UI (recommended for deploy):** Site configuration → Environment variables → `ALLOWED_LOGIN_IPS`
- **In the app:** open `/adminuseradmin_useradminuser` on the live site (no login required), confirm **Your IP address**, and click **Allow this IP**. Extra addresses are stored in Netlify Blobs.

Allowlist reads use strong consistency so a saved address is available to the next login request. The settings page also shows the last ten sign-in addresses and the last successful login for up to ten addresses, persisted in the site-wide `login-activity` Blobs store. These are login records, not live sessions. Activity starts accumulating after deploying this version; earlier in-memory records cannot be recovered.

Default allowlist is only loopback (`127.0.0.1`), so a Netlify deploy will reject sign-in until you add your public IP with one of the methods above.

`/api/*`, `/health`, and `/ready` are proxied to the function. Client-side routes such as `/home` fall back to `index.html`.

Local production-like preview: `npx netlify dev` (after `npm install`) uses the same function + redirects. `npm start` starts the API and Vite.

## Deploy on Vercel with a private Blob store

The Vite frontend and Express API deploy together using `vercel.json` and `api/index.js`. The API stores JSON records, settings, login activity, images, and vault files in **private Vercel Blob storage**. File downloads continue through the existing API routes; vault routes still require authentication.

1. Import the repository into Vercel. Use the Vite preset, `npm run build`, output directory `dist`, and Node.js 22.
2. Connect your **private** Blob store to this project and the intended environment. Use the credentials Vercel provides: `BLOB_STORE_ID` with platform OIDC, or `BLOB_READ_WRITE_TOKEN`. These are server-only variables; never use a `VITE_` prefix.
3. Set `STORAGE_PROVIDER=vercel`, a long random `JWT_SECRET`, `DEMO_MODE=true`, `VITE_DEMO_MODE=true`, and your public IP in `ALLOWED_LOGIN_IPS`. Add the optional Solana and Sumsub variables from `.env.example` as needed. When using Sumsub webhooks, also set `NODEJS_HELPERS=0` in the project environment so Express can capture the original signed request bytes.
4. Deploy. Open `/health`, then `/adminuseradmin_useradminuser` to check your detected IP and the allowlist. Sign in and check that the recent successful login appears. Change a listing or upload a file and verify that it remains available after redeploying.

Reads bypass Blob caching. API requests reload the latest saved snapshot, wait for uploads and data commits, and return a conflict (409) if another instance changed the snapshot first. Refresh before retrying a conflicting change. This remains a demo JSON snapshot store, with no database transactions spanning records, uploads, or external chain operations.

By default, blob paths are namespaced under `realtychain/<VERCEL_ENV>/` (`realtychain/development/` locally). Set `BLOB_PREFIX` for a different namespace, such as a separate preview branch. Use separate stores or prefixes for production and testing. A new store starts with demo seeds; existing Netlify data is **not** copied automatically.

For local use of Vercel Blob, put `STORAGE_PROVIDER=vercel` and the private store's `BLOB_READ_WRITE_TOKEN` in `.env`, using a development store/prefix. Without these variables, local development continues using files. Netlify deployments continue using Netlify Blobs unless Vercel storage is explicitly selected or its credentials are configured.

## Available Scripts

- `npm start` - Install if needed, then start the API and Vite
- `npm run dev` - Start the API and Vite
- `npm run build` - Build for production
- `npm run preview` - Preview a production build
- `npm run lint` - Run ESLint
- `npm test` - Run the API tests

## Tech Stack

- **Frontend**: React 18, Vite
- **Styling**: Tailwind CSS
- **Chain**: Solana (`@solana/web3.js`, Phantom, Solflare) and the program in `programs/realty_chain`
- **Routing**: React Router DOM
- **Animations**: Framer Motion
- **Icons**: Lucide React

## Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/         # Page components
├── context/       # React context providers
├── hooks/         # Data hooks (properties catalog, Solana reads)
├── utils/         # Utility functions and types
└── styles/        # Global styles
server/
├── routes/        # Auth, properties, KYC, settings, activity, vault
└── mock/          # Seed users + property catalog
programs/realty_chain/  # Solana program: buys, transfers, compliance config, Corda settlement
```

