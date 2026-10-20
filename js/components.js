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
  const brand = `
      <a href="${pageHref("index.html")}" class="brand">
        <img src="${driveImg(SITE.logo, 200)}" alt="${SITE.teamName} logo" class="brand-logo" width="40" height="40" />
        <span class="brand-text"><strong>${SITE.teamNumber}</strong> ${isPortalPage() ? "Portal" : SITE.teamName}</span>
      </a>`;

  // The portal keeps its header short: the user's group, a way back to the public site, and sign-out.
  if (isPortalPage()) {
    return `
  <header class="site-header">
    <div class="header-inner">
      ${brand}
      <nav class="site-nav portal-nav">
        <span class="nav-chip" id="group-chip" hidden></span>
        <a href="${pageHref("index.html")}" class="nav-link">Public site</a>
        <a href="${SIGNOUT_URL}" class="nav-login">Sign out</a>
      </nav>
    </div>
  </header>`;
  }

  const active = currentPage();
  const links = NAV_LINKS.map(
    (l) => `<a href="${l.href}" class="nav-link${l.href === active ? " active" : ""}">${l.label}</a>`
  ).join("");
  return `
  <header class="site-header">
    <div class="header-inner">
      ${brand}
      <button class="nav-toggle" aria-label="Open menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="site-nav">
        ${links}
        <a href="${PORTAL_URL}" class="nav-login">Team Login</a>
      </nav>
    </div>
  </header>`;
}

function renderFooter() {
  return `
  <footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-col">
        <strong>${SITE.teamName}</strong>
        <p>FRC Team ${SITE.teamNumber} · ${SITE.school}<br />${SITE.location} · Since ${SITE.founded}</p>
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
    <div class="footer-giant" aria-hidden="true">${SITE.teamNumber}</div>
    <p class="footer-copy">© ${new Date().getFullYear()} ${SITE.teamName}, FRC Team ${SITE.teamNumber}.</p>
  </footer>`;
}

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

function mountLayout() {
  document.getElementById("site-header").innerHTML = renderHeader();
  document.getElementById("site-footer").innerHTML = renderFooter();

  const header = document.querySelector(".site-header");
  // Pages without a full-screen hero get a solid header from the start.
  if (!document.querySelector(".hero")) header.classList.add("solid");
  const onScroll = () => header.classList.toggle("scrolled", scrollY > 30);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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

  // Big page headings rise in word by word.
  const splitHeadings = () => document.querySelectorAll(".page-header h1, .robot-hero h1").forEach(splitWords);
  splitHeadings();
  setupCursor();
  // After every page script's DOMContentLoaded handler has filled in content.
  setTimeout(() => { splitHeadings(); initEffects(); }, 0);
}

document.addEventListener("DOMContentLoaded", mountLayout);
