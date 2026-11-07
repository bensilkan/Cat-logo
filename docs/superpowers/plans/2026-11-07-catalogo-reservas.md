# Catálogo de reservas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static premium catalog on GitHub Pages where clients reserve (or back-order) beauty products; orders land in a Google Sheet via an Apps Script web app that enforces stock.

**Architecture:** Vanilla HTML/CSS/JS front end (no build step) reads the catalog and posts orders to a Google Apps Script web app bound to a Sheet. Pure business logic (`apps-script/logic.js`, `js/cart.js`) is plain JS loadable both in the browser/Apps Script and in Node for tests. A mock API (`?mock=1`, or when `API_URL` is empty) serves `data/products.seed.json` so the UI is testable without Google.

**Tech Stack:** HTML/CSS/vanilla ES2020, Google Apps Script (V8), Node 18+ `node:test`, Playwright (preinstalled) for smoke tests, Python + Pillow + rembg for image processing.

**Spec:** `docs/superpowers/specs/2026-11-07-catalogo-reservas-design.md`

## Global Constraints

- UI copy in Spanish (El Salvador). Currency USD, format `$9.50`.
- Palette: `--ivory #FAF6F1`, `--wine #6E2A3F`, `--champagne #C9A96E`, `--ink #2A1F22`. Fonts: Cormorant Garamond (titles), Manrope (UI) from Google Fonts.
- Categories, exactly: Rostro · Cejas y pestañas · Ojos · Labios.
- Order estados, exactly: Pendiente · Confirmado · Entregado · Cancelado. Only Cancelado releases stock (compare trimmed, case-insensitive).
- Encargo max 10 per SKU per order. Reserva never exceeds `disponible`.
- WhatsApp field accepts SV `+503 ____-____` and other formats (≥ 8 digits).
- Images: 1200×1200 WebP, product cut out on uniform ivory canvas with soft contact shadow, stored in `img/`.
- Stock and prices come from the Sheet at runtime, never from front-end constants (the seed JSON is only for mock mode and initial setup).
- No secrets in the repo; Apps Script URL is public by design.

## Review Focus

- Two clients confirm the last unit simultaneously → exactly one order written; the other gets `sin_existencias` (Task 2 lock + Task 1 test on sequential validation).
- Hand-edited sheet: blank/text `existencias`, `" cancelado "` with spaces/lowercase, unknown sku in Líneas → treated as 0 / Cancelado / ignored, never a crash (Task 1 tests).
- Saved cart references a SKU that was hidden or whose stock dropped → on catalog refresh the line is removed (hidden) or flagged with "Pasar a encargo / Quitar" (Task 4 tests).
- API not configured or network down → catalog shows a calm error with "Reintentar"; cart intact (Task 5 smoke test).
- Double-tap on "Confirmar pedido" → button disabled while submitting; only one POST (Task 5 smoke test).

---

### Task 1: Seed data + pure order logic

**Files:**
- Create: `package.json` (`"type": "commonjs"`, script `"test": "node --test tests/unit"`)
- Create: `data/products.seed.json`
- Create: `apps-script/logic.js`
- Test: `tests/unit/logic.test.js`

**Interfaces:**
- Produces: `data/products.seed.json` — array of `{sku, producto_id, marca, nombre, variante, categoria, precio, existencias, desc_atractiva, virtud, tecnica, imagen, visible}`. 14 SKUs per spec §5 (wnw clásicos = 2 SKUs `wnw-clasico-dorado`, `wnw-clasico-rojizo` with `producto_id: "wnw-clasicos"`; nooni only `nooni-applecherry`). Texts copied from the PDF; brow pencil / clear brow texts say "unidad", not "set de 2"; nooni técnica mentions only applecherry.
- Produces (logic.js, exported via `if (typeof module !== 'undefined') module.exports = {...}`):
  - `toNumber(v) -> number` (blank/NaN → 0)
  - `isCancelled(estado) -> boolean`
  - `computeAvailability(products, pedidos, lineas) -> {[sku]: number}` — `pedidos`: `[{pedido_id, estado}]`, `lineas`: `[{pedido_id, sku, cantidad, tipo_linea}]`; never negative.
  - `validateOrder(order, products, availability) -> {ok:true, lines} | {ok:false, error, conflictos?, campo?}` — errors: `"datos_cliente"` (with `campo`), `"item_invalido"`, `"sin_existencias"` (with `conflictos:[{sku, pedido, disponible}]`), `"encargo_maximo"`. `lines` enriched with `precio_unit`, `marca`, `nombre`, `variante`.
  - `buildOrderRecord(order, lines, now, rand) -> {pedido: {...Pedidos row}, lineas: [...]}` — `pedido_id` = `R-YYMMDD-NNNN`, `tipo` Reserva/Encargo/Mixto, `resumen` like `"2× e.l.f. Instant Lift Brow Pencil — $16.00 (Reserva)"` joined by `"; "`, `estado: "Pendiente"`.

- [ ] **Step 1: Write failing tests** in `tests/unit/logic.test.js`:
  - seed has 14 SKUs, prices `elf-color-corrector 9.5`, `elf-brow-pencil 8` stock 2, `elf-clear-brow 8` stock 2, `wnw-eyeliner 8` stock 2, both perfectpout `5.5`, `nooni-applecherry 12.5` stock 1; every `imagen` starts with `img/products/`.
  - `computeAvailability`: stock 2, one active Reserva of 1 → 1; same line but pedido `" cancelado "` → 2; Encargo lines don't count; `existencias: ""` → 0; line with unknown sku ignored; over-reserved → 0 not negative.
  - `validateOrder`: missing nombre → `{ok:false, error:"datos_cliente", campo:"nombre"}`; whatsapp `"1234"` → campo `"whatsapp"`; `"+503 7012-3456"` ok; cantidad `0`/`1.5`/unknown sku → `item_invalido`; reserva 2 with disponible 1 → `sin_existencias` with `conflictos[0] = {sku, pedido:2, disponible:1}`; two lines same sku summing over disponible → conflict; encargo 11 → `encargo_maximo`; encargo on in-stock sku allowed.
  - `buildOrderRecord`: id matches `/^R-\d{6}-\d{4}$/`, tipo Mixto when both, totals split by tipo.
- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** Create seed JSON and implement `logic.js` (no `require`, no ES module syntax — must paste into Apps Script unchanged).
- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5:** Commit `feat: seed data and order logic`.

### Task 2: Apps Script web app + setup guide

**Files:**
- Create: `apps-script/Code.gs`
- Create: `apps-script/Seed.gs` (generated)
- Create: `tools/build-seed.js` (writes `Seed.gs` as `var SEED_PRODUCTS = [...]` from the JSON)
- Create: `docs/GUIA-APPS-SCRIPT.md`
- Test: `tests/unit/codegs.test.js`

**Interfaces:**
- Consumes: everything from `logic.js`.
- Produces (HTTP):
  - `GET ?action=catalog` → `{ok:true, products:[...seed fields minus existencias, plus disponible], updatedAt}` (only `visible` truthy).
  - `POST` text/plain JSON `{cliente:{nombre, whatsapp, direccion_zona}, items:[{sku, cantidad, tipo:"Reserva"|"Encargo"}]}` → `{ok:true, pedido_id}` or validateOrder's error object, or `{ok:false, error:"ocupado"}` if lock not acquired in 10 s.
- Produces (Apps Script): `setup()` — idempotent; creates tabs `Productos`, `Pedidos`, `Líneas` with headers from spec §3, seeds Productos only if empty, adds data validation dropdown on Pedidos.estado, freezes header rows, styles headers wine/ivory.
- Sheet access helpers take a `SpreadsheetApp`-like object so tests can pass a fake: `readTable(sheet) -> object[]`, `handleCatalog(ss)`, `handleOrder(ss, body, lock, now)`.

- [ ] **Step 1: Failing test** `tests/unit/codegs.test.js`: load `logic.js` + `Code.gs` into a `vm` context with a fake in-memory spreadsheet (getSheetByName/getDataRange().getValues()/appendRow) and fake lock. Assert: `handleCatalog` hides `visible:false` and returns `disponible`; `handleOrder` valid → appends 1 Pedidos row + N Líneas rows; conflicting → appends nothing and returns `sin_existencias`; two sequential orders for the last unit → second fails; lock `tryLock` false → `ocupado`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `Code.gs` (`doGet`, `doPost` wrap the handlers and return `ContentService` JSON) and `tools/build-seed.js`; run `node tools/build-seed.js`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Write `docs/GUIA-APPS-SCRIPT.md` in Spanish: open sheet → Extensiones → Apps Script → paste `logic.js`, `Seed.gs`, `Code.gs` as three files → run `setup` → authorize → Implementar → Nueva implementación → Aplicación web, Ejecutar como "Yo", Acceso "Cualquier persona" → copy URL → send it / paste in `js/config.js`. Include how to cancel an order and restock.
- [ ] **Step 6:** Commit `feat: apps script web app and setup guide`.

### Task 3: Product and brand images

**Files:**
- Create: `img/products/<sku>.webp` (14 files, one per SKU; `elf-*`, `wnw-*`, `mny-sky-high`, `nooni-applecherry`, `langmanni-set`; the two clásicos SKUs get one image each)
- Create: `img/brands/{elf,wetnwild,maybelline,nooni,langmanni}.svg|png`
- Create: `img/hero.webp`
- Create (scratchpad, not committed): `tools/process_image.py` downloads stay in scratchpad.
- Create: `img/CREDITS.md` (source URL per image)

**Interfaces:**
- Produces: files at the exact `imagen` paths in `data/products.seed.json`.

- [ ] **Step 1:** For each SKU search retailer listings (Ulta, Target, Walmart, Amazon, CVS, brand site) for the exact shade/packaging in the PDF (e.g. 661D Lay Down the Mauves, 715 Plumberry, 813B Extra Cinnamon Please, 801 Very Black, Applecherry). Download highest-res front shot into its own scratchpad dir.
- [ ] **Step 2:** Implement `process_image.py <in> <out>`: if background not near-white uniform → rembg cutout; trim; fit within 78% of a 1200×1200 `#FAF6F1` canvas, centered; soft elliptical contact shadow; save WebP q=88.
- [ ] **Step 3:** Process all; build a contact sheet PNG and visually inspect: no halos, correct shade, consistent scale. Redo any failures.
- [ ] **Step 4:** Brand logos (monochrome wine-tinted or ink) + hero image (composed flat-lay from the product cutouts on ivory with champagne accents).
- [ ] **Step 5:** Commit `feat: product and brand imagery`.

### Task 4: Cart logic

**Files:**
- Create: `js/cart.js`
- Test: `tests/unit/cart.test.js`

**Interfaces:**
- Produces (global `window.Cart` in browser; `module.exports` in Node):
  - `createCart(storage) -> cart` where storage is `{getItem,setItem}`; key `"catalogo.cart.v1"`; corrupted JSON → empty cart.
  - `cart.lines() -> [{sku, cantidad, tipo}]`
  - `cart.add(sku, tipo, cantidad, disponible) -> {ok, added}` — Reserva capped at `disponible - inCart(sku,"Reserva")`; Encargo capped at 10.
  - `cart.setQty(sku, tipo, n, disponible)`, `cart.remove(sku, tipo)`, `cart.clear()`
  - `cart.moveToEncargo(sku)` — merges into existing Encargo line (cap 10).
  - `cart.reconcile(productsBySku) -> [{sku, cantidad, disponible}]` — drops lines whose sku is missing/hidden; returns reserva lines exceeding disponible (does not auto-change them).
  - `cart.totals(productsBySku) -> {reserva, encargo, total, count}`

- [ ] **Step 1: Failing tests:** cap at disponible across repeated adds; encargo cap 10; persistence round-trip through fake storage; corrupted storage → empty; moveToEncargo merges; reconcile drops hidden sku and reports over-limit line; totals with 9.5×1 + 8×2 = 25.5.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: cart logic with persistence`.

### Task 5: Storefront UI

**Files:**
- Create: `index.html`, `css/styles.css`, `js/config.js`, `js/api.js`, `js/ui.js`, `js/app.js`, `.nojekyll`
- Test: `tests/smoke/storefront.spec.js` (+ `playwright.config.js`, static server via `npx http-server` or node script `tools/serve.js`)

**Interfaces:**
- Consumes: `Cart` (Task 4), seed JSON (mock), images (Task 3), API shape (Task 2).
- Produces: `js/config.js` → `window.CATALOG_CONFIG = { API_URL: "", POLL_MS: 20000, STORE_NAME: "…" }`.
  - `api.fetchCatalog() -> Promise<{products}>`, `api.submitOrder(order) -> Promise<result>`; mock mode when `API_URL` empty or `?mock=1`; mock keeps availability in memory and applies orders; `?mock=fail` simulates network failure.
  - Polling every `POLL_MS`, on `visibilitychange` to visible, and before submit; after each fetch run `cart.reconcile` and show conflicts.

- [ ] **Step 1: Failing smoke tests** (mobile 390×844 and desktop 1440×900, `?mock=1`):
  - 13 product cards render grouped/filterable; filter "Labios" shows only Labios.
  - clásicos card shows two tone swatches; switching changes image `src`.
  - Brow Pencil: "Reservar" twice works, third add blocked with "No hay más unidades disponibles".
  - After mock order consumes `elf-bronzer`, refresh shows "Agotado" + "Encargar para el próximo envío".
  - Checkout: empty WhatsApp shows inline error; valid form → "Pedido recibido" with `R-` number; cart emptied.
  - Conflict: mock returns `sin_existencias` → affected line offered "Pasar a encargo"; clicking it and resubmitting succeeds.
  - Double-click confirm → exactly one mock order recorded.
  - `?mock=fail` → error message with "Reintentar"; previously saved cart still there.
- [ ] **Step 2:** Run `npx playwright test --trace off` → FAIL.
- [ ] **Step 3:** Build `index.html` + `styles.css` per spec §6–7 (hero, brand strip, category/brand filters, card grid 2/3/4 cols, product modal, cart drawer → bottom sheet on mobile, checkout form, confirmation view, availability badges "Disponible"/"Última unidad"/"Quedan N"/"Agotado").
- [ ] **Step 4:** Implement `api.js`, `ui.js`, `app.js`.
- [ ] **Step 5:** Run smoke tests → PASS. Take screenshots (mobile + desktop, deviceScaleFactor 1) and inspect visually against spec §7; fix anything that looks off.
- [ ] **Step 6:** Commit `feat: storefront UI`.

### Task 6: Deploy and connect

**Files:**
- Modify: `js/config.js` (API_URL once user provides it)
- Create: `README.md` (Spanish: enlaces, cómo cancelar, cómo reabastecer)

- [ ] **Step 1:** Create the Google Sheet "Catálogo — Pedidos" in the user's Drive via the Google Drive connector; send the link.
- [ ] **Step 2:** User (manual): make repo public; Settings → Pages → Deploy from branch `claude/gifted-babbage-1kyozp` (or `main` after merge), folder `/`. Publish Apps Script per guide; share web-app URL.
- [ ] **Step 3:** Set `API_URL`, push, open the live site with Playwright: catalog loads from the Sheet.
- [ ] **Step 4:** E2E: place a real reservation for one unit → row appears in Pedidos/Líneas, unit shows reduced; set estado Cancelado → unit returns after next poll. Remove the test rows afterward (ask user first).
- [ ] **Step 5:** Commit `chore: connect live API` and push; report links.
