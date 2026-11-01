// Every local image the site refers to must reach production: present, tracked by git (the server builds from
// a git clone) and not left out of the image by .dockerignore. Photos were once excluded by .dockerignore and
// ignored by git while content.js still used them, so 30 images were 404 on the live site. Photos now live on
// the server (media:<id>) or on Drive; every media:<id> in content.js needs its alt text in contentMedia.
// Run: node test/assets-test.cjs          (no dependencies)
//      node test/assets-test.cjs --list   print the referenced paths (test/container-test.sh fetches each one)
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// Files that name images: the content, the page code, every page, the styles, the manifest and service worker.
const sources = [
  "js/content.js", "js/components.js", "manifest.webmanifest", "sw.js",
  ...fs.readdirSync(root).filter((f) => f.endsWith(".html")),
  ...fs.readdirSync(path.join(root, "portal")).filter((f) => f.endsWith(".html")).map((f) => `portal/${f}`),
  ...fs.readdirSync(path.join(root, "css")).filter((f) => f.endsWith(".css")).map((f) => `css/${f}`),
].filter((f) => fs.existsSync(path.join(root, f)));

// A local image path: in quotes or url(), relative or from the site root, not built at run time.
const IMAGE = /["'(]\/?((?:[\w-]+\/)*[\w.-]+\.(?:webp|jpe?g|png|gif|svg|avif|ico))["')?#]/gi;
const SKIP = /^(?:media|img\/drive|content)\//;       // the editor's volumes and the image build's Drive copies
function referenced() {
  const found = new Map();                             // path -> first file that names it
  for (const f of sources) {
    const text = read(f);
    for (const m of text.matchAll(IMAGE)) {
      const p = m[1];
      if (/download:\s*$/.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;   // a file name to save as, not a path
      if (SKIP.test(p) || p.includes("${") || /^(?:https?:)?\/\//.test(p)) continue;
      if (!found.has(p)) found.set(p, f);
    }
  }
  return found;
}

// .dockerignore as Docker reads it: the last pattern that matches wins, "!" puts a path back, a pattern that
// matches a folder excludes everything in it, "**" spans folders.
function dockerIgnored(file) {
  const rules = read(".dockerignore").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const toRe = (glob) => new RegExp(`^${glob.replace(/^\/+|\/+$/g, "").split("/").map((part) => (part === "**" ? ".*" :
    part.replace(/[.+^$()|[\]{}\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))).join("/").replace(/\.\*\//g, "(?:.*/)?")}$`);
  const parts = file.split("/");
  const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  let ignored = false;
  for (const rule of rules) {
    const neg = rule.startsWith("!");
    const re = toRe(neg ? rule.slice(1) : rule);
    if (prefixes.some((p) => re.test(p))) ignored = !neg;
  }
  return ignored;
}

const refs = referenced();
if (process.argv.includes("--list")) {
  console.log([...refs.keys()].join("\n"));
  process.exit(0);
}

const tracked = new Set(execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n"));
let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name}`); }
}

// The test's own rules, so a broken matcher cannot pass everything.
check(".dockerignore matcher: excludes a JPEG in assets", dockerIgnored("assets/brand/x.jpg"));
check(".dockerignore matcher: excludes everything under img/", dockerIgnored("img/drive/a.webp"));
check(".dockerignore matcher: keeps an SVG in assets", !dockerIgnored("assets/placeholder-robot.svg"));
check("the scan finds the site's images", refs.size >= 5);

// Uploads on the server: each one content.js uses has its alt text and widths in contentMedia.
{
  const vm = require("vm");
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read("js/content.js"), ctx);
  const sections = JSON.parse(vm.runInContext("JSON.stringify(contentSections)", ctx));
  const media = JSON.parse(vm.runInContext('typeof contentMedia === "object" ? JSON.stringify(contentMedia) : "{}"', ctx));
  const ids = new Set((JSON.stringify(sections).match(/"media:[a-f0-9]{20}"/g) || []).map((s) => s.slice(7, -1)));
  for (const id of ids) check(`media:${id} has alt text in contentMedia`, media[id] && typeof media[id].alt === "string" && media[id].alt.length > 0);
  for (const id of Object.keys(media)) check(`contentMedia ${id} is used by the content`, ids.has(id));
}

for (const [p, from] of refs) {
  check(`${p} (named in ${from}) exists`, fs.existsSync(path.join(root, p)));
  check(`${p} (named in ${from}) is tracked by git, so the server's clone has it`, tracked.has(p));
  check(`${p} (named in ${from}) is not left out by .dockerignore`, !dockerIgnored(p));
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `ALL PASSED (${passed}, ${refs.size} images)`);
process.exit(failed ? 1 : 0);
