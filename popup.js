// Load + persist the "buscar tamano completo" setting.
const probeBox = document.getElementById("probe");
chrome.storage.sync.get({ probe: true }, (s) => { probeBox.checked = s.probe; });
probeBox.addEventListener("change", () => {
  chrome.storage.sync.set({ probe: probeBox.checked });
});

document.getElementById("net").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  chrome.runtime.sendMessage({ type: "open-gallery", tabId: tab.id });
  window.close();
});

document.getElementById("all").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: "download-all" }, (res) => {
    if (chrome.runtime.lastError) {
      status.textContent = "No se puede en esta pagina.";
      return;
    }
    status.textContent = res && res.count
      ? `Descargando ${res.count} imagenes...`
      : "No se encontraron imagenes.";
  });
});
