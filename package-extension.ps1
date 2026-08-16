# package-extension.ps1 — Crea un ZIP limpio para subir al Chrome Web Store.
# Incluye SOLO lo que Chrome necesita. Ejecutar desde la carpeta del proyecto:
#   pwsh ./package-extension.ps1
$ErrorActionPreference = "Stop"

$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$output  = "delpix-v$version.zip"
if (Test-Path $output) { Remove-Item $output }

$items = @(
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html", "popup.js",
  "gallery.html", "gallery.js",
  "icons"
)

Compress-Archive -Path $items -DestinationPath $output
$size = "{0:N0} KB" -f ((Get-Item $output).Length / 1KB)
Write-Host "Empaquetado: $output ($size)"
