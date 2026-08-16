// CrabGrab - service worker

// Context menu on any image.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "mid-download",
    title: "Descargar imagen en máxima resolución (CrabGrab)",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "mid-download" && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, {
      type: "resolve-and-download",
      srcUrl: info.srcUrl
    });
  }
});

// Rotating rule id for the temporary Referer-injection rules.
let ruleSeq = 1;

// Temporarily set a Referer header for one image URL so hotlink-protected
// servers (403 without a matching referer) serve the file.
async function withReferer(url, referer) {
  if (!referer) return null;
  const id = (ruleSeq++ % 30000) + 1;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [id],
      addRules: [{
        id,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [{ header: "referer", operation: "set", value: referer }]
        },
        condition: {
          urlFilter: url,
          resourceTypes: ["image", "media", "other", "xmlhttprequest", "sub_frame", "main_frame"]
        }
      }]
    });
  } catch (e) { return null; }
  return id;
}

function clearRule(id) {
  if (id == null) return;
  chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] }).catch(() => {});
}

// ---- Network image capture (like the DevTools Network tab) -----------------
// Per-tab record of every image/media URL the page requested, even ones never
// present in the DOM. Mirrored to storage.session so it survives the MV3
// service worker sleeping/restarting. tabId -> Map(url -> { url, type, ref }).
const netImages = new Map();
const IMG_EXT = /\.(jpe?g|png|gif|webp|bmp|avif|svg|ico|tiff?)(\?|#|$)/i;

// Rehydrate the in-memory cache from session storage on (re)start.
let hydrated = (async () => {
  try {
    const all = await chrome.storage.session.get(null);
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith("net:") && Array.isArray(v)) {
        netImages.set(+k.slice(4), new Map(v.map((o) => [o.url, o])));
      }
    }
  } catch (e) { /* ignore */ }
})();

// Serialized write-through to avoid clobbering concurrent writes.
let flushChain = Promise.resolve();
function flush(tabId) {
  const m = netImages.get(tabId);
  const val = m ? [...m.values()] : [];
  flushChain = flushChain.then(() =>
    chrome.storage.session.set({ ["net:" + tabId]: val }).catch(() => {})
  );
}

function addNet(tabId, url, type, initiator) {
  if (tabId == null || tabId < 0) return;
  if (!/^https?:\/\//i.test(url)) return; // skip data:/blob: (no re-fetchable URL)
  let m = netImages.get(tabId);
  if (!m) { m = new Map(); netImages.set(tabId, m); }
  if (m.has(url)) return;
  m.set(url, { url, type, ref: initiator || "" });
  flush(tabId);
}

chrome.webRequest.onCompleted.addListener(
  (d) => addNet(d.tabId, d.url, d.type, d.initiator),
  { urls: ["<all_urls>"], types: ["image", "media"] }
);

// Images fetched via XHR/fetch/other won't be typed "image" — catch by extension.
chrome.webRequest.onCompleted.addListener(
  (d) => { if (IMG_EXT.test(d.url)) addNet(d.tabId, d.url, "xhr", d.initiator); },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "other", "media"] }
);

// Reset a tab's list on a full top-level navigation.
chrome.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.type === "main_frame") {
      netImages.delete(d.tabId);
      chrome.storage.session.remove("net:" + d.tabId).catch(() => {});
    }
  },
  { urls: ["<all_urls>"], types: ["main_frame"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  netImages.delete(tabId);
  chrome.storage.session.remove("net:" + tabId).catch(() => {});
});

// Central message handler.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "download-image" && msg.url) {
    (async () => {
      const ruleId = await withReferer(msg.url, msg.referer);
      chrome.downloads.download(
        { url: msg.url, filename: msg.filename, saveAs: false },
        (id) => {
          if (chrome.runtime.lastError || id == null) {
            // Retry without a suggested filename (some data/blob URLs reject it).
            chrome.downloads.download({ url: msg.url });
          }
          // Keep the header rule briefly so the actual fetch picks it up.
          setTimeout(() => clearRule(ruleId), 8000);
        }
      );
    })();
    return false;
  }

  if (msg.type === "get-net-images") {
    hydrated.then(() => {
      const m = netImages.get(msg.tabId);
      sendResponse({ images: m ? [...m.values()] : [] });
    });
    return true; // async response
  }

  if (msg.type === "open-gallery") {
    const tabId = msg.tabId;
    chrome.tabs.create({ url: chrome.runtime.getURL(`gallery.html?tab=${tabId}`) });
    return false;
  }

  return false;
});
