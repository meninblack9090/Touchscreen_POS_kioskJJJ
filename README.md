# Touchscreen POS Kiosk System

A self-service kiosk for the IT415 Practical Examination. The original interface is connected to Supabase for product prices and completed transactions. Cash, QR, and card payments are simulations; no payment provider is connected.

## Run the kiosk

Requires Node.js 22 or newer.

```sh
npm ci
npm start
```

Open [the local kiosk](http://127.0.0.1:4173). The committed `config.js` connects to the existing **POS koiskJJJJJ** Supabase project. Its publishable key is intended for browser use; privileged backend keys are never included in the client.

Use an HTTP server rather than opening `index.html` directly. The deployed function allows these development origins by default:

- `http://127.0.0.1:4173` and `http://localhost:4173`
- `http://127.0.0.1:5500` and `http://localhost:5500` (VS Code Live Server)

## Payment behavior

- Cash rejects blanks, invalid text, negative amounts, scientific notation, more than two decimal places, and amounts below the order total. Invalid payments stay on the payment screen.
- For a ₱175.00 order, ₱174.99 is rejected, ₱175.00 gives ₱0.00 change, and ₱200.00 gives ₱25.00 change.
- QR displays a clearly identified placeholder, scanning instructions, and **Confirm Payment**.
- Card displays tap/insert/swipe instructions and a short processing state after **Process Payment**.
- QR and card simulations pay exactly the confirmed total with zero change.
- Success is displayed only after the backend saves the transaction. The receipt uses the saved product names, prices, totals, payment, change, and transaction reference.
- If a checkout response is lost, **Retry Payment** sends the identical request ID. The pending request is retained in this tab's session storage, including across reloads. Editing the payment is locked until its result is recovered.
- Checkout is blocked when this browser cannot save its recovery information; enable browser storage before trying again. Authentication failures during an unresolved retry preserve the original request.
- Product-price changes require reviewing the updated order before another payment attempt.

## Backend design

`products` contains the public active catalog. `orders` stores completed payment details and the canonical request. `order_items` stores immutable purchase snapshots. Money is stored as integer centavos.

The `kiosk` Edge Function authorizes the `apikey` header against the project's publishable keys, applies browser CORS, and calls PostgREST with backend-only credentials. Publishable keys are not JWTs, so `verify_jwt = false` is intentional: authorization is performed inside the function.

The transactional `kiosk_checkout` SQL function reads trusted prices, validates payment and the confirmed total, and saves the order and items together. A per-request transaction lock prevents concurrent retries from creating duplicate orders. Reusing an ID with a changed request returns a conflict. Order tables have RLS enabled, no public policies, and no public grants; the checkout and receipt functions can be executed only by the backend's service role.

### API

Base URL: `https://rvnnccdlsldwzgeifiic.supabase.co/functions/v1/kiosk`

Every request requires `apikey: <publishable key>`.

- `GET /products` returns `{ "products": [...] }` with IDs, names, descriptions, categories, colors, and centavo prices.
- `POST /checkout` accepts the following JSON. `cash` is a peso string for Cash and can be omitted for QR/card.

```json
{
  "requestId": "8a488b4c-7ca6-4e17-8824-ab3c91226fba",
  "items": [{ "id": "sandwich", "qty": 3 }, { "id": "cookies", "qty": 1 }],
  "method": "Cash",
  "cash": "175.00",
  "expectedTotal": 17500
}
```

Methods are `Cash`, `QR Payment`, and `Credit/Debit Card`. Quantities are integers from 1 to 999; each product appears once. Client price fields are ignored. For non-cash methods the backend sets the paid amount itself.

Success returns `{ "receipt": { "number", "date", "items", "total", "paid", "change", "method" } }`. Receipt monetary values are centavos. Errors return `{ "error": { "code", "message" } }`: validation is 400/422, changed totals or request conflicts are 409, and uncertain checkout failures are 503. Retry an uncertain checkout with the same body and request ID; do not create a new request ID to work around a timeout.

## Supabase setup and deployment

The existing project already has the migration applied and the function deployed. The migration filename matches its remote migration history.

For a **new, empty** Supabase project:

1. Create its publishable key and copy `config.example.js` to `config.js`; enter its URL and publishable key.
2. Log in to the pinned CLI and link the new project:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase functions deploy kiosk --project-ref YOUR_PROJECT_REF --use-api
   ```

3. Confirm Edge Function environment variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS`, and `SUPABASE_SECRET_KEYS` are available. Supabase supplies these automatically; the function also supports its built-in legacy service-role key as a backend fallback. Never put these privileged keys in GitHub or `config.js`.
4. For another frontend origin, set `KIOSK_ALLOWED_ORIGINS` on the Edge Function to the comma-separated origins, including whichever local development origins you still use. For example:

   ```sh
   npx supabase secrets set KIOSK_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://localhost:5500 --project-ref YOUR_PROJECT_REF
   ```

   The browser origin must match exactly, including scheme and port.

The schema is intentionally limited to the school activity: no customer login, dashboard, stock tracking, or real financial transaction integration.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Handler tests exercise authorization, routing, input validation, and error responses. Browser tests cover the simulated payment screens, cash rules, receipts, reset, failed saves, and safe retries with mocked API responses.

To verify the **configured live Supabase project**, explicitly run:

```sh
npm run test:live
npm run test:live:browser
```

These integration tests create simulated orders in the configured project. Their request IDs are recorded in the ignored `.superpowers/live-request-ids.txt` file for targeted test-data cleanup. The live browser tests cover all three payment methods and recovery after a real successful checkout response is deliberately lost and the page reloads.

`tests/database.sql` contains transactional database validation, replay, snapshot, and security assertions. Execute it in the Supabase SQL Editor; its test writes are rolled back. Keep PostgreSQL assertions enabled.

Supabase advisors may report informational notices for RLS-enabled `orders` and `order_items` having no policies. This intentionally denies public row access; no public order policies should be added just to silence those notices. A newly created foreign-key index may also be reported as unused before sufficient traffic exists. See the [RLS policy advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [unused-index advisor](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Authors

Justin Adam C. Umalay
Jaymar C. Lomocso
Jeward N. Mencede

## Vercel hosting

The kiosk frontend is deployed at https://triple-j-pos-kiosk.vercel.app. Its backend remains in the existing Supabase project.

Vercel project settings are committed in `vercel.json`: framework **Other**, build command `node scripts/build.mjs`, install command `npm ci --omit=dev --ignore-scripts`, and output directory `dist`. The build copies only the HTML, CSS, browser JavaScript, public Supabase configuration, and artwork. Database migrations, function source, tests, and environment files are excluded from the public output.

To build locally:

```sh
node scripts/build.mjs
```

To recreate the deployment, import this repository in Vercel with the above settings, or deploy its files with the Vercel CLI after explicitly linking the intended account and project. This initial deployment was uploaded directly; it does not configure automatic deployments from GitHub. For a different domain, add its exact HTTPS origin to `KIOSK_ALLOWED_ORIGINS` in Supabase, preserving the local origins you need, then redeploy the Edge Function. The committed default allowlist includes this project's assigned production and initial deployment URLs.

To test the deployed frontend against live Supabase in PowerShell:

```powershell
$env:KIOSK_DEPLOYMENT_URL='https://triple-j-pos-kiosk.vercel.app'
npm run test:live:browser
```

These tests create simulated transactions; use their recorded request IDs for targeted cleanup.


## Customer feedback
After viewing a receipt, customers can leave the existing 1–5 rating and optional comment, or skip feedback. New responses are saved in the private Supabase `customer_feedback` table, linked to their completed order, with the server submission date. View them in the Supabase dashboard under **Table Editor → customer_feedback**. Each order accepts one response. Identical retries recover the saved response; changed requests return a conflict. The form waits for confirmation before thanking the customer and keeps the original submission for safe retries after a network failure. Skipping creates no feedback record. Previous localStorage responses are not automatically imported.

Feedback uses `POST /feedback` on the existing kiosk Edge Function with `{transactionNumber, rating, comment}`. The browser uses only its publishable key; table access and the `kiosk_feedback` database function are restricted to the backend. `tests/feedback.database.sql` verifies validation, replay, duplicate rejection, and role grants inside a rolled-back transaction. Apply the committed `customer_feedback` migration before deploying the updated Edge Function.