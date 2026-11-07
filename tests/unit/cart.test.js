const test = require('node:test');
const assert = require('node:assert/strict');
const { createCart } = require('../../js/cart.js');

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, m };
}
const KEY = 'catalogo.cart.v1';
const P = (sku, precio, extra) => Object.assign({ sku, precio, visible: true, disponible: 5 }, extra);

test('Reserva capped at disponible across repeated adds', () => {
  const c = createCart(fakeStorage());
  assert.deepEqual(c.add('A', 'Reserva', 2, 3), { ok: true, added: 2 });
  assert.deepEqual(c.add('A', 'Reserva', 2, 3), { ok: true, added: 1 });
  assert.deepEqual(c.add('A', 'Reserva', 1, 3), { ok: false, added: 0 });
  assert.deepEqual(c.lines(), [{ sku: 'A', cantidad: 3, tipo: 'Reserva' }]);
});

test('Encargo capped at 10', () => {
  const c = createCart(fakeStorage());
  assert.deepEqual(c.add('A', 'Encargo', 8, 0), { ok: true, added: 8 });
  assert.deepEqual(c.add('A', 'Encargo', 5, 0), { ok: true, added: 2 });
  assert.deepEqual(c.add('A', 'Encargo', 1, 0), { ok: false, added: 0 });
  assert.equal(c.lines()[0].cantidad, 10);
});

test('persistence round-trip', () => {
  const s = fakeStorage();
  const c = createCart(s);
  c.add('A', 'Reserva', 2, 5);
  c.add('B', 'Encargo', 1, 0);
  assert.deepEqual(JSON.parse(s.m.get(KEY)).v, 1);
  const c2 = createCart(s);
  assert.deepEqual(c2.lines(), c.lines());
});

test('corrupted or invalid storage gives empty cart; malformed lines filtered', () => {
  assert.deepEqual(createCart(fakeStorage({ [KEY]: '{not json' })).lines(), []);
  assert.deepEqual(createCart(fakeStorage({ [KEY]: '{"v":2,"lines":[]}' })).lines(), []);
  assert.deepEqual(createCart(fakeStorage({ [KEY]: '[1]' })).lines(), []);
  const good = { sku: 'A', cantidad: 2, tipo: 'Reserva' };
  const s = fakeStorage({ [KEY]: JSON.stringify({ v: 1, lines: [good, { sku: 'B', cantidad: 0, tipo: 'Reserva' }, { sku: 'C', cantidad: 1, tipo: 'X' }, null, { cantidad: 1, tipo: 'Reserva' }] }) });
  assert.deepEqual(createCart(s).lines(), [good]);
});

test('storage exceptions are swallowed', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); } };
  const c = createCart(bad);
  assert.equal(c.add('A', 'Reserva', 1, 2).ok, true);
  assert.equal(c.lines().length, 1);
  assert.doesNotThrow(() => createCart(null));
});

test('setQty, remove, clear', () => {
  const c = createCart(fakeStorage());
  c.add('A', 'Reserva', 1, 5);
  c.setQty('A', 'Reserva', 4, 5);
  assert.equal(c.lines()[0].cantidad, 4);
  c.setQty('A', 'Reserva', 9, 5);
  assert.equal(c.lines()[0].cantidad, 5);
  c.setQty('A', 'Reserva', 0, 5);
  assert.deepEqual(c.lines(), []);
  c.add('A', 'Encargo', 1, 0);
  c.setQty('A', 'Encargo', 99, 0);
  assert.equal(c.lines()[0].cantidad, 10);
  c.remove('A', 'Encargo');
  assert.deepEqual(c.lines(), []);
  c.add('A', 'Encargo', 1, 0);
  c.clear();
  assert.deepEqual(c.lines(), []);
});

test('moveToEncargo merges, caps at 10, persists', () => {
  const s = fakeStorage();
  const c = createCart(s);
  c.add('A', 'Reserva', 3, 5);
  c.add('A', 'Encargo', 2, 0);
  c.moveToEncargo('A');
  assert.deepEqual(c.lines(), [{ sku: 'A', cantidad: 5, tipo: 'Encargo' }]);
  assert.deepEqual(createCart(s).lines(), c.lines());
  c.add('A', 'Encargo', 5, 0);
  c.add('A', 'Reserva', 4, 5);
  c.moveToEncargo('A');
  assert.deepEqual(c.lines(), [{ sku: 'A', cantidad: 10, tipo: 'Encargo' }]);
});

test('reconcile drops hidden/missing skus and reports over-limit Reserva', () => {
  const s = fakeStorage();
  const c = createCart(s);
  c.add('A', 'Reserva', 4, 9);
  c.add('H', 'Reserva', 1, 9);
  c.add('M', 'Encargo', 1, 0);
  c.add('H', 'Encargo', 1, 0);
  const over = c.reconcile({ A: P('A', 1, { disponible: 2 }), H: P('H', 1, { visible: false }) });
  assert.deepEqual(over, [{ sku: 'A', cantidad: 4, disponible: 2 }]);
  assert.deepEqual(c.lines(), [{ sku: 'A', cantidad: 4, tipo: 'Reserva' }]);
  assert.deepEqual(createCart(s).lines(), c.lines());
});

test('totals', () => {
  const c = createCart(fakeStorage());
  c.add('A', 'Reserva', 1, 5);
  c.add('B', 'Encargo', 2, 0);
  c.add('GONE', 'Encargo', 3, 0);
  const t = c.totals({ A: P('A', 9.5), B: P('B', 8) });
  assert.deepEqual(t, { reserva: 9.5, encargo: 16, total: 25.5, count: 3 });
  const c2 = createCart(fakeStorage());
  c2.add('A', 'Reserva', 3, 5);
  assert.equal(c2.totals({ A: P('A', 0.1) }).total, 0.3);
});

test('subscribe fires after mutations', () => {
  const c = createCart(fakeStorage());
  let n = 0;
  const off = c.subscribe(() => n++);
  c.add('A', 'Reserva', 1, 5);
  c.remove('A', 'Reserva');
  assert.equal(n, 2);
  off();
  c.clear();
  assert.equal(n, 2);
});
