// Install the app (MASTER_PLAN D63): the banner on the portal home, and the helpers the /install page uses.
// Loaded by portal/index.html and portal/install.html only, after config.js, components.js and
// js/vendor/qrcode.js. Nothing here runs on a public page.

const INSTALL_LATER_KEY = "install-banner-later";   // time of the last "Not now"
const INSTALL_NEVER_KEY = "install-banner-never";   // "Don't show again"
const INSTALL_LATER_MS = 30 * 24 * 60 * 60 * 1000;  // "Not now" is remembered for 30 days

// ---------- What kind of device is this ----------

// Already running as an installed app? (iOS reports it on navigator.standalone.)
function isInstalledApp() {
  try { if (window.matchMedia("(display-mode: standalone)").matches) return true; } catch (e) { /* no matchMedia */ }
  return navigator.standalone === true;
}

// iPhone, iPad and iPod. iPadOS 13+ says it is a Mac, so look for a Mac that has a touch screen.
function isAppleMobile(nav = navigator) {
  if (/iPhone|iPad|iPod/.test(nav.userAgent || "")) return true;
  return nav.platform === "MacIntel" && nav.maxTouchPoints > 1;
}

// ---------- Remembering "Not now" and "Don't show again" ----------
// localStorage can be blocked or throw; then the banner simply shows again next visit.

function bannerSuppressed(storage, now) {
  try {
    if (storage.getItem(INSTALL_NEVER_KEY) === "1") return true;
    const since = now - Number(storage.getItem(INSTALL_LATER_KEY));
    return since >= 0 && since < INSTALL_LATER_MS;
  } catch (e) { return false; }
}
function snoozeBanner(storage, now) { try { storage.setItem(INSTALL_LATER_KEY, String(now)); } catch (e) { /* ignore */ } }
function muteBanner(storage) { try { storage.setItem(INSTALL_NEVER_KEY, "1"); } catch (e) { /* ignore */ } }

// ---------- Chrome, Edge and Android: the browser's own install prompt ----------
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();                 // we show our own button instead of the browser's mini bar
  deferredInstall = e;
  document.dispatchEvent(new CustomEvent("install-available"));
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  document.dispatchEvent(new CustomEvent("install-done"));
});
async function runInstallPrompt() {
  const ev = deferredInstall;
  if (!ev) return;
  deferredInstall = null;
  try { await ev.prompt(); } catch (e) { /* the browser refused; nothing to do */ }
}

// ---------- Share ----------

// The system share sheet if the browser has one, else copy the link. Returns "shared", "cancelled", "copied" or "failed".
async function shareApp(data, nav = navigator) {
  if (typeof nav.share === "function") {
    try { await nav.share(data); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; /* any other error: copy instead */ }
  }
  try { await nav.clipboard.writeText(data.url); return "copied"; } catch (e) { return "failed"; }
}

// ---------- QR code, drawn in the browser (no network) ----------

// Black squares on white with the 4-module quiet zone the QR standard asks for. Colours come from CSS (--qr-fg, --qr-bg).
function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const size = n + quiet * 2;
  const svg = document.createElementNS(SVG_NS_INSTALL, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `QR code for ${text}`);
  const bg = document.createElementNS(SVG_NS_INSTALL, "rect");
  bg.setAttribute("width", size);
  bg.setAttribute("height", size);
  bg.setAttribute("class", "qr-bg");
  const path = document.createElementNS(SVG_NS_INSTALL, "path");
  path.setAttribute("d", d);
  path.setAttribute("class", "qr-fg");
  svg.append(bg, path);
  return svg;
}
const SVG_NS_INSTALL = "http://www.w3.org/2000/svg";

// ---------- Small DOM helpers (fixed strings only, never user data) ----------

function installEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
// Line icons for the iPhone steps
const INSTALL_ICONS = {
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 00-1 1v8a1 1 0 001 1h14a1 1 0 001-1v-8a1 1 0 00-1-1h-1"/>',
  plus: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
};
function installIcon(name) {
  const svg = document.createElementNS(SVG_NS_INSTALL, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "inline-ico");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = INSTALL_ICONS[name];
  return svg;
}

// ---------- The banner ----------

let installBanner = null;

function closeInstallBanner(returnFocus) {
  if (!installBanner) return;
  installBanner.remove();
  installBanner = null;
  if (returnFocus) {
    const main = document.querySelector("main");
    if (main) { main.setAttribute("tabindex", "-1"); main.focus({ preventScroll: true }); }
  }
}

function fillInstallBanner() {
  const body = installBanner.querySelector(".install-body");
  body.replaceChildren();
  if (deferredInstall) {
    const go = installEl("button", "btn", "Install");
    go.type = "button";
    go.addEventListener("click", async () => { await runInstallPrompt(); closeInstallBanner(true); });
    body.append(installEl("p", "", "Open the portal like an app, straight from your device."), go);
  } else if (isAppleMobile()) {
    const steps = installEl("ol", "install-steps");
    const one = installEl("li", "", "Tap ");
    one.append(installIcon("share"), installEl("strong", "", " Share"), " in the browser bar.");
    const two = installEl("li", "", "Choose ");
    two.append(installIcon("plus"), installEl("strong", "", " Add to Home Screen"), ".");
    steps.append(one, two);
    body.append(steps, installEl("p", "install-note", "Notifications, if the team turns them on, will need the app on your Home Screen."));
  } else {
    const how = installEl("a", "btn btn-outline", "How to install");
    how.href = "/install";
    body.append(installEl("p", "", "Add it to your device for one-tap access."), how);
  }
}

// opts.force shows the banner even if it was dismissed or the app is installed (used by the tests)
function showInstallBanner(opts = {}) {
  if (installBanner) { fillInstallBanner(); return; }
  if (!opts.force && (isInstalledApp() || bannerSuppressed(localStorageOrNull(), Date.now()))) return;

  installBanner = installEl("section", "install-banner");
  installBanner.setAttribute("role", "region");
  installBanner.setAttribute("aria-labelledby", "install-title");
  const title = installEl("h2", "", "Add the Team 2972 app to your home screen");
  title.id = "install-title";
  const body = installEl("div", "install-body");
  const actions = installEl("div", "install-actions");
  const later = installEl("button", "install-link", "Not now");
  later.type = "button";
  later.addEventListener("click", () => { snoozeBanner(localStorageOrNull(), Date.now()); closeInstallBanner(true); });
  const never = installEl("button", "install-link", "Don't show again");
  never.type = "button";
  never.addEventListener("click", () => { muteBanner(localStorageOrNull()); closeInstallBanner(true); });
  actions.append(later, never);
  installBanner.append(title, body, actions);
  fillInstallBanner();
  document.body.append(installBanner);
}

// A blocked localStorage can throw on access itself; give back something whose calls all fail quietly.
function localStorageOrNull() {
  try { return window.localStorage; } catch (e) { return { getItem() { throw e; }, setItem() { throw e; } }; }
}

// Called by the portal home. The browser's install event usually arrives within a second; wait a moment for it,
// so a Chrome user sees the Install button at once and not a "How to install" link that then changes.
function initInstallBanner() {
  if (isInstalledApp()) return;
  document.addEventListener("install-available", () => showInstallBanner());
  document.addEventListener("install-done", () => closeInstallBanner(false));
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && installBanner && installBanner.contains(document.activeElement)) {
      snoozeBanner(localStorageOrNull(), Date.now());
      closeInstallBanner(true);
    }
  });
  if (deferredInstall) showInstallBanner();
  else setTimeout(() => showInstallBanner(), 1200);
}
