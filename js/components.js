// Shared header/footer, injected on every page so nav only lives in one place.

// The header: flat links, no dropdowns (Outreach, Media and Contact are in the footer and linked from About).
const NAV_LINKS = [
  { label: "Robots", href: "robots.html" },
  { label: "About", href: "about.html" },
  { label: "Sponsors", href: "sponsors.html" },
  { label: "Join", href: "member.html" },
  { label: "Resources", href: "resources.html" },
];

// Pages that should highlight a different nav item
const NAV_ALIASES = { "robot.html": "robots.html", "mentor.html": "member.html" };

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

// Buttons for the team's public code and CAD, above the access requests on the Resources page (public pages only).
function renderTeamTools() {
  const out = (path, label) => {
    const href = safeUrl(contentGet(path));   // "#" means "not set yet", as in the editor
    return href && href !== "#" ? extLink(href, esc(label), ` class="btn"${ckHref(path)}`) : "";
  };
  return `<div class="btns team-tools">${out("SITE.github", "Robot code on GitHub")}${out("SITE.onshapePublic", "Robot CAD (public view)")}</div>`;
}

// The public Resources page's access requests, in the design 8.2 style: one column per resource under a black rule, its
// name, what it is, and a "Request access" mail link. (The portal keeps renderRequestAccess below, in its own look.)
function siteRequestAccess() {
  return `<div class="access"${ck("REQUEST_ACCESS")}>${REQUEST_ACCESS.map((r, i) => `<div${ck(`REQUEST_ACCESS[${i}]`)}>
      <h3${ck(`REQUEST_ACCESS[${i}].name`)}>${esc(r.name)}</h3>
      <p><span${ck(`REQUEST_ACCESS[${i}].what`)}>${esc(r.what)}</span> Access is by invitation.</p>
      <a class="textlink" href="${esc(requestAccessHref(r))}">Request access<span class="vh"> to the ${esc(r.name)}</span></a></div>`).join("")}</div>
    <p class="access-note small mute">This opens an email to <a href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a>.</p>`;
}

function renderRequestAccess(who) {
  return `
    <div class="contact-grid"${ck("REQUEST_ACCESS")}>${REQUEST_ACCESS.map((r, i) => `
      <div class="contact-card"${ck(`REQUEST_ACCESS[${i}]`)}>
        <h3${ck(`REQUEST_ACCESS[${i}].name`)}>${esc(r.name)}</h3>
        <p><span${ck(`REQUEST_ACCESS[${i}].what`)}>${esc(r.what)}</span> Access is by invitation.</p>
        <a class="btn btn-outline" href="${esc(requestAccessHref(r, who))}">Request access</a>
      </div>`).join("")}
    </div>
    <p class="access-note">This opens an email to <a href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a>.</p>`;
}

// ---------- Safe rendering of content ----------
// Content may come from the site editor, so nothing from it is ever put into a page as raw HTML.
// Every value goes through esc() (text), safeUrl() (links) or rich() (the Markdown subset).

const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

// Keeps a closing two-letter state code with the city ("Nampa, ID") so it never wraps onto a line alone.
// Takes text that has already been through esc().
function keepState(escaped) {
  return String(escaped).replace(/, ([A-Z]{2})$/, ",&nbsp;$1");
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
//   a Google Drive photo in any form driveIdOf() knows (an ID, lh3.googleusercontent.com/d/ID, drive.google.com/file/d/ID,
//   ?id=ID, the Drive API; any size on it is replaced) ->
//                  /img/drive/<id>-<w>.webp, the copy this server downloaded when the image was built, at the
//                  smallest saved width that is at least the width asked for; if there is none (local preview,
//                  a photo added later, a failed download), the lh3 URL as before
//   any other http(s) URL or site path, such as an SVG placeholder, which is returned unchanged
//   imgUrl("media:<id>", 600) -> "/media/<id>-800.webp"
//   imgUrl("1AbC…", 400)      -> "/img/drive/1AbC…-400.webp" or "https://lh3.googleusercontent.com/d/1AbC…=w400"
//   any other Google-hosted address -> "" (never used as it is); a blurred photo -> its blurred copy or "" (D193)
// The Drive ID rule is driveIdOf() in the "photo-rules" block, which scripts/drive-photos/fetch.cjs runs too.
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
// ---- photo-rules: start ----
// One copy of the photo rules for the pages and the image build: scripts/drive-photos/fetch.cjs reads this file and runs
// exactly the lines between the two "photo-rules" markers. Plain JavaScript only (and URL): no window, no document.

// THE SIGNAL (D193; the Website editor's preview relies on it). window.PHOTO_BLUR, set by config.js, "arrived" only when
// photoBlurList() accepts it: a plain object with format === 1 and photos a plain object (an empty one is fine) whose
// every key is a Drive ID and every value is { v: a letter and 1 to 6 digits, ellipses: a non-empty list of [x, y, rx, ry] with
// each number strictly between 0 and 1 }. Anything else, including no config.js at all, a config.js that failed or did
// not parse, PHOTO_BLUR missing, null, without format 1, or with one bad entry, is "did not arrive", and then the pages
// ask Google for nothing: no Drive photo is shown, and no Google-hosted address is used (imgUrl() gives "").
// The valid empty list, { format: 1, photos: {} }, means "nothing is blurred" and the pages behave as before D193.
const PHOTO_BLUR_FORMAT = 1;
// A blurred photo's version mark ("b2"): a letter and 1 to 6 digits, so a saved file's name <id>-<mark>-<w>.webp reads
// back without doubt.
const PHOTO_MARK = /^[a-z][0-9]{1,6}$/;
function photoBlurList(t) {
  const plain = (o) => Object.prototype.toString.call(o) === "[object Object]";
  if (!plain(t) || t.format !== PHOTO_BLUR_FORMAT || !plain(t.photos)) return null;
  const out = {};
  for (const id of Object.keys(t.photos)) {
    const b = t.photos[id];
    const ok = /^[\w-]{20,}$/.test(id) && plain(b) && typeof b.v === "string" && PHOTO_MARK.test(b.v) &&
      Array.isArray(b.ellipses) && b.ellipses.length > 0 &&
      b.ellipses.every((e) => Array.isArray(e) && e.length === 4 && e.every((n) => typeof n === "number" && n > 0 && n < 1));
    if (!ok) return null;
    out[id] = { v: b.v, ellipses: b.ellipses.map((e) => e.slice()) };
  }
  return out;
}

// True for an address on a Google host (google.com and its country domains, googleusercontent.com, googleapis.com,
// ggpht.com, gstatic.com, googledrive.com and their subdomains). Such an address is never put on a page as it is.
function isGoogleHosted(value) {
  const s = String(value ?? "").replace(/[\u0000-\u0020\u007f-\u009f]/g, "");
  let host = "";
  try { host = new URL(s, "http://relative.invalid/").hostname.toLowerCase().replace(/\.$/, ""); } catch (e) { return false; }
  return /(^|\.)(googleusercontent|googleapis|ggpht|gstatic|googledrive)\.com$/.test(host) || /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host);
}
// The Drive file ID in a photo value, whatever form it was pasted in, or "". The one function for every Drive form; the
// pages (imgUrl) and the image build (fetch.cjs) both use it, so a blurred photo is found in any form.
//   a bare ID                                     20 or more of A-Z a-z 0-9 _ -
//   lh<N>.googleusercontent.com/d/<id>            with or without a size or other suffix (=w800, =s0, /view)
//   drive.google.com or docs.google.com           /file/d/<id>/..., /file/u/<n>/d/<id>/..., /open?id=, /uc?id=,
//                                                 /thumbnail?id= (also under /u/<n>/)
//   drive.usercontent.google.com                  any path with ?id= (/download?id=, /u/0/uc?id=)
//   www.googleapis.com/drive/v2|v3/files/<id>     the Drive API
//   img/drive/<id>-<w>.webp, img/drive/<id>-<mark>-<w>.webp   this site's own saved copy, as a path (resolved by
//                                                 sitePath: /img/..., img/..., ./ and ../, percent-escapes), current or
//                                                 retired; imgUrl() also reads this site's full address as its path
// http: and https: are both taken (both name the same file). Any other Google-hosted address is not a Drive photo
// this site can serve: imgUrl() gives "" for it (isGoogleHosted).
function driveIdOf(value) {
  const s = String(value ?? "").trim();
  const ok = (id) => (/^[\w-]{20,}$/.test(id || "") ? id : "");
  if (ok(s)) return s;
  const saved = /^\/img\/drive\/([\w-]+)-[0-9]+\.webp$/.exec(sitePath(s));
  if (saved) {
    const mark = /^(.*)-([a-z][0-9]{1,6})$/.exec(saved[1]);
    return ok(mark && ok(mark[1]) ? mark[1] : saved[1]);
  }
  let u;
  try { u = new URL(s.replace(/[\u0000-\u0020\u007f-\u009f]/g, "")); } catch (e) { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  const host = u.hostname.toLowerCase().replace(/\.$/, ""), p = u.pathname, q = u.searchParams.get("id") || "";
  let m;
  if (/^lh\d+\.googleusercontent\.com$/.test(host) && (m = /^\/d\/([\w-]+)/.exec(p))) return ok(m[1]);
  if (host === "drive.google.com" || host === "docs.google.com") {
    if ((m = /^\/file(?:\/u\/\d+)?\/d\/([\w-]+)/.exec(p))) return ok(m[1]);
    if (/^(?:\/u\/\d+)?\/(?:open|uc|thumbnail)\/?$/.test(p)) return ok(q);
  }
  if (host === "drive.usercontent.google.com") return ok(q);
  if (host === "www.googleapis.com" && (m = /^\/drive\/v[23]\/files\/([\w-]+)/.exec(p))) return ok(m[1]);
  return "";
}
// A value that is not a full address (no scheme) as the path a browser would ask for from the site's root, with "./",
// "../" and percent-escapes resolved ("img/./drive/%31x" -> "/img/drive/1x"); "" for a full address or nonsense.
function sitePath(value) {
  const s = String(value ?? "").trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return "";
  try {
    const p = new URL(s, "http://relative.invalid/").pathname;
    try { return decodeURIComponent(p); } catch (e) { return p; }
  } catch (e) { return ""; }
}
// ---- photo-rules: end ----

// The blur list as the pages see it: the photos map, or null when the list did not arrive (see THE SIGNAL above).
// A blurred photo's saved files are named <id>-<v>-<w>.webp and it is never loaded from Google: with no saved copy
// listed in the manifest (a failed download, a local preview) imgUrl() gives "" and the page shows what it shows for a
// missing photo. hasPhoto() says whether a photo value can be shown.
const PHOTO_BLUR_LIST = photoBlurList(window.PHOTO_BLUR);
function blurOf(id) {
  return PHOTO_BLUR_LIST && Object.prototype.hasOwnProperty.call(PHOTO_BLUR_LIST, id) ? PHOTO_BLUR_LIST[id] : null;
}
// A full address on this site (its own host, or www., portal. or editor. on the site's domain) as its path, so a pasted
// https://<site>/img/drive/... is read like /img/drive/...; anything else unchanged.
function sitePathOf(s) {
  if (!/^https?:\/\//i.test(s)) return s;
  try {
    const u = new URL(s), host = u.host.toLowerCase(), domain = siteBase().domain.toLowerCase();
    const mine = host === String(location.host).toLowerCase() || host === domain || SITE_SUBDOMAINS.some((sub) => host === `${sub}.${domain}`);
    return mine ? u.pathname + u.search : s;
  } catch (e) { return s; }
}
function hasPhoto(src) {
  return Boolean(String(src || "").trim()) && imgUrl(src, MEDIA_WIDTHS[0]) !== "";
}
function imgUrl(src, width) {
  const s = String(src || "").trim();
  const media = s.match(MEDIA_REF);
  if (media) {
    const info = (window.CONTENT_MEDIA || {})[media[1]];
    const have = info && info.widths.length ? info.widths : MEDIA_WIDTHS;   // widths the editor says it stored
    const w = have.find((x) => x >= width) || have[have.length - 1];
    return `/media/${media[1]}-${w}.webp`;
  }
  const local = sitePathOf(s);
  const id = driveIdOf(local);
  // A Google-hosted address that is not a Drive photo in a form driveIdOf() knows is never used as it is, and nor is
  // any other path into img/drive (an old link-preview picture, the manifest): only a current saved copy is ever named.
  if (!id) return isGoogleHosted(s) || /^\/img\/drive(?:\/|$)/i.test(sitePath(local)) ? "" : safeUrl(s);
  // The blur list did not arrive: no Drive photo at all (we cannot tell which are blurred), so nothing from Google.
  if (!PHOTO_BLUR_LIST) return "";
  const saved = Object.prototype.hasOwnProperty.call(DRIVE_PHOTOS, id) && Array.isArray(DRIVE_PHOTOS[id]) ? DRIVE_PHOTOS[id] : [];
  const blur = blurOf(id);
  if (blur) {
    // A blurred photo: the saved copy at the width asked for, or the largest saved (a "full size" link), never Google.
    const have = saved.filter((x) => Number.isInteger(x) && x > 0);
    const bw = have.find((x) => x >= width) || have[have.length - 1];
    return bw && blur.v ? `/img/drive/${id}-${blur.v}-${bw}.webp` : "";
  }
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

// An <img>'s src, srcset and sizes for a photo shown at different widths on different screens, so a phone fetches a
// small copy: `widths` are the copies to offer (as for imgUrl), `sizes` the CSS width of the spot. An uploaded image
// offers every width it has stored; a Drive photo offers each of `widths` (the copy this server saved, or lh3 at that
// width), each named by the width in its own address. Anything else (a site path) is the plain src.
//   `<img${imgSized(r.image, [400, 800], "(min-width: 1024px) 300px, 50vw")} alt="…">`
function imgSized(src, widths, sizes) {
  const media = imgSrcset(src);
  const urls = [...new Set(widths.map((w) => imgUrl(src, w)).filter(Boolean))];
  const sized = urls.map((u) => [u, Number((u.match(/-(\d+)\.webp$/) || u.match(/=w(\d+)$/) || [])[1])]).filter(([, w]) => w > 0);
  const set = media || (sized.length > 1 ? sized.map(([u, w]) => `${esc(u)} ${w}w`).join(", ") : "");
  return ` src="${esc(imgUrl(src, widths[0]))}"${set ? ` srcset="${set}" sizes="${esc(sizes)}"` : ""}`;
}

// The src (plus srcset and sizes for uploaded images) of an <img>, as attribute text for a template string:
//   `<img${imgAttrs(m.photo, 400)} alt="…">`
function imgAttrs(src, width) {
  const set = imgSrcset(src);
  return ` src="${esc(imgUrl(src, width))}"${set ? ` srcset="${set}" sizes="${Number(width)}px"` : ""}`;
}

// Dawson School's wordmark (brand/dawson-school-logo.png, white artwork). CSS draws it as a mask filled with the
// surrounding text colour, so it takes on each section's look in both themes. Links to SITE.schoolUrl when set.
// If the file fails to load once, every mark on the page is hidden and later renders return "".
// Resolved against this script's own address when it is evaluated, not the site root: the editor serves these
// pages under editor.<domain>/site/*, where /brand/... is a 404 (same base as the stylesheet's ../brand/ mask).
const SCHOOL_MARK_URL = (() => {
  try { return new URL("../brand/dawson-school-logo.png", document.currentScript.src).href; }
  catch (e) { return "/brand/dawson-school-logo.png"; }            // no currentScript (tests, modules)
})();
let schoolMarkFailed = false;
let schoolMarkProbed = false;
function schoolMark(extraClass = "") {
  if (schoolMarkFailed) return "";
  if (!schoolMarkProbed) {
    schoolMarkProbed = true;
    const probe = new Image();
    probe.onerror = () => {
      schoolMarkFailed = true;
      document.querySelectorAll(".school-mark-wrap").forEach(el => { el.hidden = true; });
    };
    probe.src = SCHOOL_MARK_URL;
  }
  const mark = `<span class="school-mark" role="img" aria-label="Dawson School logo"></span>`;
  const href = isSet(SITE.schoolUrl) ? safeUrl(SITE.schoolUrl) : "";
  const cls = `school-mark-wrap${extraClass ? " " + extraClass : ""}`;
  return href
    ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener"${ckHref("SITE.schoolUrl")}>${mark}</a>`
    : `<span class="${cls}">${mark}</span>`;
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
// A start time on the link (t=9s, t=110, t=1m30s or start=90) carries over as ?start=<seconds>.
function youtubeEmbed(url) {
  const u = String(url);
  const m = u.match(/^https:\/\/(?:www\.youtube\.com|youtu\.be)\/(?:embed\/|watch\?(?:[^#]*&)?v=)?([\w-]{11})(?:[?&#]|$)/);
  if (!m) return "";
  const t = u.match(/[?&](?:t|start)=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?(?:&|#|$)/);
  const start = t ? (+t[1] || 0) * 3600 + (+t[2] || 0) * 60 + (+t[3] || 0) : 0;
  return `https://www.youtube.com/embed/${m[1]}${start ? `?start=${start}` : ""}`;
}

function robotName(r) {
  return r.name || `${r.year} Robot`;
}

function robotUrl(r) {
  return `robot.html?year=${encodeURIComponent(r.year)}`;
}

// ---------- Design 8.2 helpers (the public pages) ----------

// A date or score range shown with an en dash ("March 24–27, 2027", "2–7–0"). Display only: content keeps what was typed.
function dash(s) {
  return String(s ?? "").replace(/(\d)\s*-\s*(?=\d)/g, "$1–");
}

// A link out of the site: it opens in a new tab and says so to a screen reader. `html` is already escaped (it may hold
// data-ck spans); `attrs` is extra attribute text (class, data-ck-href). An unsafe or empty address gives "".
function extLink(url, html, attrs = "") {
  const href = safeUrl(url);
  if (!href) return "";
  return `<a href="${esc(href)}" target="_blank" rel="noopener"${attrs}>${html}<span class="vh"> (opens in a new tab)</span></a>`;
}

// A robot's stats line ("5 events · 2 wins") as its parts. The page shows them as a list or joined with commas, so no
// middle dot is ever on screen; the content keeps its dots.
function statParts(r) {
  return r && r.stats ? String(r.stats).split(/\s+·\s+/).map((p) => p.trim()).filter(Boolean) : [];
}

// Dawson School's wordmark (brand/dawson-school-logo.png, white artwork). On paper CSS turns it black (.wm); on the black
// footer it stays white (.wm-light). Linked to SITE.schoolUrl when set. If the file fails to load it is hidden (mountLayout).
function wordmark(width, light = false) {
  const img = `<img class="wm${light ? " wm-light" : ""}" src="brand/dawson-school-logo.png" width="${width}" height="${Math.round(width * 157 / 414)}" alt="Dawson School" data-school-mark data-ck-ignore>`;
  const href = isSet(SITE.schoolUrl) ? safeUrl(SITE.schoolUrl) : "";
  return href ? `<a class="wm-link" href="${esc(href)}" target="_blank" rel="noopener"${ckHref("SITE.schoolUrl")}>${img}<span class="vh"> (opens in a new tab)</span></a>` : `<span class="wm-link">${img}</span>`;
}

// The team address on a public page: a mailto link and a Copy address button (the click is handled once, in mountLayout).
function siteAddress() {
  return `<span class="addr"><a class="addr-t" href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a><button type="button" class="copy" data-copy aria-live="polite">Copy address</button></span>`;
}

// The bumper on Home: the padded strip with the team number at each end, across the base of the hero photo. It swaps the
// site's accent between bumper blue and bumper red; the choice is kept in this browser (localStorage "2972-alliance",
// a colour, nothing personal) and read back before the first paint by each public page's one head script.
const ALLIANCE_KEY = "2972-alliance";
function bumperLabel() {
  return document.documentElement.getAttribute("data-alliance") === "red" ? "Swap to blue bumpers" : "Swap to red bumpers";
}
function renderBumper() {
  const n = `<span class="bumper-n" aria-hidden="true">${esc(SITE.teamNumber)}</span>`;
  return `<button type="button" class="bumper" id="bumper" aria-label="${bumperLabel()}" data-ck-ignore>${n}<span class="bumper-t" id="bumperT" aria-hidden="true">${bumperLabel()}</span>${n}</button>`;
}
function swapBumpers() {
  const root = document.documentElement;
  const next = root.getAttribute("data-alliance") === "red" ? "blue" : "red";
  root.setAttribute("data-alliance", next);
  try { localStorage.setItem(ALLIANCE_KEY, next); } catch (e) { /* storage blocked: the swap still works, it is just not kept */ }
  const b = document.getElementById("bumper"), t = document.getElementById("bumperT");
  if (b) b.setAttribute("aria-label", bumperLabel());
  if (t) t.textContent = bumperLabel();
}

// ---------- Home helpers: newest award, next event, sponsor names ----------

// The newest season that has an award: { r, i, award } (i is its place in ROBOTS, for data-ck), or null.
function newestAward() {
  const i = ROBOTS.findIndex((r) => Array.isArray(r.awards) && r.awards.length);
  return i < 0 ? null : { r: ROBOTS[i], i, award: ROBOTS[i].awards[0] };
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// "March 24-27, 2027" or "Mar 30 - Apr 2, 2027" -> { start, end } (local dates; end is the end of the last day), or null
// when the text is not a date range this page understands. The schedule is typed by hand, so it must never throw.
function parseEventDates(text) {
  const m = /([A-Za-z]+)\.?\s+(\d{1,2})(?:\s*[-–—]\s*(?:([A-Za-z]+)\.?\s+)?(\d{1,2}))?\s*,?\s*(\d{4})/.exec(String(text || ""));
  if (!m) return null;
  const m1 = MONTHS[m[1].slice(0, 3).toLowerCase()];
  const m2 = m[3] ? MONTHS[m[3].slice(0, 3).toLowerCase()] : m1;
  if (m1 == null || m2 == null) return null;
  const y = Number(m[5]);
  return { start: new Date(y, m1, Number(m[2])), end: new Date(y, m2, Number(m[4] || m[2]), 23, 59, 59) };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The team's time zone: "today" for the next-event count is the date in Colorado, wherever the visitor is.
const TEAM_TIME_ZONE = "America/Denver";
// A calendar date as a whole number of days (so two dates subtract to a count of days, with no clock or DST in it).
const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m, d) / 86400000);
// The day number of `now` in the team's time zone. Falls back to the browser's own date if Intl cannot do it.
function teamDay(now) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
    const get = (t) => Number((parts.find((p) => p.type === t) || {}).value);
    const y = get("year"), m = get("month"), d = get("day");
    if (y && m && d) return dayNumber(y, m - 1, d);
  } catch (e) { /* no time zone data: use the browser's date */ }
  return dayNumber(now.getFullYear(), now.getMonth(), now.getDate());
}
const dateDay = (d) => dayNumber(d.getFullYear(), d.getMonth(), d.getDate());   // parseEventDates() dates are local calendar dates
// More than this many days away, the count is one plain line ("In 131 days"); this many or fewer, the large number.
const BIG_COUNT_DAYS = 60;

// "Next event" on Home: a table of the events in SCHEDULE_2027 that have not ended, soonest first, the next one in bold
// with how long until it starts. Computed in the browser from the schedule and today's date in the team's time zone on
// every call (Home calls it on load, when the tab is shown again and every 30 minutes), so there is no server job and
// nothing to edit. After the last event: "The season is over".
// A date this page cannot read ("Date TBD") stays in the list under the next event. It is never dropped, and the
// season is not called over while one remains. The band carries the list's data-ck so an editor can always add an event.
// The day count: "Happening now", "Starts today", "Starts tomorrow", the large number with "days to go" when the event is
// BIG_COUNT_DAYS away or fewer, otherwise one plain line "In N days".
function renderNextUp(now = new Date()) {
  const today = teamDay(now);
  const dated = SCHEDULE_2027.map((e, i) => ({ e, i, d: parseEventDates(e.dates) }));
  const upcoming = dated.filter((x) => x.d && dateDay(x.d.end) >= today).sort((a, b) => a.d.start - b.d.start || a.i - b.i);
  const unread = dated.filter((x) => !x.d);
  const open = `<section class="band band-floor next-band" aria-labelledby="sched-h"${ck("SCHEDULE_2027")}><div class="wrap">`;
  if (!upcoming.length && !unread.length) return `${open}<h2 id="sched-h">The season is over</h2><p class="next-none">Next season's events appear here when FIRST announces them.</p></div></section>`;
  // The next event is the soonest readable one still ahead. Unreadable dates follow it. When every readable date
  // has passed, the unreadable ones are the list (the first stands in as next, with no count).
  const list = upcoming.length ? [...upcoming, ...unread] : unread;
  const rows = list.map((x, k) => {
    let when = "";
    if (k === 0 && x.d) {
      const days = dateDay(x.d.start) - today;
      if (days < 0) when = "Happening now";
      else if (days === 0) when = "Starts today";
      else if (days === 1) when = "Starts tomorrow";
      else if (days <= BIG_COUNT_DAYS) when = `<span class="count-big">${days}</span> days to go`;
      else when = `In ${days} days`;
    }
    const P = `SCHEDULE_2027[${x.i}]`;
    return `<tr${k === 0 ? ' class="next"' : ""}${ck(P)}><th scope="row"${ck(`${P}.event`)}>${esc(x.e.event)}</th><td class="when"${ck(`${P}.dates`)}>${esc(dash(x.e.dates))}</td><td${ck(`${P}.location`)}>${keepState(esc(x.e.location))}</td><td class="next-in">${when}</td></tr>`;
  }).join("");
  return `${open}<h2 id="sched-h">Next event</h2><table class="sched" aria-labelledby="sched-h"><thead><tr><th scope="col">Event</th><th scope="col">Dates</th><th scope="col">Place</th><th scope="col"><span class="vh">Starts</span></th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

// The editor's overlay.js sets this on the preview page (editor host, /site/<page>) before landing renders.
// The public site never loads that script, so the flag stays unset.
function inEditorPreview() {
  return window.__editorOverlay === true;
}

// A sponsor shows as a name in type. When it has a real logo (not empty, not the grey placeholder) the logo is shown on a
// white tile instead, and if the file fails to load the name takes its place (see the error handler in mountLayout).
function realLogo(s) {
  return Boolean(s.logo) && !/placeholder/i.test(String(s.logo));
}
// A placeholder or empty logo is only a name on the public site. In the editor preview it is also an image
// target (class "logo", with the logo field's data-ck) so the overlay can replace it.
function editorLogoTarget(s, P) {
  if (!inEditorPreview()) return "";
  const alt = esc(altFor(s.logo, s.name + " logo"));
  if (s.logo) return `<img class="logo"${imgAttrs(s.logo, 400)}${ck(`${P}.logo`)}${ckAlt(`${P}.name`)} alt="${alt}" title="${esc(s.name)}" loading="lazy" />`;
  return `<span class="logo"${ck(`${P}.logo`, "image")}${ckAlt(`${P}.name`)} role="img" aria-label="${alt}">Logo</span>`;
}
// The names of one tier as a list in banner lettering. A sponsor with a real logo shows the logo (made for white, it sits
// on the page as it is); { typeOnly: true } sets every sponsor's name in type, real logo or not (Home's sponsors).
function sponsorNames(tier, ti, { typeOnly = false } = {}) {
  const base = `SPONSOR_TIERS[${ti}]`;
  const items = tier.sponsors.map((s, j) => {
    const P = `${base}.sponsors[${j}]`;
    const name = `<span${ck(`${P}.name`)}>${esc(s.name)}</span>`;
    const href = isSet(s.url) ? safeUrl(s.url) : "";
    if (typeOnly || !realLogo(s)) return `<li${ck(P)}>${href ? extLink(href, name, ckHref(`${P}.url`)) : name}${editorLogoTarget(s, P)}</li>`;
    const logoName = `<span class="sp-name"${ck(`${P}.name`)}>${esc(s.name)}</span>`;   // shown only if the logo fails to load
    const img = `<img class="logo"${imgAttrs(s.logo, 400)}${ck(`${P}.logo`)}${ckAlt(`${P}.name`)} alt="${esc(altFor(s.logo, s.name + " logo"))}" loading="lazy" data-sponsor-logo />`;
    return `<li class="logo-tile"${ck(P)}>${href ? extLink(href, img + logoName, ckHref(`${P}.url`)) : img + logoName}</li>`;
  }).join("");
  // An empty tier's list still needs a visible spot in the editor preview (the public page hides the whole tier).
  const vacant = !tier.sponsors.length && inEditorPreview() ? `<li class="editor-empty" data-ck-ignore>No sponsors in this tier yet.</li>` : "";
  return `<ul class="names"${ck(`${base}.sponsors`)}>${items}${vacant}</ul>`;
}

// ---------- Season log ----------
// The competition record as one picture: a column per year from the first season to the newest, one mark per event in
// ROBOTS[].results. The marks come from the words of each result, so nothing is typed by hand. A won event is a banner
// (what the winners take home), in the accent; captain a black disc; a pick or the playoffs a ring with a dot; anything
// else a ring. No mark depends on colour. Years with no season (2020, 2021) stay as columns that say "No season", so the
// gap is visible; they are not links.
function resultType(text) {
  const s = String(text || "");
  if (/won the event/i.test(s)) return "win";
  if (/captain/i.test(s)) return "cap";
  if (/pick|playoffs|semifinal|quarterfinal/i.test(s)) return "po";
  return "played";
}

// { seasons, wins, playoffs } counted from ROBOTS: a playoff event is any event that is not just "played".
function seasonStats() {
  let wins = 0, playoffs = 0;
  ROBOTS.forEach((r) => (r.results || []).forEach((x) => {
    const t = resultType(x.result);
    if (t === "win") wins++;
    if (t !== "played") playoffs++;
  }));
  return { seasons: ROBOTS.length, wins, playoffs };
}

const SEASON_SHAPES = {
  win: `<path class="m-win" d="M4 1h14v20l-7-5.2L4 21z"/>`,
  cap: `<circle class="m-ink" cx="11" cy="11" r="8"/>`,
  po: `<circle class="m-line" cx="11" cy="11" r="7"/><circle class="m-ink" cx="11" cy="11" r="3"/>`,
  played: `<circle class="m-line" cx="11" cy="11" r="7"/>`,
};
// One 22px mark. With an event ({ event, result }) it is an image named by that event; without one it is decoration.
function seasonMark(type, ev) {
  const label = ev ? `${ev.event}: ${ev.result}` : "";
  return `<svg width="22" height="22" viewBox="0 0 22 22" ${ev ? `role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>` : `aria-hidden="true">`}${SEASON_SHAPES[type] || SEASON_SHAPES.played}</svg>`;
}

const SEASON_LEGEND = [["win", "Won the event"], ["cap", "Alliance captain"], ["po", "Picked or in the playoffs"], ["played", "Played the event"]];

// Draws the log into `el`: the hint (SITE.homeRecordHint), the columns in a box that scrolls sideways on a phone, and the
// legend. The log is keyed as the ROBOTS list unless the page already has another element for it ({ list: false }).
function seasonLog(el, { list = true } = {}) {
  const years = ROBOTS.map((r) => Number(r.year)).filter(Number.isFinite);
  if (!years.length) { el.innerHTML = `<p class="empty-note">No seasons yet.</p>`; return; }
  const lo = Math.min(...years), hi = Math.max(...years);
  let cols = "";
  for (let y = lo; y <= hi; y++) {
    const i = ROBOTS.findIndex((r) => Number(r.year) === y);
    if (i < 0) {
      cols += `<div class="log-col log-none" data-ck-ignore><span class="log-marks"></span><span class="log-year">${y}</span><span class="log-name">No season</span></div>`;
      continue;
    }
    const r = ROBOTS[i], results = r.results || [], P = `ROBOTS[${i}]`;
    const wins = results.filter((x) => resultType(x.result) === "win");
    const label = `${r.year}${r.name ? `, ${r.name}` : ""}: ${plural(results.length, "event")}${wins.map((w) => `, won the ${w.event}`).join("")}`;
    cols += `<a class="log-col" href="${robotUrl(r)}" aria-label="${esc(label)}"${ck(P)}><span class="log-marks"${ck(`${P}.results`)}>${results.map((x, j) => `<span class="log-mark"${ck(`${P}.results[${j}]`)}>${seasonMark(resultType(x.result), x)}</span>`).join("")}</span><span class="log-year"${ck(`${P}.year`)}>${esc(r.year)}</span><span class="log-name"${ck(`${P}.name`)}>${esc(r.name)}</span></a>`;
  }
  const hint = SITE.homeRecordHint ? `<p class="log-hint"${ck("SITE.homeRecordHint")}>${esc(SITE.homeRecordHint)}</p>` : "";
  el.innerHTML = `${hint}<div class="log-scroll" role="region" aria-label="Season log, scrolls sideways" tabindex="0"${list ? ck("ROBOTS") : ""}><div class="log">${cols}</div></div>` +
    `<ul class="legend">${SEASON_LEGEND.map(([t, text]) => `<li>${seasonMark(t)} ${text}</li>`).join("")}</ul>`;
  const wrap = el.querySelector(".log-scroll");
  // Once the visitor moves the log themselves, it is theirs: a later scrollLogToNewest(..., { unlessMoved: true }) leaves it.
  const mine = (e) => { if (e.type !== "keydown" || /^(Arrow|Page|Home|End)/.test(e.key)) wrap.slMoved = true; };
  ["pointerdown", "wheel", "touchstart", "keydown"].forEach((t) => wrap.addEventListener(t, mine, { passive: true }));
  scrollLogToNewest(el);
}

// The record as one sentence, counted from ROBOTS: "16 seasons since 2009, 2 event wins and 14 events in the playoffs."
function seasonSummary() {
  const s = seasonStats();
  const years = ROBOTS.map((r) => Number(r.year)).filter(Number.isFinite);
  const since = years.length ? ` since ${Math.min(...years)}` : "";
  return `<p class="record-line">${plural(s.seasons, "season")}${since}, ${plural(s.wins, "event win")} and ${plural(s.playoffs, "event")} in the playoffs.</p>`;
}

// Home: "Competition record", the sentence and the log. The log starts scrolled to the newest year when it is wider than
// the screen (a phone).
function renderRecord(el) {
  if (!el) return;
  el.innerHTML = `<section class="band" aria-labelledby="rec-h"><div class="wrap"><h2 id="rec-h">Competition record</h2>${seasonSummary()}<div class="sl-host"></div></div></section>`;
  seasonLog(el.querySelector(".sl-host"));
}

// Scrolls a season log to its right-hand end (the newest year). Does nothing when the whole log fits.
// { unlessMoved: true } (the page's load event, when fonts and photos have changed the width) also leaves the log alone
// if the visitor has moved it: they touched it, or it is no longer where this function last put it.
function scrollLogToNewest(root = document, { unlessMoved = false } = {}) {
  const w = root.querySelector(".log-scroll");
  if (!w || w.scrollWidth <= w.clientWidth) return;
  if (unlessMoved && (w.slMoved || (w.slAutoLeft !== undefined && Math.abs(w.scrollLeft - w.slAutoLeft) > 1))) return;
  w.scrollLeft = w.scrollWidth;
  w.slAutoLeft = w.scrollLeft;
}

// ---------- Robots in a list (Home and the Robots page) ----------
// A robot's photo in its 4:3 frame, or, with no photo, a grey "Photo wanted" tile with the year large.
function robotShot(r, i, sizes, { lazy = true } = {}) {
  const P = `ROBOTS[${i}]`;
  if (!hasPhoto(r.image)) return `<span class="shot r43"${ck(`${P}.image`, "image")}><span class="ph"><b data-ck-ignore aria-hidden="true">${esc(r.year)}</b><span>Photo wanted</span></span></span>`;
  return `<span class="shot r43"><img${imgSized(r.image, [400, 800, 1600], sizes)}${imgPos(r)}${ck(`${P}.image`)} alt="${esc(altFor(r.image, `${robotName(r)}, the ${r.year} robot`))}"${lazy ? ' loading="lazy"' : ""} width="1000" height="750"></span>`;
}
// The words under a robot's photo: year and game, name, then one line: the tagline (or, with { line: "stats" } as on the
// Robots page, the stats joined with commas), whichever the robot has, the chosen one first.
function robotMeta(r, i, { status = false, line: first = "tagline" } = {}) {
  const P = `ROBOTS[${i}]`;
  const parts = statParts(r);
  const tag = r.tagline ? `<span class="robot-line"${ck(`${P}.tagline`)}>${esc(r.tagline)}</span>` : "";
  const stats = parts.length ? `<span class="robot-line"${ck(`${P}.stats`)}>${esc(parts.join(", "))}</span>` : "";
  const line = first === "stats" ? stats || tag : tag || stats;
  return `<span class="robot-meta"><span><span class="robot-yr"${ck(`${P}.year`)}>${esc(r.year)}</span> <span class="mute"${ck(`${P}.game`)}>${esc(r.game)}</span></span>` +
    `<span class="robot-name"${ck(`${P}.name`)}>${esc(robotName(r))}</span>${line}` +
    `${status && r.status === "In service" ? `<span class="status status-on"${ck(`${P}.status`)}>In service</span>` : ""}</span>`;
}

// Home: "The robots", the four newest seasons from ROBOTS (newest year first): the newest large, the next three in a
// list, and a button to the Robots page.
const HOME_ROBOTS = 4;
const ROBOT_BIG_SIZES = "(min-width: 1240px) 680px, (min-width: 900px) 56vw, 100vw";
const ROBOT_ROW_SIZES = "(min-width: 900px) 190px, 34vw";
function robotsRow() {
  const newest = ROBOTS.map((r, i) => ({ r, i })).filter(({ r }) => Number.isFinite(Number(r.year)))
    .sort((a, b) => Number(b.r.year) - Number(a.r.year) || a.i - b.i).slice(0, HOME_ROBOTS);
  if (!newest.length) return "";
  const link = ({ r, i }, cls, sizes) => `<a class="robot-a${cls ? ` ${cls}` : ""}" href="${robotUrl(r)}"${ck(`ROBOTS[${i}]`)}>${robotShot(r, i, sizes)}${robotMeta(r, i)}</a>`;
  const [big, ...rest] = newest;
  const heading = SITE.homeRobotsHeading || "The robots";
  return `<section class="band band-floor" aria-labelledby="rob-h"><div class="wrap">
    <h2 id="rob-h"${ck("SITE.homeRobotsHeading")}>${esc(heading)}</h2>
    <div class="star"${ck("ROBOTS")}>${link(big, "robot-big", ROBOT_BIG_SIZES)}
      <div>${rest.length ? `<ul class="roster">${rest.map((x) => `<li>${link(x, "", ROBOT_ROW_SIZES)}</li>`).join("")}</ul>` : ""}
      <p class="more"><a class="btn" href="robots.html">See all ${plural(ROBOTS.length, "robot")}</a></p></div></div></div></section>`;
}

// ---------- Short text from long text ----------
// The redesign shows the first sentence of a longer paragraph and keeps the whole paragraph one click away, so nothing
// is rewritten: these only cut what the content already says.
const flatText = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
// The words of a rich-text string, without the [link](url), ** and * marks.
const plainText = (t) => flatText(String(t ?? "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1"));
function firstSentence(t) {
  const s = plainText(t);
  const i = s.indexOf(". ");
  return i < 0 ? s : s.slice(0, i + 1);
}

// ---------- Results table (robot page) ----------
// ROBOTS[].results[].result is a sentence typed by hand ("Rank 38 of 42 (2-7-0) — 2nd pick of Alliance 2, won the event").
// parseResult pulls out the rank, the record and what came after the dash. A sentence that does not start with "Rank N"
// ("Scrimmage") is not parsed: its raw words go in the Playoffs column and rank and record show a dash, so nothing is
// lost or invented. It never throws.
function parseResult(text) {
  const raw = String(text ?? "");
  const r = /^\s*Rank (\d+)(?: of (\d+))?/.exec(raw);
  if (!r) return { parsed: false, rank: "–", record: "–", playoffs: raw };
  const rec = /\((\d+-\d+-\d+)\)/.exec(raw);
  const dash = raw.indexOf(" — ");
  return { parsed: true, rank: r[2] ? `${r[1]} of ${r[2]}` : r[1], record: rec ? rec[1] : "–", playoffs: dash >= 0 ? raw.slice(dash + 3).trim() || "–" : "–" };
}

// One row: Event (with the banner mark and "Winner" on a won event), Rank, Record, Playoffs, Match data (The Blue
// Alliance). `path` is the result's data-ck path (optional).
function resultRow(x, path) {
  const p = parseResult(x.result), win = resultType(x.result) === "win";
  const k = (field) => (path ? ck(`${path}.${field}`) : "");
  return `<tr${win ? ' class="win"' : ""}${path ? ck(path) : ""}><th scope="row"><span${k("event")}>${esc(x.event)}</span>${win ? `<span class="won">${seasonMark("win")}Winner</span>` : ""}</th>` +
    `<td${k("result")}>${esc(p.rank)}</td><td${k("result")}>${esc(dash(p.record))}</td><td${k("result")}>${esc(p.playoffs)}</td>` +
    `<td>${x.tba ? extLink(tbaEvent(x.tba), "The Blue Alliance", path ? ckHref(`${path}.tba`) : "") : ""}</td></tr>`;
}

// The whole table, in a box that scrolls sideways on a phone. `base` is the robot's data-ck path ("ROBOTS[2]").
function resultsTable(r, base) {
  const rows = (r.results || []).map((x, i) => resultRow(x, base ? `${base}.results[${i}]` : ""));
  return `<div class="tbl-scroll" role="region" aria-label="Results, scrolls sideways" tabindex="0"${base ? ck(`${base}.results`) : ""}><table class="tbl"><thead><tr><th scope="col">Event</th><th scope="col">Rank</th><th scope="col">Record</th><th scope="col">Playoffs</th><th scope="col">Match data</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

// ---------- Site hosts ----------
// Every host URL is built from SITE_SCHEME and SITE_DOMAIN (filled into config.js
// by Caddy), so the same files work on localhost and 2972robotics.com.

// Hosts that serve landing's own pages: the public site (www), the portal, and the editor's preview
// (editor.<domain>/site/*). The site domain is the address without one of these. scripts/theme-init.mjs has the
// same list for the head script (test/theme-test.cjs checks they match). Keep both in step.
const SITE_SUBDOMAINS = ["www", "portal", "editor"];

function siteBase() {
  const env = window.SITE_ENV || {};
  const filled = (v) => Boolean(v) && !v.startsWith("{{");
  if (filled(env.scheme) && filled(env.domain)) return { scheme: env.scheme, domain: env.domain };
  // Plain local preview: work it out from the address bar.
  const scheme = location.protocol === "https:" ? "https" : "http";
  // Only a plain host name (letters, digits, dots, hyphens, a port) is used to build links.
  const host = /^[A-Za-z0-9.:-]+$/.test(location.host) ? location.host : "localhost";
  const domain = host.replace(new RegExp(`^(${SITE_SUBDOMAINS.join("|")})\\.`), "") || "localhost";
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

// Public pages never see who is signed in (Caddy strips the identity headers), so the portal leaves a
// plain hint cookie on the whole site domain: only "1", no name, no group, nothing to trust. It lets the
// public "Team Login" link say "Portal". It is a label only; the portal still checks the real session.
const SIGNED_IN_HINT = "2972_in";
function hintCookieAttrs() {
  const { scheme, domain } = siteBase();
  const host = domain.replace(/:\d+$/, "");
  return `; path=/${host.includes(".") ? `; domain=${host}` : ""}; samesite=lax${scheme === "https" ? "; secure" : ""}`;
}
function setSignedInHint(on) {
  try {
    document.cookie = `${SIGNED_IN_HINT}=${on ? "1" : ""}${hintCookieAttrs()}; max-age=${on ? 43200 : 0}`;
  } catch (e) { /* cookies blocked: the link just keeps saying Team Login */ }
}
function loginLabel() {
  return document.cookie.split("; ").includes(`${SIGNED_IN_HINT}=1`) ? "Portal" : "Team login";
}

function pageHref(page) {
  return isPortalPage() ? hostUrl("", `/${page}`) : page;
}

// Dawson's Mustang "D" (brand/dawson-mustang.png), left of the team logo in the header with a thin rule to its right,
// linked to SITE.schoolUrl when set. A separate link from the team brand (links cannot nest); removed if the file fails
// to load (mountLayout).
function renderSchoolBadge() {
  const img = `<img${imgAttrs("brand/dawson-mustang.png", 80)} data-ck-ignore alt="Dawson School" class="school-badge-img" width="42" height="34" />`;
  const href = isSet(SITE.schoolUrl) ? safeUrl(SITE.schoolUrl) : "";
  return href
    ? `<a class="hdr-school" href="${esc(href)}" target="_blank" rel="noopener"${ckHref("SITE.schoolUrl")}>${img}<span class="vh"> (opens in a new tab)</span></a>`
    : `<span class="hdr-school">${img}</span>`;
}

// The public header (design 8.2): a white bar with a black rule under it. Home shows the number over the full team name;
// every other page reads "2972 Team" on one line. The page you are on is underlined in the accent; the login link is the
// accent button. On a phone the links open under the bar from a "Menu" button (mountLayout: Escape closes it).
function renderHeader() {
  // The protected portal mounts the static shell bar after /me.json and /apps.json load.
  if (isPortalPage()) return "";
  const active = currentPage();
  const name = isHomePage()
    ? `<span class="brand-n"${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span><span class="brand-t"><span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span></span>`
    : `<span class="brand-one"><span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span> Team</span>`;
  const links = NAV_LINKS.map((l) => `<a class="nav-a" href="${l.href}"${l.href === active ? ' aria-current="page"' : ""}>${l.label}</a>`).join("");
  return `
  <header class="hdr" id="hdr">
    <div class="wrap hdr-in">
      ${renderSchoolBadge()}
      <a class="brand" href="${pageHref("index.html")}"><img${imgAttrs(SITE.logo, 200)}${ck("SITE.logo")} alt="" width="44" height="44" />${name}<span class="vh">, home</span></a>
      <button type="button" class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav class="nav" id="site-nav" aria-label="Main">
        ${links}
        <a class="btn btn-bumper btn-sm nav-login" href="${PORTAL_URL}">${loginLabel()}</a>
      </nav>
    </div>
  </header>`;
}

// The team e-mail address (a mailto link) with a Copy button. The click is handled once for the page (mountLayout).
function emailAddress() {
  return `<span class="addr"><a class="addr-t" href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a><button type="button" class="btn btn-line btn-sm" data-copy aria-live="polite">Copy</button></span>`;
}

// The Copy button beside an address: copies it, or, with no clipboard access, selects it so Ctrl/Cmd+C works. The button
// says "Copied" or "Selected" for two seconds, then its own words again ("Copy" on the portal, "Copy address" on public pages).
function copyAddress(button) {
  const text = button.parentNode.querySelector(".addr-t");
  if (!button.hasAttribute("data-label")) button.setAttribute("data-label", button.textContent);
  const label = button.getAttribute("data-label");
  const reset = (said) => { button.textContent = said; setTimeout(() => { button.textContent = label; }, 2000); };
  const select = () => {                                // no clipboard access: select the address so Ctrl/Cmd+C works
    try { const r = document.createRange(); r.selectNodeContents(text); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ }
    reset("Selected");
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.textContent).then(() => reset("Copied"), select);
    else select();
  } catch (e) { select(); }
}

// Home carries <body data-home> (the header shows the full team name there).
function isHomePage() {
  return document.body.hasAttribute("data-home");
}

// The public footer (design 8.2), the same on every public page: the logo and the team's name and facts; Contact (the
// address with Copy, Instagram); Pages in two columns; and the base line with the year, Privacy, Terms and the white
// Dawson wordmark.
function siteFooter() {
  const page = (href, label) => `<li><a href="${href}">${label}</a></li>`;
  const instagram = isSet(SITE.instagram) ? `<p>${extLink(SITE.instagram, `Instagram <span${ck("SITE.instagramHandle")}>${esc(SITE.instagramHandle)}</span>`, ckHref("SITE.instagram"))}</p>` : "";
  return `
  <footer class="ftr">
    <div class="wrap">
      <div class="ftr-grid">
        <div class="ftr-id"><img${imgAttrs(SITE.logo, 200)} alt="" width="104" height="104" data-ck-ignore /><div>
          <p class="ftr-name"${ck("SITE.teamName")}>${esc(SITE.teamName)}</p>
          <p>FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span>, <span${ck("SITE.school")}>${esc(SITE.school)}</span><br /><span${ck("SITE.location")}>${esc(SITE.location)}</span>. Since <span${ck("SITE.founded")}>${esc(SITE.founded)}</span>.</p>
        </div></div>
        <div class="ftr-contact"><h2>Contact</h2><p>${siteAddress()}</p>${instagram}</div>
        <nav aria-label="Footer"><h2>Pages</h2><ul class="ftr-pages">
          ${page("robots.html", "Robots")}${page("about.html", "About")}${page("sponsors.html", "Sponsors")}${page("member.html", "Join")}${page("mentor.html", "Mentor")}
          ${page("outreach.html", "Outreach")}${page("media.html", "Media")}${page("resources.html", "Resources")}${page("contact.html", "Contact")}
          <li><a href="${PORTAL_URL}">${loginLabel()}</a></li><li><a href="${REQUEST_URL}">Request an account</a></li>
        </ul></nav>
      </div>
      <div class="ftr-base"><span>© ${new Date().getFullYear()} <span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span>, FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span></span><span class="ftr-legal"><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a></span>${wordmark(110, true)}</div>
    </div>
  </footer>`;
}

// The footer: the public one above, or, on the portal (<body data-portal>), the portal's own footer in its present look
// (css/style.css), with "Install the app".
function renderFooter() {
  if (!isPortalPage()) return siteFooter();
  const page = (href, label) => `<li><a href="${pageHref(href)}">${label}</a></li>`;
  const instagram = isSet(SITE.instagram) ? `<a href="${esc(safeUrl(SITE.instagram))}" target="_blank" rel="noopener"${ckHref("SITE.instagram")}>Instagram <span${ck("SITE.instagramHandle")}>${esc(SITE.instagramHandle)}</span> ↗</a>` : "";
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <strong${ck("SITE.teamName")}>${esc(SITE.teamName)}</strong>
        <p>FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span> · <span${ck("SITE.school")}>${esc(SITE.school)}</span><br /><span${ck("SITE.location")}>${esc(SITE.location)}</span> · Since <span${ck("SITE.founded")}>${esc(SITE.founded)}</span></p>
        ${schoolMark("footer-school")}
      </div>
      <div class="footer-col">
        <p class="label">Contact</p>
        ${emailAddress()}
        ${instagram}
      </div>
      <div class="footer-col">
        <p class="label">Pages</p>
        <ul>
          ${page("sponsors.html", "Become a sponsor")}
          ${page("mentor.html", "Become a mentor")}
          ${page("member.html", "Become a team member")}
          ${page("robots.html", "Robots")}
          ${page("about.html", "About")}
          ${page("outreach.html", "Outreach")}
          ${page("media.html", "Media")}
          ${page("resources.html", "Resources")}
          ${page("contact.html", "Contact")}
          <li><a href="/install">Install the app</a></li>
        </ul>
      </div>
    </div>
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

// ---------- Theme and colour ----------
// Public pages are light only: <html data-site="public"> and <meta name="color-scheme" content="light"> in each page's
// HTML. They never read or write the shared `theme` cookie or the old localStorage key, so a choice made in the portal
// (the shell kit owns that) neither changes these pages nor is changed by them. The one thing a public page remembers is
// the bumper colour ("2972-alliance"), read by its head script and written only when the bumper is pressed.

let layoutStarted = false;

// Builds the header and footer. Safe to run again (the editor re-renders after a draft change).
function mountLayout() {
  if (!isPortalPage()) document.getElementById("site-header").innerHTML = renderHeader();
  document.getElementById("site-footer").innerHTML = renderFooter();

  const header = document.querySelector(".hdr");
  const badgeImg = header && header.querySelector(".school-badge-img");
  if (badgeImg) {
    const hideBadge = () => header.querySelectorAll(".hdr-school").forEach((el) => el.remove());
    badgeImg.addEventListener("error", hideBadge);
    if (badgeImg.complete && !badgeImg.naturalWidth) hideBadge();
  }

  // The phone menu: a button that opens the links under the bar. Escape closes it and returns focus to the button.
  const toggle = document.getElementById("menuBtn");
  if (toggle && header) {
    const setOpen = (open) => { header.classList.toggle("open", open); toggle.setAttribute("aria-expanded", String(open)); };
    toggle.addEventListener("click", () => setOpen(!header.classList.contains("open")));
    header.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && header.classList.contains("open")) { setOpen(false); toggle.focus(); }
    });
  }

  // The installable app: register the service worker, and clear what it stored when someone signs out.
  registerServiceWorker();
  if (isPortalPage()) setSignedInHint(true);

  if (!layoutStarted) {
    layoutStarted = true;
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG") return;
      // A sponsor logo that does not load: the CSS hides the picture and shows the sponsor's name in type (li.logo-failed).
      if (img.hasAttribute("data-sponsor-logo")) { const li = img.closest("li"); if (li) li.classList.add("logo-failed"); }
      // The Dawson wordmark that does not load: hidden, with its link.
      if (img.hasAttribute("data-school-mark")) { const w = img.closest(".wm-link"); (w || img).hidden = true; }
    }, true);
    document.addEventListener("click", (e) => {
      const copy = e.target.closest && e.target.closest("[data-copy]");
      if (copy) { copyAddress(copy); return; }
      if (e.target.closest && e.target.closest("#bumper")) { swapBumpers(); return; }
      // A sign-out link clears the stored files first (waiting at most a second), then goes on to sign out.
      const link = e.target.closest && e.target.closest("a[data-signout]");
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      setSignedInHint(false);
      Promise.race([clearOfflineCaches(), new Promise((r) => setTimeout(r, 1000))]).then(() => { location.href = link.href; });
    });
  }
}

// Wait for the DOM and the content, then build the layout (the loader runs this).
onContent(mountLayout);
