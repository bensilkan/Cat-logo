const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const seed = require('../../data/products.seed.json');

const PROD_HEADER = ['sku', 'producto_id', 'marca', 'nombre', 'variante', 'categoria', 'precio', 'existencias', 'desc_atractiva', 'virtud', 'tecnica', 'imagen', 'visible'];
const PED_HEADER = ['pedido_id', 'fecha', 'tipo', 'nombre', 'whatsapp', 'direccion_zona', 'resumen', 'total_reserva', 'total_encargo', 'estado', 'notas'];
const LIN_HEADER = ['pedido_id', 'sku', 'cantidad', 'tipo_linea', 'precio_unit'];

function load() {
  const ctx = vm.createContext({ console });
  ['logic.js', 'Code.gs'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}

function fakeSheet(rows) {
  return {
    rows,
    failWrite: false,
    getDataRange() { return { getValues: () => rows.map((r) => r.slice()) }; },
    getLastRow() { return rows.length; },
    getLastColumn() { return rows.reduce((m, r) => Math.max(m, r.length), 0); },
    getRange(r, c, nr, nc) {
      const self = this;
      return {
        getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
        setValues(vals) {
          if (self.failWrite) throw new Error('boom');
          vals.forEach((v, i) => { rows[r - 1 + i] = v.slice(); });
        },
      };
    },
  };
}

function fakeSs(tabs) {
  const sheets = {};
  Object.keys(tabs).forEach((n) => { sheets[n] = fakeSheet(tabs[n]); });
  return { sheets, getSheetByName: (n) => sheets[n] || null };
}

function prodRow(p) { return PROD_HEADER.map((h) => p[h]); }

function makeSs(products, pedidos, lineas) {
  return fakeSs({
    'Productos': [PROD_HEADER.slice()].concat(products.map(prodRow)),
    'Pedidos': [PED_HEADER].concat(pedidos || []),
    'Líneas': [LIN_HEADER].concat(lineas || []),
  });
}

const lock = (ok = true) => ({ released: 0, tryLock() { return ok; }, releaseLock() { this.released++; } });
const P = (sku, extra) => Object.assign({}, seed.find((p) => p.sku === sku), extra);
const body = (items) => ({ cliente: { nombre: 'Ana', whatsapp: '+503 7000-1111', direccion_zona: 'San Salvador' }, items });
const NOW = new Date(2026, 10, 7, 10, 0, 0);

test('readTable maps rows by header name, skipping blank rows', () => {
  const c = load();
  const sh = fakeSheet([['b', 'a'], [1, 2], ['', ''], [3, 4]]);
  assert.deepEqual(JSON.parse(JSON.stringify(c.readTable(sh))), [{ b: 1, a: 2 }, { b: 3, a: 4 }]);
});

test('handleCatalog hides visible:false, omits existencias, includes disponible', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer'), P('elf-brow-pencil', { visible: false })]);
  const r = c.handleCatalog(ss);
  assert.equal(r.ok, true);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].sku, 'elf-bronzer');
  assert.equal(r.products[0].disponible, 1);
  assert.ok(!('existencias' in r.products[0]));
  assert.ok(r.updatedAt);
});

test('handleCatalog tolerates hand-edited sheets', () => {
  const c = load();
  const ss = makeSs(
    [
      P('elf-bronzer', { visible: 'sí' }),
      P('elf-brow-pencil', { visible: '' }),
      P('elf-clear-brow', { visible: 'TRUE' }),
      P('wnw-eyeliner', { visible: 'FALSE' }),
      P('wnw-perfectpout-rouge', { sku: '  ' }),
    ],
    [[' 7 ', NOW, 'Reserva', 'x', 'y', 'z', '', 0, 0, ' Cancelado ', '']],
    [
      [7, ' elf-bronzer ', 1, 'reserva ', 14],
      ['R-1', 'elf-brow-pencil ', 1, 'RESERVA', 8],
      ['R-1', 'elf-brow-pencil', 1, ' encargo', 8],
      ['R-1', '', 1, 'Reserva', 8],
    ]
  );
  const r = c.handleCatalog(ss);
  const by = {};
  r.products.forEach((p) => { by[p.sku] = p.disponible; });
  assert.deepEqual(Object.keys(by).sort(), ['elf-bronzer', 'elf-brow-pencil', 'elf-clear-brow']);
  assert.equal(by['elf-bronzer'], 1);      // numeric pedido_id 7 cancelled as ' 7 '
  assert.equal(by['elf-brow-pencil'], 1);  // 2 - 1 reserva; encargo ignored
  assert.equal(by['elf-clear-brow'], 2);
});

test('handleOrder valid appends 1 Pedidos row and N Líneas rows by header', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer'), P('elf-brow-pencil')]);
  const l = lock();
  const r = c.handleOrder(ss, body([
    { sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' },
    { sku: 'elf-brow-pencil', cantidad: 2, tipo: 'Encargo' },
  ]), l, NOW);
  assert.equal(r.ok, true);
  assert.match(r.pedido_id, /^R-261107-\d{4}$/);
  assert.equal(ss.sheets['Pedidos'].rows.length, 2);
  assert.equal(ss.sheets['Líneas'].rows.length, 3);
  assert.equal(ss.sheets['Pedidos'].rows[1][0], r.pedido_id);
  assert.equal(ss.sheets['Pedidos'].rows[1][9], 'Pendiente');
  assert.deepEqual(ss.sheets['Líneas'].rows[1], [r.pedido_id, 'elf-bronzer', 1, 'Reserva', 14]);
  assert.equal(l.released, 1);
});

test('handleOrder writes by header name when columns are reordered', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  ss.sheets['Líneas'].rows[0] = ['precio_unit', 'tipo_linea', 'sku', 'extra', 'cantidad', 'pedido_id'];
  const r = c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]), lock(), NOW);
  assert.deepEqual(ss.sheets['Líneas'].rows[1], [14, 'Reserva', 'elf-bronzer', '', 1, r.pedido_id]);
});

test('handleOrder stores whatsapp as text and neutralizes formula injection', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const b = body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]);
  b.cliente.nombre = '=HYPERLINK("http://x")';
  b.cliente.direccion_zona = '-cmd';
  c.handleOrder(ss, b, lock(), NOW);
  const row = ss.sheets['Pedidos'].rows[1];
  assert.equal(row[3], '\'=HYPERLINK("http://x")');
  assert.equal(row[4], "'+503 7000-1111"); // formula guard only
  assert.equal(row[5], "'-cmd");
  assert.ok(row[1] instanceof Date);
});

test('handleOrder conflict appends nothing and returns sin_existencias', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const l = lock();
  const r = c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 2, tipo: 'Reserva' }]), l, NOW);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'sin_existencias');
  assert.equal(ss.sheets['Pedidos'].rows.length, 1);
  assert.equal(ss.sheets['Líneas'].rows.length, 1);
  assert.equal(l.released, 1);
});

test('two sequential orders for the last unit: second fails', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const it = [{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }];
  assert.equal(c.handleOrder(ss, body(it), lock(), NOW).ok, true);
  const r2 = c.handleOrder(ss, body(it), lock(), NOW);
  assert.equal(r2.error, 'sin_existencias');
  assert.equal(ss.sheets['Pedidos'].rows.length, 2);
});

test('cancelling an order in the sheet frees the unit', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const it = [{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }];
  c.handleOrder(ss, body(it), lock(), NOW);
  ss.sheets['Pedidos'].rows[1][9] = 'Cancelado';
  assert.equal(c.handleOrder(ss, body(it), lock(), NOW).ok, true);
});

test('lock not acquired returns ocupado and writes nothing', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const l = lock(false);
  const r = c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]), l, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { ok: false, error: 'ocupado' });
  assert.equal(ss.sheets['Pedidos'].rows.length, 1);
});

test('handleOrder releases the lock even when an exception is thrown', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  ss.sheets['Pedidos'].failWrite = true;
  const l = lock();
  assert.throws(() => c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]), l, NOW));
  assert.equal(l.released, 1);
});

test('doPost returns error_interno JSON on bad input', () => {
  const c = load();
  c.ContentService = {
    MimeType: { JSON: 'json' },
    createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }),
  };
  c.SpreadsheetApp = { getActiveSpreadsheet: () => { throw new Error('no ss'); } };
  c.LockService = { getScriptLock: () => lock() };
  const r = c.doPost({ postData: { contents: 'not json' } });
  assert.deepEqual(JSON.parse(r.text), { ok: false, error: 'error_interno' });
});

test('handleOrder flushes before releasing the lock', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  const events = [];
  const l = { tryLock: () => true, releaseLock: () => events.push('release') };
  const r = c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]), l, NOW, { flush: () => events.push('flush') });
  assert.equal(r.ok, true);
  assert.deepEqual(events, ['flush', 'release']);
});

test('pedido_id collision is regenerated under the lock', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer'), P('elf-brow-pencil')]);
  const it = (sku) => [{ sku, cantidad: 1, tipo: 'Reserva' }];
  const r1 = c.handleOrder(ss, body(it('elf-bronzer')), lock(), NOW, { rand: () => 0.1234 });
  assert.equal(r1.pedido_id, 'R-261107-1234');
  const seq = [0.1234, 0.1234, 0.5678];
  const r2 = c.handleOrder(ss, body(it('elf-brow-pencil')), lock(), NOW, { rand: () => seq.shift() });
  assert.equal(r2.pedido_id, 'R-261107-5678');
  assert.equal(ss.sheets['Líneas'].rows[2][0], 'R-261107-5678');
});

test('pedido_id falls back to a longer suffix when rand keeps colliding', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer'), P('elf-brow-pencil')]);
  c.handleOrder(ss, body([{ sku: 'elf-bronzer', cantidad: 1, tipo: 'Reserva' }]), lock(), NOW, { rand: () => 0.1234 });
  const r = c.handleOrder(ss, body([{ sku: 'elf-brow-pencil', cantidad: 1, tipo: 'Reserva' }]), lock(), NOW, { rand: () => 0.1234 });
  assert.match(r.pedido_id, /^R-261107-1234-\d{3}$/);
  assert.equal(ss.sheets['Líneas'].rows[2][0], r.pedido_id);
});

test('handleCatalog never exposes extra private columns', () => {
  const c = load();
  const ss = makeSs([P('elf-bronzer')]);
  ss.sheets['Productos'].rows[0].push('costo', 'proveedor');
  ss.sheets['Productos'].rows[1].push(3.2, 'Acme');
  const out = c.handleCatalog(ss).products[0];
  assert.ok(!('costo' in out) && !('proveedor' in out) && !('existencias' in out));
  assert.deepEqual(Object.keys(out).sort(), PROD_HEADER.filter((h) => h !== 'existencias').concat('disponible').sort());
});
