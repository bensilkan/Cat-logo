// Apps Script web app: catálogo y reservas. Usa las funciones puras de logic.js
// y la constante SEED_PRODUCTS de Seed.gs (los tres archivos comparten ámbito global).

var PRODUCT_HEADERS = ['sku', 'producto_id', 'marca', 'nombre', 'variante', 'categoria', 'precio', 'existencias', 'desc_atractiva', 'virtud', 'tecnica', 'imagen', 'visible'];
var PEDIDO_HEADERS = ['pedido_id', 'fecha', 'tipo', 'nombre', 'whatsapp', 'direccion_zona', 'resumen', 'total_reserva', 'total_encargo', 'estado', 'notas'];
var LINEA_HEADERS = ['pedido_id', 'sku', 'cantidad', 'tipo_linea', 'precio_unit'];
var ESTADOS = ['Pendiente', 'Confirmado', 'Entregado', 'Cancelado'];
var TAB_PRODUCTOS = 'Productos';
var TAB_PEDIDOS = 'Pedidos';
var TAB_LINEAS = 'Líneas';

// ---------- Lectura de hojas ----------

function readTable(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var blank = row.every(function (v) { return v === '' || v === null || v === undefined; });
    if (blank) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) obj[headers[j]] = row[j];
    }
    rows.push(obj);
  }
  return rows;
}

function isTruthyVisible(v) {
  if (v === '' || v === null || v === undefined) return true;
  if (v === true || v === 1) return true;
  var s = String(v).trim().toLowerCase();
  return s === 'true' || s === 'si' || s === 'sí' || s === '1' || s === 'verdadero';
}

function canonTipoLinea(v) {
  var s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (s === 'reserva') return 'Reserva';
  if (s === 'encargo') return 'Encargo';
  return String(v === null || v === undefined ? '' : v).trim();
}

function requireSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Falta la pestaña ' + name);
  return sh;
}

// Lee las tres pestañas y normaliza lo que una persona pudo editar a mano.
function loadData(ss) {
  var products = readTable(requireSheet(ss, TAB_PRODUCTOS)).map(function (p) {
    p.sku = String(p.sku === null || p.sku === undefined ? '' : p.sku).trim();
    return p;
  }).filter(function (p) { return p.sku !== ''; });
  var pedidos = readTable(requireSheet(ss, TAB_PEDIDOS)).map(function (p) {
    p.pedido_id = String(p.pedido_id === null || p.pedido_id === undefined ? '' : p.pedido_id).trim();
    return p;
  });
  var lineas = readTable(requireSheet(ss, TAB_LINEAS)).map(function (l) {
    l.pedido_id = String(l.pedido_id === null || l.pedido_id === undefined ? '' : l.pedido_id).trim();
    l.sku = String(l.sku === null || l.sku === undefined ? '' : l.sku).trim();
    l.tipo_linea = canonTipoLinea(l.tipo_linea);
    return l;
  }).filter(function (l) { return l.sku !== ''; });
  return { products: products, pedidos: pedidos, lineas: lineas };
}

// ---------- Escritura ----------

// Texto seguro para la hoja: evita que =, +, -, @ al inicio se interpreten como fórmula.
function safeText(v) {
  var s = String(v === null || v === undefined ? '' : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Agrega varias filas de una vez, ordenando los valores según los encabezados de la hoja.
function appendRowsByHeader(sheet, objs) {
  if (!objs.length) return;
  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0];
  var rows = objs.map(function (obj) {
    return headers.map(function (h) {
      var key = String(h).trim();
      return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : '';
    });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, width).setValues(rows);
}

// ---------- Manejadores ----------

function handleCatalog(ss, now) {
  var d = loadData(ss);
  var avail = computeAvailability(d.products, d.pedidos, d.lineas);
  var products = d.products.filter(function (p) {
    return isTruthyVisible(p.visible);
  }).map(function (p) {
    var out = {};
    PRODUCT_HEADERS.forEach(function (k) {
      if (k !== 'existencias') out[k] = p[k] === undefined ? '' : p[k];
    });
    out.visible = true;
    out.disponible = avail[p.sku];
    return out;
  });
  return { ok: true, products: products, updatedAt: (now || new Date()).toISOString() };
}

// deps (opcional): { rand, flush } para pruebas.
function handleOrder(ss, body, lock, now, deps) {
  deps = deps || {};
  if (!lock.tryLock(10000)) return { ok: false, error: 'ocupado' };
  try {
    var d = loadData(ss);
    var visibles = d.products.filter(function (p) { return isTruthyVisible(p.visible); });
    var avail = computeAvailability(d.products, d.pedidos, d.lineas);
    var check = validateOrder(body, visibles, avail);
    if (!check.ok) return check;

    // Número de pedido único: se regenera mientras ya exista en la hoja.
    var existing = {};
    d.pedidos.forEach(function (x) { existing[x.pedido_id] = true; });
    var rec = buildOrderRecord(body, check.lines, now, deps.rand);
    for (var tries = 0; existing[rec.pedido.pedido_id] && tries < 20; tries++) {
      rec = buildOrderRecord(body, check.lines, now, deps.rand);
    }
    while (existing[rec.pedido.pedido_id]) {
      var longId = rec.pedido.pedido_id + '-' + pad(Math.floor(Math.random() * 1000), 3);
      rec.pedido.pedido_id = longId;
      rec.lineas.forEach(function (l) { l.pedido_id = longId; });
    }

    var p = rec.pedido;
    p.nombre = safeText(p.nombre);
    p.whatsapp = safeText(p.whatsapp);
    p.direccion_zona = safeText(p.direccion_zona);
    p.resumen = safeText(p.resumen);
    appendRowsByHeader(requireSheet(ss, TAB_PEDIDOS), [p]);
    appendRowsByHeader(requireSheet(ss, TAB_LINEAS), rec.lineas);
    // Confirmar las escrituras antes de soltar el candado, para que el siguiente pedido las vea.
    if (deps.flush) deps.flush();
    else if (typeof SpreadsheetApp !== 'undefined') SpreadsheetApp.flush();
    return { ok: true, pedido_id: p.pedido_id };
  } finally {
    lock.releaseLock();
  }
}

// ---------- Puntos de entrada web ----------

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action !== 'catalog') return jsonOut({ ok: false, error: 'accion_invalida' });
    return jsonOut(handleCatalog(SpreadsheetApp.getActiveSpreadsheet()));
  } catch (err) {
    return jsonOut({ ok: false, error: 'error_interno' });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    return jsonOut(handleOrder(SpreadsheetApp.getActiveSpreadsheet(), body, LockService.getScriptLock(), new Date()));
  } catch (err) {
    return jsonOut({ ok: false, error: 'error_interno' });
  }
}

// ---------- Preparación de la hoja (ejecutar una vez desde el editor) ----------

function ensureTab(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  var width = Math.max(sh.getLastColumn(), headers.length);
  sh.getRange(1, 1, 1, width)
    .setBackground('#6E2A3F').setFontColor('#FAF6F1').setFontWeight('bold');
  sh.setFrozenRows(1);
  return sh;
}

function columnOf(sh, header) {
  var hs = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < hs.length; i++) if (String(hs[i]).trim() === header) return i + 1;
  return 0;
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var prod = ensureTab(ss, TAB_PRODUCTOS, PRODUCT_HEADERS);
  var ped = ensureTab(ss, TAB_PEDIDOS, PEDIDO_HEADERS);
  ensureTab(ss, TAB_LINEAS, LINEA_HEADERS);

  var estadoCol = columnOf(ped, 'estado');
  if (estadoCol) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(ESTADOS, true).setAllowInvalid(false).build();
    ped.getRange(2, estadoCol, 1000, 1).setDataValidation(rule);
  }

  if (prod.getLastRow() <= 1) {
    var headers = prod.getRange(1, 1, 1, prod.getLastColumn()).getValues()[0];
    var rows = SEED_PRODUCTS.map(function (p) {
      return headers.map(function (h) {
        var k = String(h).trim();
        return Object.prototype.hasOwnProperty.call(p, k) ? p[k] : '';
      });
    });
    prod.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}
