# Hato don Nelson Company

PWA para registrar y consultar el ganado en Supabase. La pantalla de inicio
muestra los animales registrados y permite abrir su seguimiento; el formulario
para registrar ganado está en una pantalla independiente. Conserva los registros
en este dispositivo y pone en cola las altas hechas sin conexión para
sincronizarlas cuando vuelva la conexión.

## Desarrollo

1. Crea un archivo `.env` con las credenciales públicas del proyecto Supabase:

   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_KEY=tu_clave_publica
   ```

2. Instala dependencias e inicia Vite:

   ```sh
   npm install
   npm run dev
   ```

La tabla `Vaca` debe aceptar las columnas `name`, `raza` y `date_purchase`.
Si las credenciales no están configuradas, las altas se guardan localmente y
quedan pendientes hasta que Supabase esté disponible.

Cada vaca sincronizada permite consultar y editar su seguimiento en la tabla
`Seguimiento`. El formulario admite campos parciales; los campos que se dejen
vacíos se guardan como `NULL`. Para los selects se usan los valores definidos
en `src/seguimiento-enums.js`. La app carga y actualiza el registro de
seguimiento más reciente para cada vaca.

## PWA

La aplicación se puede instalar desde un navegador compatible y guarda su
interfaz para abrirla sin conexión. Las altas sin conexión quedan guardadas en
el almacenamiento local del navegador y se envían a Supabase al reconectar.
El service worker requiere HTTPS en producción (o `localhost` durante el
desarrollo).
