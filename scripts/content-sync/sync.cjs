#!/usr/bin/env node
// Content sync: copies what the site editor PUBLISHED on the live site back into this repo and opens a
// pull request, so GitHub keeps up with edits made in the editor (docs/CONTENT_EDITING.md, "Content sync").
//
// It runs on a person's computer with their own `gh` login. The server never gets a GitHub credential.
//
//   node scripts/content-sync/sync.cjs              fetch, commit on content-sync/<date>, push, open a PR
//   node scripts/content-sync/sync.cjs --dry-run    show the diff and the PR text; change nothing
//   node scripts/content-sync/sync.cjs --no-push    commit on a local content-sync/<date> branch only
//   --site <url>     read from another site (default https://2972robotics.com; http only for localhost)
//   --repo <dir>     the landing checkout to use (default: the one this script is in)
//   --no-gitleaks    skip the secret scan (tests only; GitHub runs gitleaks on the PR anyway)
//
// What it does:
// 1. Downloads <site>/content/content.json. A 404 means nothing is published yet: it says so and stops.
//    The file is checked with js/content-loader.js itself (anything the site would ignore is refused),
//    plus a few stricter rules: it must be the editor's envelope, format 1, with no draft fields.
// 2. In a temporary git worktree on origin/main (your checkout and its branch are never touched):
//    patches js/content.js to what the site shows, rewriting only the values that changed (comments around
//    them stay), writes the alt text of uploaded images into `contentMedia`, and downloads the /media/ images
//    the content refers to into media/ (and deletes ones nothing refers to any more).
// 3. No difference: prints "no changes". Otherwise scans for secrets, commits, pushes and runs
//    `gh pr create`. It never pushes to main and never merges.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const DEFAULT_SITE = "https://2972robotics.com";
const MAX_CONTENT_BYTES = 2 * 1024 * 1024;          // the loader's own limit
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;            // one image file
const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;     // all images downloaded in one run
const MEDIA_WIDTHS = [400, 800, 1600];
const MEDIA_REF = /^media:([a-f0-9]{20})$/;
const MEDIA_FILE = /^([a-f0-9]{20})-(400|800|1600)\.webp$/;
const TIMEOUT_MS = 20000;
const GITLEAKS_IMAGE = "ghcr.io/gitleaks/gitleaks:v8.30.1"; // CONVENTIONS pins this version
const LINE = 200;                                     // longest line an inline object or list may make (the file has long ones)

class SyncError extends Error {}
const refuse = (msg) => { throw new SyncError(msg); };
const kind = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

// ---------- reading content.js and the published file ----------

// Runs content.js and the loader in a bare "browser" without fetch, like test/loader-test.cjs does.
function loaderEnv(contentJs, loaderJs) {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, JSON, Promise,
    module: { exports: {} },
  };
  ctx.window = ctx;
  ctx.document = { readyState: "complete", addEventListener() {}, documentElement: { classList: { add() {} } } };
  vm.createContext(ctx);
  vm.runInContext(contentJs, ctx, { filename: "content.js", timeout: 2000 });
  vm.runInContext(loaderJs, ctx, { filename: "content-loader.js", timeout: 2000 });
  return {
    useContent: ctx.module.exports.useContent,
    sections: () => JSON.parse(vm.runInContext("JSON.stringify(contentSections)", ctx)),
    media: () => JSON.parse(vm.runInContext('typeof contentMedia === "object" ? JSON.stringify(contentMedia) : "null"', ctx)),
  };
}

// Checks the published text and returns what the site shows from it:
// { doc, sections (every section, published laid over the built-ins), defaults, media, ignored }.
function readPublished(text, contentJs, loaderJs) {
  if (Buffer.byteLength(text) > MAX_CONTENT_BYTES) refuse(`content.json is larger than ${MAX_CONTENT_BYTES} bytes`);
  let doc;
  try { doc = JSON.parse(text); } catch (e) { refuse(`content.json is not JSON (${e.message})`); }
  if (kind(doc) !== "object") refuse("content.json is not a JSON object");
  if (doc.format !== 1) refuse(`content.json has format ${JSON.stringify(doc.format)}; this script knows format 1 (the editor's envelope)`);
  if (kind(doc.content) !== "object") refuse("content.json has no content object");
  if ("draft" in doc || "rev" in doc) refuse("content.json has draft fields (draft/rev): that is a preview, not the published file");
  if (doc.media !== undefined && kind(doc.media) !== "object") refuse("content.json has a media field that is not an object");

  const env = loaderEnv(contentJs, loaderJs);
  const defaults = env.sections();
  if (!env.useContent(text)) refuse("the site's loader (js/content-loader.js) would ignore this content.json; a section probably has the wrong type");
  const sections = env.sections();
  const ignored = Object.keys(doc.content).filter((k) => !(k in defaults));

  // Alt text and sizes of uploads, kept as the loader keeps them (valid ids, known widths, alt ≤ 500).
  const media = {};
  Object.keys(doc.media || {}).sort().forEach((id) => {
    const m = doc.media[id];
    if (!/^[a-f0-9]{20}$/.test(id) || kind(m) !== "object") return;
    const entry = { alt: typeof m.alt === "string" ? m.alt.slice(0, 500) : "" };
    if (Number.isInteger(m.width) && m.width > 0) entry.width = m.width;
    if (Number.isInteger(m.height) && m.height > 0) entry.height = m.height;
    entry.widths = Array.isArray(m.widths) ? MEDIA_WIDTHS.filter((w) => m.widths.includes(w)) : [];
    media[id] = entry;
  });
  return { doc, sections, defaults, media, ignored };
}

function mediaIds(value, out = new Set()) {
  if (typeof value === "string") {
    const m = value.trim().match(MEDIA_REF);
    if (m) out.add(m[1]);
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => mediaIds(v, out));
  }
  return out;
}

// ---------- writing content.js ----------

const IDENT = /^[A-Za-z_$][\w$]*$/;
const keyText = (k) => (IDENT.test(k) ? k : JSON.stringify(k));
const isEmpty = (v) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0);
const isLeaf = (v) => v === null || typeof v !== "object" || isEmpty(v);

// A string as a JS literal. Text with line breaks becomes a template literal, as the file writes long
// paragraphs; only \, ` and ${ are special there, and they are escaped, so the text cannot become code.
// Other control characters (a template would turn \r into \n) use a plain JSON string.
function stringText(s) {
  if (s.includes("\n") && !/[\u0000-\u0009\u000b-\u001f\u2028\u2029]/.test(s)) {
    return "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
  }
  if (s.includes('"') && !/['\\\u0000-\u001f\u2028\u2029]/.test(s)) return `'${s}'`;   // '30" W', as the file writes it
  return JSON.stringify(s);
}

// One line, if the value holds no list or object with something in it.
function inline(v) {
  if (typeof v === "string") return v.includes("\n") ? null : stringText(v);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (isEmpty(v)) return Array.isArray(v) ? "[]" : "{}";
  const parts = (Array.isArray(v) ? v : Object.values(v)).map((x) => (isLeaf(x) ? inline(x) : null));
  if (parts.includes(null)) return null;
  if (Array.isArray(v)) return `[${parts.join(", ")}]`;
  return `{ ${Object.keys(v).map((k, i) => `${keyText(k)}: ${parts[i]}`).join(", ")} }`;
}

// A JS literal in the file's style: two-space indent, trailing commas, an object of plain values on one
// line, and `{ year: "2008", items: [` when only the last value is a list.
function literal(v, indent, top) {
  if (typeof v === "string") return stringText(v);
  if (isLeaf(v)) return inline(v);
  const one = top ? null : inline(v);
  if (one !== null && indent.length + one.length + 2 <= LINE) return one;
  const inner = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => `${inner}${literal(x, inner)},`).join("\n")}\n${indent}]`;
  const keys = Object.keys(v);
  const last = v[keys[keys.length - 1]];
  if (!top && keys.length > 1 && Array.isArray(last) && !isEmpty(last) && keys.slice(0, -1).every((k) => isLeaf(v[k]) && inline(v[k]) !== null)) {
    const head = `{ ${keys.map((k, i) => `${keyText(k)}: ${i < keys.length - 1 ? inline(v[k]) : ""}`).join(", ")}`;
    if (indent.length + head.length + 1 <= LINE) return `${head}${literal(last, indent)} }`;
  }
  return `{\n${keys.map((k) => `${inner}${keyText(k)}: ${literal(v[k], inner)},`).join("\n")}\n${indent}}`;
}

// ---------- patching content.js in place ----------
// A small reader for the literals in content.js. Each list item and object property records where its
// "segment" starts (the blank lines and comments before it) and ends (its comma and a comment on the same
// line), so an edit can keep everything around the values that did not change.

// The first top-level character at or after i that is in `stops`, skipping strings, template literals,
// comments and brackets. `last` is the end of the last character that is not whitespace or a comment.
function scan(src, i, stops) {
  let depth = 0;
  let last = i;
  const templates = [];                 // bracket depth at each open ${ … } inside a template literal
  const skipString = (q) => { for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; };
  const skipTemplate = () => {          // from inside a template literal to its end, or into a ${
    for (i++; i < src.length; i++) {
      if (src[i] === "\\") i++;
      else if (src[i] === "`") return;
      else if (src[i] === "$" && src[i + 1] === "{") { i++; templates.push(depth); depth++; return; }
    }
  };
  for (; i < src.length; i++) {
    const c = src[i];
    if (depth === 0 && stops.includes(c)) return { stop: i, last };
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) i = src.length; continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 1; continue; }
    if (/\s/.test(c)) continue;
    if (c === '"' || c === "'") skipString(c);
    else if (c === "`") skipTemplate();
    else if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (templates.length && templates[templates.length - 1] === depth) { templates.pop(); skipTemplate(); }
    }
    last = i + 1;
  }
  return { stop: -1, last };
}

function skipTrivia(src, i) {
  for (;;) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src.startsWith("//", i)) { i = src.indexOf("\n", i); if (i < 0) return src.length; }
    else if (src.startsWith("/*", i)) i = src.indexOf("*/", i + 2) + 2;
    else return i;
  }
}

// After a value: its comma, and a comment on the rest of that line. Returns { end, comma }.
function segmentEnd(src, i, close) {
  const at = skipTrivia(src, i);
  if (src[at] !== ",") return { end: i, comma: false, next: at };
  let end = at + 1;
  const rest = /^[ \t]*(\/\/[^\n]*)?(?=\n)/.exec(src.slice(end));
  if (rest) end += rest[0].length;
  return { end, comma: true, next: end };
}

// { type: "array" | "object" | "other", start, end, items | props, close } for the value at i.
function parseValue(src, i) {
  const c = src[i];
  if (c === "[" || c === "{") {
    const close = c === "[" ? "]" : "}";
    const node = { type: c === "[" ? "array" : "object", start: i, entries: [] };
    let j = i + 1;
    for (;;) {
      const k = skipTrivia(src, j);
      if (src[k] === close) { node.close = j; node.end = k + 1; return node; }
      const entry = { segStart: j };
      let v = k;
      if (node.type === "object") {
        const key = /^(?:[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/.exec(src.slice(k));
        if (!key) return null;
        entry.key = key[0][0] === "'" ? key[0].slice(1, -1) : key[0][0] === '"' ? JSON.parse(key[0]) : key[0];
        v = skipTrivia(src, k + key[0].length);
        if (src[v] !== ":") return null;               // shorthand or a method: not a literal this can patch
        v = skipTrivia(src, v + 1);
      }
      entry.start = k;
      entry.node = parseValue(src, v);
      if (!entry.node) return null;
      const seg = segmentEnd(src, entry.node.end, close);
      Object.assign(entry, { segEnd: seg.end, comma: seg.comma });
      node.entries.push(entry);
      j = seg.next;
      if (!seg.comma && src[skipTrivia(src, j)] !== close) return null;
    }
  }
  const s = scan(src, i, ",]};");
  return { type: "other", start: i, end: s.last };
}

// The [start, end) of `const NAME = …;` and its value's node.
function findConst(src, name) {
  const m = new RegExp(`^const ${name}\\s*=`, "m").exec(src);
  if (!m) return null;
  const v = skipTrivia(src, m.index + m[0].length);
  const node = parseValue(src, v);
  const s = scan(src, v, ";");
  if (!node || s.stop < 0) return null;
  return { start: m.index, end: s.stop + 1, node };
}

// Order-free comparison: the site does not care in what order an object's keys come.
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const equal = (a, b) => canon(a) === canon(b);

function lineIndent(src, at) {
  const lineStart = src.lastIndexOf("\n", at - 1) + 1;
  return /^[ \t]*/.exec(src.slice(lineStart))[0];
}

// Index pairs of the longest common run of equal items (old i, new j), in order.
function lcs(a, b) {
  const ka = a.map(canon);
  const kb = b.map(canon);
  const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i][j] = ka[i] === kb[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (ka[i] === kb[j]) { pairs.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// The new text for `node` (whose value was `before`) so that it evaluates to `after`. Values that did not
// change keep their source text, comments and all; a list or object written over several lines is patched
// entry by entry; anything else is written fresh with literal().
function patch(src, node, before, after) {
  if (equal(before, after)) return src.slice(node.start, node.end);
  const indent = lineIndent(src, node.start);
  const multiline = node.type !== "other" && src.slice(node.start, node.end).includes("\n");
  const fresh = () => literal(after, indent, false);
  if (!multiline) return fresh();
  const entries = node.entries;
  const inner = entries.length ? lineIndent(src, entries[0].start) : `${indent}  `;
  const piece = (e, text) => src.slice(e.segStart, e.node.start) + text + src.slice(e.node.end, e.segEnd) + (e.comma ? "" : ",");
  const added = (text) => `\n${inner}${text},`;
  const tail = src.slice(entries.length ? entries[entries.length - 1].segEnd : node.close, node.end);
  const open = src[node.start];

  if (node.type === "array" && Array.isArray(before) && Array.isArray(after) && before.length === entries.length) {
    // Keep equal items; between them, pair changed items up in order, then add or drop the rest.
    const out = [];
    const anchors = [...lcs(before, after), [before.length, after.length]];
    let i = 0;
    let j = 0;
    for (const [ai, aj] of anchors) {
      for (; i < ai && j < aj; i++, j++) {
        const e = entries[i];
        out.push(piece(e, patch(src, e.node, before[i], after[j])));
      }
      for (; j < aj; j++) out.push(added(literal(after[j], inner)));
      i = ai;                                          // old items left between anchors are dropped
      if (ai < before.length) { out.push(piece(entries[ai], src.slice(entries[ai].start, entries[ai].node.end))); i++; j++; }
    }
    return open + out.join("") + tail;
  }
  if (node.type === "object" && kind(before) === "object" && kind(after) === "object" && entries.every((e) => e.key in before)) {
    const out = [];
    entries.forEach((e) => {
      if (!(e.key in after)) return;                   // a key the editor removed
      out.push(piece(e, patch(src, e.node, before[e.key], after[e.key])));
    });
    Object.keys(after).filter((k) => !entries.some((e) => e.key === k)).forEach((k) => out.push(added(`${keyText(k)}: ${literal(after[k], inner)}`)));
    return open + out.join("") + tail;
  }
  return fresh();
}

const MEDIA_COMMENT = `/*
  contentMedia — alt text and sizes of the images uploaded through the site editor (the
  "media:<id>" values above), so the built-in content keeps their alt text. Written by
  scripts/content-sync/sync.cjs from the published file; the image files are in media/.
  (camelCase on purpose, like contentSections: the editor imports every UPPER_SNAKE name.)
*/`;

// Sets `const NAME = …;` to `after`. With `before` (its current value), only what changed is rewritten;
// without it, the whole value is written fresh.
function setConst(src, name, after, before) {
  const at = findConst(src, name);
  if (!at) {
    if (name !== "contentMedia") refuse(`js/content.js has no "const ${name} = …;" that this script can read`);
    return `${src.replace(/\s*$/, "")}\n\n${MEDIA_COMMENT}\nconst ${name} = ${literal(after, "", true)};\n`;
  }
  const value = before === undefined ? literal(after, "", true) : patch(src, at.node, before, after);
  return src.slice(0, at.node.start) + value + src.slice(at.node.end);
}

// ---------- images ----------

async function get(url) {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "cache-control": "no-cache" } });
  if (res.status >= 300 && res.status < 400) refuse(`${url} redirects (${res.status}); refusing to follow`);
  return res;
}

async function getImage(url) {
  const res = await get(url);
  if (res.status !== 200) refuse(`${url} returned ${res.status}; the content refers to an image the site does not have`);
  if (Number(res.headers.get("content-length")) > MAX_IMAGE_BYTES) refuse(`${url} is larger than ${MAX_IMAGE_BYTES} bytes`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) refuse(`${url} is larger than ${MAX_IMAGE_BYTES} bytes`);
  if (buf.length < 12 || buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WEBP") refuse(`${url} is not a WebP image`);
  return buf;
}

// ---------- one sync into a checkout (no git) ----------

// Reads the published content and updates `dir` (a landing checkout) to match it. Everything is
// downloaded and checked before the first file is written, so a refusal leaves `dir` as it was.
// Returns { published: false } when nothing is published, else a summary for the PR.
async function syncInto(dir, { site = DEFAULT_SITE, log = () => {} } = {}) {
  const base = siteUrl(site);
  const contentPath = path.join(dir, "js", "content.js");
  const contentJs = fs.readFileSync(contentPath, "utf8");
  const loaderJs = fs.readFileSync(path.join(dir, "js", "content-loader.js"), "utf8");

  const url = `${base}/content/content.json`;
  log(`Reading ${url}`);
  const res = await get(url);
  if (res.status === 404) return { published: false };
  if (res.status !== 200) refuse(`${url} returned ${res.status}`);
  if (Number(res.headers.get("content-length")) > MAX_CONTENT_BYTES) refuse(`content.json is larger than ${MAX_CONTENT_BYTES} bytes`);
  const pub = readPublished(await res.text(), contentJs, loaderJs);

  // Sections and image metadata that differ from what content.js holds now.
  const env = loaderEnv(contentJs, loaderJs);
  const current = env.sections();
  const changed = Object.keys(current).filter((n) => !equal(current[n], pub.sections[n]));
  const ids = [...mediaIds(pub.sections)].sort();
  const media = {};
  ids.forEach((id) => { if (pub.media[id]) media[id] = pub.media[id]; });
  const mediaChanged = !equal(env.media() || {}, media);

  let next = contentJs;
  changed.forEach((n) => { next = setConst(next, n, pub.sections[n], current[n]); });
  if (mediaChanged) next = setConst(next, "contentMedia", media);

  // The file must say exactly what the site shows, or nothing is written. A kept expression such as
  // SITE.github can evaluate differently once SITE changed; such a section is written out in full instead.
  const wrong = () => { const got = loaderEnv(next, loaderJs).sections(); return Object.keys(got).filter((n) => !equal(got[n], pub.sections[n])); };
  wrong().forEach((n) => { next = setConst(next, n, pub.sections[n]); });
  const check = loaderEnv(next, loaderJs);
  if (wrong().length || !equal(check.media() || {}, media)) refuse("internal error: the rewritten js/content.js does not match the published content");

  // Images: every stored width of every referenced upload. Files are named by content id, so one already here is kept.
  const mediaDir = path.join(dir, "media");
  const want = new Set();
  ids.forEach((id) => {
    const widths = media[id] && media[id].widths.length ? media[id].widths : MEDIA_WIDTHS;
    widths.forEach((w) => want.add(`${id}-${w}.webp`));
  });
  const have = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).filter((f) => MEDIA_FILE.test(f)) : [];
  const added = [];
  let total = 0;
  for (const f of [...want].sort()) {
    if (have.includes(f)) continue;
    log(`Downloading /media/${f}`);
    const buf = await getImage(`${base}/media/${f}`);
    total += buf.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) refuse(`more than ${MAX_TOTAL_IMAGE_BYTES} bytes of new images in one run; check what was uploaded`);
    added.push({ file: f, buf });
  }
  const removed = have.filter((f) => !want.has(f)).sort();

  if (next !== contentJs) fs.writeFileSync(contentPath, next);
  if (added.length) fs.mkdirSync(mediaDir, { recursive: true });
  added.forEach(({ file, buf }) => fs.writeFileSync(path.join(mediaDir, file), buf));
  removed.forEach((f) => fs.unlinkSync(path.join(mediaDir, f)));

  return {
    published: true,
    version: pub.doc.version,
    publishedAt: pub.doc.publishedAt,
    changed: changed.map((n) => ({ name: n, detail: describe(current[n], pub.sections[n]) })),
    mediaChanged,
    added: added.map(({ file, buf }) => ({ file, bytes: buf.length })),
    removed,
    ignored: pub.ignored,
    changes: next !== contentJs || added.length > 0 || removed.length > 0,
  };
}

// A short note on what changed in a section, for the PR body.
function describe(before, after) {
  if (Array.isArray(before) && Array.isArray(after)) {
    const items = [];
    for (let i = 0; i < Math.max(before.length, after.length); i++) if (!equal(before[i], after[i])) items.push(i);
    const count = before.length === after.length ? `${after.length} items` : `${before.length} → ${after.length} items`;
    const list = items.length > 8 ? `${items.slice(0, 8).join(", ")}, …` : items.join(", ");
    return `${count}; changed: [${list}]`;
  }
  if (kind(before) === "object" && kind(after) === "object") {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !equal(before[k], after[k]));
    return `keys: ${keys.join(", ")}`;
  }
  return "value changed";
}

function siteUrl(site) {
  let u;
  try { u = new URL(site); } catch (e) { refuse(`--site ${site} is not a URL`); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) refuse("--site must be https (http only for localhost)");
  return u.origin;
}

// ---------- git, gitleaks and the PR ----------

function prBody(r, site) {
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  const lines = [
    `Content published in the site editor, copied from ${site}/content/content.json by \`scripts/content-sync/sync.cjs\`.`,
    "",
    `Published version: **${r.version}**, at ${r.publishedAt}.`,
    "",
    "### Changed sections in `js/content.js`",
    ...(r.changed.length ? r.changed.map((c) => `- \`${c.name}\`: ${c.detail}`) : ["- none"]),
  ];
  if (r.mediaChanged) lines.push("- `contentMedia` (alt text and sizes of uploaded images)");
  lines.push("", "### Images in `media/`");
  if (!r.added.length && !r.removed.length) lines.push("- no change");
  r.added.forEach((a) => lines.push(`- added \`${a.file}\` (${kb(a.bytes)})`));
  r.removed.forEach((f) => lines.push(`- removed \`${f}\` (nothing refers to it any more)`));
  if (r.ignored.length) {
    lines.push("", "### Ignored", `Sections landing does not know (the site ignores them too): ${r.ignored.map((n) => `\`${n}\``).join(", ")}. landing needs a code change before these can show.`);
  }
  lines.push(
    "",
    "### Review",
    "- [ ] The changes are ones the team meant to publish (see the editor's history).",
    "- [ ] No student names, emails or private links on public pages (CONVENTIONS §9).",
    "- [ ] New images are fine to keep in a public repo.",
    "- [ ] No comment worth keeping was lost inside a rewritten value.",
    "",
    "The live site already shows this content; merging only updates the built-in fallback in git.",
  );
  return lines.join("\n");
}

const git = (cwd, args, opts = {}) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();

function hasCommand(cmd, args) {
  try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch (e) { return false; }
}

function gitleaks(dir) {
  const args = ["dir", "--no-banner", "--redact", "--config"];
  if (hasCommand("gitleaks", ["version"])) {
    execFileSync("gitleaks", [...args, path.join(dir, ".gitleaks.toml"), dir], { stdio: "inherit" });
  } else if (hasCommand("docker", ["version"])) {
    execFileSync("docker", ["run", "--rm", "-v", `${dir}:/repo`, GITLEAKS_IMAGE, ...args, "/repo/.gitleaks.toml", "/repo"], { stdio: "inherit" });
  } else {
    refuse("gitleaks is not installed and docker is not running; install one of them (CONVENTIONS §9)");
  }
}

function freeBranch(repo, date) {
  for (let n = 1; ; n++) {
    const name = n === 1 ? `content-sync/${date}` : `content-sync/${date}-${n}`;
    const local = hasCommand("git", ["-C", repo, "rev-parse", "--verify", "--quiet", `refs/heads/${name}`]);
    const remote = git(repo, ["ls-remote", "--heads", "origin", name]) !== "";
    if (!local && !remote) return name;
  }
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main(argv) {
  const opt = { site: DEFAULT_SITE, repo: path.join(__dirname, "..", ".."), dryRun: false, push: true, scan: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opt.dryRun = true;
    else if (a === "--no-push") opt.push = false;
    else if (a === "--no-gitleaks") opt.scan = false;
    else if (a === "--site" && argv[i + 1]) opt.site = argv[++i];
    else if (a === "--repo" && argv[i + 1]) opt.repo = argv[++i];
    else refuse(`unknown argument ${a} (see the top of scripts/content-sync/sync.cjs)`);
  }
  const site = siteUrl(opt.site);
  const repo = git(opt.repo, ["rev-parse", "--show-toplevel"]);
  const log = (m) => console.log(m);
  if (!opt.dryRun && opt.push && !hasCommand("gh", ["auth", "status"])) refuse("`gh` is not installed or not signed in (run `gh auth login`)");

  log("Fetching origin/main");
  git(repo, ["fetch", "--quiet", "origin", "main"]);
  const branch = opt.dryRun ? null : freeBranch(repo, today());
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "content-sync-"));
  git(repo, ["worktree", "add", "--quiet", ...(branch ? ["-b", branch] : ["--detach"]), tmp, "origin/main"]);
  let keepBranch = false;
  try {
    const r = await syncInto(tmp, { site, log });
    if (!r.published) { log(`Nothing published yet (${site}/content/content.json is 404). No changes.`); return 0; }
    if (!r.changes) { log(`Published version ${r.version} matches origin/main. No changes.`); return 0; }

    git(tmp, ["add", "-A", "js/content.js", "media"]);
    if (r.added.length) git(tmp, ["add", "--force", "--", ...r.added.map((a) => `media/${a.file}`)]);   // even where .gitignore predates media/
    const body = prBody(r, site);
    if (opt.dryRun) {
      log("\n----- diff (dry run: nothing is committed) -----");
      log(git(tmp, ["diff", "--cached", "--stat"]));
      log(git(tmp, ["diff", "--cached", "--", "js/content.js"]));
      log("\n----- PR body -----\n" + body);
      return 0;
    }
    if (opt.scan) { log("Scanning for secrets (gitleaks)"); gitleaks(tmp); }
    const title = `Content sync: editor version ${r.version} (${r.publishedAt.slice(0, 10)})`;
    git(tmp, ["commit", "--quiet", "-m", title, "-m", `Copied from ${site}/content/content.json by scripts/content-sync/sync.cjs.\nSections: ${r.changed.map((c) => c.name).join(", ") || "none"}.`]);
    keepBranch = true;
    if (!opt.push) { log(`Committed on local branch ${branch} (not pushed). Push it and open a PR when ready.`); return 0; }

    git(repo, ["push", "--quiet", "-u", "origin", `${branch}:${branch}`], { stdio: "inherit" });
    const bodyFile = path.join(tmp, "..", `${path.basename(tmp)}-pr.md`);
    fs.writeFileSync(bodyFile, body);
    try {
      execFileSync("gh", ["pr", "create", "--base", "main", "--head", branch, "--title", title, "--body-file", bodyFile], { cwd: repo, stdio: "inherit" });
    } finally {
      fs.rmSync(bodyFile, { force: true });
    }
    return 0;
  } finally {
    git(repo, ["worktree", "remove", "--force", tmp]);
    if (branch && !keepBranch) git(repo, ["branch", "-D", branch]);
  }
}

module.exports = { syncInto, readPublished, literal, findConst, setConst, patch, prBody, SyncError, MAX_IMAGE_BYTES };

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
    console.error(err instanceof SyncError ? `content-sync: ${err.message}` : err);
    process.exit(1);
  });
}
