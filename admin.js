// ════════════════════════════════════════════════════════════════
//  VERDEMENTE · PANEL DE ADMINISTRACIÓN
//  Login con Supabase Auth + CRUD de productos en Supabase.
//  Depende de: supabase-config.js (capa DB), catalogo-seed.js
// ════════════════════════════════════════════════════════════════

const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const show = (s) => $(s).classList.remove('oculto');
const hide = (s) => $(s).classList.add('oculto');

const money = (n) => '$' + Math.round(n).toLocaleString('es-AR');

let productos = [];
let editId = null;
let busq = '';
let canal = null;             // suscripción realtime
let imagenPendiente = null;   // Blob de imagen comprimida, a subir al guardar
let previewURL = null;        // object URL para la vista previa local
let categorias = [];          // categorías desde Supabase
let canalCat = null;          // suscripción realtime de categorías
let sugerencias = [];         // sugerencias / reportes anónimos
let canalSug = null;          // suscripción realtime de sugerencias

// Escapa texto de terceros antes de meterlo en el DOM (evita inyección)
const escapeHtml = (s) => (s == null ? '' : String(s))
  .replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

const CATEGORIAS_DEFAULT = [
  { nombre: '🍎 Frutas',    slug: 'frutas',    orden: 10 },
  { nombre: '🥦 Verduras',  slug: 'verduras',  orden: 20 },
  { nombre: '🌾 Dietética', slug: 'dietetica', orden: 30 },
  { nombre: '🛒 Almacén',   slug: 'almacen',   orden: 40 },
];

// nombre → slug (sin acentos, minúsculas, con guiones)
function slugify(s) {
  return (s || '').toString().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'otros';
}
// slug → nombre presentable (para categorías todavía sin registrar)
function bonito(slug) {
  return (slug || '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

// ──────────────────────────────────────────
//  ARRANQUE
// ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (typeof DB === 'undefined' || !DB.listo) {
    show('#noConfig');
    return;
  }
  initApp();
});

function initApp() {
  // Login / logout
  $('#formLogin').addEventListener('submit', onLogin);
  $('#btnLogout').addEventListener('click', () => DB.logout());

  // Acciones
  $('#btnNuevo').addEventListener('click', () => abrirForm());
  $('#btnSeed').addEventListener('click', importarSemilla);
  $('#adminSearch').addEventListener('input', (e) => { busq = e.target.value; renderLista(); });

  // Categorías (modal)
  $('#btnCategorias').addEventListener('click', abrirCategorias);
  $('#catClose').addEventListener('click', cerrarCategorias);
  $('#catOverlay').addEventListener('click', (e) => { if (e.target.id === 'catOverlay') cerrarCategorias(); });
  $('#btnAddCat').addEventListener('click', agregarCategoria);
  $('#cat-nueva').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCategoria(); } });
  $('#btnSyncCat').addEventListener('click', sincronizarCategorias);

  // Sugerencias (modal)
  $('#btnSugerencias').addEventListener('click', abrirSugerencias);
  $('#sugClose').addEventListener('click', cerrarSugerencias);
  $('#sugOverlay').addEventListener('click', (e) => { if (e.target.id === 'sugOverlay') cerrarSugerencias(); });

  // Formulario (modal)
  $('#formClose').addEventListener('click', cerrarForm);
  $('#formCancel').addEventListener('click', cerrarForm);
  $('#formOverlay').addEventListener('click', (e) => { if (e.target.id === 'formOverlay') cerrarForm(); });
  $('#f-tipo').addEventListener('change', toggleTipo);
  $('#f-categoria').addEventListener('change', toggleCategoria);
  $('#f-img').addEventListener('input', () => { limpiarPendiente(); actualizarPreview(); });
  $('#btnSubirImg').addEventListener('click', () => $('#f-file').click());
  $('#f-file').addEventListener('change', onArchivo);
  $('#formProducto').addEventListener('submit', guardar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarForm(); cerrarCategorias(); cerrarSugerencias(); } });

  renderPicker();

  // Estado de sesión
  DB.onAuth((user) => {
    if (user) {
      hide('#loginView'); show('#adminView'); show('#btnLogout');
      suscribirProductos();
      suscribirCategorias();
      suscribirSugerencias();
    } else {
      show('#loginView'); hide('#adminView'); hide('#btnLogout');
      if (canal)    { DB.desuscribir(canal);    canal = null; }
      if (canalCat) { DB.desuscribir(canalCat); canalCat = null; }
      if (canalSug) { DB.desuscribir(canalSug); canalSug = null; }
    }
  });
}

// ──────────────────────────────────────────
//  LOGIN
// ──────────────────────────────────────────
async function onLogin(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass  = $('#login-pass').value;
  const err   = $('#loginError');
  const btn   = $('#formLogin button[type="submit"]');
  err.textContent = '';
  btn.disabled = true;
  try {
    await DB.login(email, pass);
    $('#formLogin').reset();
  } catch (ex) {
    err.textContent = msgError(ex);
  } finally {
    btn.disabled = false;
  }
}

function msgError(ex) {
  const m = (ex && ex.message) || '';
  if (/invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(m))       return 'El email no está confirmado (activá "Auto Confirm" en Supabase o confirmalo).';
  if (/rate limit|too many/i.test(m))       return 'Demasiados intentos. Probá de nuevo más tarde.';
  if (/failed to fetch|network/i.test(m))   return 'Sin conexión. Revisá tu internet.';
  return m || 'No se pudo ingresar. Revisá los datos e intentá otra vez.';
}

// ──────────────────────────────────────────
//  LEER PRODUCTOS (en vivo)
// ──────────────────────────────────────────
function suscribirProductos() {
  if (canal) return;
  $('#adminList').innerHTML = `<p class="admin-empty">Cargando productos…</p>`;
  canal = DB.suscribir(
    (lista) => { productos = lista; renderLista(); renderListaCategorias(); },
    (err)   => { $('#adminList').innerHTML = `<p class="admin-empty">No se pudieron cargar los productos.<br><small>${err.message || err}</small></p>`; }
  );
}

function suscribirCategorias() {
  if (canalCat) return;
  canalCat = DB.suscribirCategorias(
    (lista) => {
      categorias = lista;
      renderLista();               // para que los nombres de categoría en la lista se actualicen
      renderListaCategorias();
      // si el modal de producto está abierto, refrescar el select conservando la elección
      if (!$('#formOverlay').classList.contains('oculto')) poblarSelectCategorias($('#f-categoria').value);
    },
    (err) => { console.warn('No se pudieron cargar las categorías (¿falta crear la tabla?):', err); }
  );
}

// ──────────────────────────────────────────
//  RENDER · LISTA DE PRODUCTOS
// ──────────────────────────────────────────
function nombreCat(slug) {
  const c = categorias.find(x => x.slug === slug);
  if (c) return c.nombre;
  if (!slug) return '(sin categoría)';
  return (typeof CAT_INFO !== 'undefined' && CAT_INFO[slug]?.nombre) || bonito(slug);
}
function textoUnidad(p) { return p.porPeso ? `por ${p.unidad} (por peso)` : `por ${p.unidad}`; }

function renderLista() {
  $('#adminCount').textContent = `${productos.length} producto${productos.length === 1 ? '' : 's'}`;
  $('#btnSeed').classList.toggle('oculto', productos.length > 0);

  const cont = $('#adminList');

  if (!productos.length) {
    cont.innerHTML = `
      <div class="admin-empty-state">
        <span>🌱</span>
        <h3>Todavía no hay productos</h3>
        <p>Creá el primero con “+ Nuevo producto” o importá el catálogo de ejemplo para arrancar rápido.</p>
      </div>`;
    return;
  }

  const q = busq.trim().toLowerCase();
  const lista = productos.filter(p => !q || (p.nombre || '').toLowerCase().includes(q));

  if (!lista.length) {
    cont.innerHTML = `<p class="admin-empty">Ningún producto coincide con “${busq}”.</p>`;
    return;
  }

  cont.innerHTML = lista.map(p => `
    <div class="admin-prod ${p.stock === false ? 'sin-stock' : ''}" data-id="${p.id}">
      <div class="admin-prod-img">${p.img ? `<img src="${p.img}" alt="${p.nombre}">` : '🥦'}</div>
      <div class="admin-prod-info">
        <h4>${p.nombre} ${p.stock === false ? '<span class="tag-agotado">Sin stock</span>' : ''}</h4>
        <div class="admin-prod-meta">
          <span class="chip-cat">${nombreCat(p.categoria)}</span>
          <span>${money(p.precio)} · ${textoUnidad(p)}</span>
        </div>
        ${p.detalle ? `<p class="admin-prod-det">${p.detalle}</p>` : ''}
      </div>
      <div class="admin-prod-actions">
        <label class="switch switch-sm" title="Disponibilidad">
          <input type="checkbox" data-stock="${p.id}" ${p.stock !== false ? 'checked' : ''}>
          <span class="switch-track"></span>
        </label>
        <button class="icon-btn" data-edit="${p.id}" title="Editar">✏️</button>
        <button class="icon-btn danger" data-del="${p.id}" title="Eliminar">🗑️</button>
      </div>
    </div>
  `).join('');

  $$('[data-stock]', cont).forEach(el => el.addEventListener('change', () => toggleStock(el.dataset.stock, el.checked)));
  $$('[data-edit]', cont).forEach(b => b.addEventListener('click', () => abrirForm(productos.find(x => String(x.id) === b.dataset.edit))));
  $$('[data-del]', cont).forEach(b => b.addEventListener('click', () => eliminar(b.dataset.del)));
}

// ──────────────────────────────────────────
//  ACCIONES RÁPIDAS
// ──────────────────────────────────────────
function toggleStock(id, disponible) {
  DB.setStock(id, disponible).catch(err => alert('No se pudo actualizar el stock: ' + (err.message || err)));
}

function eliminar(id) {
  const p = productos.find(x => String(x.id) === String(id));
  if (!confirm(`¿Eliminar "${p?.nombre || 'este producto'}"? Esta acción no se puede deshacer.`)) return;
  DB.eliminar(id).catch(err => alert('No se pudo eliminar: ' + (err.message || err)));
}

// ──────────────────────────────────────────
//  FORMULARIO · ABRIR / CERRAR
// ──────────────────────────────────────────
function abrirForm(p = null) {
  editId = p ? p.id : null;
  $('#modalTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
  $('#formProducto').reset();
  limpiarPendiente();

  // Categoría
  $('#f-categoria-custom').value = '';
  poblarSelectCategorias(p ? p.categoria : null);

  // Forma de venta
  let tipo = 'kg';
  if (p) {
    if (p.unidad === 'kg' && p.porPeso) tipo = 'kg';
    else if (['unidad', 'atado', 'docena'].includes(p.unidad) && !p.porPeso) tipo = p.unidad;
    else tipo = 'otro';
  }
  $('#f-tipo').value = tipo;
  $('#f-unidad-custom').value = tipo === 'otro' ? (p?.unidad || '') : '';
  $('#f-porpeso').checked = tipo === 'otro' ? !!p?.porPeso : false;
  toggleTipo();

  // Resto de campos
  $('#f-nombre').value  = p?.nombre  || '';
  $('#f-precio').value  = p?.precio ?? '';
  $('#f-detalle').value = p?.detalle || '';
  $('#f-orden').value   = p?.orden ?? '';
  $('#f-img').value     = p?.img || '';
  $('#f-stock').checked = p ? (p.stock !== false) : true;
  actualizarPreview();

  show('#formOverlay');
  setTimeout(() => $('#f-nombre').focus(), 50);
}

function cerrarForm() {
  hide('#formOverlay');
  editId = null;
  limpiarPendiente();
}

function toggleTipo() {
  $('#wrapUnidadCustom').classList.toggle('oculto', $('#f-tipo').value !== 'otro');
}
function toggleCategoria() {
  $('#f-categoria-custom').classList.toggle('oculto', $('#f-categoria').value !== '__nueva');
}

// ──────────────────────────────────────────
//  FORMULARIO · SELECTOR DE IMÁGENES
// ──────────────────────────────────────────
function renderPicker() {
  const cont = $('#imgPicker');
  if (typeof IMAGENES_SITIO === 'undefined') return;
  cont.innerHTML = IMAGENES_SITIO.map(src =>
    `<button type="button" class="img-thumb" data-src="${src}"><img src="${src}" alt=""></button>`
  ).join('');
  $$('.img-thumb', cont).forEach(b => b.addEventListener('click', () => {
    $('#f-img').value = b.dataset.src;
    limpiarPendiente();
    actualizarPreview();
  }));
}

function setPreview(src) {
  const box = $('#imgPreview');
  if (src) box.innerHTML = `<img src="${src}" alt="preview" onerror="this.parentNode.innerHTML='Imagen no válida'">`;
  else box.textContent = 'Sin imagen';
}

function actualizarPreview() {
  // Prioridad: foto recién subida (pendiente) por sobre la URL/ruta escrita
  if (imagenPendiente && previewURL) { setPreview(previewURL); return; }
  setPreview($('#f-img').value.trim());
}

// Descarta la foto pendiente (cuando se elige URL/imagen del sitio o se cierra el form)
function limpiarPendiente() {
  if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
  imagenPendiente = null;
  const st = $('#imgStatus'); if (st) st.textContent = '';
}

// Redimensiona y comprime una imagen del dispositivo antes de subirla
function comprimirImagen(file, maxDim = 1000, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, maxDim / Math.max(img.width, img.height));
      const width  = Math.round(img.width  * escala);
      const height = Math.round(img.height * escala);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen.')),
        'image/jpeg', calidad
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

// Cuando la dueña elige una foto del dispositivo
async function onArchivo(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const status = $('#imgStatus');
  try {
    status.textContent = 'Procesando imagen…';
    const blob = await comprimirImagen(file);
    if (previewURL) URL.revokeObjectURL(previewURL);
    imagenPendiente = blob;
    previewURL = URL.createObjectURL(blob);
    $('#f-img').value = '';   // la foto subida reemplaza cualquier URL/ruta
    actualizarPreview();
    status.textContent = `Foto lista (${Math.round(blob.size / 1024)} KB) · se sube al guardar`;
  } catch (err) {
    status.textContent = '';
    alert('No se pudo procesar la imagen: ' + (err.message || err));
  } finally {
    e.target.value = '';   // permite volver a elegir el mismo archivo
  }
}

// ──────────────────────────────────────────
//  FORMULARIO · GUARDAR
// ──────────────────────────────────────────
async function guardar(e) {
  e.preventDefault();

  const nombre = $('#f-nombre').value.trim();
  const precio = parseFloat($('#f-precio').value);
  if (!nombre)  { $('#f-nombre').focus(); return; }
  if (isNaN(precio) || precio < 0) { $('#f-precio').focus(); return; }

  // Forma de venta → unidad + porPeso
  const tipo = $('#f-tipo').value;
  let unidad, porPeso;
  if (tipo === 'kg')          { unidad = 'kg';     porPeso = true;  }
  else if (tipo === 'otro')   { unidad = ($('#f-unidad-custom').value.trim() || 'unidad'); porPeso = $('#f-porpeso').checked; }
  else                        { unidad = tipo;     porPeso = false; }

  // Orden
  let orden = parseInt($('#f-orden').value, 10);
  if (isNaN(orden)) orden = (Math.max(0, ...productos.map(p => p.orden || 0)) + 10);

  const btn = $('#formProducto button[type="submit"]');
  btn.disabled = true;

  try {
    // Categoría: si eligió "Nueva categoría", la creo y uso su slug
    let categoria = $('#f-categoria').value;
    if (categoria === '__nueva') {
      const nomCat = $('#f-categoria-custom').value.trim();
      if (!nomCat) { $('#f-categoria-custom').focus(); return; }
      categoria = slugify(nomCat);
      if (!categorias.some(c => c.slug === categoria)) {
        const ordenCat = Math.max(0, ...categorias.map(c => c.orden || 0)) + 10;
        try { await DB.crearCategoria({ nombre: nomCat, slug: categoria, orden: ordenCat }); } catch (e) { /* si ya existe, continúo */ }
      }
    }

    // Imagen: si hay una foto recién elegida, la subimos y usamos su URL pública
    let img = $('#f-img').value.trim();
    if (imagenPendiente) {
      $('#imgStatus').textContent = 'Subiendo imagen…';
      img = await DB.subirImagen(imagenPendiente, 'jpg');
    }

    const data = {
      nombre, categoria, precio, unidad, porPeso,
      detalle: $('#f-detalle').value.trim(),
      img,
      stock: $('#f-stock').checked,
      orden,
    };

    if (editId) await DB.actualizar(editId, data);
    else        await DB.crear(data);

    cerrarForm();
  } catch (err) {
    $('#imgStatus').textContent = '';
    alert('No se pudo guardar: ' + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

// ──────────────────────────────────────────
//  IMPORTAR CATÁLOGO DE EJEMPLO
// ──────────────────────────────────────────
async function importarSemilla() {
  if (typeof PRODUCTOS_SEED === 'undefined') return;
  if (!confirm(`Se van a cargar ${PRODUCTOS_SEED.length} productos de ejemplo. ¿Continuar?`)) return;

  const btn = $('#btnSeed');
  btn.disabled = true;
  try {
    await DB.importarSemilla(PRODUCTOS_SEED);
  } catch (err) {
    alert('No se pudo importar: ' + (err.message || err));
  } finally {
    btn.disabled = false;
  }
}

// ══════════════════════════════════════════
//  CATEGORÍAS · gestión
// ══════════════════════════════════════════
function abrirCategorias() {
  $('#catError').textContent = '';
  $('#cat-nueva').value = '';
  renderListaCategorias();
  show('#catOverlay');
  setTimeout(() => $('#cat-nueva').focus(), 50);
}
function cerrarCategorias() { hide('#catOverlay'); }

function catsOrdenadas() {
  return categorias.slice().sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre));
}

function renderListaCategorias() {
  const cont = $('#catList');
  if (!cont) return;

  if (!categorias.length) {
    cont.innerHTML = `<p class="admin-empty">Todavía no hay categorías. Agregá una arriba, o tocá “Detectar categorías en uso”.</p>`;
    return;
  }

  const orden = catsOrdenadas();
  cont.innerHTML = orden.map((c, i) => {
    const usos = productos.filter(p => p.categoria === c.slug).length;
    return `
      <div class="cat-row" data-id="${c.id}">
        <div class="cat-move">
          <button class="mini" data-up="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir">▲</button>
          <button class="mini" data-down="${c.id}" ${i === orden.length - 1 ? 'disabled' : ''} aria-label="Bajar">▼</button>
        </div>
        <div class="cat-name">
          <strong>${c.nombre}</strong>
          <span>${usos} producto${usos === 1 ? '' : 's'}</span>
        </div>
        <div class="cat-acts">
          <button class="icon-btn" data-editcat="${c.id}" title="Renombrar">✏️</button>
          <button class="icon-btn danger" data-delcat="${c.id}" title="Eliminar">🗑️</button>
        </div>
      </div>`;
  }).join('');

  $$('[data-up]', cont).forEach(b => b.addEventListener('click', () => moverCat(b.dataset.up, -1)));
  $$('[data-down]', cont).forEach(b => b.addEventListener('click', () => moverCat(b.dataset.down, 1)));
  $$('[data-editcat]', cont).forEach(b => b.addEventListener('click', () => renombrarCategoria(b.dataset.editcat)));
  $$('[data-delcat]', cont).forEach(b => b.addEventListener('click', () => eliminarCategoria(b.dataset.delcat)));
}

async function agregarCategoria() {
  const err = $('#catError'); err.textContent = '';
  const nom = $('#cat-nueva').value.trim();
  if (!nom) { $('#cat-nueva').focus(); return; }
  const slug = slugify(nom);
  if (categorias.some(c => c.slug === slug)) { err.textContent = 'Ya existe una categoría parecida.'; return; }
  const orden = Math.max(0, ...categorias.map(c => c.orden || 0)) + 10;
  try {
    await DB.crearCategoria({ nombre: nom, slug, orden });
    $('#cat-nueva').value = '';
  } catch (e) {
    err.textContent = 'No se pudo crear: ' + (e.message || e);
  }
}

async function renombrarCategoria(id) {
  const c = categorias.find(x => String(x.id) === String(id));
  if (!c) return;
  const nuevo = prompt('Nuevo nombre de la categoría (podés incluir un emoji):', c.nombre);
  if (nuevo == null) return;
  const nom = nuevo.trim();
  if (!nom || nom === c.nombre) return;
  try { await DB.actualizarCategoria(id, { nombre: nom }); }
  catch (e) { alert('No se pudo renombrar: ' + (e.message || e)); }
}

async function eliminarCategoria(id) {
  const c = categorias.find(x => String(x.id) === String(id));
  if (!c) return;
  const usos = productos.filter(p => p.categoria === c.slug).length;
  let msg = `¿Eliminar la categoría "${c.nombre}"?`;
  if (usos) msg += `\n\nHay ${usos} producto(s) en esta categoría: van a quedar SIN categoría (después podés reasignarlos).`;
  if (!confirm(msg)) return;
  try {
    if (usos) await DB.reasignarCategoria(c.slug, '');
    await DB.eliminarCategoria(id);
  } catch (e) {
    alert('No se pudo eliminar: ' + (e.message || e));
  }
}

async function moverCat(id, dir) {
  const orden = catsOrdenadas();
  const idx = orden.findIndex(c => String(c.id) === String(id));
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= orden.length) return;
  const a = orden[idx], b = orden[j];
  let oa = a.orden, ob = b.orden;
  if (oa === ob) ob = oa + dir;   // desempate si tenían el mismo orden
  try {
    await DB.actualizarCategoria(a.id, { orden: ob });
    await DB.actualizarCategoria(b.id, { orden: oa });
  } catch (e) {
    alert('No se pudo reordenar: ' + (e.message || e));
  }
}

// Crea en la tabla las categorías por defecto + las que ya usan los productos
async function sincronizarCategorias() {
  const btn = $('#btnSyncCat');
  const err = $('#catError'); err.textContent = '';
  btn.disabled = true;
  try {
    const existentes = new Set(categorias.map(c => c.slug));
    let maxOrden = Math.max(0, ...categorias.map(c => c.orden || 0));
    const nuevas = [];
    CATEGORIAS_DEFAULT.forEach(d => { if (!existentes.has(d.slug)) { nuevas.push(d); existentes.add(d.slug); } });
    [...new Set(productos.map(p => p.categoria).filter(Boolean))].forEach(slug => {
      if (!existentes.has(slug)) { maxOrden += 10; nuevas.push({ nombre: bonito(slug), slug, orden: maxOrden }); existentes.add(slug); }
    });
    if (!nuevas.length) { err.textContent = 'No hay categorías nuevas para agregar.'; return; }
    for (const c of nuevas) { try { await DB.crearCategoria(c); } catch (e) { /* ignora duplicados */ } }
  } finally {
    btn.disabled = false;
  }
}

// ──────────────────────────────────────────
//  SELECT DE CATEGORÍA EN EL FORM DE PRODUCTO
// ──────────────────────────────────────────
function poblarSelectCategorias(slugSel) {
  const select = $('#f-categoria');
  let opts = catsOrdenadas().map(c => `<option value="${c.slug}">${c.nombre}</option>`).join('');
  // Si el producto tiene una categoría no registrada, la incluyo para no perderla
  if (slugSel && slugSel !== '__nueva' && !categorias.some(c => c.slug === slugSel)) {
    opts += `<option value="${slugSel}">${bonito(slugSel)} (sin registrar)</option>`;
  }
  opts += `<option value="__nueva">➕ Nueva categoría…</option>`;
  select.innerHTML = opts;

  select.value = slugSel || catsOrdenadas()[0]?.slug || '__nueva';
  if (!select.value) select.value = '__nueva';
  toggleCategoria();
}

// ══════════════════════════════════════════
//  SUGERENCIAS / REPORTES (anónimos)
// ══════════════════════════════════════════
function suscribirSugerencias() {
  if (canalSug) return;
  canalSug = DB.suscribirSugerencias(
    (lista) => { sugerencias = lista; actualizarBadgeSug(); renderSugerencias(); },
    (err) => console.warn('No se pudieron cargar las sugerencias (¿falta crear la tabla?):', err)
  );
}

function actualizarBadgeSug() {
  const n = sugerencias.filter(s => !s.leido).length;
  const b = $('#sugBadge');
  b.textContent = n;
  b.classList.toggle('oculto', n === 0);
}

function abrirSugerencias() { renderSugerencias(); show('#sugOverlay'); }
function cerrarSugerencias() { hide('#sugOverlay'); }

function tipoInfo(t) {
  return ({
    mejora:     { e: '💡', n: 'Mejora',  clase: 'mejora' },
    sugerencia: { e: '✨', n: 'Sugerencia', clase: 'sugerencia' },
    error:      { e: '🐞', n: 'Error',   clase: 'error' },
  })[t] || { e: '💬', n: 'Mensaje', clase: 'otro' };
}

function renderSugerencias() {
  const cont = $('#sugList');
  if (!cont) return;

  if (!sugerencias.length) {
    cont.innerHTML = `<p class="admin-empty">Todavía no hay mensajes. 🌱</p>`;
    return;
  }

  cont.innerHTML = sugerencias.map(s => {
    const ti = tipoInfo(s.tipo);
    let fecha = '';
    try {
      fecha = new Date(s.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { fecha = ''; }
    return `
      <div class="sug-item ${s.leido ? '' : 'nuevo'}" data-id="${s.id}">
        <div class="sug-top">
          <span class="sug-tipo tipo-${ti.clase}">${ti.e} ${ti.n}</span>
          <span class="sug-fecha">${fecha}${s.pagina ? ` · ${escapeHtml(s.pagina)}` : ''}</span>
        </div>
        <p class="sug-msg">${escapeHtml(s.mensaje)}</p>
        <div class="sug-acts">
          <button class="mini-act" data-leido="${s.id}">${s.leido ? '↩︎ Marcar no leída' : '✓ Marcar leída'}</button>
          <button class="mini-act danger" data-delsug="${s.id}">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join('');

  $$('[data-leido]', cont).forEach(b => b.addEventListener('click', () => {
    const s = sugerencias.find(x => String(x.id) === b.dataset.leido);
    DB.marcarSugerencia(b.dataset.leido, !(s && s.leido)).catch(e => alert('No se pudo actualizar: ' + (e.message || e)));
  }));
  $$('[data-delsug]', cont).forEach(b => b.addEventListener('click', () => {
    if (confirm('¿Eliminar este mensaje?')) DB.eliminarSugerencia(b.dataset.delsug).catch(e => alert('No se pudo eliminar: ' + (e.message || e)));
  }));
}
