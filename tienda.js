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
let carrito = cargarCarrito();          // { [id]: cantidad }
let filtroCategoria = 'todos';
let busqueda = '';

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

// Config de cantidad según se venda por peso o por unidad
function cfgUnidad(p) {
  return p.porPeso
    ? { step: 0.5, min: 0.5, decimals: 1 }
    : { step: 1,   min: 1,   decimals: 0 };
}
const UNIDAD_CORTA = { kg: 'kg', unidad: 'un.', atado: 'atado', docena: 'doc.' };
const unidadCorta = (p) => UNIDAD_CORTA[p.unidad] || p.unidad;
const unidadLarga = (p) => p.unidad;

function fmtCantidad(cant, p) {
  const c = cfgUnidad(p);
  const num = cant.toLocaleString('es-AR', { maximumFractionDigits: c.decimals });
  return `${num} ${unidadCorta(p)}`;
}

function totalItems() {
  return Object.keys(carrito).filter(id => getProducto(id)).length;
}
function totalPedido() {
  return Object.entries(carrito).reduce((acc, [id, cant]) => {
    const p = getProducto(id);
    return p ? acc + p.precio * cant : acc;
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
  return PRODUCTOS_SEED.map((p, i) => ({ id: 'seed-' + i, orden: i * 10, ...p }));
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
  Object.keys(carrito).forEach(id => {
    const p = getProducto(id);
    if (!p || p.stock === false) { delete carrito[id]; cambio = true; }
  });
  if (cambio) guardarCarrito();
}

// ──────────────────────────────────────────
//  ACCIONES DEL CARRITO
// ──────────────────────────────────────────
function agregar(id) {
  const p = getProducto(id);
  if (!p || p.stock === false) return;
  carrito[id] = cfgUnidad(p).min;
  sincronizar();
}
function cambiarCantidad(id, delta) {
  const p = getProducto(id);
  if (!p) return;
  const u = cfgUnidad(p);
  const actual = carrito[id] ?? 0;
  let nueva = +(actual + delta * u.step).toFixed(2);
  if (nueva < u.min) { quitar(id); return; }
  carrito[id] = nueva;
  sincronizar();
}
function quitar(id) {
  delete carrito[id];
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
  renderControlesTarjetas();
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
          <div class="store-card-precio">
            <span class="precio">${fmtDinero(p.precio)}</span>
            <span class="precio-unidad">/ ${unidadLarga(p)}</span>
          </div>
          <div class="store-card-ctrl" data-ctrl="${p.id}"></div>
        </div>
      </article>
    `;
  }).join('');

  renderControlesTarjetas();
}

// Dibuja el botón "Agregar" o el stepper según si el producto está en el carrito.
function renderControlesTarjetas() {
  $$('[data-ctrl]').forEach(cont => {
    const id = cont.dataset.ctrl;
    const p = getProducto(id);
    if (!p) return;

    if (p.stock === false) {
      cont.innerHTML = `<button class="btn-agregar" disabled>Sin stock</button>`;
      return;
    }

    const cant = carrito[id];
    if (!cant) {
      cont.innerHTML = `<button class="btn-agregar" data-add="${id}">+ Agregar</button>`;
      $('[data-add]', cont).addEventListener('click', () => agregar(id));
    } else {
      cont.innerHTML = `
        <div class="stepper">
          <button class="step-btn" data-minus="${id}" aria-label="Restar">−</button>
          <span class="step-cant">${fmtCantidad(cant, p)}</span>
          <button class="step-btn" data-plus="${id}" aria-label="Sumar">+</button>
        </div>`;
      $('[data-minus]', cont).addEventListener('click', () => cambiarCantidad(id, -1));
      $('[data-plus]',  cont).addEventListener('click', () => cambiarCantidad(id,  1));
    }
  });
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
  const ids = Object.keys(carrito).filter(id => getProducto(id));

  if (!ids.length) {
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

  cont.innerHTML = ids.map(id => {
    const p = getProducto(id);
    const cant = carrito[id];
    return `
      <div class="cart-line" data-id="${id}">
        <div class="cart-line-img">${p.img ? `<img src="${p.img}" alt="${p.nombre}">` : '🥦'}</div>
        <div class="cart-line-info">
          <h5>${p.nombre}</h5>
          <span class="cart-line-precio">${fmtDinero(p.precio)} / ${unidadLarga(p)}</span>
          <div class="cart-line-bottom">
            <div class="stepper stepper-sm">
              <button class="step-btn" data-minus="${id}" aria-label="Restar">−</button>
              <span class="step-cant">${fmtCantidad(cant, p)}</span>
              <button class="step-btn" data-plus="${id}" aria-label="Sumar">+</button>
            </div>
            <span class="cart-line-sub">${fmtDinero(p.precio * cant)}</span>
          </div>
        </div>
        <button class="cart-line-del" data-del="${id}" aria-label="Quitar">✕</button>
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

  Object.keys(carrito).filter(id => getProducto(id)).forEach(id => {
    const p = getProducto(id);
    txt += `• ${fmtCantidad(carrito[id], p)} — ${p.nombre} — ${fmtDinero(p.precio * carrito[id])}\n`;
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
