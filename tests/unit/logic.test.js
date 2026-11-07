const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../../apps-script/logic.js');
const seed = require('../../data/products.seed.json');

const { toNumber, isCancelled, computeAvailability, validateOrder, buildOrderRecord } = logic;

const bySku = (sku) => seed.find((p) => p.sku === sku);

test('seed: 14 SKUs with expected prices and stock', () => {
  assert.equal(seed.length, 14);
  assert.equal(new Set(seed.map((p) => p.sku)).size, 14);
  assert.equal(bySku('elf-color-corrector').precio, 9.5);
  assert.equal(bySku('elf-brow-pencil').precio, 8);
  assert.equal(bySku('elf-brow-pencil').existencias, 2);
  assert.equal(bySku('elf-clear-brow').precio, 8);
  assert.equal(bySku('elf-clear-brow').existencias, 2);
  assert.equal(bySku('wnw-eyeliner').precio, 8);
  assert.equal(bySku('wnw-eyeliner').existencias, 2);
  assert.equal(bySku('wnw-perfectpout-rouge').precio, 5.5);
  assert.equal(bySku('wnw-gel-liner').precio, 5.5);
  assert.equal(bySku('nooni-applecherry').precio, 12.5);
  assert.equal(bySku('nooni-applecherry').existencias, 1);
});

test('seed: clasicos are two variants of one product', () => {
  const d = bySku('wnw-clasico-dorado');
  const r = bySku('wnw-clasico-rojizo');
  assert.equal(d.producto_id, 'wnw-clasicos');
  assert.equal(r.producto_id, 'wnw-clasicos');
  assert.equal(d.variante, 'Dorado/Marrón');
  assert.equal(r.variante, 'Rojizo');
  assert.equal(d.precio, 4.5);
  assert.equal(r.existencias, 1);
});

test('seed: images, fields, categories and unit wording', () => {
  const cats = ['Rostro', 'Cejas y pestañas', 'Ojos', 'Labios'];
  for (const p of seed) {
    assert.equal(p.imagen, `img/products/${p.sku}.webp`);
    assert.ok(cats.includes(p.categoria), p.sku);
    assert.equal(p.visible, true);
    for (const k of ['marca', 'nombre', 'desc_atractiva', 'virtud', 'tecnica']) {
      assert.ok(p[k] && p[k].length > 0, `${p.sku}.${k}`);
    }
  }
  for (const sku of ['elf-brow-pencil', 'elf-clear-brow']) {
    const text = JSON.stringify(bySku(sku));
    assert.ok(!/set de 2/i.test(text), sku);
    assert.ok(/unidad/i.test(text), sku);
  }
  const nooni = bySku('nooni-applecherry');
  assert.ok(/applecherry/i.test(nooni.tecnica));
  assert.ok(!/appleberry|appleplum/i.test(nooni.tecnica));
});

test('toNumber and isCancelled', () => {
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber('abc'), 0);
  assert.equal(toNumber('3'), 3);
  assert.equal(toNumber(2), 2);
  assert.equal(isCancelled(' cancelado '), true);
  assert.equal(isCancelled('Cancelado'), true);
  assert.equal(isCancelled('Pendiente'), false);
  assert.equal(isCancelled(undefined), false);
});

test('computeAvailability', () => {
  const products = [{ sku: 'a', existencias: 2 }];
  const lineas = [{ pedido_id: 'P1', sku: 'a', cantidad: 1, tipo_linea: 'Reserva' }];
  assert.deepEqual(computeAvailability(products, [{ pedido_id: 'P1', estado: 'Pendiente' }], lineas), { a: 1 });
  assert.deepEqual(computeAvailability(products, [{ pedido_id: 'P1', estado: ' cancelado ' }], lineas), { a: 2 });
  const enc = [{ pedido_id: 'P1', sku: 'a', cantidad: 5, tipo_linea: 'Encargo' }];
  assert.deepEqual(computeAvailability(products, [{ pedido_id: 'P1', estado: 'Pendiente' }], enc), { a: 2 });
  assert.deepEqual(computeAvailability([{ sku: 'a', existencias: '' }], [], []), { a: 0 });
  const unknown = [{ pedido_id: 'P1', sku: 'zzz', cantidad: 1, tipo_linea: 'Reserva' }];
  assert.deepEqual(computeAvailability(products, [{ pedido_id: 'P1', estado: 'Pendiente' }], unknown), { a: 2 });
  const over = [{ pedido_id: 'P1', sku: 'a', cantidad: 5, tipo_linea: 'Reserva' }];
  assert.deepEqual(computeAvailability(products, [{ pedido_id: 'P1', estado: 'Pendiente' }], over), { a: 0 });
});

const products = [
  { sku: 'a', marca: 'M', nombre: 'Alpha', variante: '', precio: 8, existencias: 2 },
  { sku: 'b', marca: 'N', nombre: 'Beta', variante: 'Rojo', precio: '5.5', existencias: 0 },
];
const cliente = { nombre: 'Ana Pérez', whatsapp: '+503 7012-3456', direccion_zona: 'San Salvador' };
const avail = { a: 1, b: 0 };
const mk = (items, c = cliente) => ({ cliente: c, items });

test('validateOrder: client data', () => {
  let r = validateOrder(mk([{ sku: 'a', cantidad: 1, tipo: 'Reserva' }], { ...cliente, nombre: '  ' }), products, avail);
  assert.deepEqual(r, { ok: false, error: 'datos_cliente', campo: 'nombre' });
  r = validateOrder(mk([{ sku: 'a', cantidad: 1, tipo: 'Reserva' }], { ...cliente, whatsapp: '1234' }), products, avail);
  assert.deepEqual(r, { ok: false, error: 'datos_cliente', campo: 'whatsapp' });
  r = validateOrder(mk([{ sku: 'a', cantidad: 1, tipo: 'Reserva' }], { ...cliente, direccion_zona: '' }), products, avail);
  assert.deepEqual(r, { ok: false, error: 'datos_cliente', campo: 'direccion_zona' });
  r = validateOrder(mk([{ sku: 'a', cantidad: 1, tipo: 'Reserva' }]), products, avail);
  assert.equal(r.ok, true);
});

test('validateOrder: invalid items', () => {
  for (const item of [
    { sku: 'a', cantidad: 0, tipo: 'Reserva' },
    { sku: 'a', cantidad: 1.5, tipo: 'Reserva' },
    { sku: 'nope', cantidad: 1, tipo: 'Reserva' },
    { sku: 'a', cantidad: 1, tipo: 'Otro' },
  ]) {
    assert.equal(validateOrder(mk([item]), products, avail).error, 'item_invalido');
  }
  assert.equal(validateOrder(mk([]), products, avail).error, 'item_invalido');
});

test('validateOrder: stock conflicts', () => {
  let r = validateOrder(mk([{ sku: 'a', cantidad: 2, tipo: 'Reserva' }]), products, avail);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'sin_existencias');
  assert.deepEqual(r.conflictos[0], { sku: 'a', pedido: 2, disponible: 1 });
  r = validateOrder(mk([
    { sku: 'a', cantidad: 1, tipo: 'Reserva' },
    { sku: 'a', cantidad: 1, tipo: 'Reserva' },
  ]), products, avail);
  assert.equal(r.error, 'sin_existencias');
  assert.deepEqual(r.conflictos[0], { sku: 'a', pedido: 2, disponible: 1 });
});

test('validateOrder: encargo limits and enriched lines', () => {
  assert.equal(validateOrder(mk([{ sku: 'b', cantidad: 11, tipo: 'Encargo' }]), products, avail).error, 'encargo_maximo');
  let r = validateOrder(mk([{ sku: 'a', cantidad: 3, tipo: 'Encargo' }]), products, avail);
  assert.equal(r.ok, true);
  r = validateOrder(mk([{ sku: 'b', cantidad: 2, tipo: 'Encargo' }]), products, avail);
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines[0], {
    sku: 'b', cantidad: 2, tipo: 'Encargo', precio_unit: 5.5, marca: 'N', nombre: 'Beta', variante: 'Rojo',
  });
});

test('buildOrderRecord', () => {
  const lines = [
    { sku: 'a', cantidad: 2, tipo: 'Reserva', precio_unit: 8, marca: 'e.l.f. Cosmetics', nombre: 'Instant Lift Brow Pencil', variante: '' },
    { sku: 'b', cantidad: 1, tipo: 'Encargo', precio_unit: 5.5, marca: 'N', nombre: 'Beta', variante: 'Rojo' },
  ];
  const now = new Date(2026, 10, 7, 10, 0, 0);
  const rec = buildOrderRecord({ cliente: { ...cliente, nombre: ' Ana ' } }, lines, now, () => 0.4821);
  assert.match(rec.pedido.pedido_id, /^R-\d{6}-\d{4}$/);
  assert.equal(rec.pedido.pedido_id, 'R-261107-4821');
  assert.equal(rec.pedido.tipo, 'Mixto');
  assert.equal(rec.pedido.total_reserva, 16);
  assert.equal(rec.pedido.total_encargo, 5.5);
  assert.equal(rec.pedido.estado, 'Pendiente');
  assert.equal(rec.pedido.nombre, 'Ana');
  assert.equal(
    rec.pedido.resumen,
    '2× e.l.f. Cosmetics Instant Lift Brow Pencil — $16.00 (Reserva); 1× N Beta Rojo — $5.50 (Encargo)'
  );
  assert.deepEqual(rec.lineas[0], { pedido_id: 'R-261107-4821', sku: 'a', cantidad: 2, tipo_linea: 'Reserva', precio_unit: 8 });
  assert.equal(rec.lineas.length, 2);
});

test('buildOrderRecord: single type and padding', () => {
  const one = [{ sku: 'a', cantidad: 1, tipo: 'Encargo', precio_unit: 8, marca: 'M', nombre: 'Alpha', variante: '' }];
  const rec = buildOrderRecord({ cliente }, one, new Date(2026, 0, 5), () => 0);
  assert.equal(rec.pedido.pedido_id, 'R-260105-0000');
  assert.equal(rec.pedido.tipo, 'Encargo');
  assert.equal(rec.pedido.total_reserva, 0);
});
