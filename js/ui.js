// Vista del catálogo: tarjetas, filtros, ficha del producto, carrito, formulario y confirmación.
// Todo el texto que viene de la hoja se inserta con textContent (nunca como HTML).
(function () {
  'use strict';

  var ENCARGO_CAP = typeof ENCARGO_MAX === 'number' ? ENCARGO_MAX : 10;
  // Color de las muestras de tono para productos con varias variantes.
  var SWATCH_COLORS = {
    'wnw-clasico-dorado': '#9A6A4F',
    'wnw-clasico-rojizo': '#B3242B'
  };

  var app = null; // { state, cart, actions, inCart(sku, tipo) }
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  // ---------- Utilidades ----------

  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : children === undefined ? [] : [children]).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function money(n) { return '$' + (Number(n) || 0).toFixed(2); }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function badgeFor(disponible) {
    var d = Number(disponible) || 0;
    if (d >= 3) return { text: 'Disponible', tone: 'ok' };
    if (d === 2) return { text: 'Quedan 2', tone: 'low' };
    if (d === 1) return { text: 'Última unidad', tone: 'low' };
    return { text: 'Agotado', tone: 'out' };
  }

  function altText(p) { return [p.marca, p.nombre, p.variante].filter(Boolean).join(' '); }

  function fullName(p) { return p.variante ? p.nombre + ' — ' + p.variante : p.nombre; }

  // Qué puede hacer la clienta con este SKU ahora mismo.
  function buyState(p) {
    var disp = Number(p.disponible) || 0;
    if (disp > 0) {
      var left = disp - app.inCart(p.sku, 'Reserva');
      return left > 0
        ? { tipo: 'Reserva', max: left, label: 'Reservar', kind: 'primary' }
        : { tipo: 'Reserva', max: 0, label: 'No hay más unidades disponibles', kind: 'done' };
    }
    var leftE = ENCARGO_CAP - app.inCart(p.sku, 'Encargo');
    return leftE > 0
      ? { tipo: 'Encargo', max: leftE, label: 'Encargar para el próximo envío', kind: 'outline' }
      : { tipo: 'Encargo', max: 0, label: 'Máximo de encargo en tu pedido', kind: 'done' };
  }

  function selectedOf(g) {
    var sku = app.state.selected[g.id];
    for (var i = 0; i < g.items.length; i++) if (g.items[i].sku === sku) return g.items[i];
    return g.items[0];
  }

  function groupById(id) {
    var gs = app.state.groups;
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }

  // Vuelve a enfocar el control equivalente después de reconstruir un bloque.
  function keepFocus(container, fn) {
    var a = document.activeElement;
    var key = a && container.contains(a) ? a.getAttribute('data-fk') : null;
    fn();
    if (!key) return;
    var esc = window.CSS && CSS.escape ? CSS.escape(key) : key.replace(/["\\]/g, '\\$&');
    var next = container.querySelector('[data-fk="' + esc + '"]');
    if (next && !next.disabled) next.focus();
    else {
      var fallback = container.querySelector('[data-fk-fallback]') || container.closest('[role="dialog"]');
      if (fallback) fallback.focus();
    }
  }

  function swatchGroup(g, current, onPick, fkPrefix) {
    var wrap = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Tono' });
    g.items.forEach(function (p) {
      var out = (Number(p.disponible) || 0) === 0;
      wrap.appendChild(h('button', {
        type: 'button',
        class: 'swatch' + (out ? ' swatch--out' : ''),
        style: '--swatch:' + (SWATCH_COLORS[p.sku] || '#C9A96E'),
        'aria-pressed': String(p.sku === current.sku),
        'aria-label': 'Tono ' + p.variante + (out ? ' (agotado)' : ''),
        title: p.variante,
        'data-sku': p.sku,
        'data-fk': fkPrefix + p.sku,
        onclick: function (e) { e.stopPropagation(); onPick(p.sku); }
      }));
    });
    return wrap;
  }

  // ---------- Diálogos (ficha y carrito) ----------

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  function makeDialog(root, onRequestClose) {
    var panel = $('[role="dialog"]', root);
    var opener = null;
    var timer = null;
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) onRequestClose();
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); onRequestClose(); return; }
      if (e.key !== 'Tab') return;
      var items = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (n) {
        return n.offsetParent !== null || n === document.activeElement;
      });
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return {
      panel: panel,
      isOpen: function () { return root.dataset.open === 'true'; },
      open: function (from) {
        if (root.dataset.open === 'true') return;
        clearToasts();
        opener = from || document.activeElement;
        clearTimeout(timer);
        root.hidden = false;
        void root.offsetWidth; // permite la transición de entrada
        root.dataset.open = 'true';
        setBackgroundInert();
        var target = panel.querySelector('[data-autofocus]') || panel;
        target.focus({ preventScroll: true });
      },
      close: function () {
        if (root.dataset.open !== 'true') return;
        root.dataset.open = 'false';
        setBackgroundInert();
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        timer = setTimeout(function () { root.hidden = true; }, reduce ? 0 : 320);
        if (opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
        opener = null;
      }
    };
  }

  var modal, drawer;

  function setBackgroundInert() {
    var anyOpen = (modal && modal.isOpen()) || (drawer && drawer.isOpen());
    ['.site-header', 'main', '.site-footer'].forEach(function (sel) {
      var n = $(sel);
      if (n) n.inert = !!anyOpen;
    });
    document.documentElement.classList.toggle('is-locked', !!anyOpen);
  }

  // ---------- Avisos breves ----------

  var toastTimer = null;
  function clearToasts() {
    clearTimeout(toastTimer);
    $('#toasts').replaceChildren();
  }
  function toast(message, actionLabel, action) {
    var region = $('#toasts');
    clearTimeout(toastTimer);
    var node = h('div', { class: 'toast', role: 'status' }, [
      h('span', { class: 'toast__text', text: message }),
      actionLabel ? h('button', {
        type: 'button', class: 'toast__action', text: actionLabel,
        onclick: function () { region.replaceChildren(); action(); }
      }) : null
    ]);
    region.replaceChildren(node);
    requestAnimationFrame(function () { node.classList.add('is-in'); });
    toastTimer = setTimeout(function () {
      node.classList.remove('is-in');
      setTimeout(function () { if (node.parentNode) node.remove(); }, 300);
    }, 3600);
  }

  // ---------- Catálogo ----------

  var cards = {};
  var builtKey = '';
  var shownKey = '';

  function renderFilters() {
    var s = app.state;
    Array.prototype.forEach.call(document.querySelectorAll('#filtro-categoria .chip'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.categoria === s.filter.categoria));
    });
    var sel = $('#filtro-marca');
    var want = [''].concat(s.brands).join('|');
    var have = Array.prototype.map.call(sel.options, function (o) { return o.value; }).join('|');
    if (want !== have) {
      sel.replaceChildren(h('option', { value: '', text: 'Todas las marcas' }));
      s.brands.forEach(function (m) { sel.appendChild(h('option', { value: m, text: m })); });
    }
    sel.value = s.filter.marca;
  }

  function skeleton() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 8; i++) {
      frag.appendChild(h('div', { class: 'product-card product-card--skeleton', 'aria-hidden': 'true' }, [
        h('div', { class: 'sk sk--media' }),
        h('div', { class: 'product-card__body' }, [
          h('div', { class: 'sk sk--line sk--short' }),
          h('div', { class: 'sk sk--line' }),
          h('div', { class: 'sk sk--line sk--mid' }),
          h('div', { class: 'sk sk--btn' })
        ])
      ]));
    }
    return frag;
  }

  function buildCard(g) {
    var refs = {};
    var open = function () { app.actions.openProduct(g.id, refs.open); };
    refs.img = h('img', { class: 'product-card__img', width: '1200', height: '1200', loading: 'lazy', decoding: 'async', alt: '' });
    refs.badge = h('span', { class: 'badge' });
    refs.open = h('button', { type: 'button', class: 'product-card__open', onclick: open }, g.items[0].nombre);
    refs.tone = h('div', { class: 'product-card__tone' });
    refs.desc = h('p', { class: 'product-card__desc' });
    refs.price = h('p', { class: 'product-card__price' });
    refs.cta = h('button', {
      type: 'button', class: 'btn product-card__cta',
      onclick: function () {
        var p = selectedOf(g);
        var b = buyState(p);
        if (b.max <= 0) { toast('No hay más unidades disponibles'); return; }
        app.actions.add(p.sku, b.tipo, 1);
      }
    });
    var art = h('article', {
      class: 'product-card', 'data-producto': g.id, 'data-categoria': g.categoria, 'data-marca': g.marca
    }, [
      h('div', { class: 'product-card__media', onclick: open }, [refs.img, refs.badge]),
      h('div', { class: 'product-card__body' }, [
        h('p', { class: 'product-card__brand', text: g.marca }),
        h('h3', { class: 'product-card__name' }, refs.open),
        refs.tone,
        refs.desc,
        h('div', { class: 'product-card__foot' }, [refs.price, refs.cta])
      ])
    ]);
    art._refs = refs;
    return art;
  }

  function updateCard(card, g) {
    var r = card._refs;
    var p = selectedOf(g);
    var src = p.imagen || '';
    if (r.img.getAttribute('src') !== src) r.img.setAttribute('src', src);
    r.img.alt = altText(p);
    if (r.open.textContent !== p.nombre) r.open.textContent = p.nombre;
    var b = badgeFor(p.disponible);
    r.badge.textContent = b.text;
    r.badge.className = 'badge badge--' + b.tone;
    card.dataset.estado = b.tone === 'out' ? 'agotado' : 'disponible';
    r.desc.textContent = p.desc_atractiva || '';
    r.price.textContent = money(p.precio);
    var buy = buyState(p);
    r.cta.textContent = buy.label;
    r.cta.disabled = buy.max <= 0;
    r.cta.className = 'btn btn--block product-card__cta btn--' + buy.kind;
    r.cta.setAttribute('aria-label', buy.label + ': ' + fullName(p));

    if (g.items.length > 1) {
      keepFocus(r.tone, function () {
        r.tone.replaceChildren(
          swatchGroup(g, p, function (sku) { app.actions.selectTone(g.id, sku); }, 'card-' + g.id + '-'),
          h('span', { class: 'tone-name', text: p.variante })
        );
      });
    } else if (p.variante) {
      var value = r.tone.querySelector('.shade__value');
      if (!value) {
        value = h('span', { class: 'shade__value' });
        r.tone.replaceChildren(h('p', { class: 'shade' }, [h('span', { class: 'shade__label', text: 'Tono' }), value]));
      }
      if (value.textContent !== p.variante) value.textContent = p.variante;
    } else if (r.tone.firstChild) {
      r.tone.replaceChildren();
    }
  }

  // Tarjeta editorial que completa la última fila de la cuadrícula cuando queda incompleta.
  var note = null;
  function placeNote(grid, count) {
    if (!note) {
      note = h('aside', { class: 'grid-note', 'aria-label': 'Encargos' }, [
        h('div', { class: 'grid-note__inner' }, [
          h('p', { class: 'grid-note__eyebrow', text: 'Próximo envío' }),
          h('p', { class: 'grid-note__title' }, ['¿Se agotó tu ', h('em', { text: 'favorito' }), '?']),
          h('p', { class: 'grid-note__text', text: 'Encárgalo y lo traemos en el próximo envío. Te confirmamos por WhatsApp cuando llegue.' })
        ])
      ]);
    }
    var cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    var rest = count % cols;
    if (!count || !rest) { if (note.parentNode) note.remove(); return; }
    note.style.gridColumn = 'span ' + (cols - rest);
    note.dataset.span = String(cols - rest);
    if (note.parentNode !== grid || grid.lastChild !== note) grid.appendChild(note);
  }

  function matches(g) {
    var f = app.state.filter;
    return (f.categoria === 'Todo' || g.categoria === f.categoria) && (!f.marca || g.marca === f.marca);
  }

  function renderCatalog() {
    var s = app.state;
    var grid = $('#catalogo-grid');
    var status = $('#catalog-status');
    var count = $('#catalog-count');
    renderFilters();
    grid.setAttribute('aria-busy', String(!s.products && s.status === 'loading'));

    if (!s.products) {
      cards = {}; builtKey = ''; shownKey = '';
      count.textContent = '';
      if (s.status === 'error') {
        grid.replaceChildren();
        status.replaceChildren(h('div', { class: 'state-message', role: 'alert' }, [
          h('p', { class: 'state-message__title', text: 'No pudimos cargar el catálogo.' }),
          h('p', { class: 'state-message__text', text: 'Revisa tu conexión e inténtalo de nuevo. Tu pedido sigue guardado en este dispositivo.' }),
          h('button', { type: 'button', class: 'btn btn--outline', text: 'Reintentar', onclick: function () { app.actions.retry(); } })
        ]));
      } else {
        status.replaceChildren();
        if (!grid.querySelector('.product-card--skeleton')) grid.replaceChildren(skeleton());
      }
      return;
    }

    status.replaceChildren();
    var key = s.groups.map(function (g) { return g.id + ':' + g.items.map(function (p) { return p.sku; }).join(','); }).join('|');
    if (key !== builtKey) {
      cards = {};
      s.groups.forEach(function (g) { cards[g.id] = buildCard(g); });
      builtKey = key;
      shownKey = '';
    }
    var visible = s.groups.filter(matches);
    visible.forEach(function (g) { updateCard(cards[g.id], g); });
    var vKey = visible.map(function (g) { return g.id; }).join('|');
    if (vKey !== shownKey) {
      grid.replaceChildren.apply(grid, visible.map(function (g, i) {
        cards[g.id].style.setProperty('--i', String(Math.min(i, 8)));
        return cards[g.id];
      }));
      shownKey = vKey;
    }
    placeNote(grid, visible.length);
    count.textContent = plural(visible.length, 'pieza', 'piezas');
    if (!visible.length) {
      status.replaceChildren(h('div', { class: 'state-message' }, [
        h('p', { class: 'state-message__title', text: 'No hay piezas en esta selección.' }),
        h('button', { type: 'button', class: 'btn btn--outline', text: 'Ver todo', onclick: function () { app.actions.setFilter('Todo', ''); } })
      ]));
    }
  }

  // ---------- Ficha del producto ----------

  function stepper(value, min, max, onChange, fk, label) {
    return h('div', { class: 'stepper', role: 'group', 'aria-label': label || 'Cantidad' }, [
      h('button', {
        type: 'button', class: 'stepper__btn', 'aria-label': 'Quitar una unidad', 'data-fk': fk + '-minus',
        disabled: value <= min, onclick: function () { onChange(value - 1); }
      }, '−'),
      h('output', { class: 'stepper__value', 'aria-live': 'polite', text: String(value) }),
      h('button', {
        type: 'button', class: 'stepper__btn', 'aria-label': 'Agregar una unidad', 'data-fk': fk + '-plus',
        disabled: value >= max, onclick: function () { onChange(value + 1); }
      }, '+')
    ]);
  }

  function renderModal() {
    var s = app.state;
    if (!s.modal || !modal.isOpen() && !s.modalOpening) return;
    var g = groupById(s.modal);
    if (!g) { app.actions.closeProduct(); return; }
    var p = selectedOf(g);
    var buy = buyState(p);
    var qty = Math.max(1, Math.min(s.modalQty, Math.max(1, buy.max)));
    s.modalQty = qty;
    var b = badgeFor(p.disponible);

    var tones;
    if (g.items.length > 1) {
      tones = h('div', { class: 'pd__tones' }, [
        h('p', { class: 'pd__label' }, ['Tono', h('span', { class: 'pd__label-value', text: p.variante })]),
        swatchGroup(g, p, function (sku) { app.actions.selectTone(g.id, sku); }, 'modal-')
      ]);
    } else if (p.variante) {
      tones = h('p', { class: 'pd__label' }, ['Tono', h('span', { class: 'pd__label-value', text: p.variante })]);
    }

    var hint = buy.tipo === 'Encargo'
      ? 'Sin existencias por ahora. Lo pedimos en el próximo envío y te confirmamos por WhatsApp cuando llegue.'
      : 'Tus unidades quedan reservadas al confirmar el pedido. Sin pagos en línea.';

    var content = h('div', { class: 'pd' }, [
      h('button', { type: 'button', class: 'icon-btn pd__close', 'aria-label': 'Cerrar', 'data-close': true, 'data-fk': 'close' }, closeIcon()),
      h('div', { class: 'pd__media' + (b.tone === 'out' ? ' is-out' : '') }, [
        h('img', { src: p.imagen, alt: altText(p), width: '1200', height: '1200', decoding: 'async' })
      ]),
      h('div', { class: 'pd__info' }, [
        h('p', { class: 'pd__brand', text: p.marca }),
        h('h2', { id: 'modal-title', class: 'pd__name', text: p.nombre }),
        h('div', { class: 'pd__meta' }, [
          h('p', { class: 'pd__price', text: money(p.precio) }),
          h('span', { class: 'badge badge--inline badge--' + b.tone, text: b.text })
        ]),
        h('p', { class: 'pd__lede', text: p.desc_atractiva || '' }),
        tones,
        h('div', { class: 'pd__buy' }, [
          buy.max > 0 ? stepper(qty, 1, buy.max, function (n) { s.modalQty = n; renderModal(); }, 'qty') : null,
          h('button', {
            type: 'button', class: 'btn btn--lg pd__cta btn--' + buy.kind, 'data-fk': 'cta', disabled: buy.max <= 0,
            onclick: function () { app.actions.add(p.sku, buy.tipo, s.modalQty, true); }
          }, buy.label)
        ]),
        h('p', { class: 'pd__hint', text: hint }),
        h('div', { class: 'pd__sections' }, [
          h('section', { class: 'pd__section' }, [h('h3', { text: 'Virtud' }), h('p', { text: p.virtud || '' })]),
          h('section', { class: 'pd__section' }, [h('h3', { text: 'Ficha técnica' }), h('p', { text: p.tecnica || '' })])
        ])
      ])
    ]);
    keepFocus(modal.panel, function () { modal.panel.replaceChildren(content); });
  }

  function closeIcon() {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('fill', 'none');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 6l12 12M18 6L6 18');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
    return svg;
  }

  // ---------- Carrito, formulario y confirmación ----------

  function noticeBlock() {
    var s = app.state;
    if (!s.notice.length || !s.products) return null;
    return h('div', { class: 'notice', role: 'alert' }, [
      h('p', { class: 'notice__title', text: 'Las existencias cambiaron' }),
      h('p', { class: 'notice__text', text: 'Mientras elegías, otras personas reservaron algunas piezas. Puedes pasar lo que falta a encargo o quitarlo.' }),
      h('ul', { class: 'notice__list' }, s.notice.map(function (n) {
        var p = s.products && s.bySku[n.sku];
        var name = p ? fullName(p) : n.sku;
        var detail = n.disponible > 0
          ? 'Tienes ' + n.cantidad + ' en reservas; ' + (n.disponible === 1 ? 'solo queda 1.' : 'solo quedan ' + n.disponible + '.')
          : 'Tienes ' + n.cantidad + ' en reservas; ya no quedan unidades.';
        return h('li', { class: 'notice__item' }, [
          h('p', { class: 'notice__name', text: name }),
          h('p', { class: 'notice__detail', text: detail }),
          h('div', { class: 'notice__actions' }, [
            h('button', { type: 'button', class: 'btn btn--sm btn--primary', 'data-fk': 'n-enc-' + n.sku, onclick: function () { app.actions.resolveNotice(n.sku, 'encargo'); } }, 'Pasar a encargo'),
            h('button', { type: 'button', class: 'btn btn--sm btn--ghost', 'data-fk': 'n-rm-' + n.sku, onclick: function () { app.actions.resolveNotice(n.sku, 'quitar'); } }, 'Quitar')
          ])
        ]);
      }))
    ]);
  }

  function drawerHead(title, opts) {
    opts = opts || {};
    return h('div', { class: 'drawer__head' }, [
      opts.back ? h('button', { type: 'button', class: 'icon-btn drawer__back', 'aria-label': 'Volver a tu pedido', 'data-fk': 'back', onclick: opts.back }, backIcon()) : null,
      h('div', { class: 'drawer__titles' }, [
        h('h2', { id: 'drawer-title', class: 'drawer__title', text: title }),
        opts.sub ? h('p', { class: 'drawer__sub', text: opts.sub }) : null
      ]),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', 'data-close': true, 'data-fk': 'close' }, closeIcon())
    ]);
  }

  function backIcon() {
    var svg = closeIcon();
    svg.firstChild.setAttribute('d', 'M15 5l-7 7 7 7');
    return svg;
  }

  function lineItem(l) {
    var s = app.state;
    var p = s.bySku[l.sku];
    if (!p) return null;
    var max = l.tipo === 'Reserva' ? Number(p.disponible) || 0 : ENCARGO_CAP;
    var fk = 'l-' + l.tipo + '-' + l.sku;
    return h('li', { class: 'line' }, [
      h('div', { class: 'line__thumb' }, h('img', { src: p.imagen, alt: '', width: '1200', height: '1200', loading: 'lazy' })),
      h('div', { class: 'line__info' }, [
        h('p', { class: 'line__brand', text: p.marca }),
        h('p', { class: 'line__name', text: p.nombre }),
        p.variante ? h('p', { class: 'line__variant', text: p.variante }) : null,
        h('div', { class: 'line__controls' }, [
          stepper(l.cantidad, 1, Math.max(max, 1), function (n) { app.actions.setQty(l.sku, l.tipo, n); }, fk, 'Cantidad de ' + p.nombre),
          h('button', { type: 'button', class: 'link-btn', 'data-fk': fk + '-rm', onclick: function () { app.actions.remove(l.sku, l.tipo); } }, 'Quitar')
        ])
      ]),
      h('p', { class: 'line__price', text: money(p.precio * l.cantidad) })
    ]);
  }

  function cartSection(title, tipo, lines, subtotal, note) {
    if (!lines.length) return null;
    return h('section', { class: 'cart-section', 'aria-label': title }, [
      h('div', { class: 'cart-section__head' }, [
        h('h3', { class: 'cart-section__title', text: title }),
        h('span', { class: 'cart-section__count', text: plural(lines.reduce(function (a, l) { return a + l.cantidad; }, 0), 'pieza', 'piezas') })
      ]),
      note ? h('p', { class: 'cart-section__note', text: note }) : null,
      h('ul', { class: 'lines' }, lines.map(lineItem)),
      h('div', { class: 'cart-section__subtotal' }, [h('span', { text: 'Subtotal ' + title.toLowerCase() }), h('span', { text: money(subtotal) })])
    ]);
  }

  var ENCARGO_NOTE = 'Los encargos se confirman cuando llegue el próximo envío.';

  function renderCartStep() {
    var s = app.state;
    var lines = app.cart.lines();
    var count = lines.reduce(function (a, l) { return a + l.cantidad; }, 0);
    var body = h('div', { class: 'drawer__body' });
    var foot = null;

    if (!s.products && lines.length) {
      body.appendChild(h('div', { class: 'state-message state-message--compact' }, [
        h('p', { class: 'state-message__title', text: 'Tu pedido está guardado.' }),
        h('p', { class: 'state-message__text', text: 'Necesitamos cargar el catálogo para mostrarte precios y existencias.' }),
        h('button', { type: 'button', class: 'btn btn--outline', text: 'Reintentar', onclick: function () { app.actions.retry(); } })
      ]));
    } else if (!lines.length) {
      body.appendChild(h('div', { class: 'cart-empty' }, [
        h('p', { class: 'cart-empty__title', text: 'Tu pedido está vacío.' }),
        h('p', { class: 'cart-empty__text', text: 'Explora la colección y reserva tus piezas favoritas.' }),
        h('button', { type: 'button', class: 'btn btn--outline', 'data-fk': 'explore', onclick: function () { app.actions.closeCart(true); } }, 'Explorar el catálogo')
      ]));
    } else {
      var t = app.cart.totals(s.bySku);
      var res = lines.filter(function (l) { return l.tipo === 'Reserva'; });
      var enc = lines.filter(function (l) { return l.tipo === 'Encargo'; });
      body.append(
        noticeBlock() || '',
        cartSection('Reservas', 'Reserva', res, t.reserva) || '',
        cartSection('Encargos', 'Encargo', enc, t.encargo, ENCARGO_NOTE) || ''
      );
      foot = h('div', { class: 'drawer__foot' }, [
        h('div', { class: 'total-row' }, [h('span', { class: 'total-row__label', text: 'Total' }), h('span', { class: 'total-row__value', text: money(t.total) })]),
        h('button', { type: 'button', class: 'btn btn--primary btn--lg btn--block', 'data-fk': 'continue', onclick: function () { app.actions.goCheckout(); } }, 'Continuar'),
        h('p', { class: 'drawer__fine drawer__fine--center', text: 'No pagas nada en línea: coordinamos el pago al entregar.' })
      ]);
    }
    return [drawerHead('Tu pedido', { sub: count ? plural(count, 'pieza', 'piezas') : '' }), body, foot];
  }

  var FIELDS = [
    { name: 'nombre', label: 'Nombre completo', type: 'text', autocomplete: 'name' },
    { name: 'whatsapp', label: 'WhatsApp', type: 'tel', autocomplete: 'tel', placeholder: '+503 7000-0000', inputmode: 'tel', help: 'Te escribiremos a este número para coordinar.' },
    { name: 'direccion_zona', label: 'Dirección o zona', type: 'text', autocomplete: 'street-address', placeholder: 'Colonia, municipio o punto de referencia' }
  ];

  var checkoutRefs = null;

  function renderCheckoutStep() {
    var s = app.state;
    checkoutRefs = { inputs: {}, errors: {} };
    var form = h('form', { id: 'checkout-form', class: 'checkout', novalidate: true });
    form.addEventListener('submit', function (e) { e.preventDefault(); app.actions.submit(); });
    FIELDS.forEach(function (f) {
      var id = 'f-' + f.name;
      var err = h('p', { class: 'field__error', id: 'error-' + f.name, hidden: true });
      var input = h('input', {
        id: id, name: f.name, type: f.type, autocomplete: f.autocomplete, placeholder: f.placeholder,
        inputmode: f.inputmode, required: true, class: 'field__input', 'data-fk': id
      });
      input.value = s.form[f.name] || '';
      input.addEventListener('input', function () {
        s.form[f.name] = input.value;
        if (s.errors[f.name]) { delete s.errors[f.name]; updateCheckout(); }
      });
      checkoutRefs.inputs[f.name] = input;
      checkoutRefs.errors[f.name] = err;
      form.appendChild(h('div', { class: 'field' }, [
        h('label', { class: 'field__label', for: id, text: f.label }),
        input,
        f.help ? h('p', { class: 'field__help', id: 'help-' + f.name, text: f.help }) : null,
        err
      ]));
    });
    checkoutRefs.notice = h('div', { class: 'checkout__notice' });
    checkoutRefs.summary = h('div', { class: 'summary' });
    checkoutRefs.formError = h('div', { class: 'form-error', role: 'alert' });
    checkoutRefs.submit = h('button', { type: 'submit', form: 'checkout-form', class: 'btn btn--primary btn--lg btn--block', 'data-fk': 'submit' }, 'Confirmar pedido');

    var body = h('div', { class: 'drawer__body' }, [
      checkoutRefs.notice,
      h('p', { class: 'checkout__intro', text: 'Reservamos tus piezas al confirmar. Después te escribimos por WhatsApp para coordinar la entrega y el pago.' }),
      form,
      checkoutRefs.summary
    ]);
    var foot = h('div', { class: 'drawer__foot' }, [
      checkoutRefs.formError,
      checkoutRefs.submit,
      h('p', { class: 'drawer__fine drawer__fine--center', text: 'Tu pedido es una reserva. No se realiza ningún pago en línea.' })
    ]);
    return [drawerHead('Tus datos', { back: function () { app.actions.backToCart(); }, sub: 'Paso final' }), body, foot];
  }

  function updateCheckout() {
    if (!checkoutRefs) return;
    var s = app.state;
    var r = checkoutRefs;
    keepFocus(r.notice, function () { r.notice.replaceChildren(noticeBlock() || ''); });
    FIELDS.forEach(function (f) {
      var msg = s.errors[f.name];
      var input = r.inputs[f.name];
      r.errors[f.name].textContent = msg || '';
      r.errors[f.name].hidden = !msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      var described = [f.help ? 'help-' + f.name : '', msg ? 'error-' + f.name : ''].filter(Boolean).join(' ');
      if (described) input.setAttribute('aria-describedby', described); else input.removeAttribute('aria-describedby');
    });
    var t = app.cart.totals(s.bySku);
    var rows = [];
    if (t.reserva > 0) rows.push(['Reservas', money(t.reserva)]);
    if (t.encargo > 0) rows.push(['Encargos', money(t.encargo)]);
    r.summary.replaceChildren.apply(r.summary, rows.map(function (row) {
      return h('div', { class: 'summary__row' }, [h('span', { text: row[0] }), h('span', { text: row[1] })]);
    }).concat([h('div', { class: 'summary__row summary__row--total' }, [h('span', { text: 'Total' }), h('span', { text: money(t.total) })])]));
    r.formError.textContent = s.formError || '';
    r.formError.hidden = !s.formError;
    r.submit.disabled = !!s.submitting;
    r.submit.textContent = s.submitting ? 'Enviando…' : 'Confirmar pedido';
    r.submit.setAttribute('aria-busy', String(!!s.submitting));
  }

  function focusField(name) {
    if (checkoutRefs && checkoutRefs.inputs[name]) checkoutRefs.inputs[name].focus();
  }

  function renderDoneStep() {
    var o = app.state.lastOrder;
    var group = function (title, lines) {
      if (!lines.length) return null;
      return h('section', { class: 'receipt__group' }, [
        h('h3', { class: 'receipt__title', text: title }),
        h('ul', { class: 'receipt__lines' }, lines.map(function (l) {
          return h('li', { class: 'receipt__line' }, [
            h('span', { class: 'receipt__qty', text: l.cantidad + '×' }),
            h('span', { class: 'receipt__name' }, [h('span', { class: 'receipt__brand', text: l.marca }), document.createTextNode(fullName(l))]),
            h('span', { class: 'receipt__amt', text: money(l.subtotal) })
          ]);
        }))
      ]);
    };
    var res = o.lines.filter(function (l) { return l.tipo === 'Reserva'; });
    var enc = o.lines.filter(function (l) { return l.tipo === 'Encargo'; });
    var first = String(o.nombre || '').split(/\s+/)[0];
    var body = h('div', { class: 'drawer__body confirmation', id: 'confirmation' }, [
      h('div', { class: 'confirmation__mark', 'aria-hidden': 'true' }),
      h('p', { class: 'eyebrow eyebrow--center', text: first ? 'Gracias, ' + first : 'Gracias' }),
      h('h2', { id: 'drawer-title', class: 'confirmation__title', tabindex: '-1', 'data-autofocus': true, 'data-fk-fallback': true, text: 'Pedido recibido' }),
      h('p', { class: 'confirmation__label', text: 'Número de pedido' }),
      h('p', { class: 'order-number', text: o.pedido_id }),
      h('p', { class: 'confirmation__text', text: 'Te contactaremos por WhatsApp para coordinar la entrega.' }),
      h('div', { class: 'receipt' }, [
        group('Reservas', res),
        group('Encargos', enc),
        enc.length ? h('p', { class: 'receipt__note', text: ENCARGO_NOTE }) : null,
        h('div', { class: 'receipt__totals' }, [
          res.length && enc.length ? h('div', { class: 'summary__row' }, [h('span', { text: 'Reservas' }), h('span', { text: money(o.totals.reserva) })]) : null,
          res.length && enc.length ? h('div', { class: 'summary__row' }, [h('span', { text: 'Encargos' }), h('span', { text: money(o.totals.encargo) })]) : null,
          h('div', { class: 'summary__row summary__row--total' }, [h('span', { text: 'Total' }), h('span', { text: money(o.totals.total) })])
        ])
      ])
    ]);
    var foot = h('div', { class: 'drawer__foot' }, [
      h('button', { type: 'button', class: 'btn btn--primary btn--lg btn--block', 'data-fk': 'done', onclick: function () { app.actions.finish(); } }, 'Seguir explorando')
    ]);
    return [h('div', { class: 'drawer__head drawer__head--bare' }, [
      h('span'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Cerrar', 'data-close': true }, closeIcon())
    ]), body, foot];
  }

  var builtStep = '';

  function renderDrawer(force) {
    var s = app.state;
    var panel = drawer.panel;
    if (!drawer.isOpen() && !force) { builtStep = ''; return; }
    if (s.step === 'checkout') {
      if (builtStep !== 'checkout') {
        panel.replaceChildren.apply(panel, renderCheckoutStep().filter(Boolean));
        builtStep = 'checkout';
      }
      updateCheckout();
      return;
    }
    checkoutRefs = null;
    var done = s.step === 'done' && s.lastOrder;
    var stepKey = done ? 'done:' + s.lastOrder.pedido_id : 'cart';
    var changed = builtStep !== stepKey;
    // La confirmación no cambia con el sondeo: se construye una sola vez.
    if (done && !changed) return;
    // Conservar la posición de desplazamiento del carrito al reconstruirlo.
    var oldBody = panel.querySelector('.drawer__body');
    var scrollTop = !changed && oldBody ? oldBody.scrollTop : 0;
    keepFocus(panel, function () {
      var parts = (done ? renderDoneStep() : renderCartStep()).filter(Boolean);
      panel.replaceChildren.apply(panel, parts);
    });
    if (scrollTop) {
      var newBody = panel.querySelector('.drawer__body');
      if (newBody) newBody.scrollTop = scrollTop;
    }
    builtStep = stepKey;
    if (changed && drawer.isOpen()) {
      var target = panel.querySelector('[data-autofocus]');
      if (target) target.focus({ preventScroll: true });
    }
  }

  // ---------- Encabezado ----------

  function renderBadge() {
    var n = app.cart.lines().reduce(function (a, l) { return a + l.cantidad; }, 0);
    var c = $('#cart-count');
    c.textContent = String(n);
    c.dataset.empty = String(n === 0);
    $('#cart-count-label').textContent = n === 1 ? 'pieza' : 'piezas';
  }

  // ---------- API pública ----------

  function render() {
    renderBadge();
    renderCatalog();
    renderDrawer();
    if (modal.isOpen()) renderModal();
  }

  function init(ctx) {
    app = ctx;
    var cfg = window.CATALOG_CONFIG || {};
    if (cfg.STORE_NAME) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-store-name]'), function (n) { n.textContent = cfg.STORE_NAME; });
      document.title = cfg.STORE_NAME + ' — Maquillaje importado';
    }
    if (window.CatalogAPI && window.CatalogAPI.mode !== 'live') {
      var banner = h('div', { class: 'demo-banner', role: 'note' }, [
        h('span', { class: 'demo-banner__tag', text: 'Modo demostración' }),
        h('span', { class: 'demo-banner__text', text: 'Los pedidos no se registran.' })
      ]);
      document.body.insertBefore(banner, $('.site-header'));
    }
    var year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    modal = makeDialog($('#product-modal'), function () { app.actions.closeProduct(); });
    drawer = makeDialog($('#cart-drawer'), function () { app.actions.closeCart(); });

    $('#cart-button').addEventListener('click', function (e) { app.actions.openCart(e.currentTarget); });
    $('#filtro-categoria').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (b) app.actions.setFilter(b.dataset.categoria, app.state.filter.marca);
    });
    $('#filtro-marca').addEventListener('change', function (e) {
      app.actions.setFilter(app.state.filter.categoria, e.target.value);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.brand-logo'), function (b) {
      b.setAttribute('aria-label', 'Ver productos de ' + b.dataset.marca);
      b.addEventListener('click', function () {
        app.actions.setFilter('Todo', b.dataset.marca);
        var target = $('#catalogo');
        target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        target.focus({ preventScroll: true });
      });
    });
    ['(min-width: 720px)', '(min-width: 1100px)'].forEach(function (q) {
      var mq = window.matchMedia(q);
      var onChange = function () { render(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    });
    render();
  }

  window.CatalogUI = {
    init: init,
    render: render,
    toast: toast,
    focusField: focusField,
    openModal: function (from) { app.state.modalOpening = true; renderModal(); app.state.modalOpening = false; modal.open(from); },
    closeModal: function () { modal.close(); },
    openDrawer: function (from) { renderDrawer(true); drawer.open(from); renderDrawer(); },
    closeDrawer: function () { drawer.close(); },
    isDrawerOpen: function () { return drawer.isOpen(); },
    badgeFor: badgeFor,
    money: money
  };
})();
