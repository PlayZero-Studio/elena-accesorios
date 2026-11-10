'use strict';
/**
 * Elena Accesorios — servidor sin dependencias externas (solo módulos nativos de Node).
 * Sirve el sitio público, el panel de administración y la API.
 *
 *   node server.js                → http://localhost:3000
 *   Panel de administración       → http://localhost:3000/admin.html
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // las fotos viven junto a los datos (un solo disco para respaldar)
const DB_FILE = path.join(DATA_DIR, 'db.json');
const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */
const uid = () => crypto.randomBytes(6).toString('hex');
const clampStr = (v, max = 2000) => String(v == null ? '' : v).slice(0, max);
const PAY_METHODS = ['efectivo', 'transferencia', 'tarjeta'];
const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cat';

function writeJsonAtomic(file, obj) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ */
/*  Contraseña (hash scrypt; nunca se guarda en texto plano)           */
/* ------------------------------------------------------------------ */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(password, auth) {
  const { hash } = hashPassword(password, auth.salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(auth.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function loadAuth() {
  if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  // Primera ejecución: se toma la contraseña inicial de ADMIN_PASSWORD y se guarda solo su hash.
  const initial = process.env.ADMIN_PASSWORD;
  if (!initial) {
    console.error('\n[!] Primera ejecución: definí la contraseña inicial con la variable ADMIN_PASSWORD.\n' +
      '    Ejemplo:  ADMIN_PASSWORD="tu-clave" node server.js\n');
    process.exit(1);
  }
  const auth = hashPassword(initial);
  writeJsonAtomic(AUTH_FILE, auth);
  console.log('[ok] Contraseña de administración creada (se guardó únicamente su hash).');
  return auth;
}
let auth = loadAuth();

/* ------------------------------------------------------------------ */
/*  Base de datos (JSON)                                               */
/* ------------------------------------------------------------------ */
const HISTORY_TEXT = [
  '¡Hola! Soy Ro, docente de Nivel Inicial y creadora de Elena, un hermoso emprendimiento que dedico con mucho amor a mi tiempo libre.',
  '',
  'Este proyecto nació gracias al apoyo incondicional de mi familia y de mis amigas. Pero, principalmente, cobró vida gracias a Camilita: mi amiga, mi compañera y mi fiel clienta fanática de los anillos. Ella fue un ser de luz, noble, sincera y valiente, quien me impulsó y me dio el empujón definitivo cuando yo no me animaba a emprender. Cuando decidí dar el paso, fue la primera en enterarse y le encantó el nombre.',
  '',
  '## ¿Por qué Elena?',
  '',
  'El nombre de este emprendimiento es un homenaje de amor a mi abuela, Elena Susana. Ella fue la mejor abuela que me pudo haber tocado en la vida y siempre será mi motorcito.'
].join('\n');

function seed() {
  const cats = ['Llaveros', 'Denarios', 'Rosarios', 'Tarjetas', 'Prendedores', 'Otros'];
  return {
    categories: cats.map((name, i) => ({ id: slugify(name), name, order: i })),
    products: [],
    settings: {
      brand: 'Elena Accesorios',
      whatsapp: '5492244505043',
      instagram: 'https://www.instagram.com/elena.accesorios24',
      hero: {
        eyebrow: 'Agenda abierta',
        title: 'Pensados para acompañar momentos inolvidables',
        subtitle: 'Llaveros personalizados para momentos únicos e inolvidables'
      },
      history: { title: 'Nuestra Historia', body: HISTORY_TEXT },
      installments: ['3 cuotas sin interés'],
      ctas: [
        {
          id: 'cta1',
          text: '¿Tenés un evento en mente? Contanos y armamos juntas tus souvenirs.',
          button: 'Escribinos por WhatsApp',
          message: '¡Hola! Me gustaría consultar por souvenirs personalizados.'
        }
      ]
    }
  };
}
/* ------------------------------------------------------------------ */
/*  Guardado en archivos                                               */
/* ------------------------------------------------------------------ */
// productos.json      → todos los productos (se actualiza al agregar, editar o eliminar)
// contenido.json      → categorías, textos de la web, cuotas, llamados a la acción y contacto
// site/index.html     → la página principal, generada de nuevo cada vez que se guarda algo
// *.anterior.json     → copia de la versión previa de cada archivo (por si hay que volver atrás)
const PRODUCTS_FILE = path.join(DATA_DIR, 'productos.json');
const CONTENT_FILE = path.join(DATA_DIR, 'contenido.json');
const SITE_DIR = path.join(DATA_DIR, 'site');
const TEMPLATE_FILE = path.join(ROOT, 'templates', 'index.template.html');

function writeWithBackup(file, obj) {
  if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/\.json$/, '.anterior.json'));
  writeJsonAtomic(file, obj);
}

let db;
function loadDb() {
  const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  let content = read(CONTENT_FILE);
  let products = read(PRODUCTS_FILE);
  if (!content || !products) {
    // Primera vez con este formato: toma lo que hubiera en db.json (versión anterior) o los valores iniciales.
    const legacy = read(DB_FILE) || seed();
    content = content || { categories: legacy.categories, settings: legacy.settings };
    products = products || legacy.products || [];
  }
  return { categories: content.categories, settings: content.settings, products };
}
db = loadDb();
delete db.settings.payments;
db.products.forEach((p) => { if (!p.payments) p.payments = cleanPayments(null); });

/* ---- Generación del HTML ---- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PAY_LABELS = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta' };
const WA_ICON = '<svg><use href="#i-wa"/></svg>';
const waLink = (msg) => 'https://wa.me/' + String(db.settings.whatsapp || '').replace(/\D/g, '') + (msg ? '?text=' + encodeURIComponent(msg) : '');

function richHtml(text) {
  return String(text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
    .map((b) => (b.startsWith('## ') ? '<h3>' + esc(b.slice(3)) + '</h3>' : '<p>' + esc(b) + '</p>')).join('\n');
}
function payItems(p) {
  return PAY_METHODS.filter((k) => p.payments && p.payments[k] && p.payments[k].enabled).map((k) =>
    '<li><span class="payopts__label">' + PAY_LABELS[k] + '</span>' +
    (p.payments[k].price ? '<strong>' + esc(p.payments[k].price) + '</strong>' : '') + '</li>').join('');
}
function cardHtml(p) {
  const cat = (db.categories.find((c) => c.id === p.categoryId) || {}).name || '';
  const img = p.images.length
    ? '<img src="' + esc(p.images[0]) + '" alt="' + esc(p.title) + '" loading="lazy">' +
      (p.images.length > 1 ? '<span class="card__count">' + p.images.length + ' fotos</span>' : '')
    : '<div class="card__noimg">Elena</div>';
  const pays = payItems(p);
  return '<button class="card" type="button" data-id="' + esc(p.id) + '" data-cat="' + esc(p.categoryId) + '">' +
    '<div class="card__img">' + img + '</div><div class="card__body">' +
    (cat ? '<div class="card__cat">' + esc(cat) + '</div>' : '') +
    '<div class="card__title">' + esc(p.title) + '</div>' +
    '<ul class="payopts payopts--sm"' + (pays ? '' : ' hidden') + '>' + pays + '</ul></div></button>';
}

function renderSite() {
  const st = db.settings;
  const cats = [...db.categories].sort((a, b) => a.order - b.order);
  const ctas = st.ctas.map((c) =>
    '<div class="cta">' + (c.text ? '<p>' + esc(c.text) + '</p>' : '') +
    (c.button ? '<a class="btn btn--solid" href="' + esc(waLink(c.message)) + '" target="_blank" rel="noopener">' + WA_ICON + ' ' + esc(c.button) + '</a>' : '') +
    '</div>').join('');
  const inst = st.installments.length ? '<ul class="installments">' + st.installments.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '';
  const siteData = JSON.stringify({
    whatsapp: st.whatsapp,
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    products: db.products
  }).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16));

  const values = {
    WA_HREF: esc(waLink('¡Hola! Me gustaría hacerles una consulta.')),
    IG_HREF: esc(st.instagram),
    HERO_EYEBROW: esc(st.hero.eyebrow),
    HERO_TITLE: esc(st.hero.title),
    HERO_SUBTITLE: esc(st.hero.subtitle),
    CHIPS: '<button class="chip" role="tab" type="button" data-cat="all" aria-selected="true">Todos</button>' +
      cats.map((c) => '<button class="chip" role="tab" type="button" data-cat="' + esc(c.id) + '" aria-selected="false">' + esc(c.name) + '</button>').join(''),
    GRID: db.products.map(cardHtml).join(''),
    EMPTY_HIDDEN: db.products.length ? ' hidden' : '',
    EMPTY_TEXT: db.products.length ? 'Todavía no hay productos en esta categoría.' : 'Muy pronto vas a encontrar acá nuestros souvenirs. ¡Escribinos y contanos qué estás imaginando!',
    BAND_MODS: ctas || inst ? '' : ' band__in--solo',
    CTAS: ctas + inst,
    HISTORY_TITLE: esc(st.history.title),
    HISTORY_BODY: richHtml(st.history.body),
    SITE_DATA: siteData
  };
  // Un solo reemplazo: lo que escriba la clienta nunca se vuelve a interpretar como plantilla.
  const html = fs.readFileSync(TEMPLATE_FILE, 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in values ? values[k] : m));
  fs.mkdirSync(SITE_DIR, { recursive: true });
  const out = path.join(SITE_DIR, 'index.html');
  fs.writeFileSync(out + '.tmp', html);
  fs.renameSync(out + '.tmp', out);
}

/* Cada cambio en el panel guarda los archivos y vuelve a generar la página. */
function saveDb() {
  writeWithBackup(PRODUCTS_FILE, db.products);
  writeWithBackup(CONTENT_FILE, { categories: db.categories, settings: db.settings });
  try { renderSite(); } catch (err) { console.error('[!] No se pudo generar index.html:', err); }
}

/* ------------------------------------------------------------------ */
/*  Validación                                                         */
/* ------------------------------------------------------------------ */
function cleanImages(list) {
  if (!Array.isArray(list)) return [];
  return list.filter((u) => typeof u === 'string' && /^\/uploads\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(u));
}
function cleanPayments(p) {
  const out = {};
  PAY_METHODS.forEach((k) => {
    const x = (p && typeof p === 'object' && p[k]) || {};
    out[k] = { enabled: !!x.enabled, price: clampStr(x.price, 60).trim(), text: clampStr(x.text, 200).trim() };
  });
  return out;
}
function cleanSettings(s, current) {
  const out = JSON.parse(JSON.stringify(current));
  if (!s || typeof s !== 'object') return out;
  if (typeof s.whatsapp === 'string') out.whatsapp = s.whatsapp.replace(/\D/g, '').slice(0, 20);
  if (typeof s.instagram === 'string') {
    const u = s.instagram.trim().slice(0, 300);
    out.instagram = /^https:\/\//i.test(u) ? u : current.instagram;
  }
  if (s.hero && typeof s.hero === 'object') {
    out.hero = {
      eyebrow: clampStr(s.hero.eyebrow, 80),
      title: clampStr(s.hero.title, 200),
      subtitle: clampStr(s.hero.subtitle, 300)
    };
  }
  if (s.history && typeof s.history === 'object') {
    out.history = { title: clampStr(s.history.title, 120), body: clampStr(s.history.body, 12000) };
  }
  delete out.payments; // los medios de pago ahora son por producto
  if (Array.isArray(s.installments)) {
    out.installments = s.installments.map((t) => clampStr(t, 200).trim()).filter(Boolean).slice(0, 30);
  }
  if (Array.isArray(s.ctas)) {
    out.ctas = s.ctas.slice(0, 20).map((c) => ({
      id: /^[a-z0-9]{3,20}$/.test(c && c.id) ? c.id : 'c' + uid(),
      text: clampStr(c && c.text, 400).trim(),
      button: clampStr(c && c.button, 80).trim(),
      message: clampStr(c && c.message, 500).trim()
    })).filter((c) => c.text || c.button);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Sesiones y límite de intentos                                      */
/* ------------------------------------------------------------------ */
const sessions = new Map(); // token -> expiración
const SESSION_MS = 1000 * 60 * 60 * 8;
const attempts = new Map(); // ip -> {count, until}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  const t = parseCookies(req).elena_sid;
  const exp = t && sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'x';
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v < now) sessions.delete(k);
  for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
}, 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/*  HTTP helpers                                                       */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SEC_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) =>
  send(res, status, JSON.stringify(obj), { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...headers });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Archivo demasiado grande'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let file;
  if (pathname === '/' || pathname === '/index.html') {
    file = path.join(SITE_DIR, 'index.html');
  } else if (pathname.startsWith('/uploads/')) {
    file = path.join(UPLOAD_DIR, path.basename(decodeURIComponent(pathname)));
  } else {
    file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Prohibido');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'No encontrado', { 'Content-Type': MIME['.txt'] });
    const ext = path.extname(file).toLowerCase();
    const isUpload = file.startsWith(UPLOAD_DIR + path.sep);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': isUpload ? 'public, max-age=31536000, immutable' : 'no-cache'
    };
    if (path.basename(file) === 'admin.html') headers['X-Robots-Tag'] = 'noindex, nofollow';
    res.writeHead(200, { ...SEC_HEADERS, ...headers });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function removeUpload(url) {
  if (!/^\/uploads\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(url)) return;
  fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

/* ------------------------------------------------------------------ */
/*  Rutas de la API                                                    */
/* ------------------------------------------------------------------ */
const publicData = () => ({
  categories: [...db.categories].sort((a, b) => a.order - b.order),
  products: db.products,
  settings: db.settings
});

async function handleApi(req, res, pathname) {
  const method = req.method;

  if (method === 'GET' && pathname === '/api/site') return json(res, 200, publicData());

  if (method === 'POST' && pathname === '/api/login') {
    const ip = clientIp(req);
    const a = attempts.get(ip);
    if (a && a.until > Date.now() && a.count >= 5) {
      return json(res, 429, { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' });
    }
    const body = await readBody(req, 10 * 1024);
    if (typeof body.password === 'string' && checkPassword(body.password, auth)) {
      attempts.delete(ip);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      const secure = (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
      return json(res, 200, { ok: true }, {
        'Set-Cookie': `elena_sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`
      });
    }
    const cur = a && a.until > Date.now() ? a : { count: 0, until: Date.now() + 15 * 60 * 1000 };
    cur.count += 1;
    attempts.set(ip, cur);
    return json(res, 401, { error: 'Contraseña incorrecta.' });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const t = parseCookies(req).elena_sid;
    if (t) sessions.delete(t);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'elena_sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (method === 'GET' && pathname === '/api/me') return json(res, 200, { authed: isAuthed(req) });

  /* ---- Desde acá, todo requiere sesión ---- */
  if (!pathname.startsWith('/api/admin/')) return json(res, 404, { error: 'No encontrado' });
  if (!isAuthed(req)) return json(res, 401, { error: 'Sesión vencida. Volvé a ingresar.' });
  if (method !== 'GET' && !(req.headers['content-type'] || '').startsWith('application/json')) {
    return json(res, 415, { error: 'Content-Type inválido' });
  }
  const rest = pathname.slice('/api/admin/'.length).split('/');
  const [resource, id] = rest;

  if (method === 'GET' && resource === 'data') return json(res, 200, publicData());

  /* Ajustes (pagos, cuotas, CTAs, textos, contacto) */
  if (method === 'PUT' && resource === 'settings') {
    const body = await readBody(req, 200 * 1024);
    db.settings = cleanSettings(body, db.settings);
    saveDb();
    return json(res, 200, db.settings);
  }

  /* Categorías */
  if (resource === 'categories') {
    if (method === 'POST' && !id) {
      const body = await readBody(req, 10 * 1024);
      const name = clampStr(body.name, 60).trim();
      if (!name) return json(res, 400, { error: 'Escribí un nombre para la categoría.' });
      let base = slugify(name), cid = base, n = 2;
      while (db.categories.some((c) => c.id === cid)) cid = base + '-' + n++;
      const cat = { id: cid, name, order: db.categories.reduce((m, c) => Math.max(m, c.order), -1) + 1 };
      db.categories.push(cat); saveDb();
      return json(res, 201, cat);
    }
    const cat = db.categories.find((c) => c.id === id);
    if (!cat) return json(res, 404, { error: 'Categoría inexistente' });
    if (method === 'PUT') {
      const body = await readBody(req, 10 * 1024);
      const name = clampStr(body.name, 60).trim();
      if (!name) return json(res, 400, { error: 'Escribí un nombre para la categoría.' });
      cat.name = name;
      if (Number.isFinite(body.order)) cat.order = body.order;
      saveDb();
      return json(res, 200, cat);
    }
    if (method === 'DELETE') {
      db.categories = db.categories.filter((c) => c.id !== id);
      db.products.forEach((p) => { if (p.categoryId === id) p.categoryId = ''; });
      saveDb();
      return json(res, 200, { ok: true });
    }
  }

  /* Productos */
  if (resource === 'products') {
    const pick = (b) => ({
      title: clampStr(b.title, 120).trim(),
      description: clampStr(b.description, 4000).trim(),
      price: clampStr(b.price, 60).trim(),
      categoryId: db.categories.some((c) => c.id === b.categoryId) ? b.categoryId : '',
      images: cleanImages(b.images),
      payments: cleanPayments(b.payments)
    });
    if (method === 'POST' && !id) {
      const body = await readBody(req, 200 * 1024);
      const p = pick(body);
      if (!p.title) return json(res, 400, { error: 'El producto necesita un título.' });
      const prod = { id: uid(), ...p, createdAt: Date.now() };
      db.products.unshift(prod); saveDb();
      return json(res, 201, prod);
    }
    const prod = db.products.find((p) => p.id === id);
    if (!prod) return json(res, 404, { error: 'Producto inexistente' });
    if (method === 'PUT') {
      const body = await readBody(req, 200 * 1024);
      const p = pick(body);
      if (!p.title) return json(res, 400, { error: 'El producto necesita un título.' });
      prod.images.filter((u) => !p.images.includes(u)).forEach(removeUpload);
      Object.assign(prod, p); saveDb();
      return json(res, 200, prod);
    }
    if (method === 'DELETE') {
      prod.images.forEach(removeUpload);
      db.products = db.products.filter((p) => p.id !== id); saveDb();
      return json(res, 200, { ok: true });
    }
  }

  /* Subida de fotos (el navegador envía cada foto como data URL) */
  if (method === 'POST' && resource === 'upload') {
    const body = await readBody(req, 12 * 1024 * 1024);
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data || '');
    if (!m) return json(res, 400, { error: 'Formato de imagen no válido (JPG, PNG o WEBP).' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return json(res, 413, { error: 'La imagen supera los 8 MB.' });
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return json(res, 201, { url: '/uploads/' + name });
  }

  /* Cambio de contraseña */
  if (method === 'POST' && resource === 'password') {
    const body = await readBody(req, 10 * 1024);
    if (!checkPassword(String(body.current || ''), auth)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
    const next = String(body.next || '');
    if (next.length < 8) return json(res, 400, { error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    auth = hashPassword(next);
    writeJsonAtomic(AUTH_FILE, auth);
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'No encontrado' });
}

/* ------------------------------------------------------------------ */
/*  Servidor                                                           */
/* ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Método no permitido');
    return serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'Error interno del servidor' : err.message });
  }
});
saveDb(); // crea productos.json / contenido.json (migra db.json si existía) y genera la portada
server.listen(PORT, () => console.log(`Elena Accesorios en http://localhost:${PORT}  ·  Panel: /admin.html`));

/* ---- Render: apagado ordenado ---- */
process.on('SIGTERM', () => {
  console.log('Apagando...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
});
