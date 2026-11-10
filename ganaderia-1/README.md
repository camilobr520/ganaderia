# Campo Vivo

PWA para registrar vacas en Supabase. Conserva los registros en este dispositivo
y pone en cola las altas hechas sin conexión para sincronizarlas cuando vuelva
la conexión.

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

## PWA

La aplicación se puede instalar desde un navegador compatible y guarda su
interfaz para abrirla sin conexión. Las altas sin conexión quedan guardadas en
el almacenamiento local del navegador y se envían a Supabase al reconectar.
El service worker requiere HTTPS en producción (o `localhost` durante el
desarrollo).
