// Comunicación con el Apps Script, o con una API simulada en el navegador.
//
// Modo simulado: cuando CATALOG_CONFIG.API_URL está vacío o la URL lleva ?mock=1.
// La simulación usa las MISMAS funciones puras que el servidor (logic.js:
// computeAvailability, validateOrder, buildOrderRecord) sobre pedidos y líneas en memoria,
// sembradas desde data/products.seed.json y guardadas en sessionStorage (sobreviven a recargar).
//
// Ganchos de prueba (solo modo simulado):
//   ?mock=fail      → toda petición falla como un error de red.
//   ?mock=conflict  → en el primer pedido con reservas, la simulación registra antes otra
//                     reserva "de otra persona" que toma todas las unidades del primer SKU
//                     reservado; la validación real responde entonces sin_existencias.
//   CatalogAPI.mockState() → { posts, pedidos, lineas } para inspeccionar lo registrado.
// Con API_URL configurada, los parámetros ?mock=… solo funcionan en localhost / 127.0.0.1:
// en el sitio publicado nadie puede forzar la simulación ni recibir un pedido falso.
(function () {
  var GET_TIMEOUT_MS = 15000;
  // El envío espera más: Apps Script puede tardar y cortar antes podría duplicar el pedido al reintentar.
  var POST_TIMEOUT_MS = 30000;
  var MOCK_KEY = 'catalogo.mock.v1';
  var cfg = window.CATALOG_CONFIG || {};
  var params = new URLSearchParams(window.location.search);
  var isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  var mockParam = cfg.API_URL && !isLocalHost ? null : params.get('mock');
  var mode = mockParam === 'fail' ? 'fail'
    : mockParam === 'conflict' ? 'conflict'
    : (mockParam === '1' || !cfg.API_URL) ? 'mock'
    : 'live';

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function networkError() {
    return new TypeError('Failed to fetch');
  }

  // ---------- API real ----------

  function request(url, options, timeoutMs) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || GET_TIMEOUT_MS);
    var opts = Object.assign({ cache: 'no-store', redirect: 'follow' }, options);
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).finally(function () { clearTimeout(timer); });
  }

  var live = {
    fetchCatalog: function () {
      var sep = cfg.API_URL.indexOf('?') >= 0 ? '&' : '?';
      return request(cfg.API_URL + sep + 'action=catalog', {}, GET_TIMEOUT_MS).then(function (data) {
        if (!data || data.ok === false || !Array.isArray(data.products)) throw new Error('catalogo_invalido');
        return data;
      });
    },
    submitOrder: function (order) {
      // text/plain evita la verificación previa de CORS que Apps Script no responde.
      return request(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(order)
      }, POST_TIMEOUT_MS);
    }
  };

  // ---------- API simulada ----------

  var seedPromise = null;
  function seed() {
    if (!seedPromise) {
      seedPromise = fetch('data/products.seed.json', { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
      seedPromise.catch(function () { seedPromise = null; });
    }
    return seedPromise;
  }

  function loadMock() {
    try {
      var s = JSON.parse(window.sessionStorage.getItem(MOCK_KEY));
      if (s && Array.isArray(s.pedidos) && Array.isArray(s.lineas)) return s;
    } catch (e) { /* sin almacenamiento */ }
    return { pedidos: [], lineas: [], posts: 0, conflictUsed: false };
  }
  var mockData = loadMock();
  function saveMock() {
    try { window.sessionStorage.setItem(MOCK_KEY, JSON.stringify(mockData)); } catch (e) { /* solo memoria */ }
  }

  var mock = {
    fetchCatalog: function () {
      if (mode === 'fail') return delay(300).then(function () { throw networkError(); });
      return Promise.all([seed(), delay(250)]).then(function (res) {
        var products = res[0];
        var avail = computeAvailability(products, mockData.pedidos, mockData.lineas);
        var out = products.filter(function (p) { return p.visible !== false; }).map(function (p) {
          var o = JSON.parse(JSON.stringify(p));
          delete o.existencias;
          o.visible = true;
          o.disponible = avail[p.sku];
          return o;
        });
        return { ok: true, products: out, updatedAt: new Date().toISOString() };
      });
    },
    submitOrder: function (order) {
      mockData.posts = (mockData.posts || 0) + 1;
      saveMock();
      if (mode === 'fail') return delay(400).then(function () { throw networkError(); });
      var body = JSON.parse(JSON.stringify(order)); // como si viajara por la red
      return Promise.all([seed(), delay(450)]).then(function (res) {
        var products = res[0];
        if (mode === 'conflict' && !mockData.conflictUsed) {
          var first = (body.items || []).filter(function (i) { return i && i.tipo === 'Reserva'; })[0];
          if (first) {
            mockData.conflictUsed = true;
            var left = computeAvailability(products, mockData.pedidos, mockData.lineas)[first.sku] || 0;
            if (left > 0) {
              mockData.pedidos.push({ pedido_id: 'R-OTRA-PERSONA', estado: 'Pendiente' });
              mockData.lineas.push({ pedido_id: 'R-OTRA-PERSONA', sku: first.sku, cantidad: left, tipo_linea: 'Reserva', precio_unit: 0 });
            }
          }
        }
        var visibles = products.filter(function (p) { return p.visible !== false; });
        var avail = computeAvailability(products, mockData.pedidos, mockData.lineas);
        var check = validateOrder(body, visibles, avail);
        if (!check.ok) { saveMock(); return check; }
        var taken = {};
        mockData.pedidos.forEach(function (p) { taken[p.pedido_id] = true; });
        var rec = buildOrderRecord(body, check.lines, new Date());
        while (taken[rec.pedido.pedido_id]) rec = buildOrderRecord(body, check.lines, new Date());
        mockData.pedidos.push(rec.pedido);
        Array.prototype.push.apply(mockData.lineas, rec.lineas);
        saveMock();
        return { ok: true, pedido_id: rec.pedido.pedido_id };
      });
    }
  };

  var impl = mode === 'live' ? live : mock;

  window.CatalogAPI = {
    mode: mode,
    fetchCatalog: function () { return impl.fetchCatalog(); },
    submitOrder: function (order) { return impl.submitOrder(order); },
    mockState: function () {
      return JSON.parse(JSON.stringify({
        posts: mockData.posts || 0,
        pedidos: mockData.pedidos.filter(function (p) { return p.pedido_id !== 'R-OTRA-PERSONA'; }),
        lineas: mockData.lineas.filter(function (l) { return l.pedido_id !== 'R-OTRA-PERSONA'; })
      }));
    }
  };
})();
