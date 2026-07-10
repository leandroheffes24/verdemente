# Configuración de Supabase — Tienda Verdemente

El panel (`admin.html`) y la tienda (`tienda.html`) usan **Supabase**
(base de datos PostgreSQL + Authentication + Realtime) para que la dueña
administre los productos y los cambios se vean al instante en todos los
dispositivos. El plan **gratuito** alcanza de sobra.

> Mientras no completes estos pasos, la tienda funciona con el catálogo de
> ejemplo (`catalogo-seed.js`) y el panel muestra "Falta configurar Supabase".

---

## 1. Crear el proyecto

1. Entrá a **https://app.supabase.com** e iniciá sesión.
2. **New project** → nombre (ej: `verdemente`), elegí una contraseña para la base
   y una región cercana (ej: `South America (São Paulo)`) → **Create**.
3. Esperá ~1 minuto a que termine de crearse.

## 2. Copiar las credenciales

1. Menú izquierdo → **Project Settings (⚙️) → API**.
2. Copiá:
   - **Project URL** → va en `SUPABASE_URL`
   - **Project API keys → `anon` `public`** → va en `SUPABASE_ANON_KEY`
3. Pegalas en el archivo **`supabase-config.js`**:

```js
const SUPABASE_URL      = "";
const SUPABASE_ANON_KEY = "";
```

> La `anon key` es **pública a propósito**: no da acceso a escribir porque la tabla
> está protegida por políticas RLS (paso 3).

## 3. Crear la tabla y las políticas de seguridad

1. Menú izquierdo → **SQL Editor → New query**.
2. Pegá **todo** este script y tocá **Run**:

```sql
-- Tabla de productos
create table if not exists public.productos (
  id        bigint generated always as identity primary key,
  nombre    text not null,
  categoria text,
  precio    numeric not null default 0,
  unidad    text,
  por_peso  boolean not null default false,
  img       text,
  detalle   text,
  stock     boolean not null default true,
  orden     int not null default 0,
  creado    timestamptz not null default now()
);

-- Seguridad a nivel de fila
alter table public.productos enable row level security;

-- Cualquiera puede LEER el catálogo (tienda pública)
create policy "lectura publica"
  on public.productos for select
  to anon, authenticated
  using (true);

-- Solo usuarios logueados (la dueña) pueden CREAR/EDITAR/BORRAR
create policy "escritura autenticada"
  on public.productos for all
  to authenticated
  using (true)
  with check (true);

-- Actualización en vivo (Realtime) para la tienda
alter publication supabase_realtime add table public.productos;


-- ─────────────────────────────────────────────
-- Tabla de categorías (crear / editar / eliminar desde el panel)
create table if not exists public.categorias (
  id     bigint generated always as identity primary key,
  nombre text not null,
  slug   text not null unique,
  orden  int not null default 0,
  creado timestamptz not null default now()
);

alter table public.categorias enable row level security;

create policy "cat lectura publica"
  on public.categorias for select
  to anon, authenticated
  using (true);

create policy "cat escritura autenticada"
  on public.categorias for all
  to authenticated
  using (true)
  with check (true);

alter publication supabase_realtime add table public.categorias;


-- ─────────────────────────────────────────────
-- Tabla de sugerencias / reportes ANÓNIMOS
create table if not exists public.sugerencias (
  id      bigint generated always as identity primary key,
  tipo    text,
  mensaje text not null,
  pagina  text,
  leido   boolean not null default false,
  creado  timestamptz not null default now()
);

alter table public.sugerencias enable row level security;

-- Cualquiera (anónimo) puede ENVIAR una sugerencia, pero NADIE del público puede leerlas
create policy "sug enviar anonimo"
  on public.sugerencias for insert
  to anon, authenticated
  with check (true);

-- Solo la dueña (logueada) puede leer / marcar / borrar
create policy "sug leer admin"
  on public.sugerencias for select
  to authenticated
  using (true);
create policy "sug editar admin"
  on public.sugerencias for update
  to authenticated
  using (true) with check (true);
create policy "sug borrar admin"
  on public.sugerencias for delete
  to authenticated
  using (true);

alter publication supabase_realtime add table public.sugerencias;
```

> Cuando entres al panel por primera vez, tocá **🏷️ Categorías → "Detectar categorías
> en uso"** para que se creen automáticamente las categorías por defecto y las que ya
> usan tus productos.
>
> Las **sugerencias son anónimas**: la tabla no guarda ningún dato de quién las envía
> (ni nombre, ni email, ni IP), y las políticas impiden que el público las lea.

## 4. Crear el usuario de la dueña

1. Menú izquierdo → **Authentication → Users → Add user → Create new user**.
2. Cargá **email** y **contraseña**, y activá **Auto Confirm User** (para que
   pueda entrar sin confirmar por mail).
3. Copiá el **User UID** que aparece en la lista de usuarios: lo vas a necesitar en el paso 6.

## 5. Bloquear nuevos registros (IMPORTANTE) 🔒

Por defecto Supabase deja que **cualquiera** se registre. Como el permiso de escritura lo
tienen los usuarios logueados, hay que cerrar el registro para que **solo exista la dueña**
y nadie más pueda crearse una cuenta con tu anon key.

1. Menú izquierdo → **Authentication**. Buscá la configuración de registro, que según la
   versión del panel está en **Sign In / Providers → Email**, en **Providers → Email**, o en
   **Configuration → Sign In / Up**.
2. Desactivá la opción **"Allow new users to sign up"** (a veces figura como
   *"Enable email signups"* o *"User Signups"*). Guardá.

Desde ahí, no se puede registrar nadie nuevo: los usuarios se crean solo a mano desde
**Authentication → Users**.

## 6. Blindar la escritura solo a la dueña (recomendado) 🛡️

Defensa extra (por si alguna vez se reactivaran los registros): esta política permite
escribir **solo** al usuario de la dueña. En el **SQL Editor**, reemplazá `UID-DE-LA-DUEÑA`
por el User UID del paso 4 y ejecutá:

```sql
drop policy if exists "escritura autenticada" on public.productos;

create policy "escritura solo admin"
  on public.productos for all
  to authenticated
  using      ( auth.uid() = 'UID-DE-LA-DUEÑA' )
  with check ( auth.uid() = 'UID-DE-LA-DUEÑA' );
```

Con esto, aunque alguien lograra loguearse, **no podría tocar el catálogo**.

## 7. Activar la subida de fotos (Storage) 📷

Para que la dueña pueda **subir fotos** desde el panel (se comprimen solas antes de subir):

1. Menú izquierdo → **Storage → New bucket**. Nombre exacto: **`productos`**,
   marcá **Public bucket** → **Create**.
2. En el **SQL Editor**, corré esto para que solo la dueña (logueada) pueda
   subir / editar / borrar imágenes en ese bucket:

```sql
create policy "imagenes: subir"  on storage.objects for insert to authenticated with check (bucket_id = 'productos');
create policy "imagenes: editar" on storage.objects for update to authenticated using (bucket_id = 'productos');
create policy "imagenes: borrar" on storage.objects for delete to authenticated using (bucket_id = 'productos');
```

La **lectura es pública** (el bucket es público), así los clientes ven las fotos.

> Si le ponés otro nombre al bucket, cambialo también en `supabase-config.js`
> (constante `STORAGE_BUCKET`).

## 8. Cargar los productos

1. Abrí **`admin.html`** en el navegador.
2. Ingresá con el email y contraseña del paso 4.
3. Tocá **"📦 Importar catálogo de ejemplo"** para cargar productos iniciales,
   o **"+ Nuevo producto"** para crear los tuyos desde cero.

¡Listo! Cada cambio en el panel se refleja al instante en `tienda.html`.

---

## Cómo entra la dueña al panel

- Es la página **`admin.html`** (ej: `https://tusitio.com/admin.html`).
- No está enlazada desde la web pública: solo entra quien conoce la dirección **y**
  tiene usuario y contraseña.
- Para cambiar la contraseña o agregar otra persona: Supabase → Authentication → Users.

## Notas

- **Imágenes:** el panel permite **subir fotos** desde el celular o la compu (se
  **comprimen y redimensionan solas** antes de subir, para no ocupar espacio), pegar una
  URL, o elegir una de las imágenes que ya vienen con el sitio. La subida usa el bucket de
  Storage del paso 7.
- **Costo:** con el volumen de una verdulería, entra holgado en el plan gratuito.
- **CORS:** la API de Supabase acepta pedidos desde cualquier dominio, así que funciona
  tanto en tu dominio como probando en local.
