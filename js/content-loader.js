// Content loader.
//
// js/content.js is the built-in DEFAULT content. At startup this file also asks the server for
// /content/content.json, which the site editor publishes. Two shapes are accepted:
//   the editor's envelope  { "format": 1, "version": 7, "publishedAt": "...",
//                            "content": { SITE: {...}, ROBOTS: [...], ... },
//                            "media": { "<id>": { "alt": "...", "widths": [400, 800, 1600], ... } } }
//   or just the sections   { SITE: {...}, ROBOTS: [...], ... }
// When that file is present and valid, its sections replace the defaults;
// in every other case (404, unreadable, half-written, invalid, too slow) the site simply uses the
// built-in content. It must never throw or leave a blank page.
//
// Pages do not read content before it is ready. They register a render function:
//   onContent(() => { ...build the page from SITE, ROBOTS, ... });
// which runs once the DOM is ready AND the content has loaded (or the short timeout has passed).
// The editor can call window.setContent(newJson) to swap in draft content and re-render live.
//
// Settings the page (or the editor's wrapper) may set before this script runs:
//   window.CONTENT_URL         where to fetch content from (default "/content/content.json")
//   window.CONTENT_TIMEOUT_MS  how long to wait before using the built-in content (default 1500)

(function () {
  "use strict";

  const URL_ = window.CONTENT_URL || "/content/content.json";
  const TIMEOUT_MS = window.CONTENT_TIMEOUT_MS || 1500;
  const MAX_BYTES = 2 * 1024 * 1024;
  const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  // The registry of editable sections (contentSections), defined at the bottom of js/content.js.
  const live = typeof contentSections === "object" && contentSections ? contentSections : {};
  const names = Object.keys(live);
  const kind = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
  const pristine = {};
  names.forEach((n) => { pristine[n] = JSON.parse(JSON.stringify(live[n])); });

  // Metadata for uploaded images (alt text, stored widths), from the envelope's "media" map.
  // window.CONTENT_MEDIA is updated in place; components.js reads it for alt text and srcset.
  const MEDIA_ID = /^[a-f0-9]{20}$/;
  const mediaInfo = window.CONTENT_MEDIA = {};

  function setMedia(raw) {
    Object.keys(mediaInfo).forEach((k) => delete mediaInfo[k]);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    Object.keys(raw).forEach((id) => {
      const m = raw[id];
      if (!MEDIA_ID.test(id) || !m || typeof m !== "object") return;
      const widths = Array.isArray(m.widths) ? m.widths.filter((w) => w === 400 || w === 800 || w === 1600) : [];
      mediaInfo[id] = { alt: typeof m.alt === "string" ? m.alt.slice(0, 500) : "", widths };
    });
  }

  // The sections and media map of a document, in either shape; null if it is not usable.
  function unwrap(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
    if ("format" in doc || ("content" in doc && !("SITE" in doc))) {
      if (doc.format !== 1) return null;                       // a format this page does not know
      return { sections: doc.content, media: doc.media };
    }
    return { sections: doc, media: {} };
  }

  // A deep copy that keeps only JSON data and drops keys that could change an object's prototype.
  function clean(v, depth) {
    if (depth > 12) throw new Error("too deep");
    if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
    if (v && typeof v === "object") {
      const out = {};
      Object.keys(v).forEach((k) => { if (!UNSAFE_KEYS.has(k)) out[k] = clean(v[k], depth + 1); });
      return out;
    }
    if (typeof v === "function" || typeof v === "undefined" || typeof v === "symbol") throw new Error("not JSON");
    return v;
  }

  // Returns the sections of `data` to use, or null if the document is not valid.
  function validate(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const sections = {};
    for (const n of names) {
      if (!(n in data)) continue;
      if (kind(data[n]) !== kind(pristine[n])) return null; // wrong type for a known section
      sections[n] = data[n];
    }
    return Object.keys(sections).length ? sections : null;
  }

  // Write `value` into a live section IN PLACE, so every page's reference to it stays valid.
  // Arrays are replaced; objects are merged over what is there (so a key the published file
  // leaves out keeps its built-in value).
  function setSection(name, value, merge) {
    const target = live[name];
    if (typeof target === "string") {
      live[name] = value;                       // a plain string cannot be changed in place; pages read it with contentGet()
    } else if (Array.isArray(target)) {
      target.length = 0;
      value.forEach((x) => target.push(x));
    } else {
      if (!merge) Object.keys(target).forEach((k) => delete target[k]);
      Object.keys(value).forEach((k) => { target[k] = value[k]; });
    }
  }

  function restoreDefaults() {
    names.forEach((n) => setSection(n, JSON.parse(JSON.stringify(pristine[n])), false));
    setMedia({});
  }

  // Turn text into a content update, or return false (and change nothing) if it is not usable.
  function useContent(text) {
    try {
      if (typeof text !== "string" || text.length > MAX_BYTES) return false;
      const doc = unwrap(clean(JSON.parse(text), 0));
      const sections = doc && validate(doc.sections);
      if (!sections) return false;
      restoreDefaults(); // start from the built-ins, then lay the published sections over them
      Object.keys(sections).forEach((n) => setSection(n, sections[n], true));
      setMedia(doc.media);
      return true;
    } catch (err) {
      return false;
    }
  }

  async function fetchContent() {
    if (typeof fetch !== "function") return false;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { if (ctl) ctl.abort(); reject(new Error("timeout")); }, TIMEOUT_MS);
    });
    try {
      // "no-cache" = ask the server whether it changed (ETag), so a new publish shows up straight away.
      const res = await Promise.race([
        fetch(URL_, { cache: "no-cache", credentials: "same-origin", signal: ctl ? ctl.signal : undefined }),
        timeout,
      ]);
      if (!res.ok) return false;
      return useContent(await Promise.race([res.text(), timeout]));
    } catch (err) {
      return false; // offline, aborted, or blocked: use the built-in content
    } finally {
      clearTimeout(timer);
    }
  }

  // ---------- render scheduling ----------
  const renderers = [];
  let ready = false;

  function run(fn) {
    try {
      fn();
    } catch (err) {
      // A published value the page could not handle must not blank the site: use the built-ins.
      console.error("Page render failed; using built-in content.", err);
      restoreDefaults();
      window.CONTENT_FALLBACK = true;
      try { fn(); } catch (err2) { console.error("Page render failed with built-in content too.", err2); }
    }
  }

  window.onContent = function (fn) {
    renderers.push(fn);
    if (ready) run(fn);
  };

  // For the editor: swap in draft content (a JSON object or its text) and re-render every page piece.
  window.setContent = function (data) {
    const ok = useContent(typeof data === "string" ? data : JSON.stringify(data));
    if (ok) renderers.forEach(run);
    return ok;
  };

  // Resolve a data-ck path such as SITE.mission, ROBOTS[2].image or ROBOTS[0].gallery[3].
  window.contentGet = function (path) {
    const parts = String(path).match(/[^.[\]]+/g);
    if (!parts || !(parts[0] in live)) return undefined;
    let v = live[parts[0]];
    for (let i = 1; i < parts.length; i++) {
      if (v === null || typeof v !== "object" || UNSAFE_KEYS.has(parts[i])) return undefined;
      v = v[parts[i]];
    }
    return v;
  };
  window.CONTENT_SECTIONS = names;

  const domReady = new Promise((r) => {
    if (document.readyState !== "loading") r();
    else document.addEventListener("DOMContentLoaded", r, { once: true });
  });
  const started = fetchContent();
  window.CONTENT_LOADED = started; // a promise that resolves to true (published) or false (built-in)
  Promise.all([started, domReady]).then(([published]) => {
    window.CONTENT_SOURCE = published ? "published" : "default";
    ready = true;
    renderers.slice().forEach(run);
    document.documentElement.classList.add("content-ready");
  });

  // Test hook (Node): lets a test drive the loader without a browser.
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { useContent, validate, clean, restoreDefaults };
  }
})();
