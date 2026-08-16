// Gallery for network-captured images.
const tabId = parseInt(new URLSearchParams(location.search).get("tab"), 10);

const grid = document.getElementById("grid");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");
const dlBtn = document.getElementById("dl");
const onlyBig = document.getElementById("onlyBig");
const sortSel = document.getElementById("sort");

let items = [];   // { url, ref, w, h, loaded, sel, order, card }

function filenameFor(url) {
  try {
    const u = new URL(url);
    let name = u.pathname.split("/").pop() || "image";
    name = decodeURIComponent(name).split("?")[0];
    if (!/\.\w{3,4}$/.test(name)) name += ".jpg";
    return name;
  } catch (e) { return "image.jpg"; }
}

// ---- Full-resolution resolver (same logic as the hover button) -------------
const SIGNED_RE = /[?&](s|sig|signature|hmac|token|st|expires|oh|oe|x-amz-signature|x-goog-signature)=/i;
const SIZE_WORDS = ["thumbnail", "thumb", "small", "medium", "mini", "tiny",
  "preview", "lowres", "low", "icon", "sm", "md", "xs", "tn"];
const BIG_NUMS = ["2000", "1600", "1280", "1024", "3000", "1920"];

function upgradeUrl(url) {
  if (!url) return url;
  try {
    const rd = url.match(/^https?:\/\/(?:preview|external-preview|i)\.redd\.it\/(?:.*?-)?([a-z0-9]+)\.(jpe?g|png|gif|webp)/i);
    if (rd) return `https://i.redd.it/${rd[1]}.${rd[2].toLowerCase()}`;
    const wiki = url.match(/^(https?:.*\/)thumb\/(.+?)\/[^/]+$/);
    if (wiki) return wiki[1] + wiki[2];
    url = url.replace(/=[swh]\d+(-[a-z]\d+)*(-c)?$/i, "=s0");
    url = url.replace(/-\d{2,4}x\d{2,4}(\.\w{3,4})(\?.*)?$/i, "$1$2");
    if (!SIGNED_RE.test(url)) {
      const u = new URL(url);
      let touched = false;
      for (const p of ["w", "h", "width", "height", "size", "resize", "fit", "q", "quality"]) {
        if (u.searchParams.has(p)) { u.searchParams.delete(p); touched = true; }
      }
      if (touched) url = u.toString();
    }
  } catch (e) { /* keep original */ }
  return url;
}

function sizeCandidates(url) {
  const out = [];
  const add = (u) => { if (u && u !== url && !out.includes(u)) out.push(u); };

  const yt = url.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//i);
  if (yt) {
    for (const n of ["maxresdefault", "sddefault", "hq720", "hqdefault"]) add(`https://i.ytimg.com/vi/${yt[1]}/${n}.jpg`);
    return out;
  }

  const qi = url.indexOf("?");
  const q = qi >= 0 ? url.slice(qi) : "";
  const path = qi >= 0 ? url.slice(0, qi) : url;
  const em = path.match(/\.\w{3,4}$/);
  const ext = em ? em[0] : "";
  const stem = ext ? path.slice(0, -ext.length) : path;

  // Trailing size token: _280 / -280 / _280x200 / _300px / _1024w / _720p
  const tokenRe = /([._-])(\d{2,5})(x\d{2,5})?(px|w|p)?$/i;
  const tm = stem.match(tokenRe);
  if (tm) {
    const sep = tm[1], unit = tm[4] || "";
    add(stem.replace(tokenRe, "") + ext + q);
    for (const big of BIG_NUMS) {
      add(stem.replace(tokenRe, sep + big) + ext + q);
      add(stem.replace(tokenRe, sep + big + unit) + ext + q);
    }
  }
  for (const w of SIZE_WORDS) {
    const re = new RegExp("([._-])" + w + "(?=[._-]|$)", "i");
    if (re.test(stem)) {
      add(stem.replace(re, "") + ext + q);
      add(stem.replace(re, "$1large") + ext + q);
      add(stem.replace(re, "$1original") + ext + q);
      add(stem.replace(re, "$1full") + ext + q);
    }
  }
  add(url.replace(/\/\d{2,5}\/(?=[^/]+$)/, "/"));
  for (const w of SIZE_WORDS) {
    const re = new RegExp("/" + w + "/(?=[^/]+$)", "i");
    if (re.test(url)) { add(url.replace(re, "/")); add(url.replace(re, "/large/")); add(url.replace(re, "/original/")); }
  }
  add(url.replace(/\/upload\/[^/]*(?:[whc]_|,)[^/]*\/(?=(v\d+\/)?[^/]+$)/, "/upload/"));
  add(url.replace(/\/(?:unsafe\/)?\d{2,5}x\d{2,5}\//, "/"));
  add(url.replace(/\/tr:[^/]+\//i, "/"));
  try {
    const u = new URL(url);
    const sizeSeg = /\/(?:thumbs?|thumbnails?)\/[a-z]?\d{1,4}(?:x\d{1,4})?\//i;
    const cleanPath = u.pathname.replace(sizeSeg, "/");
    if (cleanPath !== u.pathname) add(u.origin + cleanPath + u.search);
    if (/^(?:thumbs?|thumbnails?|t|img-?thumbs?|static-?thumbs?)\./i.test(u.hostname)) {
      const rest = u.hostname.replace(/^[^.]+\./, "");
      for (const h of ["public", "img", "images", "image", "static", "cdn", "media", "www", "i"]) {
        add(`${u.protocol}//${h}.${rest}${cleanPath}${u.search}`);
        if (cleanPath !== u.pathname) add(`${u.protocol}//${h}.${rest}${u.pathname}${u.search}`);
      }
    }
  } catch (e) { /* ignore */ }
  return out;
}

function probeImage(url, timeout = 7000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (val) => { if (done) return; done = true; clearTimeout(t); img.onload = img.onerror = null; resolve(val); };
    const t = setTimeout(() => finish(null), timeout);
    img.onload = () => finish({ url, w: img.naturalWidth || 0 });
    img.onerror = () => finish(null);
    img.referrerPolicy = "no-referrer"; // matches the preview thumbs, which load here
    img.src = url;
  });
}

// Global concurrency gate: cap simultaneous probes so a full gallery doesn't
// flood the host with hundreds of image requests (which get throttled/timed out
// and then fail, leaving the thumbnail). Returns a release function.
let probeActive = 0;
const probeQueue = [];
const MAX_PROBES = 6;
function acquireProbe() {
  return new Promise((res) => {
    const start = () => { probeActive++; res(() => { probeActive--; if (probeQueue.length) probeQueue.shift()(); }); };
    if (probeActive < MAX_PROBES) start(); else probeQueue.push(start);
  });
}
async function probeGated(url) {
  const release = await acquireProbe();
  try { return await probeImage(url); }
  finally { release(); }
}

// Resolve the largest available variant for a captured URL. Probes candidates
// in priority order (plain strip = the real original comes first) and stops at
// the first one that loads AND is larger — so a typical `_300px` thumbnail
// costs a single probe, not a dozen. Falls back to the deterministic upgrade.
async function resolveFull(url, knownWidth) {
  const base = upgradeUrl(url);
  const cands = sizeCandidates(base);
  let best = { url: base, w: knownWidth || 0 };
  for (const c of cands) {
    const r = await probeGated(c);
    if (r && r.w > best.w) { best = r; break; } // first bigger hit wins
  }
  return best.url;
}

function selectedCount() { return items.filter(i => i.sel && isVisible(i)).length; }

function isVisible(i) {
  if (!onlyBig.checked) return true;
  return (i.w >= 400 || i.h >= 400);
}

function updateDlBtn() {
  dlBtn.textContent = `Descargar seleccionadas (${selectedCount()})`;
}

// Resolve the full-res variant, then download it.
async function downloadOne(item) {
  const url = await resolveFull(item.url, item.w);
  chrome.runtime.sendMessage({
    type: "download-image",
    url,
    filename: filenameFor(url),
    referer: item.ref
  });
}

const DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#e6edf6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>';

function makeCard(item) {
  const card = document.createElement("div");
  card.className = "card";

  const chk = document.createElement("input");
  chk.type = "checkbox";
  chk.className = "sel-box";

  const wrap = document.createElement("div");
  wrap.className = "thumb-wrap";

  const img = document.createElement("img");
  img.className = "thumb";
  img.loading = "lazy";
  img.referrerPolicy = "no-referrer";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = "HD";
  badge.style.display = "none";

  const quick = document.createElement("button");
  quick.className = "quick";
  quick.title = "Descargar esta imagen";
  quick.innerHTML = DL_ICON;
  quick.addEventListener("click", async (e) => {
    e.stopPropagation();
    quick.innerHTML = "…";
    await downloadOne(item);
    quick.classList.add("done");
    quick.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#05130c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>';
    setTimeout(() => { quick.classList.remove("done"); quick.innerHTML = DL_ICON; }, 1100);
  });

  wrap.append(img, badge, quick);

  const meta = document.createElement("div");
  meta.className = "meta";
  const dims = document.createElement("div");
  dims.className = "dims";
  dims.textContent = "cargando…";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = filenameFor(item.url);
  meta.append(dims, name);

  card.append(chk, wrap, meta);

  const toggle = (val) => {
    item.sel = val != null ? val : !item.sel;
    chk.checked = item.sel;
    card.classList.toggle("sel", item.sel);
    updateDlBtn();
  };
  chk.addEventListener("click", (e) => { e.stopPropagation(); toggle(chk.checked); });
  card.addEventListener("click", () => toggle());

  img.addEventListener("load", async () => {
    item.w = img.naturalWidth; item.h = img.naturalHeight; item.loaded = true;
    dims.textContent = `${item.w} × ${item.h}`;
    badge.style.display = (item.w >= 800 || item.h >= 800) ? "" : "none";
    applyFilterSort();
    // Once we know the real thumbnail size, look for a larger variant and swap
    // the card to it (preview + filename + dims + download all use the big one).
    if (!item.resolved) {
      item.resolved = true;
      const full = await resolveFull(item.url, item.w);
      if (full && full !== item.url) {
        item.url = full;
        name.textContent = filenameFor(full);
        img.src = full; // reloads -> this handler updates dims to the full-res size
      }
    }
  });
  img.addEventListener("error", () => {
    dims.textContent = "no se pudo previsualizar";
  });
  img.src = item.url;

  item.card = card;
  item.chk = chk;
  return card;
}

function applyFilterSort() {
  const mode = sortSel.value;
  const arr = [...items];
  if (mode === "size") arr.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  else arr.sort((a, b) => a.order - b.order);
  for (const it of arr) {
    it.card.style.display = isVisible(it) ? "" : "none";
    grid.appendChild(it.card); // re-order
  }
  const vis = arr.filter(isVisible).length;
  countEl.textContent = `${vis} de ${items.length} imagenes`;
  updateDlBtn();
}

function render(images) {
  items = images.map((im, idx) => ({
    url: im.url, ref: im.ref || "", w: 0, h: 0, loaded: false, sel: false, order: idx
  }));
  if (!items.length) { emptyEl.style.display = "block"; countEl.textContent = "0 imagenes"; return; }
  const frag = document.createDocumentFragment();
  for (const it of items) frag.appendChild(makeCard(it));
  grid.appendChild(frag);
  countEl.textContent = `${items.length} imagenes`;
}

// Controls
document.getElementById("selAll").addEventListener("click", () => {
  items.forEach(i => { if (isVisible(i)) { i.sel = true; i.chk.checked = true; i.card.classList.add("sel"); } });
  updateDlBtn();
});
document.getElementById("selNone").addEventListener("click", () => {
  items.forEach(i => { i.sel = false; i.chk.checked = false; i.card.classList.remove("sel"); });
  updateDlBtn();
});
onlyBig.addEventListener("change", applyFilterSort);
sortSel.addEventListener("change", applyFilterSort);

dlBtn.addEventListener("click", async () => {
  const sel = items.filter(i => i.sel && isVisible(i));
  if (!sel.length) return;
  dlBtn.disabled = true;
  dlBtn.textContent = `Resolviendo ${sel.length}…`;
  // Resolve full-res for all in parallel, then download staggered.
  const urls = await Promise.all(sel.map(i => resolveFull(i.url, i.w)));
  dlBtn.textContent = `Descargando ${sel.length}…`;
  urls.forEach((url, k) => {
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: "download-image",
        url,
        filename: filenameFor(url),
        referer: sel[k].ref
      });
    }, k * 120); // small stagger to avoid flooding the download manager
  });
  setTimeout(() => { dlBtn.disabled = false; updateDlBtn(); }, sel.length * 120 + 500);
});

// Load captured images for this tab.
chrome.runtime.sendMessage({ type: "get-net-images", tabId }, (res) => {
  render((res && res.images) || []);
});
