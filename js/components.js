// Shared header/footer, injected on every page so nav only lives in one place.

const NAV_LINKS = [
  { label: "Home", href: "index.html" },
  { label: "About", href: "about.html" },
  { label: "Team", href: "team.html" },
  { label: "Robots", href: "robots.html" },
  { label: "Sponsors", href: "sponsors.html" },
  { label: "Outreach", href: "outreach.html" },
  { label: "Media", href: "media.html" },
  { label: "Resources", href: "resources.html" },
  { label: "Contact", href: "contact.html" },
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

// Photo URL at the width a spot needs. content.js may hold a bare Google Drive file ID or a full
// lh3.googleusercontent.com/d/ID URL (any =w size on it is replaced). Anything else, such as an
// SVG placeholder path, is returned unchanged.
//   driveImg("1AbC…", 400) -> "https://lh3.googleusercontent.com/d/1AbC…=w400"
function driveImg(src, width) {
  const s = String(src || "");
  const id = /^[\w-]{20,}$/.test(s) ? s : (s.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/) || [])[1];
  return id ? `https://lh3.googleusercontent.com/d/${id}=w${width}` : s;
}

// "https://www.youtube.com/watch?v=ID" or "https://youtu.be/ID" -> embed URL
function youtubeEmbed(url) {
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : url;
}

function robotName(r) {
  return r.name || "Robot name unknown";
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
  const domain = location.host.replace(/^(www|portal)\./, "") || "localhost";
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
  const active = isPortalPage() ? "" : currentPage();
  const links = NAV_LINKS.map(
    (l) =>
      `<a href="${pageHref(l.href)}" class="nav-link${l.href === active ? " active" : ""}">${l.label}</a>`
  ).join("");

  return `
  <header class="site-header">
    <div class="header-inner">
      <a href="${pageHref("index.html")}" class="brand">
        <img src="${driveImg(SITE.logo, 200)}" alt="${SITE.teamName} logo" class="brand-logo" width="42" height="42" />
        <span class="brand-text">
          <strong>${SITE.teamNumber}</strong> ${SITE.teamName}
        </span>
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="site-nav">
        ${links}
        ${isPortalPage()
          ? `<a href="${SIGNOUT_URL}" class="nav-login">Sign out</a>`
          : `<a href="${PORTAL_URL}" class="nav-login">Team Login</a>`}
      </nav>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <strong>Team ${SITE.teamNumber} — ${SITE.teamName}</strong>
        <p>${SITE.school} · ${SITE.location}</p>
      </div>
      <div class="footer-col">
        <a href="${pageHref("contact.html")}">Contact us</a>
        <a href="mailto:${SITE.email}">${SITE.email}</a>
        <a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram ${SITE.instagramHandle}</a>
      </div>
      <div class="footer-col">
        <a href="${pageHref("sponsors.html")}">Become a Sponsor</a>
        <a href="${pageHref("team.html")}">Become a Mentor</a>
        ${isPortalPage() ? "" : `<a href="${PORTAL_URL}">Team Login</a>
        <a href="${REQUEST_URL}">Request an account</a>`}
      </div>
    </div>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE.teamName}, FRC Team ${SITE.teamNumber}.</p>
  </footer>`;
}

function mountLayout() {
  document.getElementById("site-header").innerHTML = renderHeader();
  document.getElementById("site-footer").innerHTML = renderFooter();

  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

document.addEventListener("DOMContentLoaded", mountLayout);
