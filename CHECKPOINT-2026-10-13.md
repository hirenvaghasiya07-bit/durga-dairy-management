# Durga Dairy Software Checkpoint

Checkpoint code: DURGA-DAIRY-SAVE-2026-10-13-DS-AKASH-CUSTOMER-NEXT

Saved on: 2026-10-13
Repository: https://github.com/hirenvaghasiya07-bit/durga-dairy-management
Working branch: safety/data-sync-repair-2026-10
Checkpoint branch: checkpoint/durga-dairy-2026-10-13-latest
Checkpoint base commit: df58edeba9bed4df5c982dce7b6408b16312d159
Live app: https://durga-dairy-live.hiren-vaghasiya07.workers.dev/

## Safety rules
- Keep existing business/customer/sales data. Never wipe production data.
- Before any production asset edit, create a backup of affected web_assets rows.
- Deploy only the requested change; do not deploy unrelated branch changes.
- Test JavaScript syntax and available safety checks before live deployment.
- Bump service-worker cache/version and asset query strings when changing cached frontend assets.
- Verify production asset readback after deployment.
- Do not claim visual/browser interaction testing unless it was actually performed.
- Continue deploying requested fixes live after tests, per the user's instruction.

## Current work areas
- Global date fields: date/month fields use dropdowns with Day, Month (JAN/FEB etc.), Year.
- Hiren Daily Sale: configurable milk price categories, multi-category bulk entry, effective-dated category price history, date-wise grouped sales, date-level and individual entry actions. Dashboard/category summary should combine separate milk price categories into one Milk total while individual rate categories remain available during entry.
- Akash Daily Sale: milk price categories replacing slab-style input, effective-dated prices, date-wise grouped summaries, category-wise entries and edit/delete controls.
- Production frontend assets are stored in Cloudflare D1 table web_assets; service-worker caching must be refreshed when static assets change.
- GitHub working branch used for incremental work: safety/data-sync-repair-2026-10.

## User requirements to continue / verify
1. Hiren customer setup: save each customer's default milk price once and automatically use it for entries; remove milk slab and use milk price.
2. Customer monthly account: opening balance (previous outstanding), current month bill, paid amount, total due/receivable.
3. Customer detail: date-wise entries with edit; bulk date-range entry to fill missed daily records.
4. Customer other products: record other categories/products with quantity, unit price and amount, including unpaid amounts.
5. Customer PDF bill: preview before sharing; itemized layout (product/category, quantity, per-unit price, amount; Milk section and payable total); editable Terms & Policies list shown on PDF; WhatsApp sharing on mobile.
6. Milk Purchase Hiren: vendor dropdown sourced from existing vendors.
7. Milk Purchase Akash: vendor tab/selection and morning/evening purchase quantities split by cow/buffalo.
8. Stock Purchase: categories created in category management should appear dynamically as stock purchase categories; simplify confusing selected-quantity display if not needed.
9. Verify bulk-delete actions in Hiren and Akash Daily Sale against actual live UI, preserving audit/tombstone safeguards.

## Verification note
This checkpoint records the GitHub working tree at the base commit above. Production D1 assets may contain incremental changes beyond this source commit; verify the live asset version and backups before restoring or rolling back. This is a continuation checkpoint, not a claim that all pending requirements are implemented.
