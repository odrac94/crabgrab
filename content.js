// Max Image Downloader - content script
// Adds a hover download button on every image and resolves the highest-res URL.

(() => {
  "use strict";

  const BTN_CLASS = "mid-dl-btn";
  let currentTarget = null;

  // ---- Settings ------------------------------------------------------------
  const settings = { probe: true }; // "buscar full size" ON by default
  try {
    chrome.storage.sync.get({ probe: true }, (s) => { settings.probe = s.probe; });
    chrome.storage.onChanged.addListener((ch) => {
      if (ch.probe) settings.probe = ch.probe.newValue;
    });
  } catch (e) { /* storage may be unavailable in some frames */ }

  // ---- Highest-resolution URL resolver -------------------------------------

  // Pick largest candidate from a srcset string.
  function pickFromSrcset(srcset) {
    if (!srcset) return null;
    let best = null;
    let bestScore = -1;
    for (const part of srcset.split(",")) {
      const seg = part.trim();
      if (!seg) continue;
      const sp = seg.split(/\s+/);
      const url = sp[0];
      const desc = sp[1] || "";
      let score = 1;
      if (desc.endsWith("w")) score = parseInt(desc, 10) || 1;
      else if (desc.endsWith("x")) score = (parseFloat(desc) || 1) * 1000;
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    return best;
  }

  // Data attributes commonly holding the full-res image.
  const HIRES_ATTRS = [
    "data-zoom-image", "data-zoom-src", "data-large-image", "data-large",
    "data-full", "data-full-src", "data-highres", "data-hi-res", "data-original",
    "data-src-large", "data-image", "data-lazy-src", "data-src", "data-srcset"
  ];

  // Query params that mean the URL is cryptographically signed. Touching the
  // query then invalidates the signature -> 403 -> broken download.
  const SIGNED_RE = /[?&](s|sig|signature|hmac|token|st|expires|oh|oe|x-amz-signature|x-goog-signature)=/i;

  // Strip known CDN size params to reach the original.
  function upgradeUrl(url) {
    if (!url) return url;
    try {
      // Reddit: preview/external-preview -> the unsigned full-res original on
      // i.redd.it. The media id is the last token of the filename stem.
      const rd = url.match(/^https?:\/\/(?:preview|external-preview|i)\.redd\.it\/(?:.*?-)?([a-z0-9]+)\.(jpe?g|png|gif|webp)/i);
      if (rd) return `https://i.redd.it/${rd[1]}.${rd[2].toLowerCase()}`;

      // Wikipedia / MediaWiki thumbnails: /thumb/a/ab/File.jpg/640px-File.jpg
      const wiki = url.match(/^(https?:.*\/)thumb\/(.+?)\/[^/]+$/);
      if (wiki) return wiki[1] + wiki[2];

      // Google user content / Blogger: strip =sNNN / =wNNN-hNNN sizing suffix
      url = url.replace(/=[swh]\d+(-[a-z]\d+)*(-c)?$/i, "=s0");

      // WordPress / generic: image-640x480.jpg -> image.jpg
      url = url.replace(/-\d{2,4}x\d{2,4}(\.\w{3,4})(\?.*)?$/i, "$1$2");

      // Query-string width/height/resize hints — but NEVER on a signed URL,
      // where removing a param breaks the signature.
      if (!SIGNED_RE.test(url)) {
        const u = new URL(url, location.href);
        let touched = false;
        for (const p of ["w", "h", "width", "height", "size", "resize", "fit", "q", "quality"]) {
          if (u.searchParams.has(p)) { u.searchParams.delete(p); touched = true; }
        }
        if (touched) url = u.toString();
      }
    } catch (e) { /* keep original on parse error */ }
    return url;
  }

  function looksLikeImage(url) {
    return /\.(jpe?g|png|gif|webp|bmp|avif|svg)(\?|#|$)/i.test(url || "");
  }

  // ---- Full-size guessing (probe candidates) -------------------------------
  // Words that usually mark a downscaled variant.
  const SIZE_WORDS = ["thumbnail", "thumb", "small", "medium", "mini", "tiny",
    "preview", "lowres", "low", "icon", "sm", "md", "xs", "tn"];
  // Bigger tokens to try when the size token is a raw number (e.g. _280 -> _1600).
  const BIG_NUMS = ["2000", "1600", "1280", "1024", "3000", "1920"];

  // Build a list of plausible full-size URLs for a given image URL.
  function sizeCandidates(url) {
    const out = [];
    const add = (u) => { if (u && u !== url && !out.includes(u)) out.push(u); };

    // YouTube thumbnails: i.ytimg.com/vi/<ID>/<name>.jpg -> try the full-res
    // variants in descending order (maxres may not exist for every video).
    const yt = url.match(/^https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/([^/]+)\//i);
    if (yt) {
      const id = yt[1];
      for (const n of ["maxresdefault", "sddefault", "hq720", "hqdefault"]) {
        add(`https://i.ytimg.com/vi/${id}/${n}.jpg`);
      }
      return out; // no generic guessing needed for ytimg
    }

    const qi = url.indexOf("?");
    const q = qi >= 0 ? url.slice(qi) : "";
    const path = qi >= 0 ? url.slice(0, qi) : url;

    const em = path.match(/\.\w{3,4}$/);
    const ext = em ? em[0] : "";
    const stem = ext ? path.slice(0, -ext.length) : path;

    // 1. Trailing size token before extension:
    //    _280 / -280 / .280 / _280x200 / _300px / _1024w / _720p
    const tokenRe = /([._-])(\d{2,5})(x\d{2,5})?(px|w|p)?$/i;
    const tm = stem.match(tokenRe);
    if (tm) {
      const sep = tm[1], unit = tm[4] || "";
      add(stem.replace(tokenRe, "") + ext + q);                    // strip token
      for (const big of BIG_NUMS) {
        add(stem.replace(tokenRe, sep + big) + ext + q);           // swap number only
        add(stem.replace(tokenRe, sep + big + unit) + ext + q);    // swap keeping unit (300px -> 2000px)
      }
    }

    // 2. Size WORD in the filename: name_thumb.jpg / name-small.jpg
    for (const w of SIZE_WORDS) {
      const re = new RegExp("([._-])" + w + "(?=[._-]|$)", "i");
      if (re.test(stem)) {
        add(stem.replace(re, "") + ext + q);                // remove word
        add(stem.replace(re, "$1large") + ext + q);
        add(stem.replace(re, "$1original") + ext + q);
        add(stem.replace(re, "$1full") + ext + q);
        add(stem.replace(re, "$1big") + ext + q);
      }
    }

    // 3. Size segment in the path: /280/name.jpg or /thumb/name.jpg
    add(url.replace(/\/\d{2,5}\/(?=[^/]+$)/, "/"));
    for (const w of SIZE_WORDS) {
      const re = new RegExp("/" + w + "/(?=[^/]+$)", "i");
      if (re.test(url)) {
        add(url.replace(re, "/"));
        add(url.replace(re, "/large/"));
        add(url.replace(re, "/original/"));
        add(url.replace(re, "/full/"));
      }
    }

    // 4. CDN transform segments in the path.
    // Cloudinary: /image/upload/w_400,h_300,c_fill/v1/file.jpg -> drop transforms
    add(url.replace(/\/upload\/[^/]*(?:[whc]_|,)[^/]*\/(?=(v\d+\/)?[^/]+$)/, "/upload/"));
    // Thumbor / generic dimension segment: /unsafe/300x300/ or /300x300/
    add(url.replace(/\/(?:unsafe\/)?\d{2,5}x\d{2,5}\//, "/"));
    // imgkit / cdn "tr:w-400" style transform segments
    add(url.replace(/\/tr:[^/]+\//i, "/"));

    // 5. Thumbnail on a separate host/path than the original.
    //    thumbs.site.com/.../thumbs/c144/<path> -> {public,cdn,...}.site.com/<path>
    try {
      const u = new URL(url, location.href);
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
    } catch (e) { /* ignore parse errors */ }

    return out;
  }

  // Load a URL and report its real pixel dimensions (null on error/timeout).
  function probeImage(url, timeout = 7000) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        img.onload = img.onerror = null;
        resolve(val);
      };
      const t = setTimeout(() => finish(null), timeout);
      img.onload = () => finish({ url, w: img.naturalWidth || 0 });
      img.onerror = () => finish(null);
      // Send the page referer (default policy) so hotlink-protected hosts (403
      // without a referer) serve the probe — matches the real download, which
      // injects the same referer. Forcing no-referrer here made the full-size
      // probe fail and the thumbnail win.
      img.src = url;
    });
  }

  // Given a resolved URL + its on-page width, probe candidates and return the
  // largest one that actually loads. Falls back to the input URL.
  async function pickFullSize(url, knownWidth) {
    if (!settings.probe) return url;
    const cands = sizeCandidates(url);
    if (!cands.length) return url;
    // Probe in priority order (plain strip = the real original comes first) and
    // stop at the first variant that loads AND is larger — one probe for a
    // typical `_300px` thumbnail instead of a dozen, so the button snaps back.
    let best = { url, w: knownWidth || 0 };
    for (const c of cands) {
      const r = await probeImage(c);
      if (r && r.w > best.w) { best = r; break; }
    }
    return best.url;
  }

  // Resolve best URL for a given <img> (or element with bg image).
  function resolveBest(el) {
    const candidates = [];

    if (el.tagName === "IMG") {
      // 1. srcset on the img or its <picture> siblings
      candidates.push(pickFromSrcset(el.getAttribute("srcset")));
      const pic = el.closest("picture");
      if (pic) {
        pic.querySelectorAll("source").forEach(s => {
          candidates.push(pickFromSrcset(s.getAttribute("srcset")));
        });
      }
      // 2. hi-res data attributes
      for (const a of HIRES_ATTRS) {
        const v = el.getAttribute(a);
        if (v) candidates.push(a === "data-srcset" ? pickFromSrcset(v) : v);
      }
      // 3. anchor wrapper pointing to a full image
      const a = el.closest("a");
      if (a && looksLikeImage(a.href)) candidates.push(a.href);
      // 4. currentSrc / src fallback
      candidates.push(el.currentSrc || el.src);
    } else {
      // Background image element
      const bg = getComputedStyle(el).backgroundImage;
      const m = bg && bg.match(/url\((['"]?)(.*?)\1\)/);
      if (m) candidates.push(m[2]);
    }

    // Resolve relative -> absolute, upgrade, dedupe.
    const seen = new Set();
    const resolved = [];
    for (let c of candidates) {
      if (!c) continue;
      try { c = new URL(c, location.href).href; } catch (e) { continue; }
      const up = upgradeUrl(c);
      if (!seen.has(up)) { seen.add(up); resolved.push(up); }
    }
    return resolved[0] || (el.currentSrc || el.src || null);
  }

  // ---- Download ------------------------------------------------------------

  function filenameFor(url) {
    try {
      const u = new URL(url, location.href);
      let name = u.pathname.split("/").pop() || "image";
      name = decodeURIComponent(name).split("?")[0];
      if (!/\.\w{3,4}$/.test(name)) name += ".jpg";
      return name;
    } catch (e) { return "image.jpg"; }
  }

  // True once the extension has been reloaded/updated and this content script
  // is orphaned (its chrome.runtime is dead). chrome.runtime.id becomes undefined.
  function contextAlive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
  }

  function download(url, filename) {
    if (!url) return false;
    if (!contextAlive()) { toast("Recarga la página (Delpix se actualizó)"); return false; }
    try {
      chrome.runtime.sendMessage({
        type: "download-image",
        url,
        filename: filename || filenameFor(url),
        referer: location.href
      });
      return true;
    } catch (e) {
      // Extension context invalidated mid-call (reloaded/updated).
      toast("Recarga la página (Delpix se actualizó)");
      return false;
    }
  }

  // ---- Hover button UI -----------------------------------------------------

  const btn = document.createElement("button");
  btn.className = BTN_CLASS;
  btn.type = "button";
  btn.title = "Descargar imagen (max resolucion)";
  btn.textContent = "⬇"; // down arrow
  btn.style.display = "none";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const el = currentTarget;
    if (!el) return;
    btn.classList.add("mid-busy");
    btn.textContent = "…";
    let ok = false;
    try {
      let url = resolveBest(el);
      url = await pickFullSize(url, el.naturalWidth || 0);
      ok = download(url);
    } catch (err) {
      // Never leave the button stuck on "…": fall back to the raw src.
      const raw = (el.currentSrc || el.src) || null;
      ok = raw ? download(raw) : false;
    } finally {
      btn.classList.remove("mid-busy");
      if (ok) flash();                                   // ✓ then ⬇
      else if (btn.textContent === "…") btn.textContent = "⬇";
    }
  });

  function flash() {
    btn.textContent = "✓"; // check
    setTimeout(() => { btn.textContent = "⬇"; }, 900);
  }

  // Transient confirmation toast (used for paths with no hover-button feedback,
  // e.g. the right-click context menu).
  let toastEl = null, toastT = null;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "mid-toast";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = text;
    requestAnimationFrame(() => toastEl.classList.add("mid-show"));
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove("mid-show"), 1600);
  }

  function attach() {
    if (!document.body.contains(btn)) document.body.appendChild(btn);
  }

  function placeOver(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 48) { hideBtn(); return; } // skip tiny icons
    // Off-screen (scrolled out): don't show a stray button.
    if (r.bottom < 0 || r.top > window.innerHeight) { hideBtn(); return; }
    attach();
    btn.style.display = "block";
    // Fixed positioning -> viewport coords, no scroll offset. Clamp inside the
    // image so the button never lands in the page corner.
    btn.style.top = Math.max(6, r.top + 6) + "px";
    btn.style.left = Math.max(6, r.left + 6) + "px";
  }

  function hideBtn() {
    btn.style.display = "none";
    currentTarget = null;
  }

  // Find an image UNDER the cursor, seeing through overlay layers that sites
  // (e.g. Instagram) stack on top of <img> to block saving.
  function targetFrom(e) {
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    // Prefer a real <img> anywhere in the hit-stack.
    for (const el of stack) {
      if (el === btn) continue;
      if (el.tagName === "IMG") return el;
    }
    // Otherwise the first element painting a background image.
    for (const el of stack) {
      if (el === btn) continue;
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && bg.includes("url(")) return el;
    }
    return null;
  }

  let rafPending = false;
  document.addEventListener("mousemove", (e) => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      const t = targetFrom(e);
      if (t) { currentTarget = t; placeOver(t); }
      else if (btn.style.display !== "none" && !btn.matches(":hover")) hideBtn();
    });
  }, true);

  // On scroll, keep the button glued to its image (fixed coords go stale).
  window.addEventListener("scroll", () => {
    if (currentTarget && btn.style.display !== "none") placeOver(currentTarget);
  }, true);

  // ---- Messages from background (context menu / popup) ----------------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "resolve-and-download" && msg.srcUrl) {
      // context menu gives us srcUrl; try to match a live <img> to upgrade it
      const img = [...document.images].find(i => i.currentSrc === msg.srcUrl || i.src === msg.srcUrl);
      const base = img ? resolveBest(img) : upgradeUrl(msg.srcUrl);
      const w = img ? (img.naturalWidth || 0) : 0;
      pickFullSize(base, w).then((u) => { download(u); toast("Descargando imagen…"); });
    }
    if (msg.type === "download-all") {
      (async () => {
        const seen = new Set();
        const imgs = [...document.querySelectorAll("img")];
        const bases = [];
        for (const i of imgs) {
          const b = resolveBest(i);
          if (b && !seen.has(b)) { seen.add(b); bases.push({ b, w: i.naturalWidth || 0 }); }
        }
        const finals = await Promise.all(bases.map(x => pickFullSize(x.b, x.w)));
        const uniq = new Set(finals.filter(Boolean));
        uniq.forEach((u) => download(u));
        sendResponse({ count: uniq.size });
      })();
      return true; // async response
    }
    return false;
  });
})();
