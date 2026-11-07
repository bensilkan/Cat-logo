// Pure order logic. No dependencies: pasted unchanged into Google Apps Script,
// loaded in the browser via <script>, and required from Node tests.

function toNumber(v) {
  if (typeof v === 'string') {
    // Acepta "12,50", " $12.50 " y similares (coma decimal escrita a mano en la hoja).
    v = v.replace(/^\s*\$?\s*/, '').replace(/\s+$/, '').replace(',', '.');
  }
  var n = Number(v);
  return isFinite(n) && v !== '' && v !== null && v !== undefined ? n : 0;
}

function isCancelled(estado) {
  return String(estado === null || estado === undefined ? '' : estado).trim().toLowerCase() === 'cancelado';
}

function computeAvailability(products, pedidos, lineas) {
  var cancelled = {};
  pedidos.forEach(function (p) {
    if (isCancelled(p.estado)) cancelled[p.pedido_id] = true;
  });
  var avail = {};
  products.forEach(function (p) {
    avail[p.sku] = toNumber(p.existencias);
  });
  lineas.forEach(function (l) {
    if (l.tipo_linea !== 'Reserva' || cancelled[l.pedido_id]) return;
    if (!Object.prototype.hasOwnProperty.call(avail, l.sku)) return;
    avail[l.sku] -= toNumber(l.cantidad);
  });
  Object.keys(avail).forEach(function (sku) {
    if (avail[sku] < 0) avail[sku] = 0;
  });
  return avail;
}

var ENCARGO_MAX = 10;

function validateOrder(order, products, availability) {
  var cliente = (order && order.cliente) || {};
  var nombre = String(cliente.nombre === undefined || cliente.nombre === null ? '' : cliente.nombre).trim();
  var zona = String(cliente.direccion_zona === undefined || cliente.direccion_zona === null ? '' : cliente.direccion_zona).trim();
  var digits = String(cliente.whatsapp === undefined || cliente.whatsapp === null ? '' : cliente.whatsapp).replace(/\D/g, '');
  if (!nombre) return { ok: false, error: 'datos_cliente', campo: 'nombre' };
  if (digits.length < 8) return { ok: false, error: 'datos_cliente', campo: 'whatsapp' };
  if (!zona) return { ok: false, error: 'datos_cliente', campo: 'direccion_zona' };

  var items = order && order.items;
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'item_invalido' };

  var bySku = {};
  products.forEach(function (p) {
    bySku[p.sku] = p;
  });

  var lines = [];
  var reservado = {};
  var encargado = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i] || {};
    var prod = Object.prototype.hasOwnProperty.call(bySku, it.sku) ? bySku[it.sku] : null;
    var cant = it.cantidad;
    if (!prod || typeof cant !== 'number' || !isFinite(cant) || Math.floor(cant) !== cant || cant < 1 ||
        (it.tipo !== 'Reserva' && it.tipo !== 'Encargo')) {
      return { ok: false, error: 'item_invalido' };
    }
    var bucket = it.tipo === 'Reserva' ? reservado : encargado;
    bucket[it.sku] = (bucket[it.sku] || 0) + cant;
    lines.push({
      sku: it.sku,
      cantidad: cant,
      tipo: it.tipo,
      precio_unit: toNumber(prod.precio),
      marca: prod.marca,
      nombre: prod.nombre,
      variante: prod.variante || ''
    });
  }

  for (var sku in encargado) {
    if (encargado[sku] > ENCARGO_MAX) return { ok: false, error: 'encargo_maximo' };
  }

  var conflictos = [];
  for (var s in reservado) {
    var disponible = toNumber(availability && availability[s]);
    if (reservado[s] > disponible) conflictos.push({ sku: s, pedido: reservado[s], disponible: disponible });
  }
  if (conflictos.length) return { ok: false, error: 'sin_existencias', conflictos: conflictos };

  return { ok: true, lines: lines };
}

function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function formatMoney(n) {
  return '$' + n.toFixed(2);
}

function buildOrderRecord(order, lines, now, rand) {
  now = now || new Date();
  rand = rand || Math.random;
  var yymmdd = pad(now.getFullYear() % 100, 2) + pad(now.getMonth() + 1, 2) + pad(now.getDate(), 2);
  var pedidoId = 'R-' + yymmdd + '-' + pad(Math.floor(rand() * 10000), 4);

  var totalReserva = 0;
  var totalEncargo = 0;
  var tieneReserva = false;
  var tieneEncargo = false;
  var partes = [];
  var lineas = lines.map(function (l) {
    var sub = l.cantidad * l.precio_unit;
    if (l.tipo === 'Reserva') {
      totalReserva += sub;
      tieneReserva = true;
    } else {
      totalEncargo += sub;
      tieneEncargo = true;
    }
    var nombre = [l.marca, l.nombre, l.variante].filter(Boolean).join(' ');
    partes.push(l.cantidad + '× ' + nombre + ' — ' + formatMoney(sub) + ' (' + l.tipo + ')');
    return { pedido_id: pedidoId, sku: l.sku, cantidad: l.cantidad, tipo_linea: l.tipo, precio_unit: l.precio_unit };
  });

  var cliente = (order && order.cliente) || {};
  return {
    pedido: {
      pedido_id: pedidoId,
      fecha: now,
      tipo: tieneReserva && tieneEncargo ? 'Mixto' : tieneReserva ? 'Reserva' : 'Encargo',
      nombre: String(cliente.nombre || '').trim(),
      whatsapp: String(cliente.whatsapp || '').trim(),
      direccion_zona: String(cliente.direccion_zona || '').trim(),
      resumen: partes.join('; '),
      total_reserva: Math.round(totalReserva * 100) / 100,
      total_encargo: Math.round(totalEncargo * 100) / 100,
      estado: 'Pendiente',
      notas: ''
    },
    lineas: lineas
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toNumber: toNumber,
    isCancelled: isCancelled,
    computeAvailability: computeAvailability,
    validateOrder: validateOrder,
    buildOrderRecord: buildOrderRecord
  };
}
