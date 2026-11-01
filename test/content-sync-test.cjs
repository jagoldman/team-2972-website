// Tests for scripts/content-sync/sync.cjs: copying the editor's published content back into the repo.
// Run: node test/content-sync-test.cjs     (no dependencies, no network: a local server plays the live site)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const http = require("http");
const { execFileSync, execFile } = require("child_process");

const root = path.join(__dirname, "..");
const SCRIPT = path.join(root, "scripts", "content-sync", "sync.cjs");
const S = require(SCRIPT);
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const FIXTURE = JSON.parse(read("test/fixtures/content/content.json"));   // fake people, a few hostile values

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Key order is free: the site reads keys by name, and a patched object keeps the file's order.
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v));
const equal = (a, b) => canon(a) === canon(b);
const clone = (v) => JSON.parse(JSON.stringify(v));

// The sections (and contentMedia) a content.js gives, evaluated the way the site does.
function evaluate(src) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return {
    sections: JSON.parse(vm.runInContext("JSON.stringify(contentSections)", ctx)),
    media: JSON.parse(vm.runInContext('typeof contentMedia === "object" ? JSON.stringify(contentMedia) : "null"', ctx)),
  };
}
const DEFAULTS = evaluate(read("js/content.js")).sections;

// A small fake WebP (RIFF header, then padding).
const webp = (n = 64) => { const b = Buffer.alloc(n, 1); b.write("RIFF", 0, "latin1"); b.writeUInt32LE(n - 8, 4); b.write("WEBPVP8L", 8, "latin1"); return b; };

// The "live site": state.content is the body of /content/content.json (null: 404); state.media maps file names to bytes.
const state = { content: null, media: {}, hits: [] };
const server = http.createServer((req, res) => {
  state.hits.push(req.url);
  if (state.redirect) { res.writeHead(302, { location: "https://example.com/" }); return res.end(); }
  if (req.url === "/content/content.json" && state.content !== null) { res.writeHead(200, { "content-type": "application/json" }); return res.end(state.content); }
  const m = req.url.match(/^\/media\/([\w-]+\.webp)$/);
  if (m && state.media[m[1]]) { res.writeHead(200, { "content-type": "image/webp" }); return res.end(state.media[m[1]]); }
  res.writeHead(404); res.end();
});

// A fresh landing "checkout" (just what the script reads) in a temp folder.
function checkout() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "content-sync-test-"));
  fs.mkdirSync(path.join(dir, "js"));
  fs.copyFileSync(path.join(root, "js/content.js"), path.join(dir, "js/content.js"));
  fs.copyFileSync(path.join(root, "js/content-loader.js"), path.join(dir, "js/content-loader.js"));
  return dir;
}
// Every stored width of every upload in an envelope, as the site would serve them.
function serveMediaFor(doc) {
  state.media = {};
  Object.keys(doc.media || {}).forEach((id) => (doc.media[id].widths || []).forEach((w) => { state.media[`${id}-${w}.webp`] = webp(); }));
}
// An envelope from the current defaults with `edit` applied to its content.
function envelope(edit, media = {}) {
  const content = clone(DEFAULTS);
  edit(content);
  return { format: 1, version: 3, publishedAt: "2026-10-31T12:00:00.000Z", content, media };
}

async function refused(name, fn, pattern) {
  try { await fn(); check(name, false, "was not refused"); }
  catch (e) { check(name, e instanceof S.SyncError && pattern.test(e.message), e.message); }
}

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const site = `http://127.0.0.1:${server.address().port}`;

  // ---------- nothing published ----------
  {
    const dir = checkout();
    state.content = null;
    const r = await S.syncInto(dir, { site });
    check("a 404 means nothing is published yet", r.published === false);
    check("nothing published: content.js untouched", read("js/content.js") === fs.readFileSync(path.join(dir, "js/content.js"), "utf8"));
  }

  // ---------- refusals: the file must be what the loader would use, and more ----------
  {
    const dir = checkout();
    const before = fs.readFileSync(path.join(dir, "js/content.js"), "utf8");
    const tryWith = (text) => { state.content = text; return S.syncInto(dir, { site }); };
    await refused("not JSON is refused", () => tryWith("{ half"), /not JSON/);
    await refused("format 2 is refused", () => tryWith(JSON.stringify({ format: 2, content: {} })), /format 2/);
    await refused("a flat file (not the envelope) is refused", () => tryWith(JSON.stringify(DEFAULTS)), /format/);
    await refused("a section of the wrong type is refused", () => tryWith(JSON.stringify(envelope((c) => { c.ROBOTS = { not: "a list" }; }))), /loader/);
    await refused("a draft (preview) document is refused", () => tryWith(JSON.stringify({ ...envelope(() => {}), draft: true, rev: 4 })), /draft/);
    await refused("a file over 2 MB is refused", () => tryWith(JSON.stringify(envelope((c) => { c.SITE.mission = "x".repeat(2.1 * 1024 * 1024); }))), /larger/);
    await refused("http to a real host is refused", () => S.syncInto(dir, { site: "http://example.com" }), /https/);
    state.redirect = true;
    await refused("a redirect is not followed", () => S.syncInto(dir, { site }), /redirects \(302\)/);
    state.redirect = false;
    check("refusals leave content.js as it was", fs.readFileSync(path.join(dir, "js/content.js"), "utf8") === before);
  }

  // ---------- one section changed: only its block is rewritten ----------
  {
    const dir = checkout();
    const doc = envelope((c) => { c.VALUES[0].text = "Changed in the editor."; });
    state.content = JSON.stringify(doc);
    const r = await S.syncInto(dir, { site });
    const after = fs.readFileSync(path.join(dir, "js/content.js"), "utf8");
    const before = read("js/content.js");
    check("one change: reported as VALUES only", same(r.changed.map((c) => c.name), ["VALUES"]) && r.changes, JSON.stringify(r.changed));
    check("one change: described by item", /changed: \[0\]/.test(r.changed[0].detail), r.changed[0].detail);
    const cut = (s) => s.replace(/^const VALUES = [\s\S]*?^\];/m, "<VALUES>");
    check("one change: every other line of content.js is byte-identical (comments kept)", cut(after) === cut(before));
    check("one change: the new file evaluates to the published content", equal(evaluate(after).sections, doc.content));
    check("one change: no images, no contentMedia change", r.added.length === 0 && r.removed.length === 0 && !r.mediaChanged);

    const again = await S.syncInto(dir, { site });
    check("a second run finds no changes", again.published && !again.changes && again.changed.length === 0);
    check("a second run leaves the file alone", fs.readFileSync(path.join(dir, "js/content.js"), "utf8") === after);
  }

  // ---------- patching keeps comments around what did not change ----------
  {
    const before = read("js/content.js");
    const comments = (src) => src.split("\n").map((l) => (l.match(/(?:^|\s)\/\/\s.*$/) || [""])[0]).filter(Boolean);
    const run = async (name, edit) => {
      const dir = checkout();
      const doc = envelope(edit);
      state.content = JSON.stringify(doc);
      await S.syncInto(dir, { site });
      const after = fs.readFileSync(path.join(dir, "js/content.js"), "utf8");
      check(`${name}: evaluates to the published content`, equal(evaluate(after).sections, doc.content));
      return after;
    };
    const changedLines = (a, b) => { const x = a.split("\n"); const y = b.split("\n"); return x.length === y.length ? x.filter((l, i) => l !== y[i]).length : -1; };

    let after = await run("one robot field", (c) => { c.ROBOTS[0].tagline = "Edited tagline."; });
    check("one robot field: exactly one line changes", changedLines(before, after) === 1, String(changedLines(before, after)));

    after = await run("a robot added at the top", (c) => { c.ROBOTS.unshift({ year: "2027", game: "Future Game", name: "", status: "Building" }); });
    check("a robot added at the top: every comment is kept", same(comments(after), comments(before)));
    check("a robot added at the top: written in the file's style", after.includes('const ROBOTS = [\n  { year: "2027", game: "Future Game", name: "", status: "Building" },\n  {'));

    after = await run("a robot removed", (c) => { c.ROBOTS.splice(1, 1); });
    check("a robot removed: the other robots' comments are kept", comments(after).filter((l) => !comments(before).includes(l)).length === 0 && comments(before).length - comments(after).length <= 2);

    // (A top-level SITE key cannot be removed: the loader merges SITE over the built-ins. A nested one can.)
    after = await run("a key added and one removed", (c) => { c.SITE.newKey = "New"; delete c.ROBOTS[0].stats; });
    check("a key added and one removed: comments are kept", after.includes("// keeps the people, trims the banners") && after.includes('  newKey: "New",\n};') && same(comments(after), comments(before)));

    after = await run("a referenced value changed", (c) => { c.SITE.onshapePublic = "https://example.com/new-onshape"; });
    check("a referenced value changed: content that used SITE.onshapePublic keeps the old URL", !/url: SITE\.onshapePublic/.test(after) && evaluate(after).sections.RESOURCE_LINKS.some((g) => g.items.some((i) => i.url === DEFAULTS.SITE.onshapePublic)));

    after = await run("hostile text in a field", (c) => { c.SITE.mission = "`; process.exit(1); `${SITE.email}\nline two"; c.VALUES[0].text = "\"; alert(1); //"; });
    check("hostile text in a field: stays one string", evaluate(after).sections.SITE.mission.startsWith("`; process.exit(1);"));
  }

  // ---------- the fixture envelope: every section, uploads, hostile text ----------
  {
    const dir = checkout();
    state.content = JSON.stringify(FIXTURE);
    serveMediaFor(FIXTURE);
    state.hits = [];
    const r = await S.syncInto(dir, { site });
    const after = fs.readFileSync(path.join(dir, "js/content.js"), "utf8");
    const got = evaluate(after);
    const expected = clone(DEFAULTS);
    Object.keys(FIXTURE.content).forEach((n) => {
      expected[n] = DEFAULTS[n] && !Array.isArray(DEFAULTS[n]) && typeof DEFAULTS[n] === "object" ? { ...DEFAULTS[n], ...FIXTURE.content[n] } : FIXTURE.content[n];
    });
    check("fixture: content.js evaluates to the published sections laid over the built-ins", equal(got.sections, expected));
    check("fixture: hostile text is kept as plain data", got.sections.HISTORY.milestones[0].items[1].text.includes("<b>html</b>") && got.sections.HISTORY.milestones[0].items[1].text.includes("javascript:alert(1)"));
    check("fixture: the rewritten file still parses as a script", (() => { try { new vm.Script(after); return true; } catch (e) { return false; } })());

    const referenced = [...new Set(JSON.stringify(FIXTURE.content).match(/media:[a-f0-9]{20}/g).map((s) => s.slice(6)))].sort();
    check("fixture: contentMedia holds exactly the referenced uploads", same(Object.keys(got.media), referenced), Object.keys(got.media).join(","));
    check("fixture: contentMedia keeps alt text and widths", got.media["00000000000000000004"].alt === "Pat Example smiling" && same(got.media["00000000000000000006"].widths, [400, 800]));

    const files = fs.readdirSync(path.join(dir, "media")).sort();
    const want = referenced.flatMap((id) => FIXTURE.media[id].widths.map((w) => `${id}-${w}.webp`)).sort();
    check("fixture: every stored width of every referenced upload is in media/", same(files, want), files.join(","));
    check("fixture: no width the editor did not store is asked for", !state.hits.includes("/media/00000000000000000006-1600.webp"));
    check("fixture: unreferenced uploads are not downloaded", !files.some((f) => f.startsWith("0000000000000000000b")));
    check("fixture: the PR body lists sections and images", (() => {
      const body = S.prBody(r, site);
      return body.includes("`HISTORY`") && body.includes("added `00000000000000000004-400.webp`") && body.includes("version: **7**");
    })());

    // The loader now gives the built-in content its alt text when nothing is published.
    const ctx = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, JSON, Promise, module: { exports: {} } };
    ctx.window = ctx;
    ctx.document = { readyState: "complete", addEventListener() {}, documentElement: { classList: { add() {} } } };
    vm.createContext(ctx);
    vm.runInContext(after, ctx);
    vm.runInContext(read("js/content-loader.js"), ctx);
    check("loader: built-in uploads have their alt text", vm.runInContext('CONTENT_MEDIA["00000000000000000004"].alt', ctx) === "Pat Example smiling");
    ctx.module.exports.restoreDefaults();
    check("loader: restoreDefaults keeps the built-in alt text", vm.runInContext('CONTENT_MEDIA["00000000000000000005"].alt', ctx) === "The fixture robot on the field");

    // Back to content with no uploads: the image files and contentMedia go.
    state.content = JSON.stringify(envelope(() => {}));
    const back = await S.syncInto(dir, { site });
    check("uploads nothing refers to any more are removed", fs.readdirSync(path.join(dir, "media")).length === 0 && back.removed.length === want.length);
    check("contentMedia is emptied again", same(evaluate(fs.readFileSync(path.join(dir, "js/content.js"), "utf8")).media, {}));
  }

  // ---------- image checks (nothing is written when one fails) ----------
  {
    const doc = envelope((c) => { c.SITE.heroImage = "media:0123456789abcdef0123"; }, { "0123456789abcdef0123": { alt: "Hero", width: 3000, height: 2000, widths: [400, 800, 1600] } });
    state.content = JSON.stringify(doc);
    const tryMedia = async (name, media, pattern) => {
      const dir = checkout();
      state.media = media;
      await refused(name, () => S.syncInto(dir, { site }), pattern);
      check(`${name}: nothing written`, !fs.existsSync(path.join(dir, "media")) && fs.readFileSync(path.join(dir, "js/content.js"), "utf8") === read("js/content.js"));
    };
    const ok = { "0123456789abcdef0123-400.webp": webp(), "0123456789abcdef0123-800.webp": webp(), "0123456789abcdef0123-1600.webp": webp() };
    await tryMedia("a missing image is refused", { ...ok, "0123456789abcdef0123-1600.webp": undefined }, /returned 404/);
    await tryMedia("an image over the size limit is refused", { ...ok, "0123456789abcdef0123-800.webp": webp(S.MAX_IMAGE_BYTES + 1) }, /larger/);
    await tryMedia("a file that is not WebP is refused", { ...ok, "0123456789abcdef0123-400.webp": Buffer.from("<html>not an image</html>") }, /not a WebP/);

    const dir = checkout();
    state.media = ok;
    const r = await S.syncInto(dir, { site });
    check("a new hero upload: SITE changed, 3 files added", same(r.changed.map((c) => c.name), ["SITE"]) && r.added.length === 3 && r.mediaChanged);
    check("a new hero upload: other SITE comments are lost only inside SITE", fs.readFileSync(path.join(dir, "js/content.js"), "utf8").includes("// Upcoming competitions"));
  }

  // ---------- literal(): strings can never become code ----------
  {
    const tricky = ["a`b", "${SITE.email}", "line one\nline two `x` ${y} \\n", "back\\slash", "say \"hi\"", "it's \"so\"", "cr\r\nlf", " sep"];
    const src = `const X = ${S.literal(tricky, "", true)};\nX;`;
    check("literal: tricky strings round-trip exactly", same(vm.runInNewContext(src), tricky), src);
    check("literal: unsafe keys are quoted", S.literal({ "a-b": 1, ok: 2 }, "", true).includes('"a-b": 1'));
    const at = S.findConst("const A = { s: `x ${ {a: 1}.a } }` }; // ; \nconst B = 2;", "A");
    check("findConst: skips template literals and nested braces", at && at.end === "const A = { s: `x ${ {a: 1}.a } }` };".length);
  }

  // ---------- the command line, with git (no push, no PR) ----------
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "content-sync-git-"));
    const origin = path.join(tmp, "origin.git");
    const work = path.join(tmp, "work");
    const g = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    g(tmp, "init", "--quiet", "--bare", "--initial-branch=main", origin);
    g(tmp, "clone", "--quiet", origin, work);
    g(work, "config", "user.email", "test@example.com");
    g(work, "config", "user.name", "Test");
    fs.mkdirSync(path.join(work, "js"));
    fs.mkdirSync(path.join(work, "scripts", "content-sync"), { recursive: true });
    ["js/content.js", "js/content-loader.js", ".gitignore", "scripts/content-sync/sync.cjs"].forEach((f) => fs.copyFileSync(path.join(root, f), path.join(work, f)));
    g(work, "add", "-A");
    g(work, "commit", "--quiet", "-m", "seed");
    g(work, "push", "--quiet", "origin", "main");
    // Run asynchronously: this process is also the "live site" the script reads from.
    const cli = (...args) => new Promise((resolve, reject) => {
      execFile(process.execPath, [path.join(work, "scripts/content-sync/sync.cjs"), "--site", site, "--no-gitleaks", ...args], { cwd: work, encoding: "utf8" },
        (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve(stdout)));
    });

    state.content = null;
    check("cli: nothing published", /Nothing published yet/.test(await cli("--dry-run")));

    const doc = envelope((c) => { c.SITE.heroImage = "media:0123456789abcdef0123"; c.VALUES.push({ name: "Curiosity", text: "Ask why." }); }, { "0123456789abcdef0123": { alt: "Hero", width: 3000, height: 2000, widths: [400, 800, 1600] } });
    state.content = JSON.stringify(doc);
    serveMediaFor(doc);
    const dry = await cli("--dry-run");
    check("cli: dry run shows the diff and the PR body", dry.includes('+  { name: "Curiosity", text: "Ask why." },') && dry.includes("media/0123456789abcdef0123-400.webp") && dry.includes("### Changed sections"), dry);
    check("cli: dry run leaves no branch and no worktree", !g(work, "branch", "--list", "content-sync/*") && g(work, "worktree", "list").split("\n").length === 1);

    const out = await cli("--no-push");
    const branch = g(work, "branch", "--list", "content-sync/*").replace(/^[*+ ]+/, "");
    check("cli: --no-push commits on a content-sync branch", /^content-sync\/\d{4}-\d{2}-\d{2}$/.test(branch) && out.includes(branch), out);
    check("cli: the commit has content.js and the three images", (() => {
      const files = g(work, "show", "--name-only", "--format=", branch).split("\n").sort();
      return same(files, ["js/content.js", "media/0123456789abcdef0123-1600.webp", "media/0123456789abcdef0123-400.webp", "media/0123456789abcdef0123-800.webp"]);
    })());
    check("cli: your checkout stays on main and clean", g(work, "rev-parse", "--abbrev-ref", "HEAD") === "main" && g(work, "status", "--porcelain") === "");
    check("cli: nothing was pushed", g(origin, "branch", "--list").trim() === "main" || g(origin, "branch", "--list").trim() === "* main");
    check("cli: a second run picks the next branch name", /content-sync\/\d{4}-\d{2}-\d{2}-2/.test(await cli("--no-push")));

    fs.rmSync(tmp, { recursive: true, force: true });
  }

  server.close();
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL PASSED (${passed})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
