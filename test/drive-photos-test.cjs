// Drive photos served from this server (scripts/drive-photos/fetch.cjs, imgUrl() in js/components.js):
//   - which content values count as Drive photos (the same rule in both files)
//   - imgUrl() with and without a manifest: the local file, the next width up, the lh3 fallback
//   - a build run against a local fake of lh3 where some photos fail: the rest are saved, the run succeeds
//   - the Caddy, Dockerfile and service worker pieces
//   - D193 (a face blurred at the owner's request): the blur changes the region and nothing else, every width and the
//     link-preview picture are made from the blurred picture, and a blurred photo never comes from Google
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
// config.js runs first, as on every page (it carries window.PHOTO_BLUR); then the manifest under test replaces SITE_ENV.
function loadComponents(drivePhotos, { blur } = {}) {
  const ctx = { console, location: { host: "localhost", protocol: "http:", search: "", pathname: "/" }, scrollY: 0 };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (blur) ctx.PHOTO_BLUR = blur; else vm.runInContext(read("config.js"), ctx);
  ctx.SITE_ENV = { scheme: "http", domain: "localhost", drivePhotos };
  ctx.matchMedia = () => ({ matches: false });
  ctx.addEventListener = () => {};
  ctx.onContent = () => {};
  ctx.document = { addEventListener() {}, body: { hasAttribute: () => false }, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(ctx);
  vm.runInContext(`${read("js/components.js")};globalThis.imgUrl = imgUrl;globalThis.hasPhoto = hasPhoto;globalThis.imgSized = imgSized;`, ctx);
  return ctx;
}
const D = "1DdDdDdDdDdDdDdDdDdDdDdDdDd678";   // made up, two widths saved
const manifest = JSON.stringify({ [B]: [400, 800, 1200, 1600], [D]: [400, 800], [HERO]: [400, 800, 1200, 1600] });
const site = loadComponents(manifest);
const lh3 = (id, w) => `https://lh3.googleusercontent.com/d/${id}=w${w}`;
const cases = [
  ["a saved width is served locally", B, 400, `/img/drive/${B}-400.webp`],
  ["a width between two saved ones gets the next one up", B, 600, `/img/drive/${B}-800.webp`],
  ["the hero at 1600", B, 1600, `/img/drive/${B}-1600.webp`],
  ["wider than anything saved falls back to lh3", B, 2000, lh3(B, 2000)],
  ["only the widths the manifest lists are used", D, 1200, lh3(D, 1200)],
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
// ---------- D193: a blurred photo is never loaded from Google ----------
{
  const blur = fetchPhotos.blurTable();
  const ctx = loadComponents(manifest);
  check("D193: the blur table is in config.js, has the hero photo, and the pages read the same table as the build",
    blur[HERO] && blur[HERO].v === "b1" && JSON.stringify(blur[HERO].ellipses) === JSON.stringify([[0.3825, 0.538, 0.0215, 0.034]]) && JSON.stringify(ctx.window.PHOTO_BLUR) === JSON.stringify(blur), JSON.stringify(blur));
  const want = { 400: 400, 600: 800, 800: 800, 1200: 1200, 1600: 1600, 2000: 1600, 9999: 1600 };
  const got = Object.keys(want).map((w) => [w, ctx.imgUrl(HERO, Number(w))]);
  check("D193: the hero is served from its blurred files, named <id>-b1-<w>.webp; the full-size link (2000) is the largest blurred copy",
    got.every(([w, u]) => u === `/img/drive/${HERO}-b1-${want[w]}.webp`), JSON.stringify(got));
  check("D193: fetch.cjs names the files the way imgUrl() asks for them", fetchPhotos.fileName(HERO, 800, blur) === `${HERO}-b1-800.webp` && fetchPhotos.fileName(B, 800, blur) === `${B}-800.webp`);
  check("D193: an lh3 address of the hero in the content is served from the blurred files too", ctx.imgUrl(`https://lh3.googleusercontent.com/d/${HERO}=w800`, 800) === `/img/drive/${HERO}-b1-800.webp`);
  const srcset = ctx.imgSized(HERO, [400, 800, 1600], "100vw");
  check("D193: the hero's srcset lists only its blurred files", /srcset="[^"]*-b1-400\.webp 400w, [^"]*-b1-800\.webp 800w, [^"]*-b1-1600\.webp 1600w"/.test(srcset) && !/google/.test(srcset), srcset);
  // Every way the manifest can be missing or wrong, every width, both forms of the ID: never a Google address.
  const leaks = [];
  for (const [label, m] of [["filled", manifest], ["without the hero", JSON.stringify({ [B]: [400] })], ["unfilled (local preview)", '{{readFile "img/drive/manifest.json"}}'],
    ["missing", undefined], ["not JSON", "{oops"], ["a list", "[1,2]"], ["bad widths", JSON.stringify({ [HERO]: ["400", null] })], ["empty widths", JSON.stringify({ [HERO]: [] })]]) {
    const c = loadComponents(m);
    for (const id of Object.keys(blur)) for (const src of [id, ` ${id} `, `https://lh3.googleusercontent.com/d/${id}=w400`]) for (const w of [1, 400, 800, 1200, 1600, 2000, 4000]) {
      const u = c.imgUrl(src, w);
      if (/google/i.test(u) || (u && !u.startsWith(`/img/drive/${id}-${blur[id].v}-`))) leaks.push(`${label} ${src} ${w}: ${u}`);
    }
  }
  check("D193: imgUrl() never gives a Google address (or an unblurred file) for a blurred photo, whatever the manifest says", leaks.length === 0, leaks.slice(0, 4).join(" | "));
  const none = loadComponents(JSON.stringify({ [B]: [400] }));
  check("D193: with no saved blurred copy, the photo is not shown at all (imgUrl \"\", hasPhoto false)", none.imgUrl(HERO, 800) === "" && none.imgUrl(HERO, 2000) === "" && !none.hasPhoto(HERO) && none.hasPhoto(B) && ctx.hasPhoto(HERO));
  check("D193: an entry with a bad version mark fails closed (no photo, never Google)", loadComponents(manifest, { blur: { [HERO]: { v: "../x", ellipses: [] } } }).imgUrl(HERO, 800) === "");
  // The pages' full-size links and photo spots go through imgUrl()/hasPhoto(); no page writes a Google address itself.
  const pages = ["index", "robots", "robot", "about", "sponsors", "member", "mentor", "outreach", "media", "resources", "contact"].map((p) => [p, read(`${p}.html`)]);
  check("D193: no public page or script builds a Google photo address of its own", pages.every(([, h]) => !/googleusercontent/.test(h)) && (read("js/components.js").match(/googleusercontent\.com\/d\/\$\{/g) || []).length === 1);
  check("D193: the full-size links (robot gallery, Media photos) come from imgUrl() and only for photos that can be shown",
    /pics\.map\(\(\{ src, i \}\) => `<a class="shot r43" href="\$\{esc\(imgUrl\(src, 2000\)\)\}"/.test(read("robot.html")) && /filter\(\(\{ src \}\) => hasPhoto\(src\)\)/.test(read("robot.html"))
    && /filter\(\(\{ src \}\) => hasPhoto\(src\)\)\.map\(\(\{ src, i \}\) => `<a class="shot r43" href="\$\{esc\(imgUrl\(src, 1600\)\)\}"/.test(read("media.html")));
  const cfg = read("config.js");
  check("D193: the table in config.js never holds a Caddy template opening (two braces)", !cfg.slice(cfg.indexOf("window.PHOTO_BLUR")).includes("{{"));
  check("D193: the image build gets config.js (the table) next to content.js", /COPY config\.js \/build\/config\.js/.test(read("Dockerfile")));
  check("D193: the service worker's cache version moved past the live v6 (v8)", /const VERSION = "v8"/.test(read("sw.js")));
}

// The two copies of the Drive ID rule agree: imgUrl() goes to lh3 (empty manifest) exactly when fetch.cjs takes the value.
const plain = loadComponents("{}");
const probes = [B, ` ${B} `, "short", "a".repeat(19), "a".repeat(20), "abc-def_ghi-jkl_mnop-q", "has space in it 1234567890", "a/b/cccccccccccccccccccccc",
  `https://lh3.googleusercontent.com/d/${C}`, `https://lh3.googleusercontent.com/d/${C}=w10`, `http://lh3.googleusercontent.com/d/${C}`,
  `https://lh3.googleusercontent.com.evil.example/d/${C}`, "media:0123456789abcdef0123", "", "https://example.com/x.jpg"];
const disagree = probes.filter((p) => plain.imgUrl(p, 400).startsWith("https://lh3.googleusercontent.com/d/") !== Boolean(fetchPhotos.driveId(p)));
check("the Drive ID rule is the same in imgUrl() and fetch.cjs", disagree.length === 0, disagree.join(" | "));

// The link-preview picture is framed like the page frames the hero (SITE.heroPosition).
const F = fetchPhotos.focusOf;
check("focusOf: the hero's '50% 100%' keeps the bottom middle", JSON.stringify(F("50% 100%")) === '{"x":0.5,"y":1}');
check("focusOf: keywords, one value, empty and nonsense", JSON.stringify([F("center top"), F("right"), F("bottom"), F(""), F("url(x)"), F("1% 2% 3%")]) ===
  JSON.stringify([{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }]));

// ---------- 4. Caddy, Dockerfile, service worker ----------
const caddy = read("container/Caddyfile");
check("Caddy: /img/drive photos get a one-year immutable cache header", /\(drive_photos\)[\s\S]*?Cache-Control "public, max-age=31536000, immutable"/.test(caddy));
check("Caddy: only existing files get that header", /@drive_photo \{[\s\S]*?file \{[\s\S]*?try_files/.test(caddy));
check("Caddy: drive photos are served on the public and direct hosts", (caddy.match(/import drive_photos/g) || []).length === 2);
check("Caddy: the link-preview picture is served by its own name, only when it exists, cached for a day", /@og_image \{\s*path \/img\/drive\/og-image-b1\.jpg\s*file \{[\s\S]*?try_files[\s\S]*?handle @og_image \{\s*header Cache-Control "public, max-age=86400"/.test(caddy));
check("Caddy: the home page is rendered as a template on the public and direct hosts", /\(home_page\) \{\s*@home path \/ \/index\.html\s*handle @home \{[\s\S]*?templates/.test(caddy) && (caddy.match(/import home_page/g) || []).length === 2);
{
  // Caddy runs the WHOLE of index.html through its template engine, so "{{" anywhere else (the body, a script, a comment)
  // would break the page in the container while a plain local server shows it fine. Template actions belong only inside
  // attribute values in the <head>.
  const templateProblems = (html) => {
    const i = html.indexOf("</head>");
    if (i < 0) return ["no </head>"];
    const problems = [];
    if (html.slice(0, i).replace(/"[^"]*"/g, '""').includes("{{")) problems.push("a template action in the head outside an attribute value");
    if (html.slice(i).includes("{{")) problems.push("{{ after the head (body or script)");
    return problems;
  };
  const page = read("index.html");
  const head = page.split("</head>")[0];
  check("index.html: template actions only inside attribute values in the head, and no {{ anywhere after it", page.includes("{{") && templateProblems(page).length === 0, templateProblems(page).join(", "));
  const sample = '<html><head><meta content="{{env "X"}}"></head><body>';
  check("the template rule catches {{ in the body, in a script and loose in the head", templateProblems(sample + "<p>{{oops}}</p></body>").length > 0
    && templateProblems(sample + "<script>const t = `${a}{{b}}`;</script></body>").length > 0 && templateProblems("<html><head>{{if x}}<meta>{{end}}</head><body></body>").length > 0
    && templateProblems(sample + "<p>fine</p></body>").length === 0);
  check("index.html: og:image is a full address built from SITE_SCHEME and SITE_DOMAIN, og-image-b1.jpg or the app icon", /<meta property="og:image" content="\{\{env "SITE_SCHEME" \| html\}\}:\/\/\{\{env "SITE_DOMAIN" \| html\}\}\{\{if fileExists "\/img\/drive\/og-image-b1\.jpg"\}\}\/img\/drive\/og-image-b1\.jpg\{\{else\}\}\/pwa-icons\/site\/icon-512\.png\{\{end\}\}" \/>/.test(head));
  check("index.html: no address is typed in", !/2972robotics\.com|localhost/.test(head));
}
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
    check("build: nothing is left behind for failed photos (only the manifest, the saved photos and the link-preview picture)", fs.readdirSync(out).every((f) => f === "manifest.json" || f === fresh.OG.file || f.startsWith(GOOD) || f.startsWith(WIDE)), fs.readdirSync(out).join(" "));
    const og = await sharp(path.join(out, fresh.OG.file)).metadata();
    check("build: og-image-b1.jpg is the hero photo cut to 1200x630, JPEG, with no metadata", og.format === "jpeg" && og.width === 1200 && og.height === 630 && !og.exif && !og.icc && !og.xmp, JSON.stringify({ f: og.format, w: og.width, h: og.height }));
    // A hero that is not a saved photo (it failed here): no og-image-b1.jpg, and a stale one from a run before is removed.
    fs.writeFileSync(path.join(tmp, "content2.js"), `const SITE = { heroImage: "${NOTSHARED}" };\nconst contentSections = { SITE };`);
    const warn2 = [];
    await fresh.run(path.join(tmp, "content2.js"), out, { log() {}, warn: (m) => warn2.push(m) });
    check("build: a hero photo that failed leaves no og-image-b1.jpg (the page names the app icon) and says so", !fs.existsSync(path.join(out, fresh.OG.file)) && warn2.some((w) => /link-preview/.test(w)), warn2.join(" | "));
    const meta = {};
    for (const id of [GOOD, WIDE]) for (const w of fresh.WIDTHS) meta[`${id}-${w}`] = await sharp(path.join(out, `${id}-${w}.webp`)).metadata();
    check("build: every file is WebP", Object.values(meta).every((m) => m.format === "webp"));
    check("build: a wide photo is resized to each width", fresh.WIDTHS.every((w) => meta[`${WIDE}-${w}`].width === w), fresh.WIDTHS.map((w) => meta[`${WIDE}-${w}`].width).join(","));
    check("build: a photo is never enlarged", meta[`${GOOD}-1600`].width === 1000 && meta[`${GOOD}-400`].width === 400);
    check("build: metadata is stripped", Object.values(meta).every((m) => !m.exif && !m.icc && !m.xmp));
    check("build: the manifest is safe to paste into a JS string", !/['\\\n]/.test(fs.readFileSync(path.join(out, "manifest.json"), "utf8")));

    // ---------- D193: the blur ----------
    // Unit: a picture of fine stripes everywhere; one ellipse is blurred. Inside it the stripes are gone; outside the
    // padded box around it every pixel is exactly as before.
    const W = 800, H = 600, raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = ((x >> 2) + (y >> 2)) % 2 ? 255 : 0; raw.fill(v, (y * W + x) * 3, (y * W + x) * 3 + 3); }
    const stripes = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
    const E = [0.5, 0.5, 0.05, 0.08];
    const blurred = await fresh.blurRegions(sharp, stripes, [E]);
    const px = await sharp(blurred).removeAlpha().raw().toBuffer();
    const c = { x: 400, y: 300, rx: 40, ry: 48 }, pad = 32;   // pad: 0.8 of the x radius, as fetch.cjs
    let outside = 0, insideStep = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const inBox = x >= c.x - c.rx - pad && x < c.x + c.rx + pad && y >= c.y - c.ry - pad && y < c.y + c.ry + pad;
      if (!inBox && (px[i] !== raw[i] || px[i + 1] !== raw[i + 1] || px[i + 2] !== raw[i + 2])) outside++;
      // inside the ellipse: the largest step between two neighbouring pixels (the stripes step 255 every 4 pixels)
      if (x > 0 && y > 0 && ((x - c.x) / c.rx) ** 2 + ((y - c.y) / c.ry) ** 2 <= 1) insideStep = Math.max(insideStep, Math.abs(px[i] - px[i - 3]), Math.abs(px[i] - px[i - W * 3]));
    }
    check("D193 unit: every pixel outside the blurred region is unchanged", outside === 0, `${outside} pixels changed`);
    check("D193 unit: inside the ellipse the detail is gone (black and white stripes become smooth grey: no step between neighbours over 4)", insideStep <= 4, `largest step ${insideStep}`);

    // Build: a hero that is plain grey except for stripes under its blur ellipse, served by the fake lh3 and blurred by
    // the table passed to run(). Every width and the link-preview picture must be smooth (made from the blurred
    // picture); the same photo unblurred is not.
    const FACE = "1FaceFaceFaceFaceFaceFaceFace06";
    const hw = 1600, hh = 1200, hraw = Buffer.alloc(hw * hh * 3, 128);
    const hc = { x: 0.4 * hw, y: 0.5 * hh, rx: 0.06 * hw, ry: 0.08 * hh };
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) if (((x - hc.x) / hc.rx) ** 2 + ((y - hc.y) / hc.ry) ** 2 <= 1) raw.length && hraw.fill(((x >> 3) + (y >> 3)) % 2 ? 255 : 0, (y * hw + x) * 3, (y * hw + x) * 3 + 3);
    const faceJpeg = await sharp(hraw, { raw: { width: hw, height: hh, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const server2 = http.createServer((req, res) => { const id = req.url.slice(1).split("=")[0]; if (id === FACE) { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(faceJpeg); } else { res.writeHead(404); res.end(); } });
    await new Promise((r) => server2.listen(0, "127.0.0.1", r));
    try {
      process.env.DRIVE_BASE_URL = `http://127.0.0.1:${server2.address().port}/`;
      delete require.cache[require.resolve(path.join(root, "scripts", "drive-photos", "fetch.cjs"))];
      const f2 = require(path.join(root, "scripts", "drive-photos", "fetch.cjs"));
      const table = { [FACE]: { v: "b1", ellipses: [[0.4, 0.5, 0.06, 0.08]] }, [NOTSHARED]: { v: "b1", ellipses: [[0.5, 0.5, 0.1, 0.1]] } };
      fs.writeFileSync(path.join(tmp, "content3.js"), `const SITE = { heroImage: "${FACE}", heroPosition: "50% 50%" };\nconst ROBOTS = [{ image: "${NOTSHARED}" }];\nconst contentSections = { SITE, ROBOTS };`);
      const out3 = path.join(tmp, "img3"), logs = [], warns = [];
      const res3 = await f2.run(path.join(tmp, "content3.js"), out3, { log: (m) => logs.push(m), warn: (m) => warns.push(m) }, table);
      const files = fs.readdirSync(out3).sort();
      check("D193 build: the blurred photo's files carry the version mark; no file under the old name", JSON.stringify(res3) === JSON.stringify({ [FACE]: f2.WIDTHS })
        && f2.WIDTHS.every((w) => files.includes(`${FACE}-b1-${w}.webp`)) && !files.some((n) => new RegExp(`^${FACE}-\\d+\\.webp$`).test(n)), files.join(" "));
      const spread = async (file) => { const st = await sharp(file).stats(); return Math.max(...st.channels.slice(0, 3).map((ch) => ch.stdev)); };
      const before = await spread(faceJpeg);
      const after = [];
      for (const w of f2.WIDTHS) after.push([w, await spread(path.join(out3, `${FACE}-b1-${w}.webp`))]);
      const ogSpread = await spread(path.join(out3, f2.OG.file));
      check("D193 build: every width is made from the blurred picture (the striped region is smooth in each)", before > 10 && after.every(([, sd]) => sd < 2), JSON.stringify({ before, after }));
      check("D193 build: the link-preview picture is made from the blurred picture too", ogSpread < 2 && f2.OG.file === "og-image-b1.jpg", ogSpread);
      check("D193 build: a blurred photo that cannot be saved is left out and the log says so loudly (PRIVACY, no photo shown)",
        !fs.readdirSync(out3).some((n) => n.startsWith(NOTSHARED)) && warns.some((m) => m.includes("PRIVACY (D193)") && m.includes(NOTSHARED) && /NO photo/.test(m)), warns.join(" | "));
      check("D193 build: the log names the blurred photo it saved", logs.some((m) => m.includes(FACE) && /blurred/.test(m)), logs.join(" | "));
    } finally { server2.close(); }
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

buildTest().then(() => {
  console.log(failed === 0 ? `ALL PASSED (${passed}${skipped ? `, ${skipped} skipped` : ""})` : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}, (e) => { console.error(e); process.exit(1); });
