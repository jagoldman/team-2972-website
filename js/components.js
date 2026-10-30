// Shared header/footer, injected on every page so nav only lives in one place.

const NAV_LINKS = [
  {
    label: "About",
    children: [
      { label: "About the Team", href: "about.html", desc: "Who we are, our school, our mission and our history." },
      { label: "Our Robots", href: "robots.html", desc: "Every robot we have built, season by season." },
      { label: "Contact", href: "contact.html", desc: "Questions? Write to us." },
    ],
  },
  {
    label: "Outreach & Media",
    children: [
      { label: "Outreach", href: "outreach.html", desc: "How we bring robotics to our community." },
      { label: "Media", href: "media.html", desc: "Photos, videos and press." },
    ],
  },
  { label: "Sponsors", href: "sponsors.html" },
  {
    label: "Join the Team",
    children: [
      { label: "Become a Team Member", href: "member.html", desc: "For students who want to design, build and compete with us." },
      { label: "Become a Mentor", href: "mentor.html", desc: "For adults who want to guide students with their time and expertise." },
    ],
  },
  { label: "Resources", href: "resources.html" },
];

// Pages that should highlight a different nav item
const NAV_ALIASES = { "robot.html": "robots.html" };

function currentPage() {
  const path = window.location.pathname.split("/").pop();
  const page = path === "" ? "index.html" : path;
  return NAV_ALIASES[page] || page;
}

// ---------- Shared helpers ----------

// True when a link has a real value (content.js uses "#" for "not set yet")
function isSet(url) {
  return Boolean(url) && url !== "#";
}

// "Request access" email for an invite-only resource (REQUEST_ACCESS in content.js). The portal passes the signed-in
// user's name and email so the form arrives filled in; on public pages they are left blank.
function requestAccessHref(resource, who = {}) {
  const body = [
    "Hello,",
    "",
    `I would like access to the ${resource.name} (Team ${SITE.teamNumber}).`,
    "",
    `My name: ${who.name || ""}`,
    `My school email: ${who.email || ""}`,
    "Why I need access: ",
    "",
    "Thank you.",
  ].join("\n");
  return `mailto:${SITE.email}?subject=${encodeURIComponent(`Access request: ${resource.name}`)}&body=${encodeURIComponent(body)}`;
}

function renderRequestAccess(who) {
  return `
    <div class="contact-grid"${ck("REQUEST_ACCESS")}>${REQUEST_ACCESS.map((r, i) => `
      <div class="contact-card"${ck(`REQUEST_ACCESS[${i}]`)}>
        <h3${ck(`REQUEST_ACCESS[${i}].name`)}>${esc(r.name)}</h3>
        <p><span${ck(`REQUEST_ACCESS[${i}].what`)}>${esc(r.what)}</span> Access is by invitation.</p>
        <a class="btn" href="${esc(requestAccessHref(r, who))}">Request access</a>
      </div>`).join("")}
    </div>
    <p class="access-note">Each button opens an email to <a href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a>. If no email app opens,
    write to that address with your name, your school email and why you need access.</p>`;
}

// ---------- Safe rendering of content ----------
// Content may come from the site editor, so nothing from it is ever put into a page as raw HTML.
// Every value goes through esc() (text), safeUrl() (links) or rich() (the Markdown subset).

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

// A link target that is safe to use: https:, http:, mailto:, or a path on this site. Anything else
// (javascript:, data:, //other.host) becomes "". Whitespace and control characters are removed first,
// because browsers ignore them inside a URL ("java\tscript:" still runs).
function safeUrl(u) {
  const s = String(u ?? "").replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  if (!s) return "";
  const scheme = s.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return /^(https?|mailto)$/i.test(scheme[1]) ? s : "";
  return s.startsWith("//") ? "" : s;
}

// Rich text: plain text with [link](url), **bold** and *italic*. Everything else is shown as typed.
// This follows the site editor's rules (editor/src/lib/content/text.ts) so a preview there and the
// real page look the same: a link must be https:, mailto: or a page on this site; anything else, and
// anything that is not a well-formed [label](url), stays as plain text. Returns HTML that is safe to
// assign to innerHTML (all text is escaped first).
const RICH_LINK = /\[([^\]\n]{1,300})\]\(([^()\s]{1,2000})\)/g;

function richLinkOk(u) {
  if (/^mailto:/i.test(u)) return /^mailto:[^\s<>"]+$/i.test(u);
  if (/^https:\/\//i.test(u)) return /^https:\/\/[^/\\\s]/i.test(u) && u.length <= 2000;
  // a page on this site: no scheme, no "//", no backslash, no ".." or "." segments, no leading "/"
  if (!u || u.includes("//") || u.includes("\\") || u.includes(":") || u.startsWith("/")) return false;
  return !u.split(/[?#]/)[0].split("/").some((seg) => seg === ".." || seg === ".");
}

function richEmphasis(escaped) {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
}

function rich(text) {
  const md = String(text ?? "");
  let out = "";
  let last = 0;
  for (const m of md.matchAll(RICH_LINK)) {
    out += richEmphasis(esc(md.slice(last, m.index)));
    if (richLinkOk(m[2])) {
      const external = /^https:/i.test(m[2]);
      out += `<a href="${esc(m[2])}"${external ? ' target="_blank" rel="noopener"' : ""}>${richEmphasis(esc(m[1]))}</a>`;
    } else {
      out += richEmphasis(esc(m[0]));
    }
    last = m.index + m[0].length;
  }
  return out + richEmphasis(esc(md.slice(last)));
}

// data-ck marks the element that shows a content field, so the site editor can find it:
//   data-ck="ROBOTS[2].image"        the element that shows that field (a list container gets
//                                     the list's own path, e.g. data-ck="ROBOTS")
//   data-ck-type="image" | "rich"     only where it is not obvious: an image shown as a CSS
//                                     background (<img> is assumed to be an image), or a field
//                                     written in the Markdown subset
//   data-ck-href="SITE.instagram"     on a link whose address is its own field
//   data-ck-alt="SPONSOR_TIERS[0].sponsors[1].name"   on an <img> whose alt text comes from a field
// ck()/ckHref() return the attribute text to put inside a tag in a template string.
function ck(path, type) {
  return ` data-ck="${esc(path)}"${type ? ` data-ck-type="${type}"` : ""}`;
}
function ckHref(path) {
  return ` data-ck-href="${esc(path)}"`;
}
// On an <img>: the field its alt text comes from (a sponsor's name, a history photo's imageAlt, ...)
function ckAlt(path) {
  return ` data-ck-alt="${esc(path)}"`;
}

// Photo URL at the width a spot needs. A value may be:
//   "media:<id>"   an image uploaded through the site editor (a 20-character lowercase hex id) ->
//                  /media/<id>-<w>.webp, where <w> is the smallest stored width (400, 800 or 1600) that
//                  is at least the width asked for; if the published media list says which widths exist,
//                  only those are used. (<id>-thumb.webp is for the editor's own screens, not for pages.)
//   a Google Drive image ID or lh3.googleusercontent.com/d/ID URL (any =w size on it is replaced) ->
//                  /img/drive/<id>-<w>.webp, the copy this server downloaded when the image was built, at the
//                  smallest saved width that is at least the width asked for; if there is none (local preview,
//                  a photo added later, a failed download), the lh3 URL as before
//   any other http(s) URL or site path, such as an SVG placeholder, which is returned unchanged
//   imgUrl("media:<id>", 600) -> "/media/<id>-800.webp"
//   imgUrl("1AbC…", 400)      -> "/img/drive/1AbC…-400.webp" or "https://lh3.googleusercontent.com/d/1AbC…=w400"
// The Drive ID rule is also in scripts/drive-photos/fetch.cjs; keep the two in step.
const MEDIA_WIDTHS = [400, 800, 1600];
const MEDIA_REF = /^media:([a-f0-9]{20})$/;
// { "<Drive id>": [widths saved, smallest first] } from config.js; {} when Caddy did not fill it in.
const DRIVE_PHOTOS = (() => {
  try {
    const m = JSON.parse((window.SITE_ENV || {}).drivePhotos || "{}");
    return m && typeof m === "object" && !Array.isArray(m) ? m : {};
  } catch (e) {
    return {};
  }
})();
function imgUrl(src, width) {
  const s = String(src || "").trim();
  const media = s.match(MEDIA_REF);
  if (media) {
    const info = (window.CONTENT_MEDIA || {})[media[1]];
    const have = info && info.widths.length ? info.widths : MEDIA_WIDTHS;   // widths the editor says it stored
    const w = have.find((x) => x >= width) || have[have.length - 1];
    return `/media/${media[1]}-${w}.webp`;
  }
  const id = /^[\w-]{20,}$/.test(s) ? s : (s.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/) || [])[1];
  if (!id) return safeUrl(s);
  const saved = Object.prototype.hasOwnProperty.call(DRIVE_PHOTOS, id) && Array.isArray(DRIVE_PHOTOS[id]) ? DRIVE_PHOTOS[id] : [];
  const w = saved.find((x) => Number.isInteger(x) && x >= width);
  return w ? `/img/drive/${id}-${w}.webp` : `https://lh3.googleusercontent.com/d/${id}=w${width}`;
}

// The srcset for an uploaded image (every stored width), so the browser can pick for the screen.
// Empty for anything else (Drive images are already sized by the URL).
function imgSrcset(src) {
  const media = String(src || "").trim().match(MEDIA_REF);
  if (!media) return "";
  const info = (window.CONTENT_MEDIA || {})[media[1]];
  const widths = info && info.widths.length ? info.widths : MEDIA_WIDTHS;   // the widths the editor says it stored
  return widths.map((w) => `/media/${media[1]}-${w}.webp ${w}w`).join(", ");
}

// Alt text for an image field: the editor requires one for every upload and publishes it with the
// content, so use that; otherwise `fallback` (usually a name nearby). Plain text, not yet escaped.
function altFor(src, fallback) {
  const media = String(src || "").trim().match(MEDIA_REF);
  const info = media && (window.CONTENT_MEDIA || {})[media[1]];
  return (info && info.alt) || fallback || "";
}

// The src (plus srcset and sizes for uploaded images) of an <img>, as attribute text for a template string:
//   `<img${imgAttrs(m.photo, 400)} alt="…">`
function imgAttrs(src, width) {
  const set = imgSrcset(src);
  return ` src="${esc(imgUrl(src, width))}"${set ? ` srcset="${set}" sizes="${Number(width)}px"` : ""}`;
}

// A CSS position for a cropped photo, such as "67% 84%" (x y) or "center top": one or two parts, each a
// percentage or a keyword. Anything else becomes "", so a value from the editor cannot add other CSS.
const POSITION_PART = "(?:\\d{1,3}(?:\\.\\d+)?%|left|center|right|top|bottom)";
const POSITION = new RegExp(`^${POSITION_PART}(?:\\s+${POSITION_PART})?$`, "i");
function safePosition(p) {
  const s = String(p ?? "").trim();
  return POSITION.test(s) ? s : "";
}

// Inline style that keeps a robot in frame when its photo is cropped (ROBOTS[].imagePosition).
function imgPos(r) {
  const p = safePosition(r.imagePosition);
  return p ? ` style="object-position: ${esc(p)}"` : "";
}

// "https://www.youtube.com/watch?v=ID" or "https://youtu.be/ID" -> embed URL, or "" if it is not YouTube
function youtubeEmbed(url) {
  const m = String(url).match(/^https:\/\/(?:www\.youtube\.com|youtu\.be)\/(?:embed\/|watch\?(?:[^#]*&)?v=)?([\w-]{11})(?:[?&#]|$)/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : "";
}

function robotName(r) {
  return r.name || `${r.year} Robot`;
}

function robotUrl(r) {
  return `robot.html?year=${encodeURIComponent(r.year)}`;
}

// ---------- Site hosts ----------
// Every host URL is built from SITE_SCHEME and SITE_DOMAIN (filled into config.js
// by Caddy), so the same files work on localhost and 2972robotics.com.

function siteBase() {
  const env = window.SITE_ENV || {};
  const filled = (v) => Boolean(v) && !v.startsWith("{{");
  if (filled(env.scheme) && filled(env.domain)) return { scheme: env.scheme, domain: env.domain };
  // Plain local preview: work it out from the address bar.
  const scheme = location.protocol === "https:" ? "https" : "http";
  // Only a plain host name (letters, digits, dots, hyphens, a port) is used to build links.
  const host = /^[A-Za-z0-9.:-]+$/.test(location.host) ? location.host : "localhost";
  const domain = host.replace(/^(www|portal)\./, "") || "localhost";
  return { scheme, domain };
}

// hostUrl("tasks") -> "https://tasks.2972robotics.com/"; hostUrl("", "/about.html") -> public site
function hostUrl(sub, path = "/") {
  const { scheme, domain } = siteBase();
  return `${scheme}://${sub ? `${sub}.` : ""}${domain}${path}`;
}

const PORTAL_URL = hostUrl("portal");
const REQUEST_URL = hostUrl("admin", "/request");
// Sign-out (MASTER_PLAN D36, INTEGRATION §1): the outpost sign_out on the portal host. It clears every
// host's outpost cookie and, through the team-logout flow, the Authentik session. Change it only here.
const SIGNOUT_URL = hostUrl("portal", "/outpost.goauthentik.io/sign_out");

// The portal page sets <body data-portal>. Its nav links must go to the public host.
function isPortalPage() {
  return document.body.hasAttribute("data-portal");
}

function pageHref(page) {
  return isPortalPage() ? hostUrl("", `/${page}`) : page;
}

function renderHeader() {
  const brand = `
      <a href="${pageHref("index.html")}" class="brand">
        <img${imgAttrs(SITE.logo, 200)}${ck("SITE.logo")} alt="${esc(altFor(SITE.logo, SITE.teamName + " logo"))}" class="brand-logo" width="40" height="40" />
        <span class="brand-text"><strong${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</strong> ${isPortalPage() ? "Portal" : `<span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span>`}</span>
      </a>`;

  // The portal keeps its header short: the user's group, a way back to the public site, and sign-out.
  if (isPortalPage()) {
    return `
  <header class="site-header portal-header">
    <div class="header-inner">
      ${brand}
      <nav class="site-nav portal-nav">
        <span class="nav-chip" id="group-chip" hidden></span>
        <a href="${pageHref("index.html")}" class="nav-link">Public site</a>
        ${renderThemeSwitch()}
        <a href="${SIGNOUT_URL}" class="nav-login" data-signout>Sign out</a>
      </nav>
    </div>
  </header>`;
  }

  const active = currentPage();
  const links = NAV_LINKS.map((l) => {
    if (!l.children) return `<a href="${l.href}" class="nav-link${l.href === active ? " active" : ""}">${l.label}</a>`;
    const here = l.children.some((c) => c.href === active);
    return `<div class="nav-group">
        <button type="button" class="nav-link nav-drop${here ? " active" : ""}" aria-expanded="false">${l.label}</button>
        <div class="nav-menu">${l.children.map((c) =>
          `<a href="${c.href}"${c.href === active ? ' aria-current="page"' : ""}><strong>${c.label}</strong><span>${c.desc}</span></a>`).join("")}</div>
      </div>`;
  }).join("");
  return `
  <header class="site-header">
    <div class="header-inner">
      ${brand}
      <button class="nav-toggle" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="site-nav">
        ${links}
        ${renderThemeSwitch()}
        <a href="${PORTAL_URL}" class="nav-login">Team Login</a>
      </nav>
    </div>
  </header>`;
}

function renderFooter() {
  const igHref = safeUrl(SITE.instagram);
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <strong${ck("SITE.teamName")}>${esc(SITE.teamName)}</strong>
        <p>FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span> · <span${ck("SITE.school")}>${esc(SITE.school)}</span><br /><span${ck("SITE.location")}>${esc(SITE.location)}</span> · Since <span${ck("SITE.founded")}>${esc(SITE.founded)}</span></p>
      </div>
      <div class="footer-col">
        <a href="${pageHref("contact.html")}">Contact us</a>
        <a href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a>
        <a href="${esc(igHref)}" target="_blank" rel="noopener"${ckHref("SITE.instagram")}>Instagram <span${ck("SITE.instagramHandle")}>${esc(SITE.instagramHandle)}</span></a>
      </div>
      <div class="footer-col">
        <a href="${pageHref("sponsors.html")}">Become a Sponsor</a>
        <a href="${pageHref("mentor.html")}">Become a Mentor</a>
        <a href="${pageHref("member.html")}">Become a Team Member</a>
        ${isPortalPage() ? `<a href="/install">Install the app</a>` : `<a href="${PORTAL_URL}">Team Login</a>
        <a href="${REQUEST_URL}">Request an account</a>`}
      </div>
    </div>
    <div class="footer-giant" aria-hidden="true"${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</div>
    <p class="footer-copy"><span>© ${new Date().getFullYear()} <span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span>, FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span>.</span> <span><a href="${pageHref("privacy.html")}">Privacy</a> · <a href="${pageHref("terms.html")}">Terms</a></span></p>
  </footer>`;
}

// ---------- Installable app: service worker ----------
// /sw.js keeps the shared files (styles, scripts, fonts, icons) and shows /offline.html when there is no network.
// It never stores a page, /me.json or /apps.json (see sw.js). It only runs where browsers allow it: https, or localhost.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const secure = location.protocol === "https:" || /^(localhost|127\.0\.0\.1|.+\.localhost)$/.test(location.hostname);
  if (!secure) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* not installable here; the site works as before */ });
}

// On sign-out, forget everything the app stored, so nothing is left on a shared device.
async function clearOfflineCaches() {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("2972-")).map((n) => caches.delete(n)));
    }
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.active) reg.active.postMessage({ type: "clear-caches" });
  } catch (e) { /* nothing to clear, or not allowed: sign out anyway */ }
}

// ---------- Theme: Light / Dark / System ----------
// "System" (the default) leaves data-theme off <html>, so the page follows the visitor's system setting
// through CSS alone. Light and Dark set data-theme, remembered in localStorage. An inline script in each
// page's <head> sets it before the page paints, so there is no flash of the wrong theme.
const THEME_KEY = "theme";

function storedTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch (e) {
    return "system";           // storage blocked (private window, site data off): the choice just doesn't persist
  }
}

function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
  document.querySelectorAll(".theme-switch button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.theme === choice)));
}

function setTheme(choice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch (e) { /* not saved, still applied */ }
  applyTheme(choice);
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>' },
  { value: "dark", label: "Dark", icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' },
  { value: "system", label: "System", icon: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>' },
];

function renderThemeSwitch() {
  const current = storedTheme();
  return `<div class="theme-switch" role="group" aria-label="Colour theme">${THEME_OPTIONS.map((o) => `
    <button type="button" data-theme="${o.value}" aria-pressed="${o.value === current}" title="${o.label}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${o.icon}</svg><span class="sr">${o.label}</span>
    </button>`).join("")}</div>`;
}

function bindThemeSwitch() {
  document.querySelectorAll(".theme-switch button").forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.theme)));
}

// Another tab changed the theme: follow it.
addEventListener("storage", (e) => { if (e.key === THEME_KEY || e.key === null) applyTheme(storedTheme()); });

// ---------- Motion and effects ----------
// All of it is decoration: pages work without it, and none of it runs when the visitor
// has asked their system for reduced motion.

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

// Wrap each word of an element's text so it can rise into place (class "rise").
function splitWords(el) {
  if (!el || el.dataset.split) return;
  el.dataset.split = "1";
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(part); return; }
          const w = document.createElement("span");
          w.className = "w";
          const inner = document.createElement("span");
          inner.textContent = part;
          inner.style.setProperty("--wi", i++);
          w.append(inner);
          frag.append(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== "BR") {
        walk(child);
      }
    });
  };
  walk(el);
  el.classList.add("rise");
}

// Reveal [data-reveal] elements as they scroll into view.
function setupReveal(root = document) {
  const els = [...root.querySelectorAll("[data-reveal]:not(.in)")];
  if (REDUCED_MOTION || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  els.forEach((e) => io.observe(e));
}

// Count numbers in [data-count] up from zero when they come into view.
function setupCounters(root = document) {
  root.querySelectorAll("[data-count]:not([data-counted])").forEach((el) => {
    el.dataset.counted = "1";
    const target = Number(el.dataset.count);
    if (REDUCED_MOTION || !("IntersectionObserver" in window)) { el.textContent = target; return; }
    const io = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / 1400);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
  });
}

// Pointer effects: tilt on .tilt, spotlight on .spot and .app-card, magnetic .magnetic buttons.
function setupPointerFx(root = document) {
  if (REDUCED_MOTION || !FINE_POINTER) return;
  root.querySelectorAll(".tilt:not([data-fx])").forEach((c) => {
    c.dataset.fx = "1";
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 8}deg`);
      c.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 8}deg`);
    });
    c.addEventListener("pointerleave", () => { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); });
  });
  root.querySelectorAll(".spot:not([data-fx-spot]), .app-card:not([data-fx-spot])").forEach((c) => {
    c.dataset.fxSpot = "1";
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--x", `${e.clientX - r.left}px`);
      c.style.setProperty("--y", `${e.clientY - r.top}px`);
    });
  });
  root.querySelectorAll(".magnetic:not([data-fx])").forEach((b) => {
    b.dataset.fx = "1";
    b.addEventListener("pointermove", (e) => {
      const r = b.getBoundingClientRect();
      b.style.setProperty("--bx", `${(e.clientX - r.left - r.width / 2) * 0.25}px`);
      b.style.setProperty("--by", `${(e.clientY - r.top - r.height / 2) * 0.35}px`);
    });
    b.addEventListener("pointerleave", () => { b.style.setProperty("--bx", "0px"); b.style.setProperty("--by", "0px"); });
  });
}

// A small gold dot that follows the mouse and grows over links.
function setupCursor() {
  if (REDUCED_MOTION || !FINE_POINTER || document.querySelector(".cursor-dot")) return;
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  dot.setAttribute("aria-hidden", "true");
  document.body.append(dot);
  addEventListener("pointermove", (e) => {
    dot.classList.add("on");
    dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    dot.classList.toggle("big", Boolean(e.target.closest("a, button, input, [role=button]")));
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => dot.classList.remove("on"));
}

// Run every effect on whatever is on the page now. Pages that add content later call it again.
function initEffects(root = document) {
  setupReveal(root);
  setupCounters(root);
  setupPointerFx(root);
}

let layoutStarted = false;

// Builds the header and footer. Safe to run again (the editor re-renders after a draft change).
function mountLayout() {
  document.getElementById("site-header").innerHTML = renderHeader();
  document.getElementById("site-footer").innerHTML = renderFooter();

  bindThemeSwitch();
  const header = document.querySelector(".site-header");
  // Pages without a full-screen hero get a solid header from the start.
  if (!document.querySelector(".hero")) header.classList.add("solid");
  header.classList.toggle("scrolled", scrollY > 30);

  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      document.body.classList.toggle("nav-open", isOpen);
    });
  }

  // "Join the Team" dropdown: opens on hover or focus by CSS; a click or tap toggles it, Escape or an outside click closes it.
  document.querySelectorAll(".nav-drop").forEach((btn) => {
    const group = btn.parentElement;
    const set = (open) => { group.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", () => set(!group.classList.contains("open")));
    document.addEventListener("click", (e) => { if (!group.contains(e.target)) set(false); });
    group.addEventListener("keydown", (e) => { if (e.key === "Escape") { set(false); btn.focus(); } });
  });

  // The installable app: register the service worker, and clear what it stored when someone signs out.
  registerServiceWorker();
  // A sign-out link clears the stored files first (waiting at most a second), then goes on to sign out.
  document.addEventListener("click", (e) => {
    const link = e.target.closest && e.target.closest("a[data-signout]");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    Promise.race([clearOfflineCaches(), new Promise((r) => setTimeout(r, 1000))]).then(() => { location.href = link.href; });
  });

  // Big page headings rise in word by word.
  document.querySelectorAll(".page-header h1, .robot-hero h1").forEach(splitWords);

  if (!layoutStarted) {
    layoutStarted = true;
    addEventListener("scroll", () => {
      const h = document.querySelector(".site-header");
      if (h) h.classList.toggle("scrolled", scrollY > 30);
    }, { passive: true });
    setupCursor();
  }
  // After the page's own render function has filled in its content.
  setTimeout(() => {
    document.querySelectorAll(".page-header h1, .robot-hero h1").forEach(splitWords);
    initEffects();
  }, 0);
}

// Wait for the DOM and the content, then build the layout (the loader runs this).
onContent(mountLayout);
