(function () {
  'use strict';
  /* La página ya viene armada por el servidor (textos, tarjetas y categorías).
     Este script solo agrega lo interactivo: filtrar por categoría y abrir la ficha del producto. */
  var $ = function (s, r) { return (r || document).querySelector(s); };

  var data = { whatsapp: '', categories: [], products: [] };
  try { data = JSON.parse($('#site-data').textContent); } catch (e) { /* sin datos: la página igual se ve */ }
  var byId = {};
  data.products.forEach(function (p) { byId[p.id] = p; });

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function waLink(msg) {
    var n = String(data.whatsapp || '').replace(/\D/g, '');
    return 'https://wa.me/' + n + (msg ? '?text=' + encodeURIComponent(msg) : '');
  }

  /* Texto con párrafos (línea en blanco) y subtítulos ("## ...") */
  function renderRich(container, text) {
    container.textContent = '';
    String(text || '').split(/\n\s*\n/).forEach(function (block) {
      block = block.trim();
      if (!block) return;
      if (block.indexOf('## ') === 0) container.appendChild(h('h3', { text: block.slice(3) }));
      else container.appendChild(h('p', { text: block }));
    });
  }

  var PAY_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
  function renderPay(ul, p) {
    ul.textContent = '';
    Object.keys(PAY_LABELS).forEach(function (k) {
      var m = p.payments && p.payments[k];
      if (!m || !m.enabled) return;
      var li = h('li', null, h('span', { class: 'payopts__label', text: PAY_LABELS[k] }));
      if (m.price) li.appendChild(h('strong', { text: m.price }));
      if (m.text) li.appendChild(h('small', { text: m.text }));
      ul.appendChild(li);
    });
    ul.hidden = !ul.children.length;
  }

  function categoryName(id) {
    var c = data.categories.filter(function (x) { return x.id === id; })[0];
    return c ? c.name : '';
  }

  /* Filtro por categoría */
  var chips = $('#chips'), grid = $('#grid'), empty = $('#empty');
  var serverEmptyText = empty.textContent;
  chips.addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var cat = chip.getAttribute('data-cat');
    Array.prototype.forEach.call(chips.children, function (c) { c.setAttribute('aria-selected', String(c === chip)); });
    var shown = 0;
    Array.prototype.forEach.call(grid.children, function (card) {
      var ok = cat === 'all' || card.getAttribute('data-cat') === cat;
      card.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown > 0;
    empty.textContent = data.products.length ? 'Todavía no hay productos en esta categoría.' : serverEmptyText;
  });

  /* Ficha de producto con galería */
  var modal = $('#modal');
  function openModal(p) {
    $('#m-cat').textContent = categoryName(p.categoryId);
    $('#m-title').textContent = p.title;
    renderPay($('#m-pay'), p);
    renderRich($('#m-desc'), p.description);
    $('#m-wa').href = waLink('¡Hola! Me gustaría consultar por: ' + p.title);
    var main = $('#m-main'), thumbs = $('#m-thumbs');
    thumbs.textContent = '';
    function show(i) {
      main.src = p.images[i] || '/img/logo.png'; main.alt = p.title;
      Array.prototype.forEach.call(thumbs.children, function (b, j) { b.setAttribute('aria-current', String(i === j)); });
    }
    p.images.forEach(function (src, i) {
      thumbs.appendChild(h('button', { type: 'button', 'aria-label': 'Foto ' + (i + 1), onclick: function () { show(i); } }, h('img', { src: src, alt: '' })));
    });
    thumbs.hidden = p.images.length < 2;
    show(0);
    modal.showModal();
  }
  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (card && byId[card.getAttribute('data-id')]) openModal(byId[card.getAttribute('data-id')]);
  });
  $('#m-close').addEventListener('click', function () { modal.close(); });
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.close(); });
})();
