# Elena Accesorios — Web + Panel de administración

Sitio de souvenirs para eventos. Sin dependencias: solo necesita **Node.js 18 o superior**.

## Probar en tu computadora
```bash
cd elena-accesorios
node server.js
```
- Sitio:  http://localhost:3000
- Panel:  http://localhost:3000/admin.html

La contraseña inicial ya viene cargada (guardada como hash en `data/auth.json`).
Si querés partir con otra, borrá `data/auth.json` y arrancá con `ADMIN_PASSWORD="nueva-clave" node server.js`.
La clienta puede cambiarla desde el panel → **Contraseña**.

## Dónde se guarda todo (carpeta `data/`, o `DATA_DIR` en Render)
| Archivo | Contenido |
|---|---|
| `productos.json` | **Todos los productos.** Se actualiza solo al agregar, editar o eliminar uno. |
| `contenido.json` | Categorías, textos de la web (portada e historia), cuotas, llamados a la acción, WhatsApp e Instagram. |
| `site/index.html` | **La página principal ya armada** (textos, categorías y productos dentro del HTML). Se vuelve a generar sola cada vez que se guarda algo en el panel. |
| `uploads/` | Fotos de los productos. |
| `auth.json` | Contraseña del panel (solo su hash). |
| `*.anterior.json` | Copia de la versión previa de cada archivo, por si hay que volver atrás. |

La plantilla de la que sale la página está en `templates/index.template.html` (el diseño sigue en `public/styles.css`).
Si ya tenías datos cargados con una versión anterior (`db.json`), al iniciar se migran solos a estos archivos.

## Qué puede hacer la clienta desde el panel
- **Productos**: crear, editar, eliminar; fotos ilimitadas (la primera es la portada, se reordenan con ← y se quitan con ✕). Cada producto tiene sus **formas de pago** (Efectivo, Transferencia, Tarjeta): interruptor para activarlas/desactivarlas, precio y texto editable (ej.: "10% de descuento", "3 cuotas sin interés").
- **Categorías**: agregar, renombrar, eliminar (iniciales: Llaveros, Denarios, Rosarios, Tarjetas, Prendedores, Otros).
- **Cuotas y WhatsApp**: textos generales de cuotas y llamados a la acción que abren WhatsApp con el mensaje que ella escriba.
- **Textos y contacto**: portada, “Nuestra historia”, número de WhatsApp e Instagram.

## Publicarla en Render
1. Subí el proyecto a GitHub (el `.gitignore` ya deja afuera `data/`) y creá un **Web Service** conectado al repositorio.
2. **Build Command:** `npm install` (no instala nada, pero Render lo pide) · **Start Command:** `node server.js`
3. Agregá un **Disk** (Advanced → Add Disk) con *Mount Path* `/var/data`. Es imprescindible: sin disco, Render borra productos y fotos en cada reinicio o deploy. Los discos requieren una instancia paga.
4. Variables de entorno (Environment):
   - `DATA_DIR` = `/var/data`
   - `ADMIN_PASSWORD` = la contraseña inicial del panel (se guarda solo su hash en el disco; después se puede borrar esta variable y cambiarla desde el panel)
5. Deploy. El panel queda en `https://TU-APP.onrender.com/admin.html`.

Datos y fotos quedan en `DATA_DIR` (`productos.json`, `contenido.json`, `auth.json`, `site/` y `uploads/`): respaldá esa carpeta periódicamente.

> Un hosting solo de archivos estáticos (GitHub Pages, Netlify sin funciones) **no sirve**: el panel necesita este servidor.

## Seguridad incluida
Contraseña con hash scrypt, sesión por cookie HttpOnly/SameSite, límite de 5 intentos fallidos por 15 min, API de edición protegida, subida limitada a imágenes (JPG/PNG/WEBP ≤ 8 MB), cabeceras CSP y anti-iframe.

---
Creado por Camilo Rabitti, PlayZero Studio, 2026
