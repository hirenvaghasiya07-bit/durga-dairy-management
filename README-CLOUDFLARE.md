# Durga Dairy - Cloudflare Workers Ready

This package is prepared for Cloudflare Workers Static Assets + D1.

## Important
- Do NOT use "Upload your static files" for the final deployment. This build contains a Worker API and D1 database integration.
- The app uses the same-origin `/api` endpoints.
- Customer module remains unchanged and is intentionally not expanded.
- Replace `database_id` in `wrangler.jsonc` after creating the D1 database.
- Replace `SESSION_SECRET` with a strong secret before production.

## Cloudflare setup
1. In Cloudflare Dashboard choose Workers & Pages -> Create application -> Workers.
2. Create a D1 database named `durga-dairy-db`.
3. Run the contents of `schema.sql` as a D1 migration/query.
4. Set the real D1 database ID in `wrangler.jsonc`.
5. Deploy the Worker project with Wrangler.
6. Enable a `workers.dev` subdomain if prompted. Cloudflare will provide an HTTPS address.

## Local deploy command
From this folder:

    npx wrangler deploy

## Future updates
Deploying a new Worker version updates the same app URL. Users do not need to reinstall the PWA for normal web/PWA updates. Native APK distribution is a separate update channel.

## Data safety
The current application state is stored in D1 as JSON through `/api/sync`. For production, add scheduled/exported backups as an independent backup layer (for example, monthly Excel/Drive integration).
