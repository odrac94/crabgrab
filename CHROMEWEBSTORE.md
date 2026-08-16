# Chrome Web Store Listing — Delpix

> Last Updated: 2026-07-19

## Store Listing

**Extension Name**
Delpix — Descargar imágenes en máxima resolución

**Short Description** (≤132 chars)
Descarga cualquier imagen en su máxima resolución con un solo clic, en cualquier sitio web.

**Detailed Description**

Delpix descarga cualquier imagen que veas en la web en su máxima resolución disponible, con un solo clic.

Características:
Pasa el cursor sobre cualquier imagen y aparece un botón de descarga ⬇. También puedes hacer clic derecho sobre una imagen y elegir "Descargar imagen".
Busca automáticamente la versión de mayor resolución de cada imagen: prueba variantes de la dirección (por ejemplo, quita sufijos de tamaño como "_280") y descarga la más grande que exista.
Funciona a través de capas y superposiciones que algunos sitios ponen encima de las imágenes para dificultar guardarlas.
"Descargar todas las imágenes": guarda de una vez todas las imágenes de la página actual.
Galería de imágenes de red: muestra en una cuadrícula todas las imágenes que la página cargó (incluso las que no están visibles), con sus dimensiones reales, filtro por tamaño y descarga por selección.
Respeta las direcciones firmadas para no romper la descarga en sitios que las usan.

Cómo se usa:
1. Pasa el cursor sobre una imagen y pulsa el botón ⬇, o haz clic derecho → "Descargar imagen".
2. Para varias imágenes, abre el menú de la extensión y pulsa "Descargar todas las imágenes" o "Imágenes de red (galería)".
3. Activa o desactiva "Buscar tamaño completo" desde el menú de la extensión.

Privacidad:
Esta extensión no recopila, almacena ni envía ningún dato personal ni de navegación. Todo ocurre en tu dispositivo. No usa cookies, analítica ni servicios de terceros. Tu preferencia de "Buscar tamaño completo" se guarda con la sincronización de Chrome únicamente para recordar tu ajuste entre dispositivos.

Soporte:
Escríbenos a richardo.delfin94@gmail.com.

**Category**
Photos

**Single Purpose**
Descarga imágenes de páginas web en su máxima resolución disponible.

**Primary Language**
Spanish (Español)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |

### Screenshot Notes
- **1**: Botón ⬇ flotante al pasar el cursor sobre una foto (sitio real, foto de alta resolución).
- **2**: Menú de la extensión con los botones y el ajuste "Buscar tamaño completo".
- **3**: Galería de imágenes de red — cuadrícula con dimensiones, badge HD, filtro de tamaño.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| downloads | permissions | Guardar la imagen elegida en la carpeta de descargas del usuario. Es la acción central de la extensión. |
| contextMenus | permissions | Añadir la opción "Descargar imagen" al menú de clic derecho sobre cualquier imagen. |
| storage | permissions | Recordar el ajuste "Buscar tamaño completo" (storage.sync) y mantener temporalmente la lista de imágenes cargadas por pestaña para la galería (storage.session). No se guarda contenido personal. |
| declarativeNetRequestWithHostAccess | permissions | Fijar temporalmente el encabezado Referer solo durante la descarga de una imagen, para que servidores con protección anti-hotlink (que devuelven 403) entreguen el archivo. La regla se crea al descargar y se elimina a los 8 segundos. |
| webRequest | permissions | Observar (solo lectura, sin bloquear) las direcciones de imágenes que la página carga, para poder listarlas en la galería "Imágenes de red". No modifica ni bloquea ninguna petición. |
| `<all_urls>` | host_permissions | La extensión debe poder descargar imágenes en cualquier sitio web que visite el usuario; ese es su único propósito. Necesario para el script de contenido (botón de descarga), la inyección temporal del Referer y la observación de imágenes de red. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

La extensión no recopila ni transmite datos personales ni de navegación fuera del dispositivo.
El único dato almacenado es la preferencia booleana "Buscar tamaño completo" vía `chrome.storage.sync`
(se sincroniza entre los dispositivos del propio usuario a través de Chrome, no a servidores nuestros).
Las direcciones de imágenes por pestaña se guardan en `chrome.storage.session` y se borran al cerrar la pestaña o el navegador.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | No | No | — | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://odrac94.github.io/delpix/privacy.html`

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name**: Delfín
**Contact Email**: richardo.delfin94@gmail.com
**Support URL / Email**: richardo.delfin94@gmail.com
**Homepage URL**: `https://odrac94.github.io/delpix/`

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-19 | Lanzamiento inicial. Descarga a máxima resolución (hover + clic derecho), descargar todas, galería de imágenes de red, inyección temporal de Referer, resolución full-res por plataforma. | Draft |

## Review Notes

### Known Issues / Limitations
- La resolución full-res usa reglas **genéricas** (sufijos de tamaño, segmentos de CDN, hosts de
  miniaturas). No hay ninguna plataforma nombrada en el código, salvo infra pública mainstream
  (Reddit, YouTube, Wikipedia, Cloudinary/Thumbor/ImageKit).
- `<all_urls>` + `webRequest` implica revisión manual — plazos de días a semanas. Todas las
  justificaciones de permisos ya están arriba listas para copiar/pegar en el dashboard.
- No hay evasión de muros de pago ni DRM. Contenido `blob:`/`canvas`/`data:` no re-descargable no se soporta.

### Rejection History
| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
| — | — | — | — |
