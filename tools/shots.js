// Capturas para revisión visual (modo simulado).
// Uso: NODE_PATH=$(npm root -g) node tools/shots.js [carpeta_destino]
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { start } = require('./serve.js');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.superpowers', 'shots'));
const VIEWPORTS = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

async function settle(page, ms) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms || 700);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(path.join(__dirname, '..'));
  const browser = await chromium.launch();
  try {
    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const shot = (n, opts) => page.screenshot(Object.assign({ path: path.join(OUT, `${name}-${n}.png`) }, opts));
      await page.goto(server.url + '?mock=1');
      // Deja el bronceador agotado para mostrar una tarjeta "Agotado".
      await page.evaluate(() => window.CatalogAPI.submitOrder({
        cliente: { nombre: 'Prueba', whatsapp: '70001234', direccion_zona: 'San Salvador' },
        items: [{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]
      }));
      await page.reload();
      await page.locator('.product-card[data-producto]').first().waitFor();
      await settle(page, 1200);
      await shot('01-top');
      await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }));
      await settle(page, 1500);
      await shot('00-full', { fullPage: true });

      await page.evaluate(() => document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant' }));
      await settle(page, 1000);
      await shot('02-catalog');
      await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'instant' }));
      await settle(page, 1500);
      await shot('03-catalog-more');
      await page.evaluate(() => document.querySelector('.grid-note, #como-funciona').scrollIntoView({ behavior: 'instant', block: 'end' }));
      await settle(page, 1500);
      await shot('03b-catalog-end');

      await page.locator('.product-card[data-producto="wnw-clasicos"] .product-card__open').click();
      await settle(page, 700);
      await shot('04-modal');
      await page.keyboard.press('Escape');
      await settle(page, 400);

      await page.locator('.product-card[data-producto="elf-bronzer"] .product-card__open').click();
      await settle(page, 700);
      await shot('05-modal-agotado');
      await page.keyboard.press('Escape');
      await settle(page, 400);

      await page.locator('.product-card[data-producto="elf-brow-pencil"] .product-card__cta').click();
      await page.locator('.product-card[data-producto="langmanni-set"] .product-card__cta').click();
      await page.locator('.product-card[data-producto="elf-bronzer"] .product-card__cta').click();
      await settle(page, 300);
      await shot('06-toast');
      await page.locator('#cart-button').click();
      await settle(page, 700);
      await shot('07-cart');

      await page.getByRole('button', { name: 'Continuar' }).click();
      await settle(page, 400);
      await page.getByLabel('Nombre completo').fill('Ana Martínez');
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();
      await settle(page, 300);
      await shot('08-checkout-errors');
      await page.getByLabel('WhatsApp').fill('+503 7000-1234');
      await page.getByLabel('Dirección o zona').fill('Santa Tecla, La Libertad');
      await page.getByRole('button', { name: 'Confirmar pedido' }).click();
      await page.getByRole('heading', { name: 'Pedido recibido' }).waitFor();
      await settle(page, 500);
      await shot('09-confirmation');
      await context.close();
    }

    // Estados de carga y error, en celular.
    const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(server.url + '?mock=fail#catalogo');
    await p.waitForTimeout(150);
    await p.evaluate(() => document.querySelector('#catalogo').scrollIntoView({ behavior: 'instant' }));
    await p.screenshot({ path: path.join(OUT, 'mobile-10-skeleton.png') });
    await p.getByText('No pudimos cargar el catálogo.').waitFor();
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, 'mobile-11-error.png') });
    await ctx.close();

    // Conflicto de existencias al confirmar.
    const c2 = await browser.newContext({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 1 });
    const q = await c2.newPage();
    await q.goto(server.url + '?mock=conflict');
    await q.locator('.product-card[data-producto]').first().waitFor();
    await q.locator('.product-card[data-producto="elf-brow-pencil"] .product-card__cta').click();
    await q.locator('.product-card[data-producto="elf-brow-pencil"] .product-card__cta').click();
    await q.locator('#cart-button').click();
    await q.getByRole('button', { name: 'Continuar' }).click();
    await q.getByLabel('Nombre completo').fill('Ana Martínez');
    await q.getByLabel('WhatsApp').fill('70001234');
    await q.getByLabel('Dirección o zona').fill('Escalón, San Salvador');
    await q.getByRole('button', { name: 'Confirmar pedido' }).click();
    await q.locator('.notice').waitFor();
    await q.waitForTimeout(500);
    await q.screenshot({ path: path.join(OUT, 'desktop-12-conflict.png') });
    await c2.close();
    console.log('Capturas en ' + OUT);
  } finally {
    await browser.close();
    await server.close();
  }
})();
