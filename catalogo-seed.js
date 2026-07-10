// ════════════════════════════════════════════════════════════════
//  CATÁLOGO INICIAL (semilla)
//  Se usa para:
//   1) Mostrar la tienda si todavía no configuraste Firebase.
//   2) El botón "Importar catálogo de ejemplo" del panel admin.
//  Una vez que la dueña administra desde el panel, la fuente real
//  de datos es Firebase (esto queda solo como respaldo/ejemplo).
// ════════════════════════════════════════════════════════════════

// Esquema de cada producto:
//   nombre    → texto
//   categoria → 'frutas' | 'verduras' | 'dietetica' | 'almacen' | (la que quieras)
//   precio    → número en pesos
//   unidad    → etiqueta que se muestra ('kg', 'unidad', 'atado', 'bandeja', etc.)
//   porPeso   → true = se vende por peso (permite medios: 0,5 · 1 · 1,5...)
//               false = se vende de a enteros (1, 2, 3...)
//   img       → ruta o URL de la imagen
//   detalle   → texto corto opcional
//   stock     → true = disponible · false = sin stock
const PRODUCTOS_SEED = [
  // ── FRUTAS ──────────────────────────────
  { nombre: 'Naranjas',  categoria: 'frutas', precio: 1200, unidad: 'kg', porPeso: true,  img: './assets/images/verduleria/verduleria1.jpeg', detalle: 'Ideales para jugo',  stock: true },
  { nombre: 'Manzanas',  categoria: 'frutas', precio: 1800, unidad: 'kg', porPeso: true,  img: './assets/images/verduleria/verduleria2.jpeg', detalle: 'Rojas y jugosas',    stock: true },
  { nombre: 'Bananas',   categoria: 'frutas', precio: 1500, unidad: 'kg', porPeso: true,  img: './assets/images/verduleria/verduleria3.jpeg', detalle: 'En su punto justo',  stock: true },
  { nombre: 'Peras',     categoria: 'frutas', precio: 1700, unidad: 'kg', porPeso: true,  img: './assets/images/verduleria/verduleria4.jpeg', detalle: 'Dulces y frescas',   stock: true },

  // ── VERDURAS ────────────────────────────
  { nombre: 'Tomate',         categoria: 'verduras', precio: 1400, unidad: 'kg',     porPeso: true,  img: './assets/images/verduleria/verduleria5.jpeg', detalle: 'Bien maduro',            stock: true },
  { nombre: 'Ensalada mixta', categoria: 'verduras', precio: 1200, unidad: 'unidad', porPeso: false, img: './assets/images/verduleria/verduleria6.jpeg', detalle: 'Bolsa lista para comer', stock: true },
  { nombre: 'Palta',          categoria: 'verduras', precio:  900, unidad: 'unidad', porPeso: false, img: './assets/images/verduleria/verduleria5.jpeg', detalle: 'Cremosa · por unidad',   stock: true },
  { nombre: 'Acelga',         categoria: 'verduras', precio: 1000, unidad: 'atado',  porPeso: false, img: './assets/images/verduleria/verduleria6.jpeg', detalle: 'Fresca · por atado',     stock: true },

  // ── DIETÉTICA ───────────────────────────
  { nombre: 'Mostaza',                 categoria: 'dietetica', precio: 2500, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica1.jpeg', detalle: 'Sin gluten, sin aditivos', stock: true },
  { nombre: 'Especias y condimentos',  categoria: 'dietetica', precio: 1800, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica2.jpeg', detalle: 'Al mejor precio',          stock: true },
  { nombre: 'Dulce de leche',          categoria: 'dietetica', precio: 3200, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica3.jpeg', detalle: 'Sin azúcar · sin gluten',  stock: true },
  { nombre: 'Jugo de arándanos',       categoria: 'dietetica', precio: 2800, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica4.jpeg', detalle: 'Sin TACC',                 stock: true },
  { nombre: 'Arándanos deshidratados', categoria: 'dietetica', precio: 3500, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica5.jpeg', detalle: 'Bolsa 250 g',              stock: true },
  { nombre: 'Ensalada de frutas',      categoria: 'dietetica', precio: 2200, unidad: 'unidad', porPeso: false, img: './assets/images/dietetica/dietetica6.jpeg', detalle: 'Fresca del día',           stock: true },
];

// Imágenes que ya vienen con el sitio (para el selector rápido del panel)
const IMAGENES_SITIO = [
  './assets/images/verduleria/verduleria1.jpeg',
  './assets/images/verduleria/verduleria2.jpeg',
  './assets/images/verduleria/verduleria3.jpeg',
  './assets/images/verduleria/verduleria4.jpeg',
  './assets/images/verduleria/verduleria5.jpeg',
  './assets/images/verduleria/verduleria6.jpeg',
  './assets/images/dietetica/dietetica1.jpeg',
  './assets/images/dietetica/dietetica2.jpeg',
  './assets/images/dietetica/dietetica3.jpeg',
  './assets/images/dietetica/dietetica4.jpeg',
  './assets/images/dietetica/dietetica5.jpeg',
  './assets/images/dietetica/dietetica6.jpeg',
];

// Categorías conocidas (nombre visible + orden). Si la dueña crea una
// categoría nueva, igual aparece; estas solo definen ícono y orden.
const CAT_INFO = {
  frutas:    { nombre: '🍎 Frutas',    badge: '🍎 Fruta',     orden: 1 },
  verduras:  { nombre: '🥦 Verduras',  badge: '🥦 Verdura',   orden: 2 },
  dietetica: { nombre: '🌾 Dietética', badge: '🌾 Dietética', orden: 3 },
  almacen:   { nombre: '🛒 Almacén',   badge: '🛒 Almacén',   orden: 4 },
};
