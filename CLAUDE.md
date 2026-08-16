# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CrabGrab — a Chrome Manifest V3 extension (vanilla JS, no framework) that downloads any web image at its
maximum available resolution. Published/prepared for the Chrome Web Store in Spanish.

## Commands

No build system, no package.json, no test runner. Files ship as-is.

```powershell
# Syntax-check after editing any JS (the only automated check available)
node --check content.js ; node --check background.js ; node --check popup.js ; node --check gallery.js

# Build the Web Store ZIP (reads version from manifest.json -> crabgrab-v<version>.zip)
pwsh ./package-extension.ps1
```

Manual testing is the real loop: `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
After editing `background.js` or `manifest.json`, hit **Reload** on the extension card; after editing
`content.js`/`content.css`, also reload the *page under test* (old content scripts are orphaned — see
`contextAlive()` in `content.js:282`).

`package-extension.ps1` has a hardcoded `$items` list — **any new runtime file must be added there** or it
silently ships broken.

## Architecture

Four isolated JS contexts that only talk over `chrome.runtime` messages:

| Context | File | Role |
|---|---|---|
| Content script (all frames, all URLs) | `content.js` | Hover ⬇ button, DOM-based URL resolution, full-size probing |
| Service worker | `background.js` | Downloads, Referer injection, network image capture, Instagram API |
| Popup | `popup.js` / `popup.html` | Settings toggle + three actions |
| Gallery page | `gallery.js` / `gallery.html` | Grid of network-captured images for one tab |

### Message protocol (all handlers in `background.js:148` and `content.js:414`)

- `download-image {url, filename, referer}` → SW: injects Referer, calls `chrome.downloads.download`, retries without a filename on failure
- `ig-profile-pic {username}` → SW: fetches Instagram's public web_profile_info API, replies `{url}` or `{error}`
- `get-net-images {tabId}` → SW: replies `{images}` from the per-tab capture
- `open-gallery {tabId}` → SW: opens `gallery.html?tab=<id>`
- `resolve-and-download {srcUrl}` → content: right-click context-menu path
- `download-all` → content: resolves every `<img>`, replies `{count}`
- `ig-download-avatar` → content: reads username from the URL, asks the SW for the HD URL

### Resolution pipeline (the core of the extension)

Two stages, deliberately separated:

1. **Deterministic upgrade** — `upgradeUrl()`: pure string rewrites, no network. Reddit preview → `i.redd.it`,
   MediaWiki `/thumb/` strip, Google `=sNNN` → `=s0`, WordPress `-640x480` strip, query-param size hints.
2. **Speculative probe** — `sizeCandidates()` generates plausible bigger URLs (trailing size tokens, size
   *words*, path segments, Cloudinary/Thumbor/ImageKit transform segments, thumb-host → CDN-host swaps),
   then `probeImage()` loads each in an `Image()` and reads `naturalWidth`. **Stops at the first candidate
   that loads AND is wider** — this is intentional (candidates are ordered so the plain strip, i.e. the true
   original, comes first) and keeps a typical thumbnail to one probe instead of a dozen.

Two invariants worth preserving:

- `SIGNED_RE` guards query-param stripping. Removing a param from a cryptographically signed URL invalidates
  the signature → 403 → broken download. Never widen the param list past that guard.
- Probe referrer policy differs by context on purpose: `content.js` sends the page referer (matches the real
  download, which injects the same one — forcing no-referrer made hotlink-protected probes fail and the
  thumbnail win), while `gallery.js` uses `no-referrer` to match how its preview thumbs load.

**This logic is duplicated between `content.js:19-224` and `gallery.js:23-155`** (`SIGNED_RE`, `SIZE_WORDS`,
`BIG_NUMS`, `upgradeUrl`, `sizeCandidates`, `probeImage`). There is no shared module — a content script and
an extension page can't `import` a common file without restructuring. **Fix bugs in both copies.** The
gallery copy additionally has a `MAX_PROBES = 6` concurrency gate (`gallery.js:127`) that the content script
lacks, and uses `new URL(url)` where content.js uses `new URL(url, location.href)`.

### Referer injection (`background.js:26`)

Hotlink-protected hosts 403 without a matching Referer, and JS can't set that header on `fetch`. The SW adds
a temporary `declarativeNetRequest` **session** rule scoped to the one URL, then removes it — 8s after a
download starts (the actual fetch happens asynchronously), immediately after the Instagram API call. Rule
ids rotate through `ruleSeq % 30000` to avoid collisions.

### Network image capture (`background.js:54`)

`webRequest.onCompleted` (read-only, non-blocking) records every image/media URL a tab requested — including
ones never in the DOM — into `netImages: Map<tabId, Map<url, {url,type,ref}>>`. Because an MV3 service worker
sleeps, this is write-through mirrored to `chrome.storage.session` under `net:<tabId>` keys and rehydrated on
startup via the `hydrated` promise, which **every read must await**. Writes serialize through `flushChain` to
avoid clobbering. Cleared on top-level navigation and tab close. `data:`/`blob:` URLs are skipped — nothing
re-fetchable to download.

### DOM targeting (`content.js:379`)

`targetFrom()` uses `elementsFromPoint` and walks the whole hit stack, preferring any `<img>`, then any
element painting a `background-image`. This is what lets the button work through the transparent overlays
sites stack on top of images to block saving.

## Conventions

- **User-facing strings are Spanish; code comments are English.** Keep both.
- Comments explain *why* (which site broke, which failure mode), not what. Match that when editing.
- `chrome.storage.sync` holds exactly one key: `probe` (the "buscar tamaño completo" toggle), read in
  `content.js`, `popup.js`. Note the gallery ignores it and always probes.
- Every `chrome.*` call in the content script must survive extension reload — guard with `contextAlive()`
  or a try/catch, and surface `toast("Recarga la página…")` rather than throwing.

## Store submission

`CHROMEWEBSTORE.md` is the source of truth for the listing and is written to be copy-pasted into the
dashboard. When changing `manifest.json` permissions, update its **Permissions Justification** table in the
same change; when bumping `version`, add a **Version History** row. `<all_urls>` + `webRequest` means manual
review, so the justifications matter.

`PRIVACY.md` and its hosted twin `docs/privacy.html` must stay in sync — they currently disagree on the
product name (`PRIVACY.md` still says "Max Image Downloader", the HTML says "CrabGrab"). The Privacy Policy
URL in `CHROMEWEBSTORE.md` is still a `<PENDIENTE>` placeholder.

The git repo has **no commits yet** — `crabgrab-v1.0.0.zip` and `docs/` are build/publish artifacts sitting in
the working tree.
