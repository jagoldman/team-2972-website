// Drive photos served from this server (scripts/drive-photos/fetch.cjs, imgUrl() in js/components.js):
//   - which content values count as Drive photos (the same rule in both files)
//   - imgUrl() with and without a manifest: the local file, the next width up, the lh3 fallback
//   - a build run against a local fake of lh3 where some photos fail: the rest are saved, the run succeeds
//   - the Caddy, Dockerfile and service worker pieces
// Run: node test/drive-photos-test.cjs   (part 3 needs `npm ci` in scripts/drive-photos; it is skipped without it)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let passed = 0, failed = 0, skipped = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); } else { failed++; console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
}

const fetchPhotos = require(path.join(root, "scripts", "drive-photos", "fetch.cjs"));
const HERO = "1VgoMdevZH3syn0BvQq7QpFz09xrDS_rt";   // SITE.heroImage, a public photo already in content.js
const B = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";        // made-up IDs
const C = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa987654";

// ---------- 1. which values are Drive photos ----------
const ids = fetchPhotos.extractDriveIds(read("js/content.js"));
check("content.js: the hero photo is found", ids.includes(HERO));
check("content.js: every ID found matches the Drive ID shape", ids.length > 0 && ids.every((id) => /^[\w-]{20,}$/.test(id)), ids.join(" "));
check("content.js: no repeats, sorted", ids.join() === [...new Set(ids)].sort().join());
check("content.js: placeholders and site paths are not taken", !ids.some((id) => id.includes("/") || id.includes(".")));

const sample = `
// "${C}" in a comment is not content
const SITE = { heroImage: "${B}", logo: "brand/x.png", site: "https://example.com/aaaaaaaaaaaaaaaaaaaaaaaa" };
const ROBOTS = [{ image: "https://lh3.googleusercontent.com/d/${C}=w800", gallery: ["media:0123456789abcdef0123", " ${B} ", "short-id"] }];
const NOT_EDITABLE = "1QqQqQqQqQqQqQqQqQqQqQqQqQq";
const contentSections = { SITE, ROBOTS };`;
const sampleIds = fetchPhotos.extractDriveIds(sample);
check("sample: a bare ID and an lh3 URL are found, each once", sampleIds.join() === [B, C].sort().join(), sampleIds.join());

// ---------- 2. imgUrl() ----------
function loadComponents(drivePhotos) {
  const ctx = { console, location: { host: "localhost", protocol: "http:", search: "", pathname: "/" }, scrollY: 0 };
  ctx.window = ctx;
  ctx.SITE_ENV = { scheme: "http", domain: "localhost", drivePhotos };
  ctx.matchMedia = () => ({ matches: false });
  ctx.addEventListener = () => {};
  ctx.onContent = () => {};
  ctx.document = { addEventListener() {}, body: { hasAttribute: () => false }, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(ctx);
  vm.runInContext(`${read("js/components.js")};globalThis.imgUrl = imgUrl;`, ctx);
  return ctx;
}
const manifest = JSON.stringify({ [B]: [400, 800, 1200, 1600], [HERO]: [400, 800] });
const site = loadComponents(manifest);
const lh3 = (id, w) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const cases = [
  ["a saved width is served locally", B, 400, `/img/drive/${B}-400.webp`],
  ["a width between two saved ones gets the next one up", B, 600, `/img/drive/${B}-800.webp`],
  ["the hero at 1600", B, 1600, `/img/drive/${B}-1600.webp`],
  ["wider than anything saved falls back to lh3", B, 2000, lh3(B, 2000)],
  ["only the widths the manifest lists are used", HERO, 1200, lh3(HERO, 1200)],
  ["an lh3 URL in the content is served locally too", `https://lh3.googleusercontent.com/d/${B}=w9999`, 800, `/img/drive/${B}-800.webp`],
  ["a photo not in the manifest falls back to lh3", C, 800, lh3(C, 800)],
  ["an uploaded image still goes to /media", "media:0123456789abcdef0123", 600, "/media/0123456789abcdef0123-800.webp"],
  ["a site path is unchanged", "assets/brand/team.svg", 800, "assets/brand/team.svg"],
  ["a javascript: URL is still refused by safeUrl", "javascript:alert(1)", 800, site.safeUrl("javascript:alert(1)")],
];
for (const [name, src, w, want] of cases) {
  const got = site.imgUrl(src, w);
  check(`imgUrl: ${name}`, got === want, `got ${got}, want ${want}`);
}
for (const [label, value] of [["unfilled (local preview)", '{{readFile "img/drive/manifest.json"}}'], ["missing", undefined],
  ["not JSON", "{oops"], ["a list", "[1,2]"], ["bad widths", JSON.stringify({ [B]: ["400", null] })], ["not a list", JSON.stringify({ [B]: 400 })]]) {
  const got = loadComponents(value).imgUrl(B, 400);
  check(`imgUrl: manifest ${label} -> lh3 as before`, got === lh3(B, 400), got);
}
check("imgUrl: an ID that is also an Object property name is not looked up there", loadComponents("{}").imgUrl("propertyIsEnumerable", 400) === lh3("propertyIsEnumerable", 400));
// The two copies of the Drive ID rule agree: imgUrl() goes to lh3 (empty manifest) exactly when fetch.cjs takes the value.
const plain = loadComponents("{}");
const probes = [B, ` ${B} `, "short", "a".repeat(19), "a".repeat(20), "abc-def_ghi-jkl_mnop-q", "has space in it 1234567890", "a/b/cccccccccccccccccccccc",
  `https://lh3.googleusercontent.com/d/${C}`, `https://lh3.googleusercontent.com/d/${C}=w10`, `http://lh3.googleusercontent.com/d/${C}`,
  `https://lh3.googleusercontent.com.evil.example/d/${C}`, "media:0123456789abcdef0123", "", "https://example.com/x.jpg"];
const disagree = probes.filter((p) => plain.imgUrl(p, 400).startsWith("https://lh3.googleusercontent.com/d/") !== Boolean(fetchPhotos.driveId(p)));
check("the Drive ID rule is the same in imgUrl() and fetch.cjs", disagree.length === 0, disagree.join(" | "));

// ---------- 4. Caddy, Dockerfile, service worker ----------
const caddy = read("container/Caddyfile");
check("Caddy: /img/drive photos get a one-year immutable cache header", /\(drive_photos\)[\s\S]*?Cache-Control "public, max-age=31536000, immutable"/.test(caddy));
check("Caddy: only existing files get that header", /@drive_photo \{[\s\S]*?file \{[\s\S]*?try_files/.test(caddy));
check("Caddy: drive photos are served on the public and direct hosts", (caddy.match(/import drive_photos/g) || []).length === 2);
check("config.js: the manifest is filled in from img/drive/manifest.json", /drivePhotos: '\{\{readFile "img\/drive\/manifest\.json"\}\}'/.test(read("config.js")));
const docker = read("Dockerfile");
const froms = docker.match(/^FROM .*/gm) || [];
check("Dockerfile: the final image is still caddy:2.11.7-alpine", froms[froms.length - 1] === "FROM caddy:2.11.7-alpine", froms.join(" | "));
check("Dockerfile: the build stage uses an exact node version", /^FROM node:\d+\.\d+\.\d+-alpine\d+\.\d+ AS drive-photos$/m.test(docker));
check("Dockerfile: the photos are copied into the site", /COPY --from=drive-photos \/out\/drive \/srv\/site\/img\/drive/.test(docker));
const pkg = JSON.parse(read("scripts/drive-photos/package.json"));
check("sharp is pinned to an exact version", /^\d+\.\d+\.\d+$/.test(pkg.dependencies.sharp), pkg.dependencies.sharp);
check("downloaded photos are not committed", /^\/img\/drive\/$/m.test(read(".gitignore")) && /^img\/$/m.test(read(".dockerignore")));
const sw = read("sw.js");
check("service worker leaves /img/drive to the browser cache (not one of its folders)", !/STATIC_FOLDERS = \[[^\]]*"\/img/.test(sw));

// ---------- 3. a build where some photos fail ----------
async function buildTest() {
  let sharp;
  try { sharp = require(require.resolve("sharp", { paths: [path.join(root, "scripts", "drive-photos")] })); } catch (e) {
    skipped++; console.log("skip build test: run `npm ci` in scripts/drive-photos first"); return;
  }
  const GOOD = "1GoodGoodGoodGoodGoodGoodGood01", WIDE = "1WideWideWideWideWideWideWide02";
  const NOTSHARED = "1GoneGoneGoneGoneGoneGoneGone03", HTML = "1HtmlHtmlHtmlHtmlHtmlHtmlHtml04", BROKEN = "1BrokBrokBrokBrokBrokBrokBrok05";
  const small = await sharp({ create: { width: 1000, height: 600, channels: 3, background: "#3366aa" } })
    .jpeg().withExif({ IFD0: { Artist: "someone@example.com", Copyright: "test" } }).toBuffer();
  const wide = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#aa6633" } }).jpeg().toBuffer();
  const hits = {};
  const server = http.createServer((req, res) => {
    const id = req.url.slice(1).split("=")[0];
    hits[id] = (hits[id] || 0) + 1;
    if (id === GOOD) { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(small); }
    else if (id === WIDE) { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(wide); }
    else if (id === HTML) { res.writeHead(200, { "content-type": "text/html" }); res.end("<html>sign in</html>"); }
    else if (id === BROKEN) { res.writeHead(200, { "content-type": "image/jpeg" }); res.end("not really a jpeg"); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "drive-photos-test-"));
  try {
    fs.writeFileSync(path.join(tmp, "content.js"), `const SITE = { heroImage: "${GOOD}" };
const ROBOTS = [{ image: "${NOTSHARED}" }, { image: "${HTML}" }, { image: "https://lh3.googleusercontent.com/d/${WIDE}=w800" }, { image: "${BROKEN}" }];
const contentSections = { SITE, ROBOTS };`);
    process.env.DRIVE_BASE_URL = `http://127.0.0.1:${server.address().port}/`;
    delete require.cache[require.resolve(path.join(root, "scripts", "drive-photos", "fetch.cjs"))];
    const fresh = require(path.join(root, "scripts", "drive-photos", "fetch.cjs"));
    const warnings = [];
    const out = path.join(tmp, "img", "drive");
    let result, threw = null;
    try { result = await fresh.run(path.join(tmp, "content.js"), out, { log() {}, warn: (m) => warnings.push(m) }); } catch (e) { threw = e; }
    check("build: bad photos do not fail the run", !threw, threw && threw.message);
    const onDisk = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    check("build: the manifest lists only the photos that worked", JSON.stringify(onDisk) === JSON.stringify({ [GOOD]: fresh.WIDTHS, [WIDE]: fresh.WIDTHS }) && JSON.stringify(result) === JSON.stringify(onDisk), JSON.stringify(onDisk));
    check("build: one warning per failed photo", warnings.length === 3 && [NOTSHARED, HTML, BROKEN].every((id) => warnings.some((w) => w.includes(id))), warnings.join(" | "));
    check("build: a 404 is not retried", hits[NOTSHARED] === 1, `${hits[NOTSHARED]} requests`);
    check("build: nothing is left behind for failed photos", fs.readdirSync(out).every((f) => f === "manifest.json" || f.startsWith(GOOD) || f.startsWith(WIDE)), fs.readdirSync(out).join(" "));
    const meta = {};
    for (const id of [GOOD, WIDE]) for (const w of fresh.WIDTHS) meta[`${id}-${w}`] = await sharp(path.join(out, `${id}-${w}.webp`)).metadata();
    check("build: every file is WebP", Object.values(meta).every((m) => m.format === "webp"));
    check("build: a wide photo is resized to each width", fresh.WIDTHS.every((w) => meta[`${WIDE}-${w}`].width === w), fresh.WIDTHS.map((w) => meta[`${WIDE}-${w}`].width).join(","));
    check("build: a photo is never enlarged", meta[`${GOOD}-1600`].width === 1000 && meta[`${GOOD}-400`].width === 400);
    check("build: metadata is stripped", Object.values(meta).every((m) => !m.exif && !m.icc && !m.xmp));
    check("build: the manifest is safe to paste into a JS string", !/['\\\n]/.test(fs.readFileSync(path.join(out, "manifest.json"), "utf8")));
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

buildTest().then(() => {
  console.log(failed === 0 ? `ALL PASSED (${passed}${skipped ? `, ${skipped} skipped` : ""})` : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}, (e) => { console.error(e); process.exit(1); });
