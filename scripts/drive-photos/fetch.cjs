// Downloads the site's Google Drive photos so the site can serve them itself (Docker build, see Dockerfile).
//
//   node scripts/drive-photos/fetch.cjs [content.js] [out dir]     defaults: js/content.js  img/drive
//   (run `npm ci` in scripts/drive-photos first; it needs sharp)
//
// 1. Reads every Drive image in the content: each string value in contentSections that driveIdOf() (the "photo-rules"
//    block of js/components.js, which imgUrl() uses too) reduces to a Drive ID, in any form it knows.
// 2. Downloads each one once from lh3 at the largest width, then writes <out>/<id>-<w>.webp for every width
//    in WIDTHS (never enlarged; EXIF rotation applied, then all metadata dropped).
//    A photo in the blur table (window.PHOTO_BLUR in config.js, the one list the pages read too; D193, a face blurred
//    at the owner's request) has its regions blurred first, on the full downloaded picture before any resize, so every
//    width and the link-preview picture carry the blur. Its files are named <id>-<v>-<w>.webp (v from the table), so
//    a copy cached under the old name is never asked for again. If it cannot be saved, the build log says so loudly:
//    the page then shows no photo there, never the original from Google.
// 3. Writes <out>/manifest.json: { "<id>": [400, 800, 1200, 1600], ... } for the photos that worked.
//    Caddy pastes it into /config.js, and imgUrl() uses a local file only when the manifest lists it.
// 3b. Writes <out>/drive-retired.caddy (the Dockerfile moves it to /etc/caddy, and the Caddyfile imports it before the
//    photo route): every retired name of a blurred photo (<id>-<w>.webp, any other mark) and of the link-preview picture
//    answers 404, even if a stale file with that name is on disk (D193).
// 4. Writes <out>/og-image-b2.jpg: SITE.heroImage cut to 1200x630 (the link-preview size), framed by SITE.heroPosition as
//    the page frames it. index.html names it in its og:image tag (Caddy renders that tag with the site's address).
//    No hero photo, or one that failed: no og-image-b2.jpg, and the page's tag falls back to the site's app icon.
//
// A photo that cannot be downloaded or read (not shared publicly, deleted, network down) is left out with a
// warning, and the page loads it from lh3 as before. Only a bug in this script fails the build.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const WIDTHS = [400, 800, 1200, 1600];          // imgUrl() is called with 400-1600 (2000 is a "full size" link; it stays on lh3)
const QUALITY = 78;
const TIMEOUT_MS = 20000;
const ATTEMPTS = 3;
const PARALLEL = 4;
const MAX_BYTES = 40 * 1024 * 1024;
const BASE_URL = process.env.DRIVE_BASE_URL || "https://lh3.googleusercontent.com/d/";   // tests point this at a local server

// The photo rules shared with the pages: the lines between the "photo-rules" markers in js/components.js (the site root,
// or /build in the Docker stage), run on their own. One copy of each rule for the build and the pages.
function photoRules(file = path.join(__dirname, "..", "..", "js", "components.js")) {
  const src = fs.readFileSync(file, "utf8");
  const a = src.indexOf("// ---- photo-rules: start ----"), b = src.indexOf("// ---- photo-rules: end ----");
  if (a < 0 || b < a) throw new Error(`no photo-rules block in ${file}`);
  const ctx = { URL };
  vm.createContext(ctx);
  vm.runInContext(`${src.slice(a, b)}\n;globalThis.__rules = { photoBlurList, isGoogleHosted, driveIdOf };`, ctx, { timeout: 2000 });
  return ctx.__rules;
}
// The blur table: window.PHOTO_BLUR in config.js (the site root, or /build in the Docker stage), as photoBlurList()
// accepts it; returns its photos map. A list that is missing or not valid fails the build (it never builds unblurred).
// BLUR_CONFIG overrides the file (tests).
function blurTable(configFile = process.env.BLUR_CONFIG || path.join(__dirname, "..", "..", "config.js")) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(configFile, "utf8"), ctx, { timeout: 2000 });
  const list = rules().photoBlurList(ctx.window.PHOTO_BLUR);
  if (!list) throw new Error(`PRIVACY (D193): no valid PHOTO_BLUR list (format 1) in ${configFile}`);
  return JSON.parse(JSON.stringify(list));
}
// The name of one saved width: <id>-<w>.webp, or <id>-<v>-<w>.webp for a blurred photo (the same rule as imgUrl()).
function fileName(id, w, blur = {}) {
  const b = Object.prototype.hasOwnProperty.call(blur, id) ? blur[id] : null;
  return b ? `${id}-${b.v}-${w}.webp` : `${id}-${w}.webp`;
}

// The box round one ellipse of a W x H picture: the ellipse in pixels (c: centre and radii), the padding round it, and
// the box (left, top, w, h), clipped to the picture.
function blurGeometry(W, H, [fx, fy, frx, fry]) {
  const c = { x: Math.round(fx * W), y: Math.round(fy * H), rx: Math.max(2, Math.round(frx * W)), ry: Math.max(2, Math.round(fry * H)) };
  const pad = Math.max(4, Math.round(c.rx * 0.8));
  const left = Math.max(0, c.x - c.rx - pad), top = Math.max(0, c.y - c.ry - pad);
  const w = Math.min(W, c.x + c.rx + pad) - left, h = Math.min(H, c.y + c.ry + pad) - top;
  if (w < 4 || h < 4) throw new Error("blur region outside the photo");
  return { c, pad, left, top, w, h };
}
// True when the centre of pixel (x, y) of the picture is inside the protected ellipse.
function insideEllipse(c, x, y) {
  return ((x + 0.5 - c.x) / c.rx) ** 2 + ((y + 0.5 - c.y) / c.ry) ** 2 <= 1;
}
// The mask laid over the box (one byte a pixel, 255 = the blur only). Every pixel whose centre is inside the ellipse,
// and a 1px margin round it, is exactly 255; the feather (a smooth fall to 0) lies wholly outside, along each ray from
// the centre, and is 0 before the edge of the box, so no part of the protected region keeps a trace of the original
// and no hard edge is drawn.
function blurMask(g) {
  const { c, pad, left, top, w, h } = g, MARGIN = 1, feather = Math.max(1, pad - MARGIN - 1);
  const m = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = left + x + 0.5 - c.x, dy = top + y + 0.5 - c.y, r = Math.sqrt((dx / c.rx) ** 2 + (dy / c.ry) ** 2);
    let a = 255;
    if (r > 1) {
      const e = Math.hypot(dx, dy) * (1 - 1 / r);   // how far outside the ellipse, along the ray from its centre
      if (e > MARGIN) { const t = Math.min(1, (e - MARGIN) / feather); a = Math.round(255 * (1 - t * t * (3 - 2 * t))); }
    }
    m[y * w + x] = a;
  }
  return m;
}
// Blurs each ellipse of a picture so it cannot be undone: the box round it is reduced to 5x5 blocks, each block the
// average of its pixels that are NOT under the solid part of the mask (so the protected region's own pixels never reach
// the output; a block with none takes the average of the whole ring), enlarged back, smeared with a wide Gaussian, and
// laid in through blurMask(). Inside the ellipse the result depends only on the pixels round it. Takes and returns an
// image buffer (the input already rotated); returns PNG (lossless, so the next steps start from it).
async function blurRegions(sharp, input, ellipses) {
  let img = await sharp(input).png().toBuffer();
  const { width: W, height: H } = await sharp(img).metadata();
  for (const e of ellipses) {
    const g = blurGeometry(W, H, e), { c, left, top, w, h } = g;
    const mask = blurMask(g);
    const region = await sharp(img).extract({ left, top, width: w, height: h }).removeAlpha().raw().toBuffer();
    const sums = Array.from({ length: 25 }, () => [0, 0, 0, 0]), ring = [0, 0, 0, 0];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (mask[y * w + x] === 255) continue;
      const b = sums[Math.min(4, Math.floor(y * 5 / h)) * 5 + Math.min(4, Math.floor(x * 5 / w))], i = (y * w + x) * 3;
      for (const acc of [b, ring]) { acc[0] += region[i]; acc[1] += region[i + 1]; acc[2] += region[i + 2]; acc[3]++; }
    }
    if (!ring[3]) throw new Error("blur region has no pixels round the ellipse");
    const tiny = Buffer.alloc(75);
    sums.forEach((b, k) => { const src = b[3] ? b : ring; for (let ch = 0; ch < 3; ch++) tiny[k * 3 + ch] = Math.round(src[ch] / src[3]); });
    const smear = await sharp(tiny, { raw: { width: 5, height: 5, channels: 3 } }).resize({ width: w, height: h, fit: "fill", kernel: "cubic" })
      .blur(Math.max(4, c.rx / 3)).removeAlpha().raw().toBuffer();
    const patch = Buffer.alloc(w * h * 4);
    for (let k = 0; k < w * h; k++) { patch[k * 4] = smear[k * 3]; patch[k * 4 + 1] = smear[k * 3 + 1]; patch[k * 4 + 2] = smear[k * 3 + 2]; patch[k * 4 + 3] = mask[k]; }
    img = await sharp(img).composite([{ input: patch, raw: { width: w, height: h, channels: 4 }, left, top }]).png().toBuffer();
  }
  return img;
}

let RULES = null;
const rules = () => RULES || (RULES = photoRules());

// The Drive ID in a content value, or "": driveIdOf() from js/components.js, the same function the pages use.
function driveId(value) {
  return rules().driveIdOf(value);
}

// The content sections of a content.js source.
function contentOf(source) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(`${source}\n;globalThis.__sections = contentSections;`, ctx, { timeout: 2000 });
  return ctx.__sections || {};
}

// Every Drive ID in the content sections of a content.js source, sorted, no repeats.
function extractDriveIds(source) {
  return driveIdsIn(contentOf(source));
}
function driveIdsIn(sections) {
  const ids = new Set();
  const walk = (v) => {
    if (typeof v === "string") { const id = driveId(v); if (id) ids.add(id); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(sections);
  return [...ids].sort();
}

// The link-preview picture: 1200x630, the size Facebook, LinkedIn and others ask for.
// Its name changes with the D193 blur ("og-image.jpg", then "og-image-b1.jpg" before the mask was made fully opaque), so a link-preview service that kept the old picture by
// its address fetches the blurred one.
const OG = { width: 1200, height: 630, file: "og-image-b2.jpg" };
// A CSS object-position ("50% 100%", "center top", "right") as fractions { x, y } from 0 to 1; the middle when unset or
// not understood. The same values safePosition() in js/components.js accepts.
function focusOf(position) {
  const words = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const part = (p) => (/^\d{1,3}(\.\d+)?%$/.test(p) ? Math.min(100, parseFloat(p)) / 100 : p in words ? words[p] : null);
  const parts = String(position || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 1 && (parts[0] === "top" || parts[0] === "bottom")) return { x: 0.5, y: words[parts[0]] };
  if (parts.length > 2) return { x: 0.5, y: 0.5 };
  const x = parts.length ? part(parts[0]) : 0.5, y = parts.length > 1 ? part(parts[1]) : 0.5;
  return x == null || y == null ? { x: 0.5, y: 0.5 } : { x, y };
}
// Cuts the saved hero photo (the largest width) to OG size, keeping the part `position` points at, as JPEG with no metadata.
async function writeOgImage(sharp, file, position, outDir) {
  const out = path.join(outDir, OG.file);
  const meta = await sharp(file).metadata();
  const scale = Math.max(OG.width / meta.width, OG.height / meta.height);
  const w = Math.max(OG.width, Math.round(meta.width * scale)), h = Math.max(OG.height, Math.round(meta.height * scale));
  const { x, y } = focusOf(position);
  await sharp(file).resize({ width: w, height: h, fit: "fill" })
    .extract({ left: Math.round((w - OG.width) * x), top: Math.round((h - OG.height) * y), width: OG.width, height: OG.height })
    .jpeg({ quality: 82, mozjpeg: true }).toFile(`${out}.tmp`);
  fs.renameSync(`${out}.tmp`, out);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(id) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${id}=w${WIDTHS[WIDTHS.length - 1]}`, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) throw new Error(`not an image (${type || "no content-type"})`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error(`too large (${buf.length} bytes)`);
      return buf;
    } catch (e) {
      last = e;
      if (/^HTTP 4/.test(e.message)) break;     // not shared or gone: retrying will not help
      if (attempt < ATTEMPTS) await sleep(1000 * attempt);
    }
  }
  throw last;
}

// Writes every width of one photo; returns the widths written. Throws if the photo cannot be used. A photo in the blur
// table is rotated and blurred once, on the full picture, and every width is made from that.
async function convert(sharp, id, buf, outDir, blur = {}) {
  const done = [];
  const b = Object.prototype.hasOwnProperty.call(blur, id) ? blur[id] : null;
  const source = b ? await blurRegions(sharp, await sharp(buf, { failOn: "error" }).rotate().png().toBuffer(), b.ellipses) : buf;
  for (const w of WIDTHS) {
    const file = path.join(outDir, fileName(id, w, blur));
    await sharp(source, { failOn: "error" }).rotate().resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 5 }).toFile(`${file}.tmp`);
    fs.renameSync(`${file}.tmp`, file);
    done.push(w);
  }
  return done;
}

async function run(contentFile, outDir, log = console, blur = blurTable()) {
  const sharp = require("sharp");
  sharp.cache(false);
  const sections = contentOf(fs.readFileSync(contentFile, "utf8"));
  const ids = driveIdsIn(sections);
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {};
  let next = 0, bytes = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        manifest[id] = await convert(sharp, id, await download(id), outDir, blur);
        bytes += manifest[id].reduce((n, w) => n + fs.statSync(path.join(outDir, fileName(id, w, blur))).size, 0);
        if (blur[id]) log.log(`drive photos: ${id} saved with ${blur[id].ellipses.length} region(s) blurred (D193), as ${fileName(id, "<w>", blur)}`);
      } catch (e) {
        delete manifest[id];
        for (const w of WIDTHS) { fs.rmSync(path.join(outDir, `${id}-${w}.webp`), { force: true }); fs.rmSync(path.join(outDir, fileName(id, w, blur)), { force: true }); }
        if (blur[id]) log.warn(`\n!!!!!!!! PRIVACY (D193): photo ${id} must be shown blurred and could not be saved: ${e.message}\n!!!!!!!! The site will show NO photo in its place (never the original from Google). Fix this and rebuild.\n`);
        else log.warn(`warning: Drive photo ${id} left out, the site will load it from lh3: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((id) => [id, manifest[id]]));
  // Only [\w-] IDs and numbers, so the JSON holds no ' or \ and can sit inside a JS string in config.js.
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(sorted));
  fs.writeFileSync(path.join(outDir, "drive-retired.caddy"), retiredRoutes(blur));
  log.log(`drive photos: ${Object.keys(sorted).length} of ${ids.length} saved (${Math.round(bytes / 1024)} KB) in ${outDir}`);
  // The link-preview picture, from the hero photo when it was saved.
  const site = sections.SITE || {};
  const hero = driveId(site.heroImage);
  fs.rmSync(path.join(outDir, OG.file), { force: true });
  if (hero && sorted[hero]) {
    try {
      await writeOgImage(sharp, path.join(outDir, fileName(hero, sorted[hero][sorted[hero].length - 1], blur)), site.heroPosition, outDir);
      log.log(`link-preview picture: ${OG.file} from the hero photo`);
    } catch (e) {
      fs.rmSync(path.join(outDir, `${OG.file}.tmp`), { force: true });
      log.warn(`warning: no link-preview picture, the page will name the app icon instead: ${e.message}`);
    }
  } else {
    log.warn("warning: the hero photo is not a saved Drive photo, so there is no link-preview picture (the page names the app icon)");
  }
  return sorted;
}

// The Caddy rule for retired names (step 3b): the current names of each blurred photo and the current link-preview
// picture are served; every other name of a blurred photo, and every other og-image*.jpg, answers 404.
function retiredRoutes(blur) {
  const ids = Object.keys(blur).filter((id) => /^[\w-]{20,}$/.test(id) && /^[a-z][0-9]{1,6}$/.test(blur[id].v)).sort();
  const names = [`/img/drive/${OG.file}`].concat(ids.flatMap((id) => WIDTHS.map((w) => `/img/drive/${fileName(id, w, blur)}`)));
  const photos = ids.length ? `|(?:${ids.join("|")})-(?:[a-z0-9]+-)?[0-9]+\\.webp` : "";
  return `# Written by scripts/drive-photos/fetch.cjs at image build time (D193). Retired names of blurred photos and of the
# link-preview picture answer 404, even if a stale file with that name is on disk. Imported first in (drive_photos).
@drive_retired {
	path_regexp drive_retired ^/img/drive/(?:og-image[^/]*\\.jpg${photos})$
	not path ${names.join(" ")}
}
handle @drive_retired {
	header Cache-Control "no-store"
	respond 404
}
`;
}

module.exports = { WIDTHS, OG, retiredRoutes, driveId, extractDriveIds, focusOf, photoRules, blurTable, blurGeometry, insideEllipse, blurMask, blurRegions, fileName, run };

if (require.main === module) {
  const root = path.join(__dirname, "..", "..");
  const [contentFile = path.join(root, "js", "content.js"), outDir = path.join(root, "img", "drive")] = process.argv.slice(2);
  run(contentFile, outDir).catch((e) => { console.error(e); process.exit(1); });
}
