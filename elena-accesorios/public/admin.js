(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var state = { categories: [], products: [], settings: null };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'class') el.className = attrs[k];
      else if (k === 'value') el.value = attrs[k];
      else if (k === 'checked') el.checked = !!attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, 3200);
  }

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && url.indexOf('/api/login') < 0) { showLogin(); throw new Error(data.error || 'Sesión vencida'); }
        if (!r.ok) throw new Error(data.error || 'Ocurrió un error');
        return data;
      });
    });
  }

  /* ---------------- Ingreso ---------------- */
  function showLogin() { $('#panel').hidden = true; $('#login').hidden = false; $('#login-pass').value = ''; $('#login-pass').focus(); }
  function showPanel() { $('#login').hidden = true; $('#panel').hidden = false; }

  $('#login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#login-err'); err.hidden = true;
    api('POST', '/api/login', { password: $('#login-pass').value })
      .then(loadAll)
      .catch(function (ex) { err.textContent = ex.message; err.hidden = false; });
  });
  $('#logout').addEventListener('click', function () { api('POST', '/api/logout', {}).then(showLogin); });

  function loadAll() {
    return api('GET', '/api/admin/data').then(function (d) {
      state.categories = d.categories; state.products = d.products; state.settings = d.settings;
      showPanel(); renderAll();
    });
  }

  /* ---------------- Pestañas ---------------- */
  $$('#tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('#tabs button').forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
      $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== b.getAttribute('data-tab'); });
    });
  });

  function renderAll() { renderProducts(); renderCategories(); renderPayments(); renderTexts(); }
  var catName = function (id) { var c = state.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.name : 'Sin categoría'; };

  /* ---------------- Productos ---------------- */
  function renderProducts() {
    var box = $('#plist'); box.textContent = '';
    if (!state.products.length) { box.appendChild(h('p', { class: 'emptyline', text: 'Todavía no cargaste productos. ¡Empezá con el primero!' })); return; }
    state.products.forEach(function (p) {
      var img = h('div', { class: 'pitem__img' }, p.images.length ? h('img', { src: p.images[0], alt: '' }) : h('div', { class: 'pitem__noimg', text: 'Sin foto' }));
      box.appendChild(h('article', { class: 'pitem' }, img,
        h('div', { class: 'pitem__body' },
          h('div', { class: 'pitem__title', text: p.title }),
          h('div', { class: 'pitem__meta', text: catName(p.categoryId) + ' · ' + p.images.length + (p.images.length === 1 ? ' foto' : ' fotos') })),
        h('div', { class: 'pitem__actions' },
          h('button', { class: 'linkbtn', type: 'button', onclick: function () { openProduct(p); } }, 'Editar'),
          h('button', { class: 'linkbtn linkbtn--danger', type: 'button', onclick: function () { deleteProduct(p); } }, 'Eliminar'))));
    });
  }
  function deleteProduct(p) {
    if (!confirm('¿Eliminar “' + p.title + '” y todas sus fotos? Esta acción no se puede deshacer.')) return;
    api('DELETE', '/api/admin/products/' + p.id).then(function () {
      state.products = state.products.filter(function (x) { return x.id !== p.id; });
      renderProducts(); toast('Producto eliminado');
    }).catch(function (e) { toast(e.message, true); });
  }

  var editing = null;      // producto en edición (null = nuevo)
  var photos = [];         // [{url} | {loading:true}]
  var pm = $('#pmodal');

  function openProduct(p) {
    editing = p || null;
    $('#pm-title').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('#pf-title').value = p ? p.title : '';
    $('#pf-desc').value = p ? p.description : '';
    var sel = $('#pf-cat'); sel.textContent = '';
    sel.appendChild(h('option', { value: '', text: 'Sin categoría' }));
    state.categories.forEach(function (c) { sel.appendChild(h('option', { value: c.id, text: c.name })); });
    sel.value = p ? p.categoryId : '';
    renderPayForm(p ? p.payments : null, !p);
    photos = p ? p.images.map(function (u) { return { url: u }; }) : [];
    $('#pf-err').hidden = true;
    renderPhotos();
    pm.showModal();
  }
  var PAY = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta']];
  function renderPayForm(cur, isNew) {
    var box = $('#pf-pay'); box.textContent = '';
    PAY.forEach(function (m) {
      var v = (cur && cur[m[0]]) || { enabled: !!isNew, price: '', text: '' };
      box.appendChild(h('div', { class: 'payrow', 'data-m': m[0] },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: v.enabled, 'data-f': 'enabled' }), h('span', { class: 'switch__track' }), h('span', { text: m[1] })),
        h('div', { class: 'row' },
          h('label', { class: 'field' }, h('span', { text: 'Precio' }), h('input', { value: v.price, maxlength: '60', placeholder: 'Ej.: $2.500', 'data-f': 'price' })),
          h('label', { class: 'field' }, h('span', { text: 'Texto' }), h('input', { value: v.text, maxlength: '200', placeholder: 'Ej.: 10% de descuento', 'data-f': 'text' })))));
    });
  }
  function collectPay() {
    var o = {};
    $$('#pf-pay .payrow').forEach(function (r) {
      o[r.getAttribute('data-m')] = { enabled: $('[data-f=enabled]', r).checked, price: $('[data-f=price]', r).value, text: $('[data-f=text]', r).value };
    });
    return o;
  }
  function renderPhotos() {
    var box = $('#pf-photos'); box.textContent = '';
    photos.forEach(function (ph, i) {
      if (ph.loading) { box.appendChild(h('div', { class: 'photo photo--loading', text: 'Subiendo…' })); return; }
      var el = h('div', { class: 'photo' + (i === 0 ? ' is-cover' : '') },
        h('img', { src: ph.url, alt: '' }),
        i === 0 ? h('span', { class: 'photo__tag', text: 'Portada' }) : null,
        h('div', { class: 'photo__bar' },
          h('button', { type: 'button', 'aria-label': 'Mover a la izquierda', title: 'Mover', disabled: i === 0 ? '' : null, onclick: function () { move(i, -1); } }, '←'),
          h('button', { type: 'button', class: 'del', 'aria-label': 'Quitar foto', title: 'Quitar', onclick: function () { photos.splice(i, 1); renderPhotos(); } }, '✕')));
      box.appendChild(el);
    });
  }
  function move(i, d) {
    var j = i + d; if (j < 0 || j >= photos.length) return;
    var t = photos[i]; photos[i] = photos[j]; photos[j] = t; renderPhotos();
  }

  /* Reduce la foto en el navegador (máx. 1600 px) antes de subirla */
  function prepare(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo leer “' + file.name + '”.')); };
      img.src = url;
    });
  }
  function addFiles(files) {
    var list = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
    if (!list.length) return;
    $('#pf-save').disabled = true;
    var pending = list.length;
    list.forEach(function (f) {
      var slot = { loading: true }; photos.push(slot); renderPhotos();
      prepare(f).then(function (data) { return api('POST', '/api/admin/upload', { data: data }); })
        .then(function (r) { slot.loading = false; slot.url = r.url; })
        .catch(function (e) { photos.splice(photos.indexOf(slot), 1); toast(e.message, true); })
        .then(function () { renderPhotos(); if (--pending === 0) $('#pf-save').disabled = false; });
    });
  }
  $('#pf-files').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

  $('#new-product').addEventListener('click', function () { openProduct(null); });
  $('#pf-cancel').addEventListener('click', function () { pm.close(); });
  $('#pform').addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {
      title: $('#pf-title').value, payments: collectPay(), description: $('#pf-desc').value,
      categoryId: $('#pf-cat').value,
      images: photos.filter(function (p) { return p.url; }).map(function (p) { return p.url; })
    };
    var btn = $('#pf-save'); btn.disabled = true;
    var req = editing ? api('PUT', '/api/admin/products/' + editing.id, body) : api('POST', '/api/admin/products', body);
    req.then(function (saved) {
      if (editing) state.products = state.products.map(function (p) { return p.id === saved.id ? saved : p; });
      else state.products.unshift(saved);
      pm.close(); renderProducts(); toast('Producto guardado');
    }).catch(function (ex) { $('#pf-err').textContent = ex.message; $('#pf-err').hidden = false; })
      .then(function () { btn.disabled = false; });
  });

  /* ---------------- Categorías ---------------- */
  function renderCategories() {
    var ul = $('#clist'); ul.textContent = '';
    state.categories.forEach(function (c) {
      var input = h('input', { value: c.name, maxlength: '60', 'aria-label': 'Nombre de la categoría' });
      var n = state.products.filter(function (p) { return p.categoryId === c.id; }).length;
      ul.appendChild(h('li', null, input,
        h('span', { class: 'count', text: n + (n === 1 ? ' producto' : ' productos') }),
        h('button', { class: 'linkbtn', type: 'button', onclick: function () {
          api('PUT', '/api/admin/categories/' + c.id, { name: input.value }).then(function (u) { c.name = u.name; toast('Categoría actualizada'); renderProducts(); })
            .catch(function (e) { toast(e.message, true); });
        } }, 'Guardar'),
        h('button', { class: 'linkbtn linkbtn--danger', type: 'button', onclick: function () {
          var msg = n ? '¿Eliminar “' + c.name + '”? Sus ' + n + ' producto(s) quedarán sin categoría.' : '¿Eliminar la categoría “' + c.name + '”?';
          if (!confirm(msg)) return;
          api('DELETE', '/api/admin/categories/' + c.id).then(function () {
            state.categories = state.categories.filter(function (x) { return x.id !== c.id; });
            state.products.forEach(function (p) { if (p.categoryId === c.id) p.categoryId = ''; });
            renderCategories(); renderProducts(); toast('Categoría eliminada');
          }).catch(function (e) { toast(e.message, true); });
        } }, 'Eliminar')));
    });
    if (!state.categories.length) ul.appendChild(h('li', null, 'No hay categorías. Agregá la primera.'));
  }
  $('#new-cat').addEventListener('click', function () {
    var name = prompt('Nombre de la nueva categoría:');
    if (!name || !name.trim()) return;
    api('POST', '/api/admin/categories', { name: name }).then(function (c) {
      state.categories.push(c); renderCategories(); toast('Categoría agregada');
    }).catch(function (e) { toast(e.message, true); });
  });

  /* ---------------- Pagos, cuotas y CTAs ---------------- */
  function renderPayments() {
    var s = state.settings;
    var inst = $('#inst-list'); inst.textContent = '';
    s.installments.forEach(function (t, i) { inst.appendChild(instRow(t)); });

    var ctas = $('#cta-list'); ctas.textContent = '';
    s.ctas.forEach(function (c) { ctas.appendChild(ctaBox(c)); });
  }
  function instRow(text) {
    var row = h('div', { class: 'listrow' },
      h('input', { value: text, maxlength: '200', placeholder: 'Ej.: 3 cuotas sin interés', 'data-inst': '1' }),
      h('button', { class: 'linkbtn linkbtn--danger', type: 'button', onclick: function () { row.remove(); } }, 'Borrar'));
    return row;
  }
  function ctaBox(c) {
    var box = h('div', { class: 'ctabox', 'data-id': c.id || '' },
      h('label', { class: 'field' }, h('span', { text: 'Texto' }), h('textarea', { rows: '2', maxlength: '400', 'data-f': 'text', text: c.text || '' })),
      h('label', { class: 'field' }, h('span', { text: 'Texto del botón' }), h('input', { value: c.button || '', maxlength: '80', 'data-f': 'button' })),
      h('label', { class: 'field' }, h('span', { text: 'Mensaje que se envía por WhatsApp' }), h('textarea', { rows: '2', maxlength: '500', 'data-f': 'message', text: c.message || '' })),
      h('button', { class: 'linkbtn linkbtn--danger', type: 'button', onclick: function () { box.remove(); } }, 'Borrar este llamado a la acción'));
    return box;
  }
  $('#add-inst').addEventListener('click', function () { var r = instRow(''); $('#inst-list').appendChild(r); $('input', r).focus(); });
  $('#add-cta').addEventListener('click', function () { var b = ctaBox({}); $('#cta-list').appendChild(b); $('textarea', b).focus(); });

  /* ---------------- Textos y contacto ---------------- */
  function renderTexts() {
    var s = state.settings;
    $('#t-eyebrow').value = s.hero.eyebrow; $('#t-title').value = s.hero.title; $('#t-subtitle').value = s.hero.subtitle;
    $('#t-htitle').value = s.history.title; $('#t-hbody').value = s.history.body;
    $('#t-wa').value = s.whatsapp; $('#t-ig').value = s.instagram;
  }

  /* Un solo guardado para pagos + textos */
  function collectSettings() {
    return {
      whatsapp: $('#t-wa').value, instagram: $('#t-ig').value,
      hero: { eyebrow: $('#t-eyebrow').value, title: $('#t-title').value, subtitle: $('#t-subtitle').value },
      history: { title: $('#t-htitle').value, body: $('#t-hbody').value },
      installments: $$('#inst-list input[data-inst]').map(function (i) { return i.value; }),
      ctas: $$('#cta-list .ctabox').map(function (b) {
        return { id: b.getAttribute('data-id'), text: $('[data-f=text]', b).value, button: $('[data-f=button]', b).value, message: $('[data-f=message]', b).value };
      })
    };
  }
  $$('.js-save-settings').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      api('PUT', '/api/admin/settings', collectSettings()).then(function (s) {
        state.settings = s; renderPayments(); renderTexts(); toast('Cambios guardados');
      }).catch(function (e) { toast(e.message, true); }).then(function () { btn.disabled = false; });
    });
  });

  /* ---------------- Contraseña ---------------- */
  $('#pass-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('#p-new').value !== $('#p-new2').value) return toast('Las contraseñas nuevas no coinciden.', true);
    api('POST', '/api/admin/password', { current: $('#p-cur').value, next: $('#p-new').value }).then(function () {
      $('#pass-form').reset(); toast('Contraseña actualizada');
    }).catch(function (ex) { toast(ex.message, true); });
  });

  pm.addEventListener('click', function (e) { if (e.target === pm) pm.close(); });

  /* ---------------- Inicio ---------------- */
  api('GET', '/api/me').then(function (r) { if (r.authed) return loadAll(); showLogin(); }).catch(showLogin);
})();
