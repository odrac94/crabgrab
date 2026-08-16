# package-extension.ps1 — Crea un ZIP limpio para subir al Chrome Web Store.
# Incluye SOLO lo que Chrome necesita (excluye icon-master.png y docs/).
# Ejecutar desde la carpeta del proyecto:
#   pwsh ./package-extension.ps1
$ErrorActionPreference = "Stop"

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$output  = "crabgrab-v$version.zip"
if (Test-Path $output) { Remove-Item $output }

# Root files that ship as-is.
$items = @(
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html", "popup.js",
  "gallery.html", "gallery.js"
)
# Icons that ship (icon-master.png is the source art, NOT shipped).
$iconItems = @("icon16.png", "icon48.png", "icon128.png")

# Stage into a temp folder so the icons/ subdir is preserved and the
# 1024px master is left out.
$staging = Join-Path ([System.IO.Path]::GetTempPath()) "crabgrab-pkg"
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path "$staging\icons" | Out-Null
foreach ($f in $items)     { Copy-Item $f -Destination $staging }
foreach ($f in $iconItems) { Copy-Item "icons\$f" -Destination "$staging\icons" }

Compress-Archive -Path "$staging\*" -DestinationPath $output
Remove-Item $staging -Recurse -Force

$size = "{0:N0} KB" -f ((Get-Item $output).Length / 1KB)
Write-Host "Empaquetado: $output ($size)"
