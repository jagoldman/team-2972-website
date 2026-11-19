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
// { blur } puts that value in window.PHOTO_BLUR instead of running config.js; { config: false } runs no config.js at all.
function loadComponents(drivePhotos, { blur, config = true } = {}) {
  const ctx = { console, location: { host: "localhost", protocol: "http:", search: "", pathname: "/" }, scrollY: 0, URL };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (blur !== undefined) ctx.PHOTO_BLUR = blur; else if (config) vm.runInContext(read("config.js"), ctx);
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
    blur[HERO] && blur[HERO].v === "b2" && JSON.stringify(blur[HERO].ellipses) === JSON.stringify([[0.3825, 0.538, 0.0215, 0.034]]) && ctx.window.PHOTO_BLUR.format === 1 && JSON.stringify(ctx.window.PHOTO_BLUR.photos) === JSON.stringify(blur), JSON.stringify(blur));
  const want = { 400: 400, 600: 800, 800: 800, 1200: 1200, 1600: 1600, 2000: 1600, 9999: 1600 };
  const got = Object.keys(want).map((w) => [w, ctx.imgUrl(HERO, Number(w))]);
  check("D193: the hero is served from its blurred files, named <id>-b2-<w>.webp; the full-size link (2000) is the largest blurred copy",
    got.every(([w, u]) => u === `/img/drive/${HERO}-b2-${want[w]}.webp`), JSON.stringify(got));
  check("D193: fetch.cjs names the files the way imgUrl() asks for them", fetchPhotos.fileName(HERO, 800, blur) === `${HERO}-b2-800.webp` && fetchPhotos.fileName(B, 800, blur) === `${B}-800.webp`);
  check("D193: an lh3 address of the hero in the content is served from the blurred files too", ctx.imgUrl(`https://lh3.googleusercontent.com/d/${HERO}=w800`, 800) === `/img/drive/${HERO}-b2-800.webp`);
  const srcset = ctx.imgSized(HERO, [400, 800, 1600], "100vw");
  check("D193: the hero's srcset lists only its blurred files", /srcset="[^"]*-b2-400\.webp 400w, [^"]*-b2-800\.webp 800w, [^"]*-b2-1600\.webp 1600w"/.test(srcset) && !/google/.test(srcset), srcset);
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
  check("D193: an entry with a bad version mark fails closed (no photo, never Google)", loadComponents(manifest, { blur: { format: 1, photos: { [HERO]: { v: "../x", ellipses: [[0.5, 0.5, 0.1, 0.1]] } } } }).imgUrl(HERO, 800) === "");
  // The pages' full-size links and photo spots go through imgUrl()/hasPhoto(); no page writes a Google address itself.
  const pages = ["index", "robots", "robot", "about", "sponsors", "member", "mentor", "outreach", "media", "resources", "contact"].map((p) => [p, read(`${p}.html`)]);
  check("D193: no public page or script builds a Google photo address of its own", pages.every(([, h]) => !/googleusercontent/.test(h)) && (read("js/components.js").match(/googleusercontent\.com\/d\/\$\{/g) || []).length === 1);
  check("D193: the full-size links (robot gallery, Media photos) come from imgUrl() and only for photos that can be shown",
    // (A photo that cannot be shown is an editor-only spot with no link: editorPhotoSpot, release 8.3 review.)
    /pics\.map\(\(\{ src, i \}\) => !hasPhoto\(src\) \? editorPhotoSpot\([^`]*`<a class="shot r43" href="\$\{esc\(imgUrl\(src, 2000\)\)\}"/.test(read("robot.html"))
    && /\.map\(\(\{ src, i \}\) => !hasPhoto\(src\) \? editorPhotoSpot\([^`]*`<a class="shot r43" href="\$\{esc\(imgUrl\(src, 1600\)\)\}"/.test(read("media.html")));
  const cfg = read("config.js");
  check("D193: the table in config.js never holds a Caddy template opening (two braces)", !cfg.slice(cfg.indexOf("window.PHOTO_BLUR")).includes("{{"));
  check("D193: the image build gets config.js (the table) next to content.js", /COPY config\.js \/build\/config\.js/.test(read("Dockerfile")));
  check("D193: the service worker's cache version moved with the b2 mark (v9)", /const VERSION = "v9"/.test(read("sw.js")));
  check("D193: the version mark is b2 (the mask is fully opaque over the face; new addresses for the new pixels)", blur[HERO].v === "b2" && fetchPhotos.OG.file === "og-image-b2.jpg");
}

// ---------- D193: fail closed when the blur list did not arrive ----------
{
  const R = fetchPhotos.photoRules();
  const ell = [[0.5, 0.5, 0.1, 0.1]];
  const NOT_ARRIVED = [
    ["no config.js at all", { config: false }], ["PHOTO_BLUR missing (a config.js without it)", { blur: null }],
    ["an empty object", { blur: {} }], ["the old shape, with no format marker", { blur: { [HERO]: { v: "b2", ellipses: ell } } }],
    ["format 2", { blur: { format: 2, photos: {} } }], ["format as a string", { blur: { format: "1", photos: {} } }],
    ["photos is a list", { blur: { format: 1, photos: [] } }], ["photos missing", { blur: { format: 1 } }],
    ["a string", { blur: "format 1" }], ["one bad entry (no ellipses)", { blur: { format: 1, photos: { [HERO]: { v: "b2" } } } }],
    ["one bad entry (an ellipse outside the photo)", { blur: { format: 1, photos: { [HERO]: { v: "b2", ellipses: [[0.5, 1.2, 0.1, 0.1]] } } } }],
    ["one bad key", { blur: { format: 1, photos: { short: { v: "b2", ellipses: ell } } } }],
  ];
  const google = [`https://lh3.googleusercontent.com/d/${B}=w800`, `https://lh3.googleusercontent.com/d/${HERO}`, "https://drive.google.com/uc?id=" + B,
    "https://www.googleapis.com/drive/v3/files/" + B, "https://lh5.ggpht.com/abc", "https://www.google.com/images/x.png", "https://www.gstatic.com/x.png"];
  for (const [label, opts] of NOT_ARRIVED) {
    const c = loadComponents(manifest, opts);
    const urls = [B, HERO, D, C, ...google].flatMap((src) => [400, 800, 1600, 2000].map((w) => c.imgUrl(src, w)));
    const leaks = urls.filter((u) => u !== "");
    check(`D193 fail closed, ${label}: no Drive photo and nothing from Google (every imgUrl is "")`, leaks.length === 0 && !c.hasPhoto(B) && !c.hasPhoto(HERO), leaks.slice(0, 3).join(" | "));
    check(`D193 fail closed, ${label}: uploads, site paths and other hosts still work`, c.imgUrl("media:0123456789abcdef0123", 600) === "/media/0123456789abcdef0123-800.webp" && c.imgUrl("assets/brand/team.svg", 800) === "assets/brand/team.svg" && c.imgUrl("https://example.com/x.jpg", 800) === "https://example.com/x.jpg");
    check(`D193 fail closed, ${label}: the build's copy of the rule says the same (photoBlurList is null)`, opts.config === false || R.photoBlurList(opts.blur) === null);
  }
  const empty = loadComponents("{}", { blur: { format: 1, photos: {} } });
  check("D193: the valid empty list ({ format: 1, photos: {} }) means nothing is blurred: photos behave as before (Google when not saved)", empty.imgUrl(B, 800) === lh3(B, 800) && empty.imgUrl(HERO, 800) === lh3(HERO, 800) && empty.hasPhoto(B) && R.photoBlurList({ format: 1, photos: {} }) !== null);
  check("D193: the build refuses a config.js whose list did not arrive (it never builds without the blur)", (() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blur-config-"));
    try {
      const bad = [["window.SITE_ENV = {};", "missing"], ["window.PHOTO_BLUR = { photos: {} };", "no format"], ["window.PHOTO_BLUR = { format: 1, photos: { short: {} } };", "bad entry"]];
      return bad.every(([src]) => { const f = path.join(tmp, "config.js"); fs.writeFileSync(f, src); try { fetchPhotos.blurTable(f); return false; } catch (e) { return /PRIVACY \(D193\)/.test(e.message); } });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  })());
  check("D193: the signal is documented once, beside photoBlurList, and config.js carries the format marker", /THE SIGNAL \(D193; the Website editor's preview relies on it\)/.test(read("js/components.js")) && /"format": 1,/.test(read("config.js")));
}

// ---------- D193: one function for every Drive link form ----------
{
  const forms = (id) => [
    ["a bare ID", id], ["lh3 /d/", `https://lh3.googleusercontent.com/d/${id}`], ["lh3 /d/ with =w800", `https://lh3.googleusercontent.com/d/${id}=w800`],
    ["lh3 /d/ with =s0-rj", `https://lh3.googleusercontent.com/d/${id}=s0-rj`], ["lh5 /d/", `https://lh5.googleusercontent.com/d/${id}=w400-h300`],
    ["lh3 over http", `http://lh3.googleusercontent.com/d/${id}`],
    ["drive /file/d/.../view", `https://drive.google.com/file/d/${id}/view?usp=sharing`], ["drive /file/d/ bare", `https://drive.google.com/file/d/${id}`],
    ["drive /file/u/0/d/", `https://drive.google.com/file/u/0/d/${id}/view`], ["drive /open?id=", `https://drive.google.com/open?id=${id}`],
    ["drive /uc?id=", `https://drive.google.com/uc?id=${id}`], ["drive /uc?export=view&id=", `https://drive.google.com/uc?export=view&id=${id}`],
    ["docs /uc?id=", `https://docs.google.com/uc?id=${id}&export=download`], ["docs /file/d/", `https://docs.google.com/file/d/${id}/edit`],
    ["drive /thumbnail?id=", `https://drive.google.com/thumbnail?id=${id}&sz=w1000`], ["drive /u/1/uc?id=", `https://drive.google.com/u/1/uc?id=${id}`],
    ["usercontent /download?id=", `https://drive.usercontent.google.com/download?id=${id}&export=view`], ["usercontent /u/0/uc?id=", `https://drive.usercontent.google.com/u/0/uc?id=${id}`],
    ["Drive API v3", `https://www.googleapis.com/drive/v3/files/${id}?alt=media`], ["Drive API v2", `https://www.googleapis.com/drive/v2/files/${id}`],
    ["with spaces round it", `  https://drive.google.com/file/d/${id}/view  `], ["upper-case host", `https://DRIVE.GOOGLE.COM/file/d/${id}/view`],
  ];
  const site = loadComponents(manifest), bare = loadComponents("{}");
  const wrong = [];
  for (const [label, v] of forms(HERO)) {
    if (fetchPhotos.driveId(v) !== HERO) wrong.push(`build ${label}`);
    if (site.imgUrl(v, 800) !== `/img/drive/${HERO}-b2-800.webp` || site.imgUrl(v, 2000) !== `/img/drive/${HERO}-b2-1600.webp`) wrong.push(`page ${label}: ${site.imgUrl(v, 800)}`);
    if (bare.imgUrl(v, 800) !== "" || bare.hasPhoto(v)) wrong.push(`page, not saved ${label}: ${bare.imgUrl(v, 800)}`);
  }
  check(`D193: a blurred photo in each of ${forms(HERO).length} link forms is found by the build and shows its blurred copy, or nothing when it is not saved`, wrong.length === 0, wrong.slice(0, 4).join(" | "));
  const ok = [];
  for (const [label, v] of forms(B)) {
    if (fetchPhotos.driveId(v) !== B) ok.push(`build ${label}`);
    if (site.imgUrl(v, 800) !== `/img/drive/${B}-800.webp`) ok.push(`page saved ${label}: ${site.imgUrl(v, 800)}`);
    if (bare.imgUrl(v, 800) !== lh3(B, 800)) ok.push(`page not saved ${label}: ${bare.imgUrl(v, 800)}`);
  }
  check("D193: an unblurred photo in each form still works: its saved copy, or the one lh3 address for its ID", ok.length === 0, ok.slice(0, 4).join(" | "));
  const unreducible = ["https://lh3.googleusercontent.com/a/ACg8ocK", "https://lh3.googleusercontent.com/pw/AP1Gcz", `https://lh3.googleusercontent.com/d/short`,
    `https://drive.google.com/drive/folders/${B}`, `https://drive.google.com/open?id=short`, `https://photos.google.com/photo/${B}`, `https://lh3.google.com/u/0/d/${B}`,
    `https://www.googleapis.com/drive/v3/about`, "https://lh4.ggpht.com/x.jpg", "https://www.gstatic.com/images/x.png", "https://images.google.co.uk/x.jpg", "https://drive.google.com./uc"];
  const passed = unreducible.filter((v) => site.imgUrl(v, 800) !== "" || fetchPhotos.driveId(v) !== "");
  check("D193: a Google-hosted address the function cannot reduce to an ID is never requested (imgUrl gives \"\")", passed.length === 0, passed.join(" | "));
  const others = [["https://example.com/photo.jpg", "https://example.com/photo.jpg"], [`https://lh3.googleusercontent.com.evil.example/d/${B}`, `https://lh3.googleusercontent.com.evil.example/d/${B}`], ["assets/placeholder-robot.svg", "assets/placeholder-robot.svg"]];
  check("D193: addresses on other hosts and site paths are unchanged", others.every(([v, want]) => site.imgUrl(v, 800) === want && fetchPhotos.driveId(v) === ""));
  check("D193: driveIdOf is one function, in the photo-rules block: no other Drive ID rule in components.js or fetch.cjs",
    (read("js/components.js").match(/function driveIdOf\(/g) || []).length === 1 && !/DRIVE_URL|DRIVE_ID =/.test(read("scripts/drive-photos/fetch.cjs")) && !/lh3\\\.googleusercontent\\\.com\\\/d/.test(read("js/components.js").replace(/\/\/[^\n]*/g, "")));
  const sampleForms = `const SITE = { heroImage: "https://drive.google.com/file/d/${HERO}/view" };
const ROBOTS = [{ image: "https://drive.usercontent.google.com/download?id=${B}" }, { gallery: ["https://www.googleapis.com/drive/v3/files/${C}", "https://lh3.googleusercontent.com/a/nope"] }];
const contentSections = { SITE, ROBOTS };`;
  check("D193: the build downloads a photo pasted in any form (each ID once)", fetchPhotos.extractDriveIds(sampleForms).join() === [B, C, HERO].sort().join(), fetchPhotos.extractDriveIds(sampleForms).join());
}

// ---------- D193: a retired address cannot come back ----------
{
  const site = loadComponents(manifest), bare = loadComponents("{}");
  const cur = (w) => `/img/drive/${HERO}-b2-${w}.webp`;
  const old = [`/img/drive/${HERO}-1600.webp`, `img/drive/${HERO}-400.webp`, `/img/drive/${HERO}-b1-800.webp`, `./img/./drive/${HERO}-b1-1600.webp`,
    `../img/drive/%31${HERO.slice(1)}-400.webp`, `/img/drive/${HERO}-b2-400.webp`, `http://localhost/img/drive/${HERO}-1600.webp`, `https://www.localhost/img/drive/${HERO}-b1-400.webp`,
    `/img/drive/${HERO}-1600.webp?v=1`];
  // (The build cannot know the site's host, so it reads only the path forms; the pages read this site's full address too.)
  const bad = old.filter((v) => site.imgUrl(v, 800) !== cur(800) || bare.imgUrl(v, 800) !== "" || (!/^https?:/.test(v) && fetchPhotos.driveId(v) !== HERO));
  check("D193: a blurred photo's old address (any old name, mark, spelling, or this site's full address) shows the current blurred copy, or nothing", bad.length === 0, bad.map((v) => `${v} -> ${site.imgUrl(v, 800)}`).slice(0, 3).join(" | "));
  const never = ["/img/drive/og-image.jpg", "/img/drive/og-image-b1.jpg", "img/drive/og-image-b2.jpg", "https://www.localhost/img/drive/og-image.jpg", "/img/drive/manifest.json",
    "/img/drive/", "/img/drive/drive-retired.caddy", "/%69mg/drive/og-image.jpg", "./img/drive/x.webp"];
  check("D193: no other img/drive path is ever named (old link-preview pictures, the manifest, anything unknown)", never.every((v) => site.imgUrl(v, 800) === ""), never.filter((v) => site.imgUrl(v, 800) !== "").join(" | "));
  check("D193: an unblurred photo's saved-copy path reads back to its ID (served from its copy, or lh3)", site.imgUrl(`/img/drive/${B}-1600.webp`, 400) === `/img/drive/${B}-400.webp` && bare.imgUrl(`img/drive/${B}-400.webp`, 800) === lh3(B, 800));
  const routes = fetchPhotos.retiredRoutes(fetchPhotos.blurTable());
  check("D193: the build's Caddy rule names every current file of each blurred photo and the current link-preview picture as the only ones served",
    routes.includes(`path_regexp drive_retired ^/img/drive/(?:og-image[^/]*\\.jpg|(?:${HERO})-(?:[a-z0-9]+-)?[0-9]+\\.webp)$`) && fetchPhotos.WIDTHS.every((w) => routes.includes(cur(w))) && routes.includes("/img/drive/og-image-b2.jpg") && /handle @drive_retired \{\s*header Cache-Control "no-store"\s*respond 404\s*\}/.test(routes), routes);
  const caddy = read("container/Caddyfile");
  check("D193: Caddy imports that rule first in (drive_photos), before any photo is served", /\(drive_photos\) \{[^@]*import \/etc\/caddy\/drive-retired\.caddy\s*@drive_photo \{/.test(caddy));
  check("D193: the Dockerfile moves the rule from the photo build into /etc/caddy", /mv \/srv\/site\/img\/drive\/drive-retired\.caddy \/etc\/caddy\/drive-retired\.caddy/.test(read("Dockerfile")));
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
check("Caddy: the link-preview picture is served by its own name, only when it exists, cached for a day", /@og_image \{\s*path \/img\/drive\/og-image-b2\.jpg\s*file \{[\s\S]*?try_files[\s\S]*?handle @og_image \{\s*header Cache-Control "public, max-age=86400"/.test(caddy));
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
  check("index.html: og:image is a full address built from SITE_SCHEME and SITE_DOMAIN, og-image-b2.jpg or the app icon", /<meta property="og:image" content="\{\{env "SITE_SCHEME" \| html\}\}:\/\/\{\{env "SITE_DOMAIN" \| html\}\}\{\{if fileExists "\/img\/drive\/og-image-b2\.jpg"\}\}\/img\/drive\/og-image-b2\.jpg\{\{else\}\}\/pwa-icons\/site\/icon-512\.png\{\{end\}\}" \/>/.test(head));
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
    check("build: nothing is left behind for failed photos (only the manifest, the Caddy rule, the saved photos and the link-preview picture)", fs.readdirSync(out).every((f) => f === "manifest.json" || f === "drive-retired.caddy" || f === fresh.OG.file || f.startsWith(GOOD) || f.startsWith(WIDE)), fs.readdirSync(out).join(" "));
    check("build: the Caddy rule for retired names is written with the photos", fs.readFileSync(path.join(out, "drive-retired.caddy"), "utf8") === fresh.retiredRoutes(fresh.blurTable()));
    const og = await sharp(path.join(out, fresh.OG.file)).metadata();
    check("build: og-image-b2.jpg is the hero photo cut to 1200x630, JPEG, with no metadata", og.format === "jpeg" && og.width === 1200 && og.height === 630 && !og.exif && !og.icc && !og.xmp, JSON.stringify({ f: og.format, w: og.width, h: og.height }));
    // A hero that is not a saved photo (it failed here): no og-image-b2.jpg, and a stale one from a run before is removed.
    fs.writeFileSync(path.join(tmp, "content2.js"), `const SITE = { heroImage: "${NOTSHARED}" };\nconst contentSections = { SITE };`);
    const warn2 = [];
    await fresh.run(path.join(tmp, "content2.js"), out, { log() {}, warn: (m) => warn2.push(m) });
    check("build: a hero photo that failed leaves no og-image-b2.jpg (the page names the app icon) and says so", !fs.existsSync(path.join(out, fresh.OG.file)) && warn2.some((w) => /link-preview/.test(w)), warn2.join(" | "));
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

    // The mask itself, rasterised at several picture sizes with the hero's ellipse and with a tall and a tiny one: every
    // pixel whose centre is inside the ellipse is exactly opaque (255), and the box's border is 0 (the feather ends inside it).
    const maskProblems = [];
    let insideCounted = 0;
    for (const [MW, MH, ell] of [[1500, 1125, [0.3825, 0.538, 0.0215, 0.034]], [1600, 1200, [0.3825, 0.538, 0.0215, 0.034]], [400, 300, [0.3825, 0.538, 0.0215, 0.034]],
      [3000, 2250, [0.3825, 0.538, 0.0215, 0.034]], [1200, 1600, [0.5, 0.4, 0.03, 0.08]], [800, 600, [0.5, 0.5, 0.004, 0.005]]]) {
      const g = fresh.blurGeometry(MW, MH, ell), m = fresh.blurMask(g);
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        const a = m[y * g.w + x];
        if (fresh.insideEllipse(g.c, g.left + x, g.top + y)) { insideCounted++; if (a !== 255) maskProblems.push(`${MW}x${MH} (${g.left + x},${g.top + y}) alpha ${a}`); }
        if ((x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1) && a !== 0) maskProblems.push(`${MW}x${MH} border (${x},${y}) alpha ${a}`);
      }
    }
    check(`D193 unit: the mask is exactly 255 at every pixel inside the ellipse (${insideCounted} pixels at six sizes) and 0 on the box's border`, insideCounted > 3000 && maskProblems.length === 0, maskProblems.slice(0, 4).join(" | "));
    // Two pictures that are the same except inside the ellipse give identical output (before any encoding): nothing of
    // the protected region reaches the result.
    const noise = (seed) => { const b = Buffer.from(raw); let v = seed; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fresh.insideEllipse(fresh.blurGeometry(W, H, E).c, x, y)) { v = (v * 1103515245 + 12345) >>> 0; b.fill(v >>> 24, (y * W + x) * 3, (y * W + x) * 3 + 3); } return b; };
    const outA = await sharp(await fresh.blurRegions(sharp, await sharp(noise(1), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), [E])).removeAlpha().raw().toBuffer();
    const outB = await sharp(await fresh.blurRegions(sharp, await sharp(noise(99), { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), [E])).removeAlpha().raw().toBuffer();
    const inA = noise(1), inB = noise(99);
    check("D193 unit: two inputs that differ only inside the ellipse give identical pixels there (and everywhere)", !inA.equals(inB) && outA.equals(outB), `${[...outA].filter((v, k) => v !== outB[k]).length} bytes differ`);

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
      const table = { [FACE]: { v: "b2", ellipses: [[0.4, 0.5, 0.06, 0.08]] }, [NOTSHARED]: { v: "b2", ellipses: [[0.5, 0.5, 0.1, 0.1]] } };
      fs.writeFileSync(path.join(tmp, "content3.js"), `const SITE = { heroImage: "${FACE}", heroPosition: "50% 50%" };\nconst ROBOTS = [{ image: "${NOTSHARED}" }];\nconst contentSections = { SITE, ROBOTS };`);
      const out3 = path.join(tmp, "img3"), logs = [], warns = [];
      const res3 = await f2.run(path.join(tmp, "content3.js"), out3, { log: (m) => logs.push(m), warn: (m) => warns.push(m) }, table);
      const files = fs.readdirSync(out3).sort();
      check("D193 build: the blurred photo's files carry the version mark; no file under the old name", JSON.stringify(res3) === JSON.stringify({ [FACE]: f2.WIDTHS })
        && f2.WIDTHS.every((w) => files.includes(`${FACE}-b2-${w}.webp`)) && !files.some((n) => new RegExp(`^${FACE}-\\d+\\.webp$`).test(n)), files.join(" "));
      const spread = async (file) => { const st = await sharp(file).stats(); return Math.max(...st.channels.slice(0, 3).map((ch) => ch.stdev)); };
      const before = await spread(faceJpeg);
      const after = [];
      for (const w of f2.WIDTHS) after.push([w, await spread(path.join(out3, `${FACE}-b2-${w}.webp`))]);
      const ogSpread = await spread(path.join(out3, f2.OG.file));
      check("D193 build: every width is made from the blurred picture (the striped region is smooth in each)", before > 10 && after.every(([, sd]) => sd < 2), JSON.stringify({ before, after }));
      check("D193 build: the link-preview picture is made from the blurred picture too", ogSpread < 2 && f2.OG.file === "og-image-b2.jpg", ogSpread);
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
