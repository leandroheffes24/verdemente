// ════════════════════════════════════════════════════════════════
//  CONEXIÓN CON SUPABASE + CAPA DE DATOS (DB)
//  ────────────────────────────────────────────────────────────────
//  👉 PEGÁ ACÁ los datos de tu proyecto de Supabase.
//     Los encontrás en: app.supabase.com → tu proyecto →
//     Project Settings (⚙️) → API
//        • Project URL      → SUPABASE_URL
//        • Project API keys → "anon public" → SUPABASE_ANON_KEY
//
//  La "anon key" es pública a propósito: la seguridad la dan las
//  políticas RLS de la tabla (ver SETUP-SUPABASE.md).
//
//  Mientras estos valores digan "TU_...", la tienda funciona con el
//  catálogo de ejemplo y el panel avisa que falta configurar Supabase.
// ════════════════════════════════════════════════════════════════
const SUPABASE_URL      = "https://lzmovcrjrnptqjntwxmj.supabase.co";        // ej: https://abcdxyz.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6bW92Y3Jqcm5wdHFqbnR3eG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MzkxMDgsImV4cCI6MjA5OTIxNTEwOH0.zKGZ2IbTI48OIBVPH-AZUXEMigoOLIq9-Gq2gjNABPA";   // ej: eyJhbGciOi...

// Nombre del bucket de Supabase Storage donde se guardan las fotos subidas.
const STORAGE_BUCKET = "productos";

// ── No hace falta tocar de acá para abajo ──────────────────────────
const SUPABASE_LISTO = !!SUPABASE_URL && !SUPABASE_URL.startsWith("TU_") &&
                       !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.startsWith("TU_");

let sb = null;
if (SUPABASE_LISTO && typeof supabase !== 'undefined') {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ──────────────────────────────────────────
//  MAPEO fila (Postgres) ⇄ producto (app)
//  En la base los campos van en snake_case (por_peso);
//  en la app usamos camelCase (porPeso).
// ──────────────────────────────────────────
function rowToProducto(r) {
  return {
    id:           r.id,
    nombre:       r.nombre,
    categoria:    r.categoria,
    precio:       Number(r.precio),
    unidad:       r.unidad,
    porPeso:      !!r.por_peso,
    dual:         !!r.dual,
    precioUnidad: r.precio_unidad == null ? null : Number(r.precio_unidad),
    img:          r.img,
    detalle:      r.detalle,
    stock:        r.stock !== false,
    orden:        r.orden == null ? null : Number(r.orden),
  };
}
function productoToRow(p) {
  return {
    nombre:        p.nombre,
    categoria:     p.categoria,
    precio:        p.precio,
    unidad:        p.unidad,
    por_peso:      !!p.porPeso,
    dual:          !!p.dual,
    precio_unidad: (p.precioUnidad == null || p.precioUnidad === '') ? null : p.precioUnidad,
    img:           p.img,
    detalle:       p.detalle,
    stock:         p.stock !== false,
    orden:         p.orden ?? 0,
  };
}

// ──────────────────────────────────────────
//  DB · fachada de acceso a datos
//  (tienda.js y admin.js usan solo esto)
// ──────────────────────────────────────────
const DB = {
  listo: SUPABASE_LISTO && !!sb,

  // Trae todos los productos ordenados
  async listar() {
    const { data, error } = await sb
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) throw error;
    // Orden alfabético robusto (ignora mayúsculas y acentos)
    return data.map(rowToProducto).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  },

  // Carga inicial + se re-carga ante cualquier cambio (Realtime)
  suscribir(cb, onError) {
    const load = () => this.listar().then(cb).catch(e => onError ? onError(e) : console.warn('Supabase:', e));
    load();
    const canal = sb.channel('productos-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, load)
      .subscribe();
    return canal;
  },
  desuscribir(canal) { if (canal && sb) sb.removeChannel(canal); },

  // CRUD
  async crear(p) {
    const { error } = await sb.from('productos').insert(productoToRow(p));
    if (error) throw error;
  },
  async actualizar(id, p) {
    const { error } = await sb.from('productos').update(productoToRow(p)).eq('id', id);
    if (error) throw error;
  },
  async setStock(id, disponible) {
    const { error } = await sb.from('productos').update({ stock: disponible }).eq('id', id);
    if (error) throw error;
  },
  async eliminar(id) {
    const { error } = await sb.from('productos').delete().eq('id', id);
    if (error) throw error;
  },
  async importarSemilla(seed) {
    const rows = seed.map((p, i) => productoToRow({ ...p, orden: i * 10 }));
    const { error } = await sb.from('productos').insert(rows);
    if (error) throw error;
  },

  // Storage · sube una imagen (Blob ya comprimido) y devuelve su URL pública
  async subirImagen(blob, ext = 'jpg') {
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await sb.storage.from(STORAGE_BUCKET).upload(nombre, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: blob.type || 'image/jpeg',
    });
    if (error) {
      if (/bucket/i.test(error.message || '')) {
        throw new Error(`Falta crear el bucket "${STORAGE_BUCKET}" en Supabase Storage (ver SETUP-SUPABASE.md).`);
      }
      throw error;
    }
    const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(nombre);
    return data.publicUrl;
  },

  // ── Categorías ──
  async listarCategorias() {
    const { data, error } = await sb
      .from('categorias')
      .select('*')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data.map(c => ({ id: c.id, nombre: c.nombre, slug: c.slug, orden: c.orden == null ? 0 : Number(c.orden) }));
  },
  suscribirCategorias(cb, onError) {
    const load = () => this.listarCategorias().then(cb).catch(e => onError ? onError(e) : console.warn('Supabase categorías:', e));
    load();
    const canal = sb.channel('categorias-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categorias' }, load)
      .subscribe();
    return canal;
  },
  async crearCategoria({ nombre, slug, orden = 0 }) {
    const { error } = await sb.from('categorias').insert({ nombre, slug, orden });
    if (error) throw error;
  },
  async actualizarCategoria(id, campos) {
    const { error } = await sb.from('categorias').update(campos).eq('id', id);
    if (error) throw error;
  },
  async eliminarCategoria(id) {
    const { error } = await sb.from('categorias').delete().eq('id', id);
    if (error) throw error;
  },
  // Reasigna todos los productos de una categoría a otra (o a '' = sin categoría)
  async reasignarCategoria(slugViejo, slugNuevo) {
    const { error } = await sb.from('productos').update({ categoria: slugNuevo }).eq('categoria', slugViejo);
    if (error) throw error;
  },

  // ── Sugerencias / reportes (anónimos) ──
  async enviarSugerencia({ tipo, mensaje, pagina }) {
    const { error } = await sb.from('sugerencias').insert({ tipo, mensaje, pagina });
    if (error) throw error;
  },
  async listarSugerencias() {
    const { data, error } = await sb.from('sugerencias').select('*').order('creado', { ascending: false });
    if (error) throw error;
    return data;
  },
  suscribirSugerencias(cb, onError) {
    const load = () => this.listarSugerencias().then(cb).catch(e => onError ? onError(e) : console.warn('Supabase sugerencias:', e));
    load();
    const canal = sb.channel('sugerencias-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sugerencias' }, load)
      .subscribe();
    return canal;
  },
  async marcarSugerencia(id, leido) {
    const { error } = await sb.from('sugerencias').update({ leido }).eq('id', id);
    if (error) throw error;
  },
  async eliminarSugerencia(id) {
    const { error } = await sb.from('sugerencias').delete().eq('id', id);
    if (error) throw error;
  },

  // Auth
  async login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  },
  async logout() { await sb.auth.signOut(); },
  onAuth(cb) {
    sb.auth.getSession().then(({ data }) => cb(data.session ? data.session.user : null));
    sb.auth.onAuthStateChange((_evt, session) => cb(session ? session.user : null));
  },
};
