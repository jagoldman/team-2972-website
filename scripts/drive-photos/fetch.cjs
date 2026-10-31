// Downloads the site's Google Drive photos so the site can serve them itself (Docker build, see Dockerfile).
//
//   node scripts/drive-photos/fetch.cjs [content.js] [out dir]     defaults: js/content.js  img/drive
//   (run `npm ci` in scripts/drive-photos first; it needs sharp)
//
// 1. Reads every Drive image in the content: each string value in contentSections that imgUrl() in
//    js/components.js treats as a Drive photo (a bare ID of 20+ word characters, or an
//    https://lh3.googleusercontent.com/d/<ID> URL). Keep DRIVE_ID / DRIVE_URL in step with imgUrl().
// 2. Downloads each one once from lh3 at the largest width, then writes <out>/<id>-<w>.webp for every width
//    in WIDTHS (never enlarged; EXIF rotation applied, then all metadata dropped).
// 3. Writes <out>/manifest.json: { "<id>": [400, 800, 1200, 1600], ... } for the photos that worked.
//    Caddy pastes it into /config.js, and imgUrl() uses a local file only when the manifest lists it.
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

const DRIVE_ID = /^[\w-]{20,}$/;
const DRIVE_URL = /^https:\/\/lh3\.googleusercontent\.com\/d\/([\w-]+)/;

// The Drive ID in a content value, or "" (the same rule as imgUrl()).
function driveId(value) {
  const s = String(value || "").trim();
  return DRIVE_ID.test(s) ? s : (s.match(DRIVE_URL) || [])[1] || "";
}

// Every Drive ID in the content sections of a content.js source, sorted, no repeats.
function extractDriveIds(source) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(`${source}\n;globalThis.__sections = contentSections;`, ctx, { timeout: 2000 });
  const ids = new Set();
  const walk = (v) => {
    if (typeof v === "string") { const id = driveId(v); if (id) ids.add(id); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(ctx.__sections);
  return [...ids].sort();
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

// Writes every width of one photo; returns the widths written. Throws if the photo cannot be used.
async function convert(sharp, id, buf, outDir) {
  const done = [];
  for (const w of WIDTHS) {
    const file = path.join(outDir, `${id}-${w}.webp`);
    await sharp(buf, { failOn: "error" }).rotate().resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 5 }).toFile(`${file}.tmp`);
    fs.renameSync(`${file}.tmp`, file);
    done.push(w);
  }
  return done;
}

async function run(contentFile, outDir, log = console) {
  const sharp = require("sharp");
  sharp.cache(false);
  const ids = extractDriveIds(fs.readFileSync(contentFile, "utf8"));
  fs.mkdirSync(outDir, { recursive: true });
  const manifest = {};
  let next = 0, bytes = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        manifest[id] = await convert(sharp, id, await download(id), outDir);
        bytes += manifest[id].reduce((n, w) => n + fs.statSync(path.join(outDir, `${id}-${w}.webp`)).size, 0);
      } catch (e) {
        delete manifest[id];
        for (const w of WIDTHS) fs.rmSync(path.join(outDir, `${id}-${w}.webp`), { force: true });
        log.warn(`warning: Drive photo ${id} left out, the site will load it from lh3: ${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((id) => [id, manifest[id]]));
  // Only [\w-] IDs and numbers, so the JSON holds no ' or \ and can sit inside a JS string in config.js.
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(sorted));
  log.log(`drive photos: ${Object.keys(sorted).length} of ${ids.length} saved (${Math.round(bytes / 1024)} KB) in ${outDir}`);
  return sorted;
}

module.exports = { WIDTHS, driveId, extractDriveIds, run };

if (require.main === module) {
  const root = path.join(__dirname, "..", "..");
  const [contentFile = path.join(root, "js", "content.js"), outDir = path.join(root, "img", "drive")] = process.argv.slice(2);
  run(contentFile, outDir).catch((e) => { console.error(e); process.exit(1); });
}
