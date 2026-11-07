// Smoke tests for the storefront, driven by the playwright library with node:test.
// Run: npm run smoke   (needs NODE_PATH pointing at the global node_modules that holds playwright)
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { start } = require('../../tools/serve.js');

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 }
};

let server;
let browser;

before(async () => {
  server = await start(path.join(__dirname, '..', '..'));
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

// Fresh context per test, so localStorage and sessionStorage start empty.
async function openPage(viewport, query) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(server.url + (query === undefined ? '?mock=1' : query));
  page.errors = errors;
  return { context, page };
}

const card = (page, id) => page.locator(`.product-card[data-producto="${id}"]`);

async function waitForCatalog(page) {
  await page.locator('.product-card[data-producto]').first().waitFor();
}

async function openCart(page) {
  await page.locator('#cart-button').click();
  await page.locator('#cart-drawer[data-open="true"]').waitFor();
}

async function fillCheckout(page, data) {
  const d = Object.assign({ nombre: 'Ana Martínez', whatsapp: '+503 7000-1234', zona: 'Santa Tecla, La Libertad' }, data);
  await page.getByLabel('Nombre completo').fill(d.nombre);
  await page.getByLabel('WhatsApp').fill(d.whatsapp);
  await page.getByLabel('Dirección o zona').fill(d.zona);
}

async function goToCheckout(page) {
  await openCart(page);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nombre completo').waitFor();
}

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  describe(`storefront (${name})`, () => {
    test('renders 13 product cards and filters by category and brand', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        assert.equal(await page.locator('.product-card[data-producto]').count(), 13);

        await page.locator('.filters').getByRole('button', { name: 'Labios', exact: true }).click();
        const cats = await page.locator('.product-card[data-producto]').evaluateAll((els) => els.map((e) => e.dataset.categoria));
        assert.equal(cats.length, 7);
        assert.ok(cats.every((c) => c === 'Labios'), cats.join(','));

        await page.locator('.filters').getByRole('button', { name: 'Todo', exact: true }).click();
        await page.locator('#filtro-marca').selectOption('Maybelline New York');
        assert.equal(await page.locator('.product-card[data-producto]').count(), 1);
        assert.equal(page.errors.length, 0, page.errors.join('\n'));
      } finally {
        await context.close();
      }
    });

    test('clásicos card shows two tone swatches and switching changes the image', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        const c = card(page, 'wnw-clasicos');
        const swatches = c.locator('.swatch');
        assert.equal(await swatches.count(), 2);
        // Single-SKU products show a shade label, not a selector.
        assert.equal(await card(page, 'wnw-gel-liner').locator('.swatch').count(), 0);
        assert.match(await card(page, 'wnw-gel-liner').innerText(), /661D Lay Down the Mauves/);

        const img = c.locator('.product-card__img');
        const before = await img.getAttribute('src');
        await swatches.nth(1).click();
        const afterSrc = await img.getAttribute('src');
        assert.notEqual(afterSrc, before);
        assert.match(afterSrc, /wnw-clasico-rojizo\.webp$/);
        assert.equal(await swatches.nth(1).getAttribute('aria-pressed'), 'true');
      } finally {
        await context.close();
      }
    });

    test('Brow Pencil can be reserved twice; the third add is blocked', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        const cta = card(page, 'elf-brow-pencil').locator('.product-card__cta');
        assert.equal((await cta.innerText()).trim(), 'Reservar');
        await cta.click();
        await cta.click();
        await page.waitForFunction(() => document.querySelector('#cart-count').textContent.trim() === '2');
        assert.equal(await cta.isDisabled(), true);
        assert.match(await card(page, 'elf-brow-pencil').innerText(), /No hay más unidades disponibles/);
        await cta.click({ force: true });
        assert.equal((await page.locator('#cart-count').innerText()).trim(), '2');
      } finally {
        await context.close();
      }
    });

    test('availability badges follow the counts', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        assert.equal((await card(page, 'elf-brow-pencil').locator('.badge').textContent()).trim(), 'Quedan 2');
        assert.equal((await card(page, 'elf-bronzer').locator('.badge').textContent()).trim(), 'Última unidad');
      } finally {
        await context.close();
      }
    });

    test('after an order consumes elf-bronzer, it shows Agotado with Encargar', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        await card(page, 'elf-bronzer').locator('.product-card__cta').click();
        await goToCheckout(page);
        await fillCheckout(page);
        await page.getByRole('button', { name: 'Confirmar pedido' }).click();
        await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
        await page.getByRole('button', { name: 'Seguir explorando' }).click();

        // Updated right away after the order…
        await page.waitForFunction(() => {
          const b = document.querySelector('.product-card[data-producto="elf-bronzer"] .badge');
          return b && b.textContent.trim() === 'Agotado';
        });
        // …and still after a full refresh.
        await page.reload();
        await waitForCatalog(page);
        const c = card(page, 'elf-bronzer');
        assert.equal((await c.locator('.badge').textContent()).trim(), 'Agotado');
        assert.equal((await c.locator('.product-card__cta').innerText()).trim(), 'Encargar para el próximo envío');
        await c.locator('.product-card__cta').click();
        await openCart(page);
        const drawer = page.locator('#cart-drawer');
        assert.match(await drawer.textContent(), /Encargos/);
        assert.match(await drawer.textContent(), /Los encargos se confirman cuando llegue el próximo envío\./);
      } finally {
        await context.close();
      }
    });

    test('checkout validates WhatsApp, then confirms with an R- number and empties the cart', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        await card(page, 'elf-brow-pencil').locator('.product-card__cta').click();
        await card(page, 'mny-sky-high').locator('.product-card__cta').click();
        await goToCheckout(page);
        await fillCheckout(page, { whatsapp: '' });
        await page.getByRole('button', { name: 'Confirmar pedido' }).click();
        const err = page.locator('#error-whatsapp');
        await err.waitFor();
        assert.match(await err.innerText(), /WhatsApp/);
        assert.equal(await page.getByLabel('WhatsApp').getAttribute('aria-invalid'), 'true');
        assert.equal(await page.evaluate(() => window.CatalogAPI.mockState().posts), 0);

        await page.getByLabel('WhatsApp').fill('7000 1234');
        await page.getByRole('button', { name: 'Confirmar pedido' }).click();
        await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
        const num = (await page.locator('.order-number').innerText()).trim();
        assert.match(num, /^R-\d{6}-\d{4}$/);
        const conf = await page.locator('#cart-drawer').innerText();
        assert.match(conf, /Te contactaremos por WhatsApp para coordinar la entrega\./);
        assert.match(conf, /Instant Lift Brow Pencil/);
        assert.equal((await page.locator('#cart-count').innerText()).trim(), '0');
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('catalogo.cart.v1')));
        assert.deepEqual(stored.lines, []);
      } finally {
        await context.close();
      }
    });

    test('stock conflict offers "Pasar a encargo" and resubmitting succeeds', async () => {
      // ?mock=conflict: on the first order, the mock first records a competing reservation
      // that takes every unit of the first reserved sku, so the real validation conflicts.
      const { context, page } = await openPage(viewport, '?mock=conflict');
      try {
        await waitForCatalog(page);
        await card(page, 'elf-brow-pencil').locator('.product-card__cta').click();
        await goToCheckout(page);
        await fillCheckout(page);
        await page.getByRole('button', { name: 'Confirmar pedido' }).click();
        const notice = page.locator('.notice');
        await notice.waitFor();
        assert.match(await notice.innerText(), /Instant Lift Brow Pencil/);
        await notice.getByRole('button', { name: 'Pasar a encargo' }).click();
        await page.getByRole('button', { name: 'Confirmar pedido' }).click();
        await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
        const state = await page.evaluate(() => window.CatalogAPI.mockState());
        const mine = state.lineas.filter((l) => l.pedido_id === state.pedidos[state.pedidos.length - 1].pedido_id);
        assert.deepEqual(mine.map((l) => [l.sku, l.tipo_linea, l.cantidad]), [['elf-brow-pencil', 'Encargo', 1]]);
      } finally {
        await context.close();
      }
    });

    test('double-clicking confirm records exactly one order', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        await card(page, 'elf-clear-brow').locator('.product-card__cta').click();
        await goToCheckout(page);
        await fillCheckout(page);
        await page.getByRole('button', { name: 'Confirmar pedido' }).dblclick();
        await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
        const state = await page.evaluate(() => window.CatalogAPI.mockState());
        assert.equal(state.posts, 1);
        assert.equal(state.pedidos.length, 1);
      } finally {
        await context.close();
      }
    });

    test('?mock=fail shows an error with Reintentar and keeps the saved cart', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        await card(page, 'nooni-applecherry').locator('.product-card__cta').click();
        await page.waitForFunction(() => document.querySelector('#cart-count').textContent.trim() === '1');
        await page.goto(server.url + '?mock=fail');
        await page.getByText('No pudimos cargar el catálogo.').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Reintentar' }).isVisible(), true);
        assert.equal((await page.locator('#cart-count').innerText()).trim(), '1');
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('catalogo.cart.v1')));
        assert.deepEqual(stored.lines, [{ sku: 'nooni-applecherry', cantidad: 1, tipo: 'Reserva' }]);
      } finally {
        await context.close();
      }
    });

    test('product modal opens from a card and closes with Escape', async () => {
      const { context, page } = await openPage(viewport);
      try {
        await waitForCatalog(page);
        await card(page, 'langmanni-set').locator('.product-card__open').click();
        const modal = page.getByRole('dialog');
        await modal.waitFor();
        const text = await modal.textContent();
        assert.match(text, /Set de Labios Matte & Nude/);
        assert.match(text, /Virtud/);
        assert.match(text, /Ficha técnica/);
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden' });
      } finally {
        await context.close();
      }
    });
  });
}

async function poll(page) {
  // Simula el sondeo: volver a la pestaña dispara una actualización del inventario.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.CatalogUI.render());
}

describe('storefront (fix round 1)', () => {
  test('cart and confirmation keep their scroll position across polls (mobile)', async () => {
    const { context, page } = await openPage(VIEWPORTS.mobile);
    try {
      await waitForCatalog(page);
      for (const id of ['elf-brow-pencil', 'elf-clear-brow', 'wnw-eyeliner', 'langmanni-set', 'mny-sky-high']) {
        await card(page, id).locator('.product-card__cta').click();
      }
      await openCart(page);
      const body = page.locator('#cart-drawer .drawer__body');
      const dims = await body.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
      assert.ok(dims.sh > dims.ch + 150, 'cart body should scroll: ' + JSON.stringify(dims));
      const set = await body.evaluate((el) => { el.scrollTop = 260; return el.scrollTop; });
      await poll(page);
      const after = await page.locator('#cart-drawer .drawer__body').evaluate((el) => el.scrollTop);
      assert.ok(Math.abs(after - set) <= 2, `cart scrollTop ${set} -> ${after}`);

      await page.getByRole('button', { name: 'Continuar' }).click();
      await fillCheckout(page);
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();
      await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
      const conf = page.locator('#cart-drawer .drawer__body');
      const set2 = await conf.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
      assert.ok(set2 > 0, 'confirmation should scroll on mobile');
      await poll(page);
      const after2 = await page.locator('#cart-drawer .drawer__body').evaluate((el) => el.scrollTop);
      assert.ok(Math.abs(after2 - set2) <= 2, `confirmation scrollTop ${set2} -> ${after2}`);
    } finally {
      await context.close();
    }
  });

  test('mock mode shows the "Modo demostración" banner', async () => {
    const { context, page } = await openPage(VIEWPORTS.desktop);
    try {
      await waitForCatalog(page);
      assert.equal(await page.locator('.demo-banner').isVisible(), true);
      assert.match(await page.locator('.demo-banner').textContent(), /Modo demostración/);
    } finally {
      await context.close();
    }
  });

  test('a stored line whose product no longer exists is removed with a calm notice', async () => {
    const context = await browser.newContext({ viewport: VIEWPORTS.mobile, deviceScaleFactor: 1 });
    context.setDefaultTimeout(10000);
    await context.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('catalogo.cart.v1', JSON.stringify({ v: 1, lines: [
          { sku: 'nooni-applecherry', cantidad: 1, tipo: 'Reserva' },
          { sku: 'producto-retirado', cantidad: 1, tipo: 'Encargo' }
        ] }));
      }
    });
    const page = await context.newPage();
    try {
      await page.goto(server.url + '?mock=1');
      await page.getByText('Un producto ya no está disponible y se quitó de tu pedido.').waitFor();
      assert.equal((await page.locator('#cart-count').textContent()).trim(), '1');
    } finally {
      await context.close();
    }
  });

  test('STORE_WHATSAPP set: footer shows a wa.me link; a card with a broken image shows the brand placeholder', async () => {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 1 });
    context.setDefaultTimeout(10000);
    await context.route('**/js/config.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: "window.CATALOG_CONFIG = { API_URL: '', POLL_MS: 600000, STORE_NAME: 'Atelier de Belleza', STORE_WHATSAPP: '+503 7000-0000' };"
    }));
    await context.route('**/img/products/elf-bronzer.*', (route) => route.abort());
    const page = await context.newPage();
    try {
      await page.goto(server.url + '?mock=1');
      await waitForCatalog(page);
      const link = page.locator('.site-footer__contact a');
      assert.equal(await link.getAttribute('href'), 'https://wa.me/50370000000');
      assert.equal((await link.textContent()).trim(), 'Escríbenos por WhatsApp');
      const media = card(page, 'elf-bronzer').locator('.product-card__media');
      await page.waitForFunction(() => document.querySelector('.product-card[data-producto="elf-bronzer"] .product-card__media').classList.contains('is-noimg'));
      assert.ok((await media.getAttribute('data-brand')).length > 0);
    } finally {
      await context.close();
    }
  });

  test('live mode on the published host ignores ?mock params and talks to the API', async () => {
    const ROOT = path.join(__dirname, '..', '..');
    const HOST = 'http://tienda.test';
    const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.seed.json'), 'utf8'));
    const hidden = new Set();
    const edits = {};
    const posts = [];
    let failNextPost = true;
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 1 });
    context.setDefaultTimeout(10000);
    await context.route(HOST + '/**', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname === '/api') {
        if (req.method() === 'POST') {
          posts.push({ type: req.headers()['content-type'], body: req.postData() });
          if (failNextPost) { failNextPost = false; return route.abort('failed'); }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, pedido_id: 'R-261107-0001' }) });
        }
        assert.equal(url.searchParams.get('action'), 'catalog');
        const products = seed.filter((p) => !hidden.has(p.sku)).map((p) => {
          const o = Object.assign({}, p, { disponible: p.existencias }, edits[p.sku] || {});
          delete o.existencias;
          return o;
        });
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, products, updatedAt: new Date().toISOString() }) });
      }
      if (url.pathname === '/js/config.js') {
        return route.fulfill({
          contentType: 'text/javascript',
          body: "window.CATALOG_CONFIG = { API_URL: '" + HOST + "/api', POLL_MS: 600000, STORE_NAME: 'Atelier de Belleza' };"
        });
      }
      const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'no' });
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    try {
      await page.goto(HOST + '/?mock=fail');
      await waitForCatalog(page);
      assert.equal(await page.evaluate(() => window.CatalogAPI.mode), 'live');
      assert.equal(await page.locator('.demo-banner').count(), 0);

      await card(page, 'nooni-applecherry').locator('.product-card__cta').click();
      await card(page, 'elf-brow-pencil').locator('.product-card__cta').click();
      await page.waitForFunction(() => document.querySelector('#cart-count').textContent.trim() === '2');

      // El SKU se oculta en la hoja: el siguiente sondeo lo quita con un aviso que lo nombra.
      hidden.add('nooni-applecherry');
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.getByText('«Apple Seed Lip Oil» ya no está disponible y se quitó de tu pedido.').waitFor();
      await page.waitForFunction(() => document.querySelector('#cart-count').textContent.trim() === '1');
      // Un cambio de nombre o tono en la hoja (sin cambiar la estructura) también llega a las tarjetas.
      edits['elf-bronzer'] = { nombre: 'Camo Liquid Bronzer' };
      edits['wnw-gel-liner'] = { variante: '662 Berry Nice' };
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(800);
      assert.equal((await card(page, 'elf-bronzer').locator('.product-card__open').textContent()).trim(), 'Camo Liquid Bronzer');
      assert.equal((await card(page, 'wnw-gel-liner').locator('.shade__value').textContent()).trim(), '662 Berry Nice');

      await goToCheckout(page);
      await fillCheckout(page);
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();
      await page.getByText('No recibimos confirmación. Es posible que tu pedido sí se haya registrado').waitFor();
      assert.match(await page.locator('.form-error').innerText(), /espera un minuto antes de reintentar\. Te contactaremos por WhatsApp para confirmarlo\./);
      assert.equal(await page.locator('.form-error a').count(), 0);
      assert.equal(await page.locator('.site-footer__contact a').count(), 0);
      assert.equal((await page.locator('#cart-count').textContent()).trim(), '1');

      await page.getByRole('button', { name: 'Confirmar pedido' }).click();
      await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
      assert.equal(posts.length, 2);
      assert.equal(posts[1].type, 'text/plain;charset=utf-8');
      const body = JSON.parse(posts[1].body);
      assert.deepEqual(body.items, [{ sku: 'elf-brow-pencil', cantidad: 1, tipo: 'Reserva' }]);
      assert.equal(body.cliente.whatsapp, '+503 7000-1234');
      assert.match(await page.locator('#cart-drawer').textContent(), /Total\$8\.00/);
    } finally {
      await context.close();
    }
  });
});

describe('storefront (narrow)', () => {
  test('no horizontal scroll at 360px', async () => {
    const { context, page } = await openPage({ width: 360, height: 780 });
    try {
      await waitForCatalog(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, 'overflow ' + overflow + 'px');
      await openCart(page);
      const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow2 <= 0, 'overflow with drawer ' + overflow2 + 'px');
    } finally {
      await context.close();
    }
  });
});
