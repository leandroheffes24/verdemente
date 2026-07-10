// ════════════════════════════════════════════════════════════════
//  VERDEMENTE · TIENDA ONLINE
//  Carrito de compras + pedido por WhatsApp
//  Productos: se leen de Supabase (o del catálogo semilla si no está
//  configurado). Depende de: supabase-config.js, catalogo-seed.js
// ════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
//  CONFIGURACIÓN
// ──────────────────────────────────────────
const WA_NUMERO = '5491159391818';                 // WhatsApp de la verdulería (sin + ni espacios)
const DIRECCION_LOCAL = 'Av. 9 de Julio 863, Colonia San Miguel Arcángel';

// ──────────────────────────────────────────
//  ESTADO
// ──────────────────────────────────────────
const STORAGE_KEY = 'verdemente_carrito';
let PRODUCTOS = [];                     // catálogo vivo (Supabase o semilla)
let CATEGORIAS_DB = [];                 // categorías (nombre + orden) desde Supabase
let carrito = cargarCarrito();          // { [claveItem]: cantidad }
let filtroCategoria = 'todos';
let busqueda = '';
let medidaSeleccionada = {};            // { [idProducto]: 'kg' | 'un' | 'base' } (para productos duales)

function cargarCarrito() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch (e) { return {}; }
}
function guardarCarrito() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(carrito));
}

// ──────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const getProducto = (id) => PRODUCTOS.find(p => String(p.id) === String(id));

function fmtDinero(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

// ── Medidas de un producto ──
// Un producto se vende por una sola medida, o (dual) por kg Y por unidad,
// con un precio para cada una. El cliente elige.
const num = (x) => { const n = Number(x); return (isFinite(n) && n > 0) ? n : null; };

function medidasDe(p) {
  if (p.dual) {
    const pk = num(p.precio);        // precio por kg (o null)
    const pu = num(p.precioUnidad);  // precio por unidad (o null)
    return [
      descDual('kg', 'kg',     true,  pk, pu, 'unidad'),
      descDual('un', 'unidad', false, pu, pk, 'kg'),
    ];
  }
  return [{ medida: 'base', label: p.unidad, precio: Number(p.precio), porPeso: !!p.porPeso, ref: false }];
}

// Descriptor de una medida en un producto dual.
//   propio = precio propio de esta medida (o null)
//   otro   = precio de la otra medida (referencia)
function descDual(medida, label, porPeso, propio, otro, refDeLabel) {
  if (propio != null) {
    return { medida, label, porPeso, precio: propio, ref: false };
  }
  // Sin precio propio → se muestra el de la otra medida como referencia
  return {
    medida, label, porPeso,
    precio: (otro != null ? otro : 0),
    ref: true,
    refDe: refDeLabel,
    nota: porPeso
      ? 'Precio de referencia; el total se confirma al pesar tu pedido.'
      : 'El precio final varía según el kilaje de las unidades que elijas.',
  };
}
function medidaDe(p, medida) {
  const ms = medidasDe(p);
  return ms.find(m => m.medida === medida) || ms[0];
}
function cfgMedida(m) {
  return m.porPeso ? { step: 0.5, min: 0.5, decimals: 1 } : { step: 1, min: 1, decimals: 0 };
}

// Clave del carrito = id + medida (para tener kg y unidad del mismo producto por separado)
const claveItem = (id, medida) => `${id}::${medida}`;
function parseClave(key) {
  const i = key.lastIndexOf('::');
  return i < 0 ? { id: key, medida: 'base' } : { id: key.slice(0, i), medida: key.slice(i + 2) };
}

const UNIDAD_CORTA = { kg: 'kg', unidad: 'un.', atado: 'atado', docena: 'doc.' };
const labelCorto = (m) => UNIDAD_CORTA[m.label] || m.label;
const labelLargo = (m) => m.label;
const textoMedida = (m) => m.label === 'kg' ? 'por kg' : (m.label === 'unidad' ? 'por unidad' : ('por ' + m.label));

function fmtCantidad(cant, m) {
  const c = cfgMedida(m);
  const num = cant.toLocaleString('es-AR', { maximumFractionDigits: c.decimals });
  return `${num} ${labelCorto(m)}`;
}

function totalItems() {
  return Object.keys(carrito).filter(k => getProducto(parseClave(k).id)).length;
}
function totalPedido() {
  return Object.entries(carrito).reduce((acc, [key, cant]) => {
    const { id, medida } = parseClave(key);
    const p = getProducto(id);
    if (!p) return acc;
    const m = medidaDe(p, medida);
    return m.ref ? acc : acc + m.precio * cant;   // las de referencia no suman (se cobran según kilaje)
  }, 0);
}

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const catBySlug = (slug) => CATEGORIAS_DB.find(c => c.slug === slug);

// Categorías presentes en el catálogo (para los filtros)
function categoriasPresentes() {
  const set = [...new Set(PRODUCTOS.map(p => p.categoria).filter(Boolean))];
  const ord = (cat) => catBySlug(cat)?.orden ?? CAT_INFO[cat]?.orden ?? 99;
  set.sort((a, b) => (ord(a) - ord(b)) || a.localeCompare(b));
  return set;
}
function nombreCategoria(cat) {
  const c = catBySlug(cat);
  if (c) return c.nombre;
  return CAT_INFO[cat]?.nombre || ('🏷️ ' + cap(cat));
}
function badgeCategoria(cat) {
  const c = catBySlug(cat);
  if (c) return c.nombre;
  return CAT_INFO[cat]?.badge || ('🏷️ ' + cap(cat));
}

// ──────────────────────────────────────────
//  CARGA DE PRODUCTOS (Supabase o semilla)
// ──────────────────────────────────────────
function semillaConId() {
  return PRODUCTOS_SEED.map((p, i) => ({ id: 'seed-' + i, orden: i * 10, ...p }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}

function cargarProductos() {
  $('#storeGrid').innerHTML = `<p class="store-empty-grid">Cargando productos…</p>`;

  if (DB.listo) {
    // Fuente real: Supabase. Se actualiza en vivo (Realtime).
    DB.suscribir(
      (lista) => {
        PRODUCTOS = lista.length ? lista : semillaConId();  // sin productos aún → mostramos ejemplo
        trasCargar();
      },
      (err) => {
        console.warn('No se pudo leer Supabase, uso catálogo local:', err);
        PRODUCTOS = semillaConId();
        trasCargar();
      }
    );
    // Nombres y orden de las categorías (para los filtros)
    if (DB.suscribirCategorias) {
      DB.suscribirCategorias(
        (lista) => { CATEGORIAS_DB = lista; if (PRODUCTOS.length) { renderCategorias(); renderProductos(); } },
        (err) => console.warn('No se pudieron cargar las categorías:', err)
      );
    }
  } else {
    // Supabase no configurado → catálogo de ejemplo
    PRODUCTOS = semillaConId();
    trasCargar();
  }
}

function trasCargar() {
  limpiarCarrito();
  renderCategorias();
  renderProductos();
  actualizarContador();
  renderCarrito();
}

// Saca del carrito lo que ya no existe o quedó sin stock
function limpiarCarrito() {
  let cambio = false;
  Object.keys(carrito).forEach(key => {
    const p = getProducto(parseClave(key).id);
    if (!p || p.stock === false) { delete carrito[key]; cambio = true; }
  });
  if (cambio) guardarCarrito();
}

// ──────────────────────────────────────────
//  ACCIONES DEL CARRITO
// ──────────────────────────────────────────
function agregar(id, medida) {
  const p = getProducto(id);
  if (!p || p.stock === false) return;
  const m = medidaDe(p, medida);
  carrito[claveItem(id, m.medida)] = cfgMedida(m).min;
  sincronizar();
}
function cambiarCantidad(key, delta) {
  const { id, medida } = parseClave(key);
  const p = getProducto(id);
  if (!p) return;
  const c = cfgMedida(medidaDe(p, medida));
  const actual = carrito[key] ?? 0;
  let nueva = +(actual + delta * c.step).toFixed(2);
  if (nueva < c.min) { quitar(key); return; }
  carrito[key] = nueva;
  sincronizar();
}
function quitar(key) {
  delete carrito[key];
  sincronizar();
}
function vaciarCarrito() {
  carrito = {};
  sincronizar();
}

// Re-renderiza todo lo que depende del carrito y persiste.
function sincronizar() {
  guardarCarrito();
  actualizarContador();
  renderDinamicos();
  renderCarrito();
}

// ──────────────────────────────────────────
//  RENDER · FILTROS
// ──────────────────────────────────────────
function renderCategorias() {
  const cont = $('#storeCats');
  const cats = ['todos', ...categoriasPresentes()];
  if (!cats.includes(filtroCategoria)) filtroCategoria = 'todos';

  cont.innerHTML = cats.map(c => `
    <button class="cat-chip ${c === filtroCategoria ? 'active' : ''}" data-cat="${c}">
      ${c === 'todos' ? '🛒 Todos' : nombreCategoria(c)}
    </button>
  `).join('');

  $$('.cat-chip', cont).forEach(btn => {
    btn.addEventListener('click', () => {
      filtroCategoria = btn.dataset.cat;
      renderCategorias();
      renderProductos();
    });
  });
}

function productosVisibles() {
  const q = busqueda.trim().toLowerCase();
  return PRODUCTOS.filter(p => {
    const okCat = filtroCategoria === 'todos' || p.categoria === filtroCategoria;
    const okBusq = !q || (p.nombre || '').toLowerCase().includes(q) || (p.detalle || '').toLowerCase().includes(q);
    return okCat && okBusq;
  });
}

// ──────────────────────────────────────────
//  RENDER · GRILLA DE PRODUCTOS
// ──────────────────────────────────────────
function renderProductos() {
  const grid = $('#storeGrid');
  const lista = productosVisibles();

  if (!lista.length) {
    grid.innerHTML = `<p class="store-empty-grid">No encontramos productos con ese criterio. 🥲</p>`;
    return;
  }

  grid.innerHTML = lista.map(p => {
    const agotado = p.stock === false;
    return `
      <article class="store-card ${agotado ? 'agotado' : ''}" data-id="${p.id}">
        <div class="store-card-img">
          ${p.img ? `<img src="${p.img}" alt="${p.nombre}" loading="lazy">` : ''}
          ${p.categoria ? `<span class="store-card-cat">${badgeCategoria(p.categoria)}</span>` : ''}
          ${agotado ? `<span class="store-card-agotado">Sin stock</span>` : ''}
        </div>
        <div class="store-card-body">
          <h4>${p.nombre}</h4>
          ${p.detalle ? `<p class="store-card-detalle">${p.detalle}</p>` : ''}
          <div class="store-card-dyn" data-dyn="${p.id}"></div>
        </div>
      </article>
    `;
  }).join('');

  renderDinamicos();
}

// Redibuja la zona dinámica de cada tarjeta (selector de medida + precio + control)
function renderDinamicos() {
  $$('[data-dyn]').forEach(pintarDinamico);
}

function pintarDinamico(cont) {
  const id = cont.dataset.dyn;
  const p = getProducto(id);
  if (!p) return;

  const agotado = p.stock === false;
  const medidas = medidasDe(p);
  let sel = medidaSeleccionada[id];
  if (!medidas.some(m => m.medida === sel)) sel = medidas[0].medida;
  const m = medidas.find(x => x.medida === sel);
  const key = claveItem(id, m.medida);
  const cant = carrito[key];

  let html = '';
  if (p.dual) {
    html += `<div class="medida-toggle">` + medidas.map(mm =>
      `<button type="button" class="med-btn ${mm.medida === sel ? 'active' : ''}" data-med="${mm.medida}">${mm.label === 'kg' ? 'Por kg' : 'Por unidad'}</button>`
    ).join('') + `</div>`;
  }
  if (m.ref) {
    html += `<div class="store-card-precio"><span class="precio precio-ref">≈ ${fmtDinero(m.precio)}</span><span class="precio-unidad">/ ${m.refDe} (ref.)</span></div>`;
    html += `<p class="precio-nota">⚖️ ${m.nota}</p>`;
  } else {
    html += `<div class="store-card-precio"><span class="precio">${fmtDinero(m.precio)}</span><span class="precio-unidad">/ ${labelLargo(m)}</span></div>`;
  }

  if (agotado) {
    html += `<button class="btn-agregar" disabled>Sin stock</button>`;
  } else if (!cant) {
    html += `<button class="btn-agregar" data-add>+ Agregar</button>`;
  } else {
    html += `<div class="stepper">
      <button class="step-btn" data-minus aria-label="Restar">−</button>
      <span class="step-cant">${fmtCantidad(cant, m)}</span>
      <button class="step-btn" data-plus aria-label="Sumar">+</button>
    </div>`;
  }
  cont.innerHTML = html;

  $$('.med-btn', cont).forEach(b => b.addEventListener('click', () => {
    medidaSeleccionada[id] = b.dataset.med;
    pintarDinamico(cont);
  }));
  const add = $('[data-add]', cont);   if (add)   add.addEventListener('click', () => agregar(id, sel));
  const minus = $('[data-minus]', cont); if (minus) minus.addEventListener('click', () => cambiarCantidad(key, -1));
  const plus = $('[data-plus]', cont);  if (plus)  plus.addEventListener('click', () => cambiarCantidad(key, 1));
}

// ──────────────────────────────────────────
//  RENDER · CARRITO (DRAWER)
// ──────────────────────────────────────────
function actualizarContador() {
  const n = totalItems();
  $$('.cart-count').forEach(el => {
    el.textContent = n;
    el.classList.toggle('is-empty', n === 0);
  });
}

function renderCarrito() {
  const cont = $('#cartItems');
  const keys = Object.keys(carrito).filter(k => getProducto(parseClave(k).id));

  if (!keys.length) {
    cont.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-emoji">🛒</span>
        <p>Tu carrito está vacío.</p>
        <span>Agregá productos frescos para empezar tu pedido.</span>
      </div>`;
    $$('.js-total').forEach(el => el.textContent = fmtDinero(0));
    $('#btnCheckout').disabled = true;
    $('#btnVaciar').classList.add('oculto');
    return;
  }

  cont.innerHTML = keys.map(key => {
    const { id, medida } = parseClave(key);
    const p = getProducto(id);
    const m = medidaDe(p, medida);
    const cant = carrito[key];
    const tag = p.dual ? `<span class="cart-medida">${textoMedida(m)}</span>` : '';
    const precioLinea = m.ref ? `ref. ${fmtDinero(m.precio)} / ${m.refDe}` : `${fmtDinero(m.precio)} / ${labelLargo(m)}`;
    const subLinea = m.ref ? `<span class="cart-line-sub ref">según kilaje</span>` : `<span class="cart-line-sub">${fmtDinero(m.precio * cant)}</span>`;
    return `
      <div class="cart-line" data-key="${key}">
        <div class="cart-line-img">${p.img ? `<img src="${p.img}" alt="${p.nombre}">` : '🥦'}</div>
        <div class="cart-line-info">
          <h5>${p.nombre} ${tag}</h5>
          <span class="cart-line-precio">${precioLinea}</span>
          <div class="cart-line-bottom">
            <div class="stepper stepper-sm">
              <button class="step-btn" data-minus="${key}" aria-label="Restar">−</button>
              <span class="step-cant">${fmtCantidad(cant, m)}</span>
              <button class="step-btn" data-plus="${key}" aria-label="Sumar">+</button>
            </div>
            ${subLinea}
          </div>
        </div>
        <button class="cart-line-del" data-del="${key}" aria-label="Quitar">✕</button>
      </div>`;
  }).join('');

  $$('[data-minus]', cont).forEach(b => b.addEventListener('click', () => cambiarCantidad(b.dataset.minus, -1)));
  $$('[data-plus]',  cont).forEach(b => b.addEventListener('click', () => cambiarCantidad(b.dataset.plus,  1)));
  $$('[data-del]',   cont).forEach(b => b.addEventListener('click', () => quitar(b.dataset.del)));

  $$('.js-total').forEach(el => el.textContent = fmtDinero(totalPedido()));
  $('#btnCheckout').disabled = false;
  $('#btnVaciar').classList.remove('oculto');
}

// ──────────────────────────────────────────
//  ABRIR / CERRAR DRAWER
// ──────────────────────────────────────────
function abrirCarrito() {
  irAPaso('items');
  $('#cartDrawer').classList.add('open');
  $('#cartOverlay').classList.add('open');
  document.body.classList.add('cart-abierto');
  document.body.style.overflow = 'hidden';
}
function cerrarCarrito() {
  $('#cartDrawer').classList.remove('open');
  $('#cartOverlay').classList.remove('open');
  document.body.classList.remove('cart-abierto');
  document.body.style.overflow = '';
}
function irAPaso(paso) {
  $('#cartDrawer').dataset.step = paso;
}

// ──────────────────────────────────────────
//  CHECKOUT · ENVÍO / RETIRO
// ──────────────────────────────────────────
function toggleDireccion() {
  const esEnvio = $('input[name="entrega"]:checked').value === 'envio';
  $('#campoDireccion').classList.toggle('oculto', !esEnvio);
}

function validarCheckout() {
  let ok = true;
  const requeridos = ['nombre', 'telefono'];
  if ($('input[name="entrega"]:checked').value === 'envio') requeridos.push('direccion');

  $$('.field-error').forEach(e => e.classList.remove('field-error'));
  requeridos.forEach(name => {
    const input = $(`#form-${name}`);
    if (!input.value.trim()) { input.classList.add('field-error'); ok = false; }
  });
  return ok;
}

// ──────────────────────────────────────────
//  ARMAR MENSAJE + ENVIAR A WHATSAPP
// ──────────────────────────────────────────
function armarMensaje() {
  const nombre    = $('#form-nombre').value.trim();
  const telefono  = $('#form-telefono').value.trim();
  const entrega   = $('input[name="entrega"]:checked').value;
  const direccion = $('#form-direccion').value.trim();
  const coment    = $('#form-comentarios').value.trim();

  let txt = '¡Hola Verdemente! 🌿 Quiero hacer un pedido:\n\n🛒 *Mi pedido*\n';

  Object.keys(carrito).filter(k => getProducto(parseClave(k).id)).forEach(key => {
    const { id, medida } = parseClave(key);
    const p = getProducto(id);
    const m = medidaDe(p, medida);
    const cant = carrito[key];
    const extra = p.dual ? ` (${textoMedida(m)})` : '';
    if (m.ref) {
      txt += `• ${fmtCantidad(cant, m)} — ${p.nombre}${extra} — precio según kilaje (ref. ${fmtDinero(m.precio)}/${m.refDe})\n`;
    } else {
      txt += `• ${fmtCantidad(cant, m)} — ${p.nombre}${extra} — ${fmtDinero(m.precio * cant)}\n`;
    }
  });

  txt += `\n💰 *Total estimado:* ${fmtDinero(totalPedido())}\n`;
  txt += '_(El precio final puede variar según el peso)_\n\n';
  txt += `👤 *Nombre:* ${nombre}\n`;
  txt += `📱 *Teléfono:* ${telefono}\n`;

  if (entrega === 'envio') {
    txt += `🛵 *Entrega:* Envío a domicilio\n📍 *Dirección:* ${direccion}\n`;
  } else {
    txt += `🏪 *Entrega:* Retiro en el local\n📍 *Local:* ${DIRECCION_LOCAL}\n`;
  }
  if (coment) txt += `📝 *Comentarios:* ${coment}\n`;

  txt += '\n¡Gracias! 🙌';
  return txt;
}

function enviarPedido() {
  if (!totalItems()) return;
  if (!validarCheckout()) return;
  const url = `https://wa.me/${WA_NUMERO}?text=${encodeURIComponent(armarMensaje())}`;
  window.open(url, '_blank');
}

// ──────────────────────────────────────────
//  NAV SCROLL (igual que la home)
// ──────────────────────────────────────────
function initNavScroll() {
  const nav = $('#mainNav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// ──────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────
function init() {
  initNavScroll();
  cargarProductos();

  $('#storeSearch').addEventListener('input', (e) => {
    busqueda = e.target.value;
    renderProductos();
  });

  $$('.js-open-cart').forEach(b => b.addEventListener('click', abrirCarrito));
  $('#cartClose').addEventListener('click', cerrarCarrito);
  $('#cartOverlay').addEventListener('click', cerrarCarrito);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarCarrito(); });

  $('#btnCheckout').addEventListener('click', () => { if (totalItems()) irAPaso('checkout'); });
  $('#btnBackItems').addEventListener('click', () => irAPaso('items'));
  $('#btnVaciar').addEventListener('click', () => {
    if (!totalItems()) return;
    if (confirm('¿Vaciar el carrito? Se van a quitar todos los productos.')) vaciarCarrito();
  });

  $$('input[name="entrega"]').forEach(r => r.addEventListener('change', toggleDireccion));
  toggleDireccion();

  $('#formCheckout').addEventListener('submit', (e) => { e.preventDefault(); enviarPedido(); });
}

document.addEventListener('DOMContentLoaded', init);
