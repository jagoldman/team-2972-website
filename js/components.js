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

function renderHeader() {
  const active = currentPage();
  const links = NAV_LINKS.map(
    (l) =>
      `<a href="${l.href}" class="nav-link${l.href === active ? " active" : ""}">${l.label}</a>`
  ).join("");

  return `
  <header class="site-header">
    <div class="header-inner">
      <a href="index.html" class="brand">
        <img src="${SITE.logo}" alt="${SITE.teamName} logo" class="brand-logo" />
        <span class="brand-text">
          <strong>${SITE.teamNumber}</strong> ${SITE.teamName}
        </span>
      </a>
      <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="site-nav">
        ${links}
        <a href="team-login.html" class="nav-login${active === "team-login.html" ? " active" : ""}">Team Login</a>
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
        <a href="contact.html">Contact us</a>
        <a href="mailto:${SITE.email}">${SITE.email}</a>
        <a href="${SITE.instagram}" target="_blank" rel="noopener">Instagram ${SITE.instagramHandle}</a>
      </div>
      <div class="footer-col">
        <a href="sponsors.html">Become a Sponsor</a>
        <a href="team.html">Become a Mentor</a>
        <a href="team-login.html">Team Login</a>
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
