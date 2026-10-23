// Draws the team's app icons and renders the PNG sizes.   Usage: node pwa-icons/build-icons.cjs
// Needs Google Chrome (set CHROME to its path if it is not the macOS default). For each app (site, portal, tasks,
// admin, kickoff) it writes a folder <app>/ in this directory with:
//   icon.svg               the source: a rounded square, for "any" use (favicon, install icon)
//   icon-192.png, icon-512.png   the same, as PNG
//   maskable-512.png       full-bleed square with the glyph inside the safe zone (Android masks it)
//   apple-touch-icon.png   180 x 180, full-bleed and opaque (iOS rounds it itself)
// Change a colour or a glyph here and run it again. See README.md in this folder.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = __dirname;

// The team's navy and gold (the same hues as the website's dark theme)
const NAVY_TOP = "#1a2c52";
const NAVY_BOTTOM = "#070b16";
const GOLD = "#e8b931";

// Each glyph is drawn inside a 512 x 512 box, centred, no wider than about 300 units, so it stays inside the
// maskable safe zone (the inner 80% circle, 410 units across) on every app.
const SIZE = 512;
const C = SIZE / 2;

function gear() {
  const teeth = 8, outer = 152, root = 112, hole = 44;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    const w = (Math.PI * 2) / teeth;                       // angular room for one tooth
    for (const [da, r] of [[-0.5 * w * 0.78, root], [-0.5 * w * 0.40, outer], [0.5 * w * 0.40, outer], [0.5 * w * 0.78, root]]) {
      pts.push([C + Math.cos(a + da) * r, C + Math.sin(a + da) * r]);
    }
  }
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + "Z";
  const holePath = `M${C + hole} ${C}a${hole} ${hole} 0 1 0 ${-2 * hole} 0a${hole} ${hole} 0 1 0 ${2 * hole} 0Z`;
  return `<path d="${d} ${holePath}" fill="${GOLD}" fill-rule="evenodd" stroke="${GOLD}" stroke-width="12" stroke-linejoin="round"/>`;
}
const GLYPHS = {
  site: gear,                                              // the team: Gears & Buccaneers
  portal: () => `<path d="M256 104 L124 224 H158 V394 H354 V224 H388 Z M222 394 V294 H290 V394 Z" fill="${GOLD}" fill-rule="evenodd" stroke="${GOLD}" stroke-width="14" stroke-linejoin="round"/>`,
  tasks: () => `<circle cx="256" cy="256" r="146" fill="none" stroke="${GOLD}" stroke-width="26"/>
    <path d="M178 262 L236 320 L338 200" fill="none" stroke="${GOLD}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>`,
  admin: () => `<path d="M256 100 C300 128 346 136 384 138 V252 C384 332 328 384 256 414 C184 384 128 332 128 252 V138 C166 136 212 128 256 100 Z" fill="${GOLD}" stroke="${GOLD}" stroke-width="14" stroke-linejoin="round"/>
    <path d="M194 256 L240 302 L322 212" fill="none" stroke="${NAVY_BOTTOM}" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>`,
  kickoff: () => `<circle cx="256" cy="256" r="150" fill="none" stroke="${GOLD}" stroke-width="24"/>
    <circle cx="256" cy="256" r="94" fill="none" stroke="${GOLD}" stroke-width="24"/>
    <circle cx="256" cy="256" r="38" fill="${GOLD}"/>`,
};

// full: a full-bleed square with no rounded corners (maskable and Apple touch icons); otherwise a rounded square
function svg(app, full) {
  const bg = full
    ? `<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/><rect width="${SIZE}" height="${SIZE}" fill="url(#glow)"/>`
    : `<rect width="${SIZE}" height="${SIZE}" rx="112" fill="url(#bg)"/><rect width="${SIZE}" height="${SIZE}" rx="112" fill="url(#glow)"/>
  <rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" rx="109" fill="none" stroke="${GOLD}" stroke-opacity="0.28" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="${app} icon">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${NAVY_TOP}"/><stop offset="1" stop-color="${NAVY_BOTTOM}"/></linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.12" r="0.7"><stop offset="0" stop-color="${GOLD}" stop-opacity="0.16"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
  </defs>
  ${bg}
  <g>${GLYPHS[app]()}</g>
</svg>
`;
}

function render(svgText, px, outFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "icon-"));
  const page = path.join(dir, "i.html");
  fs.writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svgText).toString("base64")}" width="${px}" height="${px}" style="display:block"></body></html>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--user-data-dir=${dir}/profile`, "--hide-scrollbars",
    "--default-background-color=00000000", `--window-size=${px},${px}`, `--screenshot=${outFile}`, `file://${page}`], { stdio: "ignore" });
  fs.rmSync(dir, { recursive: true, force: true });
}

for (const app of Object.keys(GLYPHS)) {
  const dir = path.join(OUT, app);
  fs.mkdirSync(dir, { recursive: true });
  const any = svg(app, false), full = svg(app, true);
  fs.writeFileSync(path.join(dir, "icon.svg"), any);
  render(any, 192, path.join(dir, "icon-192.png"));
  render(any, 512, path.join(dir, "icon-512.png"));
  render(full, 512, path.join(dir, "maskable-512.png"));
  render(full, 180, path.join(dir, "apple-touch-icon.png"));
  console.log("drew", app);
}
