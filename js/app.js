// Arranque y estado del catálogo: carga del inventario, sondeo, carrito y envío del pedido.
(function () {
  'use strict';

  var cfg = window.CATALOG_CONFIG || {};
  var api = window.CatalogAPI;
  var ui = window.CatalogUI;
  var POLL_MS = Number(cfg.POLL_MS) > 0 ? Number(cfg.POLL_MS) : 20000;

  function safeStorage() {
    try {
      var s = window.localStorage;
      s.getItem('catalogo.test');
      return s;
    } catch (e) { return null; }
  }

  var cart = window.Cart.createCart(safeStorage());

  var state = {
    status: 'loading',      // loading | ready | error
    products: null,
    bySku: {},
    groups: [],
    brands: [],
    filter: { categoria: 'Todo', marca: '' },
    selected: {},           // producto_id -> sku elegido
    modal: null,            // producto_id abierto en la ficha
    modalQty: 1,
    notice: [],             // [{ sku, cantidad, disponible }] reservas que exceden lo disponible
    step: 'cart',           // cart | checkout | done
    form: { nombre: '', whatsapp: '', direccion_zona: '' },
    errors: {},
    formError: '',
    submitting: false,
    lastOrder: null
  };

  function inCart(sku, tipo) {
    var n = 0;
    cart.lines().forEach(function (l) { if (l.sku === sku && l.tipo === tipo) n += l.cantidad; });
    return n;
  }

  // ---------- Catálogo ----------

  function normalize(p) {
    var o = {};
    Object.keys(p).forEach(function (k) { o[k] = p[k]; });
    o.sku = String(p.sku || '').trim();
    o.producto_id = String(p.producto_id || '').trim() || o.sku;
    o.variante = p.variante === null || p.variante === undefined ? '' : String(p.variante).trim();
    o.precio = toNumber(p.precio);
    o.disponible = Math.max(0, Math.floor(toNumber(p.disponible)));
    o.visible = p.visible !== false;
    return o;
  }

  function applyCatalog(list) {
    var products = list.map(normalize).filter(function (p) { return p.sku && p.visible; });
    var bySku = {};
    var groups = [];
    var byId = {};
    var brands = [];
    products.forEach(function (p) {
      bySku[p.sku] = p;
      var g = byId[p.producto_id];
      if (!g) {
        g = byId[p.producto_id] = { id: p.producto_id, marca: p.marca, categoria: p.categoria, items: [] };
        groups.push(g);
      }
      g.items.push(p);
      if (brands.indexOf(p.marca) < 0) brands.push(p.marca);
    });
    groups.forEach(function (g) {
      var current = state.selected[g.id];
      var still = g.items.some(function (p) { return p.sku === current; });
      if (!still) {
        var firstAvailable = g.items.filter(function (p) { return p.disponible > 0; })[0];
        state.selected[g.id] = (firstAvailable || g.items[0]).sku;
      }
    });
    state.products = products;
    state.bySku = bySku;
    state.groups = groups;
    state.brands = brands;
    if (state.filter.marca && brands.indexOf(state.filter.marca) < 0) state.filter.marca = '';
    setNotice(cart.reconcile(bySku));
  }

  var lastNoticeKey = '';
  function setNotice(over) {
    state.notice = over;
    var key = over.map(function (n) { return n.sku + ':' + n.cantidad + ':' + n.disponible; }).join('|');
    if (key && key !== lastNoticeKey && !ui.isDrawerOpen()) {
      ui.toast('Las existencias de tu pedido cambiaron.', 'Revisar', function () { actions.openCart(); });
    }
    lastNoticeKey = key;
  }

  var inflight = null;
  function refresh() {
    if (inflight) return inflight;
    if (!state.products) { state.status = 'loading'; }
    inflight = api.fetchCatalog().then(function (data) {
      applyCatalog(data.products || []);
      state.status = 'ready';
    }, function (err) {
      if (!state.products) state.status = 'error';
      throw err;
    }).finally(function () {
      inflight = null;
      ui.render();
    });
    return inflight;
  }

  function quietRefresh() { return refresh().catch(function () { /* se reintenta en el próximo sondeo */ }); }

  // ---------- Pedido ----------

  function validateForm(f) {
    var errors = {};
    if (!String(f.nombre || '').trim()) errors.nombre = 'Escribe tu nombre completo.';
    if (String(f.whatsapp || '').replace(/\D/g, '').length < 8) errors.whatsapp = 'Escribe un WhatsApp válido (mínimo 8 dígitos).';
    if (!String(f.direccion_zona || '').trim()) errors.direccion_zona = 'Indica tu dirección o la zona de entrega.';
    return errors;
  }

  var SERVER_FIELD_MSG = {
    nombre: 'Revisa tu nombre completo.',
    whatsapp: 'Revisa tu número de WhatsApp (al menos 8 dígitos).',
    direccion_zona: 'Revisa tu dirección o zona.'
  };

  function orderSummary(pedidoId, lines) {
    var out = lines.map(function (l) {
      var p = state.bySku[l.sku] || {};
      return {
        sku: l.sku, tipo: l.tipo, cantidad: l.cantidad,
        marca: p.marca || '', nombre: p.nombre || l.sku, variante: p.variante || '',
        subtotal: Math.round((Number(p.precio) || 0) * l.cantidad * 100) / 100
      };
    });
    return {
      pedido_id: pedidoId,
      nombre: state.form.nombre.trim(),
      lines: out,
      totals: cart.totals(state.bySku)
    };
  }

  function submit() {
    if (state.submitting) return;
    var errors = validateForm(state.form);
    state.errors = errors;
    state.formError = '';
    var firstBad = ['nombre', 'whatsapp', 'direccion_zona'].filter(function (k) { return errors[k]; })[0];
    if (firstBad) { ui.render(); ui.focusField(firstBad); return; }
    if (!cart.lines().length) { state.step = 'cart'; ui.render(); return; }

    state.submitting = true;
    ui.render();

    // Inventario fresco justo antes de enviar; el servidor vuelve a validar de todos modos.
    refresh().catch(function () { /* si falla, el envío dirá si hay red */ }).then(function () {
      if (state.notice.length) {
        state.submitting = false;
        state.formError = 'Las existencias cambiaron. Revisa el aviso de arriba antes de confirmar.';
        ui.render();
        return;
      }
      var lines = cart.lines();
      if (!lines.length) { state.submitting = false; state.step = 'cart'; ui.render(); return; }
      var order = {
        cliente: {
          nombre: state.form.nombre.trim(),
          whatsapp: state.form.whatsapp.trim(),
          direccion_zona: state.form.direccion_zona.trim()
        },
        items: lines.map(function (l) { return { sku: l.sku, cantidad: l.cantidad, tipo: l.tipo }; })
      };
      return api.submitOrder(order).catch(function () { return { ok: false, error: 'red' }; }).then(function (res) {
        state.submitting = false;
        handleResult(res || { ok: false, error: 'error_interno' }, lines);
      });
    });
  }

  function handleResult(res, lines) {
    if (res.ok && res.pedido_id) {
      state.lastOrder = orderSummary(res.pedido_id, lines);
      state.step = 'done';
      state.errors = {};
      state.formError = '';
      state.form = { nombre: '', whatsapp: '', direccion_zona: '' };
      cart.clear();
      ui.render();
      quietRefresh();
      return;
    }
    switch (res.error) {
      case 'datos_cliente':
        state.errors = {};
        state.errors[res.campo] = SERVER_FIELD_MSG[res.campo] || 'Revisa este dato.';
        ui.render();
        ui.focusField(res.campo);
        return;
      case 'sin_existencias':
        (res.conflictos || []).forEach(function (c) {
          if (state.bySku[c.sku]) state.bySku[c.sku].disponible = Math.max(0, toNumber(c.disponible));
        });
        state.notice = (res.conflictos || []).map(function (c) {
          return { sku: c.sku, cantidad: inCart(c.sku, 'Reserva') || c.pedido, disponible: Math.max(0, toNumber(c.disponible)) };
        });
        lastNoticeKey = state.notice.map(function (n) { return n.sku + ':' + n.cantidad + ':' + n.disponible; }).join('|');
        state.formError = 'Alguien confirmó antes que tú algunas piezas. Elige qué hacer con ellas y vuelve a confirmar.';
        ui.render();
        quietRefresh();
        return;
      case 'encargo_maximo':
        state.formError = 'Puedes encargar hasta 10 unidades de cada producto. Ajusta tus encargos y vuelve a confirmar.';
        break;
      case 'item_invalido':
        state.formError = 'Algún producto de tu pedido ya no está disponible en el catálogo. Revisa tu pedido y vuelve a confirmar.';
        quietRefresh();
        break;
      case 'ocupado':
        state.formError = 'Estamos recibiendo varios pedidos a la vez. Espera unos segundos y vuelve a confirmar; tu pedido sigue guardado.';
        break;
      default:
        state.formError = 'No pudimos enviar tu pedido. Revisa tu conexión y vuelve a intentarlo; tu pedido sigue guardado.';
    }
    ui.render();
  }

  // ---------- Acciones de la vista ----------

  var actions = {
    retry: function () {
      state.status = 'loading';
      ui.render();
      quietRefresh();
    },
    setFilter: function (categoria, marca) {
      state.filter = { categoria: categoria || 'Todo', marca: marca || '' };
      ui.render();
    },
    selectTone: function (productoId, sku) {
      state.selected[productoId] = sku;
      state.modalQty = 1;
      ui.render();
    },
    add: function (sku, tipo, qty, fromModal) {
      var p = state.bySku[sku];
      if (!p) return;
      var r = cart.add(sku, tipo, qty, p.disponible);
      if (!r.ok) {
        ui.toast(tipo === 'Encargo' ? 'Puedes encargar hasta 10 unidades por producto.' : 'No hay más unidades disponibles');
        return;
      }
      if (fromModal) actions.closeProduct();
      var what = r.added > 1 ? r.added + ' piezas' : p.nombre;
      ui.toast((tipo === 'Reserva' ? 'Reservado: ' : 'Encargado: ') + what, 'Ver pedido', function () { actions.openCart(); });
      var badge = document.getElementById('cart-count');
      badge.classList.add('is-bump');
      setTimeout(function () { badge.classList.remove('is-bump'); }, 260);
    },
    openProduct: function (productoId, from) {
      state.modal = productoId;
      state.modalQty = 1;
      ui.openModal(from);
    },
    closeProduct: function () {
      ui.closeModal();
      state.modal = null;
    },
    openCart: function (from) {
      if (state.modal) actions.closeProduct();
      if (state.step === 'done' && !state.lastOrder) state.step = 'cart';
      ui.openDrawer(from || document.getElementById('cart-button'));
    },
    closeCart: function (toCatalog) {
      ui.closeDrawer();
      if (state.step === 'done') { state.step = 'cart'; state.lastOrder = null; }
      if (toCatalog) {
        var c = document.getElementById('catalogo');
        c.scrollIntoView();
        c.focus({ preventScroll: true });
      }
    },
    setQty: function (sku, tipo, n) {
      var p = state.bySku[sku];
      cart.setQty(sku, tipo, n, p ? p.disponible : 0);
    },
    remove: function (sku, tipo) { cart.remove(sku, tipo); },
    resolveNotice: function (sku, how) {
      var n = state.notice.filter(function (x) { return x.sku === sku; })[0];
      var disp = n ? n.disponible : 0;
      var reserved = inCart(sku, 'Reserva');
      // Solo se mueve o se quita lo que excede; lo que sí está disponible queda reservado.
      if (reserved > disp) {
        if (disp > 0) {
          cart.setQty(sku, 'Reserva', disp, disp);
          if (how === 'encargo') cart.add(sku, 'Encargo', reserved - disp, 0);
        } else if (how === 'encargo') {
          cart.moveToEncargo(sku);
        } else {
          cart.remove(sku, 'Reserva');
        }
      }
      state.notice = state.notice.filter(function (x) { return x.sku !== sku; });
      lastNoticeKey = '';
      if (!state.notice.length) state.formError = '';
      ui.render();
    },
    goCheckout: function () {
      if (!cart.lines().length) return;
      state.step = 'checkout';
      state.formError = '';
      ui.render();
      ui.focusField('nombre');
    },
    backToCart: function () {
      state.step = 'cart';
      ui.render();
    },
    submit: submit,
    finish: function () { actions.closeCart(true); }
  };

  // Al cambiar el carrito (aquí o al reconciliar), refrescar la vista.
  cart.subscribe(function () { ui.render(); });

  ui.init({ state: state, cart: cart, actions: actions, inCart: inCart });
  quietRefresh();

  setInterval(function () { if (!document.hidden) quietRefresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) quietRefresh(); });
})();
