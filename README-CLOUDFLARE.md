# Durga Dairy Management: Safe Build and Deployment

## Current architecture

- The production frontend is served from Cloudflare Worker `durga-dairy-live` using the `web_assets` table in D1.
- The production API is `durga-dairy-live-api`.
- The active frontend includes `app.js`, `akash-v2.js`, `akash-v2-fix.js`, `all-v2.js`, and `bootstrap.js`. Do not deploy only `app.js` or replace the active index with an older copy.
- D1 workspace data is stored in `workspace_state`; user credentials are stored in `users`.
- Private pre-repair snapshots of workspace JSON, Worker source, active web assets, and D1 schema were saved in the private KV namespace `durga-dairy-backups` under keys beginning `pre-repair-20261012-`.

## Safety fixes included in this branch

- Stable record IDs for legacy records and ID-based idempotent merges.
- Tombstones to prevent deleted records from reappearing.
- Business isolation between Hiren and Akash, including nested Akash V2 arrays.
- Role-scoped API reads and writes, ownership checks for Family/Staff entries, and append-only audit logs.
- Manual sync with visible failure feedback and local data preservation.
- Customer opening balances and carry-forward, bulk historical entries with preview and duplicate detection, configurable bill terms, and multipage PDF/print statements.
- Hiren-to-Akash internal transfers tracked separately from sales and profit.
- Akash V2 saleable quantity uses actual quantity plus slab extra percentage, with cash, UPI/bank, other receipts, and calculated credit/due.
- Dynamic Akash expense categories and deletion tombstones.
- All report date filters, expense comparison, and separate internal transfer history.
- Automated synchronization invariant tests and syntax checks.

## Run checks

Use Node.js 20 or newer:

```sh
npm test
npm run check:api
npm run check:frontend
```

## Frontend asset deployment

The live frontend uses D1 `web_assets`, not only the static assets directory configured by the root `wrangler.jsonc`.

Set these environment variables locally. Never commit the token:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with D1 read/write permissions
- Optionally `DURGA_D1_DATABASE_ID`

First run a dry run:

```sh
node scripts/deploy-live-assets.mjs
```

The script lists the files it would update and performs no writes without `--apply`. Before applying, verify that the mobile-only data recovery checklist is complete and that a fresh backup is readable. Then, and only after approval:

```sh
node scripts/deploy-live-assets.mjs --apply
```

It backs up the existing `web_assets` table locally to `.durga-backups/`, updates only the listed frontend asset paths, and verifies the content hashes. It does not change `workspace_state` or business tables.

## API Worker deployment

`wrangler.live-api.jsonc` is an API-only configuration for `durga-dairy-live-api`. It uses the existing D1 database and private backup KV binding. It is a production deployment configuration, not a staging environment.

Before any API deployment:
1. Run all checks and tests.
2. Export and verify the D1 database backup and private KV snapshots.
3. Recover and reconcile any device-only offline entries from every phone and desktop.
4. Generate a strong unique session secret and set it with `npx wrangler secret put SESSION_SECRET --config wrangler.live-api.jsonc`.
5. Test login, logout, Hiren/Akash isolation, Family/Staff restrictions, All read access, offline retries, deletions, and restore in a separate test environment.
6. Obtain explicit approval before running `npx wrangler deploy --config wrangler.live-api.jsonc`.

Do not run the production deployment until these checks and the device-data reconciliation are complete. The current live API must not be assumed to have the role-based security fixes until the API Worker is deployed.

## Important backup limitation

The Cloudflare backups preserve the current server-side D1 state and deployed assets. They cannot include records that exist only in a phone's or desktop's local browser storage. Before deployment, export or synchronize each device's local data and reconcile record counts and totals. Never clear browser storage or reset the database as a migration shortcut.
