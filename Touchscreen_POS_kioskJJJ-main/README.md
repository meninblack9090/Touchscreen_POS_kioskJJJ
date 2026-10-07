# Touchscreen POS kiosk

A static campus food and merchandise kiosk with a cart, order review, cash
validation, simulated QR/card payments, and digital receipts.

## Run

In PowerShell, run:

```powershell
cd "D:\New folder (2)\Touchscreen_POS_kioskJJJ-main"
npm start
```

Then open <http://localhost:4173> in your browser. `npm run dev` runs the same
local server. Leave the terminal running; press Ctrl+C to stop it.

Open `index.html` in a browser. No installation or compilation is required to
use the kiosk. Keep the `css`, `js`, and `assets` folders beside it. Google Fonts
supplies the original typography; local fallback fonts work offline.

## Project structure

```text
index.html              Page shell and asset references
css/styles.css          Layout, pastel theme, responsive styles and animations
js/data.js              Product catalog and payment method names
js/format.js            Currency formatting and HTML escaping
js/order.js             Cart updates, totals, cash validation and receipts
js/views.js             Screen templates and reusable UI markup
js/app.js               Events, navigation, focus management and payment timers
assets/                 Product illustrations, payment artwork and demo QR image
scripts/build.cjs       Source validation and static build packaging
scripts/serve.cjs       Local server for npm start and npm run dev
tests/                  Business logic and browser regression tests
```

Scripts use one `window.Kiosk` namespace and load in the order shown in
`index.html`. Classic deferred scripts preserve support for opening the file
directly. Prices and calculations use integer centavos. Orders live in memory
and reset when the page reloads. Payment simulation behavior is unchanged.

## Development checks

Use Node.js 22 or newer:

```sh
npm ci
npx playwright install chromium
npm test
npm run format:check
npm run build
```

`npm test` runs logic tests and real Chromium browser flows. The local server
binds to localhost and serves only public kiosk files. `npm run build` checks
syntax, script dependencies and asset references, then copies the static site
to `dist/`. Open `dist/index.html` or host the contents of that folder.

Use `npm run format` after editing. Development tools are not shipped in the
static build. Change product names, descriptions and prices in `js/data.js`;
matching artwork lives in `assets/products/`.
