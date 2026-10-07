# Backend verification — 7 October 2026

Implementation on `pos-backend-kiosk` connects the original static kiosk to Supabase project `rvnnccdlsldwzgeifiic` (POS koiskJJJJJ). Migration `20261007144127_kiosk_backend` and Edge Function `kiosk` are deployed.

## Results

- API handler: **18 tests passed**.
- Browser acceptance and review regressions: **17 tests passed**.
- Deployed API integration: **22 tests passed**.
- Actual browser-to-Supabase flows: **4 tests passed**, including a committed checkout whose response was deliberately dropped, followed by reload and recovery with the original request ID.
- Database assertions passed for invalid/insufficient/exact/overpaid cash, simulated QR/card totals, replay, request conflicts, product snapshots, malformed carts, and public access restrictions. Their writes were rolled back.
- Mobile receipt layout visually checked at 390px width.
- `npm audit`: zero known vulnerabilities. `git diff --check`: clean. No privileged keys or JWT credentials in source.
- Removed exactly the **14 orders created by this implementation's live tests**, using their recorded request IDs. The catalog retains its eight products; no test orders or purchased items remain.

## Independent review

The final independent review found two recovery issues. Three browser regression cases failed before the fixes and passed afterward:

1. A pre-checkout authorization failure during a retry must not discard an earlier unresolved request; preserve its ID and keep editing locked until its outcome is known.
2. A malformed success payload must remain unresolved rather than clear the checkout attempt.
3. Browser recovery storage must succeed before submitting checkout; otherwise display an actionable error without sending payment.

The full API and browser suites passed after the fixes, and all four actual live browser flows passed again. No minor review findings were deferred.

## Implementation decisions

- Reused the existing clean `pos-backend-kiosk` checkout, matching the approved branch choice. No additional worktree was created.
- Used native fetch/PostgREST instead of adding a Supabase SDK to the static browser app or Edge Function. This keeps the HTTP boundary explicit and testable; changing APIs would require maintaining these small wrappers.
- Matched the CLI-created local migration filename to the version recorded by Supabase's migration tool, preserving identical SQL and preventing duplicate application on the already configured project.
- Intentionally retained RLS without public policies for the private order tables. Advisors report informational notices for these tables and the newly created foreign-key index; public data-access tests confirm the intended restrictions.

The review set aside real payment-provider verification, operator authentication, and recovery after closing a tab because the approved activity uses simulated public kiosk checkout and tab-session recovery. README setup and API documentation were checked separately after completion. Recovery information survives page reload while browser session storage remains available; tab closure is outside this design.
