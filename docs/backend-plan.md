# POS backend implementation record

Approved plan: catalog and checkout only, Supabase project `frnlbbozlkmclntvfoda`, guest Edge Function, simulated payments, branch `pos-backend-kiosk`.

## Completed tasks
1. Shared request validation, atomic database checkout, catalog seed and RLS.
2. Guest Edge Function, public configuration and backend fetch module.
3. Catalog loading, immutable confirmation, payment saving and retry/reload recovery.
4. Automated, browser and live database checks; advisors, independent review and GitHub delivery.

## Decisions
- Work in the existing clean checkout on the explicitly requested feature branch.
- Use native fetch for Supabase REST and Edge Function calls; no frontend framework.
- Save completed orders only. Price changes require reviewing the updated order.
- Guest checkout is public for this activity; database checkout is server-role only.
- Session storage retains pending payloads and receipts; no customer/card information.
- Supabase assigned migration version `20261007111148`; the CLI-generated local migration was aligned with remote history.
- Clear a pending request only when the database establishes that no previous order exists for that request ID. Configuration/validation failures before the database cannot establish this.

## Verification
- `npm test`: 18 passing unit and DOM tests.
- `tests/database.sql`: rollback-only checks passed for exact cash, change, QR/card, validation, atomic rejection, idempotency, permissions, inactive products and saved snapshots after catalog changes.
- `npm run test:live`: passed; 8 products, 15 rejected requests, 5 saved simulated orders, identical/concurrent retry and private-data checks.
- Database inspection: rejected requests created 0 orders; saved orders had matching order, item and payment amounts.
- `npm run test:browser`: passed in real Chrome, including underpayment, exact payment, QR/card, receipt reload, interrupted-save retry, and mobile layout without horizontal overflow. Saves 4 simulated orders per run.
- Screenshots inspected for cash, QR, receipt and mobile catalog; the original design is preserved.
- Independent read-only review found one Important issue: pre-database rejection could discard earlier uncertain recovery state. Reproduced with a failing regression test, fixed, and full suite/live/browser checks passed. No Critical or deferred Minor issues.
- Security advisors reported only informational [RLS enabled without public policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) on the three intentionally private transaction tables.
- Performance advisors reported only an informational [unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) on the new product foreign-key index, retained for referential operations.
- Credential scan found no committed secret keys or private keys. Frontend contains only the project URL and publishable key.
