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

// Buttons for the team's public code and CAD, above the access requests on the Resources page.
function renderTeamTools() {
  const arrow = `<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg>`;
  const out = (path, label) => {
    const href = safeUrl(contentGet(path));   // "#" means "not set yet", as in the editor
    return href && href !== "#" ? `<a class="btn btn-outline" href="${esc(href)}" target="_blank" rel="noopener"${ckHref(path)}>${label} ${arrow}</a>` : "";
  };
  return `<div class="btn-row team-tools">
      ${out("SITE.github", "Robot code on GitHub")}
      ${out("SITE.onshapePublic", "Robot CAD (public view)")}
    </div>`;
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

// An <img>'s src, srcset and sizes for a photo shown at different widths on different screens, so a phone fetches a
// small copy: `widths` are the copies to offer (as for imgUrl), `sizes` the CSS width of the spot. An uploaded image
// offers every width it has stored; a Drive photo offers each of `widths` (the copy this server saved, or lh3 at that
// width), each named by the width in its own address. Anything else (a site path) is the plain src.
//   `<img${imgSized(r.image, [400, 800], "(min-width: 1024px) 300px, 50vw")} alt="…">`
function imgSized(src, widths, sizes) {
  const media = imgSrcset(src);
  const urls = [...new Set(widths.map((w) => imgUrl(src, w)))];
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

// The "Next event" strip: the soonest event in SCHEDULE_2027 that has not ended, how long until it starts, and the
// rest after it. Computed in the browser from the schedule and today's date in the team's time zone on every call (Home
// calls it on load, when the tab is shown again and every 30 minutes), so there is no server job and nothing to edit.
// After the last event: "Season complete".
// A date this page cannot read ("Date TBD") stays in the list under the next event. It is never dropped, and the
// season is not called complete while one remains. The strip carries the list's data-ck so an editor can always add an event.
function renderNextUp(now = new Date()) {
  const today = teamDay(now);
  const dated = SCHEDULE_2027.map((e, i) => ({ e, i, d: parseEventDates(e.dates) }));
  const upcoming = dated.filter((x) => x.d && dateDay(x.d.end) >= today).sort((a, b) => a.d.start - b.d.start || a.i - b.i);
  const unread = dated.filter((x) => !x.d);
  const open = `<section class="band rules alt tight" aria-label="Next event"${ck("SCHEDULE_2027")}><div class="wrap next">`;
  // Nothing left that we can place, and nothing we failed to read: the season is over.
  if (!upcoming.length && !unread.length) return `${open}<div><p class="label">Next event</p><p class="next-name">Season complete</p></div></div></section>`;
  // The next event is the soonest readable one still ahead. Unreadable dates follow it. When every readable date
  // has passed, the unreadable ones are the list (the first stands in as next, with no countdown).
  const [n, ...rest] = upcoming.length ? [...upcoming, ...unread] : unread;
  let when = "";
  if (n.d) {
    const days = dateDay(n.d.start) - today;
    if (days < 0) when = `<p class="next-in">Happening now</p>`;
    else if (days === 0) when = `<p class="next-in">Starts today</p>`;
    else if (days === 1) when = `<p class="next-in">Tomorrow</p>`;
    else if (days <= BIG_COUNT_DAYS) when = `<p class="countdown count-big"><span class="stat-n">${days}</span><span class="stat-l">days until the event starts</span></p>`;
    else when = `<p class="next-in">In ${days} days</p>`;
  }
  const where = (x) => `<span${ck(`SCHEDULE_2027[${x.i}].dates`)}>${esc(x.e.dates)}</span> · <span${ck(`SCHEDULE_2027[${x.i}].location`)}>${keepState(esc(x.e.location))}</span>`;
  return `${open}
    <div class="next-card"${ck(`SCHEDULE_2027[${n.i}]`)}><span class="beam" aria-hidden="true"><i></i></span>
      <p class="label gold">Next event</p>
      <p class="next-name"${ck(`SCHEDULE_2027[${n.i}].event`)}>${esc(n.e.event)}</p>
      <div>${where(n)}</div>
      ${when}
    </div>
    ${rest.length ? `<div><p class="label">Then</p><ul class="later">${rest.map((x) => `<li${ck(`SCHEDULE_2027[${x.i}]`)}><b${ck(`SCHEDULE_2027[${x.i}].event`)}>${esc(x.e.event)}</b><span class="mute">${where(x)}</span></li>`).join("")}</ul></div>` : ""}
  </div></section>`;
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
// { typeOnly: true } sets every sponsor's name in type, real logo or not (Home's sponsor strip).
function sponsorNames(tier, ti, { typeOnly = false } = {}) {
  const base = `SPONSOR_TIERS[${ti}]`;
  const items = tier.sponsors.map((s, j) => {
    const P = `${base}.sponsors[${j}]`;
    const name = `<span${ck(`${P}.name`)}>${esc(s.name)}</span>`;
    const href = isSet(s.url) ? safeUrl(s.url) : "";
    if (typeOnly || !realLogo(s)) return `<li${ck(P)}>${href ? `<a class="name-link" href="${esc(href)}" target="_blank" rel="noopener"${ckHref(`${P}.url`)}>${name}</a>` : name}${editorLogoTarget(s, P)}</li>`;
    const logoName = `<span class="sp-name"${ck(`${P}.name`)}>${esc(s.name)}</span>`;   // shown only if the logo fails to load
    const img = `<img class="logo"${imgAttrs(s.logo, 400)}${ck(`${P}.logo`)}${ckAlt(`${P}.name`)} alt="${esc(altFor(s.logo, s.name + " logo"))}" title="${esc(s.name)}" loading="lazy" data-sponsor-logo />`;
    return `<li class="sponsor-tile"${ck(P)}>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener"${ckHref(`${P}.url`)}>${img}${logoName}</a>` : img + logoName}</li>`;
  }).join("");
  // An empty tier's list still needs a visible spot in the editor preview (the public page hides the whole tier).
  const vacant = !tier.sponsors.length && inEditorPreview() ? `<li class="editor-empty" data-ck-ignore>No sponsors in this tier yet.</li>` : "";
  return `<ul class="names"${ck(`${base}.sponsors`)}>${items}${vacant}</ul>`;
}

// ---------- Season log ----------
// The competition record as one picture: a column per year from the first season to the newest, one mark per event in
// ROBOTS[].results. The marks come from the words of each result (docs/PUBLIC_REDESIGN_PROPOSAL.md §3), so nothing is
// typed by hand: "won the event" is a large gold mark with a ring, "captain" a gold mark, a pick or the playoffs a gold
// outline with a centre dot, and anything else is a grey outline. Years with no season (2020, 2021) stay as empty columns
// so the gap is visible.
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

function seasonMark(type, ev) {
  const big = type === "win";
  const size = big ? 28 : 22;
  const label = ev ? `${ev.event}: ${ev.result}` : "";
  const shape = {
    win: `<circle class="m-gold" cx="14" cy="14" r="9"/><circle class="m-ring" cx="14" cy="14" r="12.5"/>`,
    cap: `<circle class="m-gold" cx="14" cy="14" r="9"/>`,
    po: `<circle class="m-out" cx="14" cy="14" r="9"/><circle class="m-dot" cx="14" cy="14" r="3.5"/>`,
    played: `<circle class="m-grey" cx="14" cy="14" r="9"/>`,
  }[type];
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28" ${ev ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`}>${ev ? `<title>${esc(label)}</title>` : ""}${shape}</svg>`;
}

const SEASON_LEGEND = [["win", "Won the event"], ["cap", "Alliance captain"], ["po", "Picked or in the playoffs"], ["played", "Played the event"]];

// Draws the log into `el`. { compact: true } leaves out the robot names and the legend (for a small spot). The log is keyed as
// the ROBOTS list unless the page already has another element for it ({ list: false }).
function seasonLog(el, { compact = false, list = true } = {}) {
  const years = ROBOTS.map((r) => Number(r.year)).filter(Number.isFinite);
  if (!years.length) { el.innerHTML = `<p class="empty-note">No seasons yet.</p>`; return; }
  const lo = Math.min(...years), hi = Math.max(...years);
  let cols = "";
  for (let y = lo; y <= hi; y++) {
    const i = ROBOTS.findIndex((r) => Number(r.year) === y);
    if (i < 0) {
      cols += `<div class="sl-col" data-ck-ignore><div class="sl-marks"><span class="sl-dash" aria-hidden="true">–</span></div><span class="sl-year">${y}<span class="vh"> (no season)</span></span>${compact ? "" : `<span class="sl-name"></span>`}</div>`;
      continue;
    }
    const r = ROBOTS[i], results = r.results || [], P = `ROBOTS[${i}]`;
    const wins = results.filter((x) => resultType(x.result) === "win");
    const label = `${r.year}${r.name ? `, ${r.name}` : ""}: ${plural(results.length, "event")}${wins.map((w) => `, won the ${w.event}`).join("")}`;
    cols += `<a class="sl-col" href="${robotUrl(r)}" aria-label="${esc(label)}"${ck(P)}>
      <span class="sl-marks"${ck(`${P}.results`)}>${results.map((x, j) => `<span class="sl-mark"${ck(`${P}.results[${j}]`)}>${seasonMark(resultType(x.result), x)}</span>`).join("")}</span>
      <span class="sl-year"${ck(`${P}.year`)}>${esc(r.year)}</span>${compact ? "" : `<span class="sl-name"${r.name ? ` title="${esc(r.name)}"` : ""}${ck(`${P}.name`)}>${esc(r.name)}</span>`}</a>`;
  }
  const n = hi - lo + 1;
  el.innerHTML = `<div class="sl-wrap" role="region" aria-label="Season log, scrolls sideways" tabindex="0"${list ? ck("ROBOTS") : ""}><div class="sl-grid" style="--cols:${n}">${cols}</div></div>` +
    (compact ? "" : `<ul class="legend">${SEASON_LEGEND.map(([t, text]) => `<li>${seasonMark(t)} ${text}</li>`).join("")}</ul>`);
}

// One line above the log: counted from the same data.
function seasonSummary() {
  const s = seasonStats();
  return `<p class="sl-sum">${plural(s.seasons, "season")} · ${plural(s.wins, "event win")} · ${plural(s.playoffs, "playoff event")}</p>`;
}

// The three record numbers (they count up once when first seen; the page already holds the final numbers).
function seasonStatRow() {
  const s = seasonStats();
  return `<ul class="stats" aria-label="Competition record">${[[s.seasons, "season"], [s.wins, "event win"], [s.playoffs, "playoff event"]].map(([n, word]) =>
    `<li><b class="stat-n" data-ticker="${n}">${n}</b><span class="stat-l">${word}${n === 1 ? "" : "s"}</span></li>`).join("")}</ul>`;
}

// Home: "Competition record" with the hint (SITE.homeRecordHint), the three numbers and the log. The log starts scrolled to
// the newest year when it is wider than the screen (a phone).
function renderRecord(el) {
  if (!el) return;
  const hint = SITE.homeRecordHint ? `<p class="rec-hint"${ck("SITE.homeRecordHint")}>${esc(SITE.homeRecordHint)}</p>` : "";
  el.innerHTML = `<section class="band" aria-labelledby="rec-h"><div class="wrap"><div class="rec-head"><h2 class="h2" id="rec-h">Competition record</h2>${hint}</div>${seasonStatRow()}<div class="sl-host"></div></div></section>`;
  seasonLog(el.querySelector(".sl-host"));
  initTickers(el);
  scrollLogToNewest(el);
}

// Scrolls a season log to its right-hand end (the newest year). Does nothing when the whole log fits.
function scrollLogToNewest(root = document) {
  const w = root.querySelector(".sl-wrap");
  if (w && w.scrollWidth > w.clientWidth) w.scrollLeft = w.scrollWidth;
}

// Home: "The robots", the four newest seasons from ROBOTS (newest year first) as cards that open the robot's page, and a
// link to the Robots page. A season with no photo shows its year in the photo's place.
const HOME_ROBOTS = 4;
// The CSS width of a card's photo: four columns from 1024px (about 285px in the 1200px page), two below that, one under
// 350px. A phone takes the 400px copy (the 800px one on a 3x screen); a desktop the 400px or, on a 2x screen, the 800px.
const ROBOT_ROW_SIZES = "(min-width: 1024px) 300px, (min-width: 350px) 50vw, 100vw";
function robotsRow() {
  const newest = ROBOTS.map((r, i) => ({ r, i })).filter(({ r }) => Number.isFinite(Number(r.year)))
    .sort((a, b) => Number(b.r.year) - Number(a.r.year) || a.i - b.i).slice(0, HOME_ROBOTS);
  if (!newest.length) return "";
  const cards = newest.map(({ r, i }) => {
    const P = `ROBOTS[${i}]`;
    const photo = r.image
      ? `<div class="photo"><img${imgSized(r.image, [400, 800], ROBOT_ROW_SIZES)}${imgPos(r)}${ck(`${P}.image`)} alt="${esc(altFor(r.image, `${robotName(r)}, the ${r.year} robot`))}" loading="lazy" width="800" height="600"></div>`
      : `<div class="photo ph"${ck(`${P}.image`, "image")}><b data-ck-ignore>${esc(r.year)}</b></div>`;
    return `<li${ck(P)}><a class="card" href="${robotUrl(r)}">${photo}<div class="card-b">
      <p class="label"><span${ck(`${P}.year`)}>${esc(r.year)}</span> · <span${ck(`${P}.game`)}>${esc(r.game)}</span></p>
      <h3 class="h3"${ck(`${P}.name`)}>${esc(robotName(r))}</h3>
      ${r.tagline ? `<p${ck(`${P}.tagline`)}>${esc(r.tagline)}</p>` : ""}</div></a></li>`;
  }).join("");
  const heading = SITE.homeRobotsHeading || "The robots";
  return `<section class="band alt" aria-labelledby="rob-h"><div class="wrap">
    <h2 class="h2" id="rob-h"${ck("SITE.homeRobotsHeading")}>${esc(heading)}</h2>
    <ul class="rbt">${cards}</ul>
    <div class="rbt-more"><a class="btn btn-line" href="robots.html">See all robots</a></div></div></section>`;
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

// One row: Event · Rank · Record · Playoffs · The Blue Alliance link. `path` is the result's data-ck path (optional).
function resultRow(x, path) {
  const p = parseResult(x.result), win = resultType(x.result) === "win";
  const k = (field) => (path ? ck(`${path}.${field}`) : "");
  return `<tr${win ? ' class="win"' : ""}${path ? ck(path) : ""}>
    <td><span${k("event")}>${esc(x.event)}</span>${win ? ` <span class="pill">Winner</span>` : ""}</td>
    <td${k("result")}>${esc(p.rank)}</td><td${k("result")}>${esc(p.record)}</td><td${k("result")}>${esc(p.playoffs)}</td>
    <td>${x.tba ? `<a href="${esc(tbaEvent(x.tba))}" target="_blank" rel="noopener"${path ? ckHref(`${path}.tba`) : ""}>The Blue Alliance ↗</a>` : ""}</td></tr>`;
}

// The whole table, in a box that scrolls sideways on a phone. `base` is the robot's data-ck path ("ROBOTS[2]").
function resultsTable(r, base) {
  const rows = (r.results || []).map((x, i) => resultRow(x, base ? `${base}.results[${i}]` : ""));
  return `<div class="tbl-wrap" role="region" aria-label="Results, scrolls sideways" tabindex="0"${base ? ck(`${base}.results`) : ""}><table><thead><tr><th scope="col">Event</th><th scope="col">Rank</th><th scope="col">Record</th><th scope="col">Playoffs</th><th scope="col"><span class="vh">Link</span></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
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
  return document.cookie.split("; ").includes(`${SIGNED_IN_HINT}=1`) ? "Portal" : "Team Login";
}

function pageHref(page) {
  return isPortalPage() ? hostUrl("", `/${page}`) : page;
}

// Dawson's Mustang "D" (brand/dawson-mustang.png), to the left of the team logo in the header, linked to
// SITE.schoolUrl when set. A separate link from the team brand (links cannot nest); hidden if the file fails to load.
function renderSchoolBadge() {
  const img = `<img${imgAttrs("brand/dawson-mustang.png", 80)} data-ck-ignore alt="Dawson School" class="school-badge-img" width="128" height="104" />`;
  const href = isSet(SITE.schoolUrl) ? safeUrl(SITE.schoolUrl) : "";
  return href
    ? `<a class="school-badge" href="${esc(href)}" target="_blank" rel="noopener"${ckHref("SITE.schoolUrl")}>${img}</a>`
    : `<span class="school-badge">${img}</span>`;
}

function renderHeader() {
  // The protected portal mounts the static shell bar after /me.json and /apps.json load.
  if (isPortalPage()) return "";
  const active = currentPage();
  const links = NAV_LINKS.map((l) => `<a href="${l.href}" class="nav-link"${l.href === active ? ' aria-current="page"' : ""}>${l.label}</a>`).join("");
  return `
  <header class="site-header" id="hdr">
    <div class="wrap hd">
      ${renderSchoolBadge()}
      <span class="brand-sep" aria-hidden="true"></span>
      <a href="${pageHref("index.html")}" class="brand">
        <img${imgAttrs(SITE.logo, 200)}${ck("SITE.logo")} alt="${esc(altFor(SITE.logo, SITE.teamName + " logo"))}" class="brand-logo" width="36" height="36" />
        <span class="brand-text"><strong${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</strong><span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span></span>
      </a>
      <button type="button" class="nav-toggle" id="menuBtn" aria-expanded="false" aria-controls="site-nav">Menu</button>
      <nav class="site-nav" id="site-nav" aria-label="Main">
        ${links}
        <a href="${PORTAL_URL}" class="btn btn-gold nav-login">${loginLabel()}</a>
      </nav>
    </div>
  </header>`;
}

// The team e-mail address (a mailto link) with a Copy button. The click is handled once for the page (mountLayout).
function emailAddress() {
  return `<span class="addr"><a class="addr-t" href="mailto:${esc(SITE.email)}"${ck("SITE.email")}>${esc(SITE.email)}</a><button type="button" class="btn btn-line btn-sm" data-copy aria-live="polite">Copy</button></span>`;
}

function copyAddress(button) {
  const text = button.parentNode.querySelector(".addr-t");
  const reset = (label) => { button.textContent = label; setTimeout(() => { button.textContent = "Copy"; }, 2000); };
  const select = () => {                                // no clipboard access: select the address so Ctrl/Cmd+C works
    try { const r = document.createRange(); r.selectNodeContents(text); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ }
    reset("Selected");
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text.textContent).then(() => reset("Copied"), select);
    else select();
  } catch (e) { select(); }
}

// Home's footer (the approved home page, 2026-11-14): the same facts and links in less space, with the page links in two
// columns. Every other page keeps renderFooter's three columns until they are redesigned too.
function isHomePage() {
  return document.body.hasAttribute("data-home");
}
function renderCompactFooter() {
  const page = (href, label) => `<li><a href="${href}">${label}</a></li>`;
  const instagram = isSet(SITE.instagram) ? `<p><a href="${esc(safeUrl(SITE.instagram))}" target="_blank" rel="noopener"${ckHref("SITE.instagram")}><span>Instagram <span${ck("SITE.instagramHandle")}>${esc(SITE.instagramHandle)}</span> ↗</span></a></p>` : "";
  return `
  <footer class="site-footer ft-compact">
    <div class="wrap ft">
      <div class="ft-l"><div>
        <p class="ft-name"${ck("SITE.teamName")}>${esc(SITE.teamName)}</p>
        <p class="ft-sm">FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span> · <span${ck("SITE.school")}>${esc(SITE.school)}</span></p>
        <p class="ft-sm"><span${ck("SITE.location")}>${esc(SITE.location)}</span> · Since <span${ck("SITE.founded")}>${esc(SITE.founded)}</span></p>
      </div>${schoolMark("ft-school")}</div>
      <div class="ft-contact"><p class="label">Contact</p><p>${emailAddress()}</p>${instagram}</div>
      <nav aria-label="Footer"><p class="label">Pages</p><ul class="ft-links">
        ${page("robots.html", "Robots")}${page("about.html", "About")}${page("sponsors.html", "Sponsors")}${page("member.html", "Join")}${page("mentor.html", "Mentor")}
        ${page("outreach.html", "Outreach")}${page("media.html", "Media")}${page("resources.html", "Resources")}${page("contact.html", "Contact")}
        <li><a href="${PORTAL_URL}">${loginLabel()}</a></li><li><a href="${REQUEST_URL}">Request an account</a></li>
      </ul></nav>
    </div>
    <div class="wrap ft-bottom"><p>© ${new Date().getFullYear()} <span${ck("SITE.teamName")}>${esc(SITE.teamName)}</span>, FRC Team <span${ck("SITE.teamNumber")}>${esc(SITE.teamNumber)}</span></p><p><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p></div>
  </footer>`;
}

function renderFooter() {
  if (isHomePage()) return renderCompactFooter();
  const portal = isPortalPage();
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
          ${portal ? `<li><a href="/install">Install the app</a></li>` : `<li><a href="${PORTAL_URL}">${loginLabel()}</a></li>
          <li><a href="${REQUEST_URL}">Request an account</a></li>`}
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

// ---------- Motion ----------
// The public site has no ambient effects. The few motions it keeps (number ticker, next-event border beam, About
// timeline fill) are ported from Magic UI and Aceternity UI (docs/PUBLIC_REDESIGN_PROPOSAL.md §5a) and are
// static when the visitor has asked their system for reduced motion.
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Number Ticker, ported from Magic UI (registry/magicui/number-ticker.tsx): a spring (damping 60, stiffness 100, mass 1)
// from 0 to the number, once, when the number first comes into view, written with en-US separators. The page already
// holds the final number, so reduced motion, a missing IntersectionObserver and a script error all show the right value.
function tickerRun(el, to) {
  const fmt = new Intl.NumberFormat("en-US");
  let x = 0, v = 0, last = null;
  el.textContent = fmt.format(0);
  const frame = (t) => {
    const dt = last == null ? 0 : Math.min((t - last) / 1000, 0.05), steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    last = t;
    for (let i = 0; i < steps; i++) { v += (-100 * (x - to) - 60 * v) * h; x += v * h; }
    if (Math.abs(v) < 0.01 && Math.abs(x - to) < 0.01) { el.textContent = fmt.format(to); return; }
    el.textContent = fmt.format(Number(x.toFixed(0)));
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setTimeout(() => { el.textContent = fmt.format(to); }, 6000);
}
function initTickers(root = document) {
  if (REDUCED_MOTION || !("IntersectionObserver" in window)) return;
  root.querySelectorAll("[data-ticker]:not([data-ticked])").forEach((el) => {
    const to = Number(el.getAttribute("data-ticker"));
    if (!Number.isFinite(to)) return;
    el.setAttribute("data-ticked", "1");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      tickerRun(el, to);
    });
    io.observe(el);
  });
}

// Timeline fill, ported from Aceternity UI (components/ui/timeline.tsx): a line that fills as the page scrolls, from the
// moment the top of the list is at 10% of the viewport until its bottom is at 50% (offset ["start 10%", "end 50%"]); the
// fill's opacity ramps over the first 10%. Static (no fill at all) when the visitor has asked for reduced motion.
let timelineBusy = false;
function timelineUpdate() {
  timelineBusy = false;
  const t = document.querySelector(".tl"), f = t && t.querySelector(".tl-fill");
  if (!f || REDUCED_MOTION) return;
  const r = t.getBoundingClientRect(), vh = window.innerHeight || document.documentElement.clientHeight;
  const span = r.height - 0.4 * vh;
  const p = Math.max(0, Math.min(1, span > 0 ? (0.1 * vh - r.top) / span : (r.top <= 0.1 * vh ? 1 : 0)));
  f.style.height = `${(p * r.height).toFixed(1)}px`;
  f.style.opacity = Math.min(1, p / 0.1).toFixed(3);
}
function timelineSchedule() {
  if (timelineBusy) return;
  timelineBusy = true;
  requestAnimationFrame(timelineUpdate);
}
let timelineWired = false;
function initTimeline() {
  if (!document.querySelector(".tl")) return;
  if (!timelineWired) {
    timelineWired = true;
    addEventListener("scroll", timelineSchedule, { passive: true });
    addEventListener("resize", timelineSchedule, { passive: true });
  }
  timelineUpdate();
}

// ---------- Theme ----------
// Public pages are dark only: <html data-site="public"> and <meta name="color-scheme" content="dark"> in each page's
// HTML, no script. They never read or write the shared `theme` cookie or the old localStorage key, so a light choice
// made in the portal (the shell kit owns that) neither changes these pages nor is changed by them.

let layoutStarted = false;

// Builds the header and footer. Safe to run again (the editor re-renders after a draft change).
function mountLayout() {
  if (!isPortalPage()) document.getElementById("site-header").innerHTML = renderHeader();
  document.getElementById("site-footer").innerHTML = renderFooter();

  const header = document.querySelector(".site-header");
  const badgeImg = header && header.querySelector(".school-badge-img");
  if (badgeImg) {
    const hideBadge = () => header.querySelectorAll(".school-badge, .brand-sep").forEach((el) => el.remove());
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
    // A sponsor logo that does not load: the CSS hides the picture and shows the sponsor's name in type (li.logo-failed).
    document.addEventListener("error", (e) => {
      const img = e.target;
      if (!img || img.tagName !== "IMG" || !img.hasAttribute("data-sponsor-logo")) return;
      const li = img.closest("li");
      if (li) li.classList.add("logo-failed");
    }, true);
    document.addEventListener("click", (e) => {
      const copy = e.target.closest && e.target.closest("[data-copy]");
      if (copy) { copyAddress(copy); return; }
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
