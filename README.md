# CrabGrab

**Descarga cualquier imagen de la web en su máxima resolución con un solo clic.**

Extensión de Chrome (Manifest V3, JavaScript puro, sin frameworks). Encuentra la
versión de mayor resolución de cada imagen y la guarda, atravesando las capas que
algunos sitios ponen encima para bloquear el guardado.

🌐 **Sitio web:** https://odrac94.github.io/crabgrab/
🔒 **Privacidad:** https://odrac94.github.io/crabgrab/privacy.html

## Características

- Botón ⬇ al pasar el cursor sobre cualquier imagen (o clic derecho).
- Busca automáticamente la máxima resolución probando variantes de la URL.
- "Descargar todas las imágenes" de la página actual.
- Galería de imágenes de red: todas las imágenes que cargó la página, con sus dimensiones.
- Respeta las URLs firmadas para no romper la descarga.
- No recopila ni transmite ningún dato. Todo ocurre en tu dispositivo.

## Desarrollo

Sin build system. Los archivos se cargan tal cual.

```powershell
# Verificar sintaxis tras editar
node --check content.js ; node --check background.js ; node --check popup.js ; node --check gallery.js

# Empaquetar para la Chrome Web Store
pwsh ./package-extension.ps1
```

**Probar:** `chrome://extensions` → Modo desarrollador → **Cargar descomprimida** → esta carpeta.

## Estructura

| Contexto | Archivo | Rol |
|---|---|---|
| Content script | `content.js` | Botón hover, resolución de URL, sondeo de tamaño |
| Service worker | `background.js` | Descargas, inyección de Referer, captura de imágenes de red |
| Popup | `popup.js` / `popup.html` | Ajustes y acciones |
| Galería | `gallery.js` / `gallery.html` | Cuadrícula de imágenes de red |

## Licencia

© 2026 Delfín. Todos los derechos reservados.
