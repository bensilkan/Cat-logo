(function () {
  var KEY = 'catalogo.cart.v1';
  var CAP = 10;
  var RESERVA = 'Reserva';
  var ENCARGO = 'Encargo';

  function validLine(l) {
    return l && typeof l === 'object' && typeof l.sku === 'string' && l.sku !== '' &&
      (l.tipo === RESERVA || l.tipo === ENCARGO) &&
      typeof l.cantidad === 'number' && isFinite(l.cantidad) && l.cantidad >= 1 &&
      Math.floor(l.cantidad) === l.cantidad;
  }

  function createCart(storage) {
    var items = [];
    var listeners = [];

    function load() {
      try {
        var raw = storage && storage.getItem(KEY);
        if (!raw) return;
        var data = JSON.parse(raw);
        if (!data || data.v !== 1 || !Array.isArray(data.lines)) return;
        items = data.lines.filter(validLine).map(function (l) {
          return { sku: l.sku, cantidad: Math.min(l.cantidad, 9999), tipo: l.tipo };
        });
      } catch (e) { items = []; }
    }

    function save() {
      try { storage.setItem(KEY, JSON.stringify({ v: 1, lines: items })); } catch (e) { /* keep in memory */ }
      listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } });
    }

    function find(sku, tipo) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].sku === sku && items[i].tipo === tipo) return items[i];
      }
      return null;
    }
    function drop(line) { items = items.filter(function (l) { return l !== line; }); }
    function inCart(sku, tipo) { var l = find(sku, tipo); return l ? l.cantidad : 0; }
    function cap(tipo, disponible) { return tipo === ENCARGO ? CAP : Math.max(0, Math.floor(Number(disponible) || 0)); }
    function int(n) { n = Math.floor(Number(n)); return isFinite(n) ? n : 0; }

    load();

    return {
      lines: function () {
        return items.map(function (l) { return { sku: l.sku, cantidad: l.cantidad, tipo: l.tipo }; });
      },
      add: function (sku, tipo, cantidad, disponible) {
        if (tipo !== RESERVA && tipo !== ENCARGO) return { ok: false, added: 0 };
        var room = cap(tipo, disponible) - inCart(sku, tipo);
        var added = Math.max(0, Math.min(int(cantidad), room));
        if (added > 0) {
          var line = find(sku, tipo);
          if (line) line.cantidad += added;
          else items.push({ sku: sku, cantidad: added, tipo: tipo });
          save();
        }
        return { ok: added > 0, added: added };
      },
      setQty: function (sku, tipo, n, disponible) {
        var line = find(sku, tipo);
        if (!line) return;
        n = int(n);
        if (n <= 0) drop(line);
        else line.cantidad = Math.min(n, cap(tipo, disponible));
        if (line.cantidad <= 0) drop(line);
        save();
      },
      remove: function (sku, tipo) {
        var line = find(sku, tipo);
        if (line) { drop(line); save(); }
      },
      clear: function () { items = []; save(); },
      moveToEncargo: function (sku) {
        var r = find(sku, RESERVA);
        if (!r) return;
        var e = find(sku, ENCARGO);
        if (e) e.cantidad = Math.min(CAP, e.cantidad + r.cantidad);
        else items.push({ sku: sku, cantidad: Math.min(CAP, r.cantidad), tipo: ENCARGO });
        drop(r);
        save();
      },
      reconcile: function (productsBySku) {
        var map = productsBySku || {};
        var before = items.length;
        items = items.filter(function (l) {
          var p = map[l.sku];
          return p && p.visible;
        });
        var over = [];
        items.forEach(function (l) {
          if (l.tipo !== RESERVA) return;
          var disp = Number(map[l.sku].disponible) || 0;
          if (l.cantidad > disp) over.push({ sku: l.sku, cantidad: l.cantidad, disponible: disp });
        });
        if (items.length !== before) save();
        return over;
      },
      totals: function (productsBySku) {
        var map = productsBySku || {};
        var res = 0, enc = 0, count = 0;
        items.forEach(function (l) {
          var p = map[l.sku];
          if (!p) return;
          var sub = (Number(p.precio) || 0) * l.cantidad;
          if (l.tipo === RESERVA) res += sub; else enc += sub;
          count += l.cantidad;
        });
        var r = function (x) { return Math.round(x * 100) / 100; };
        return { reserva: r(res), encargo: r(enc), total: r(res + enc), count: count };
      },
      subscribe: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
      }
    };
  }

  var api = { createCart: createCart };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') window.Cart = api;
})();
