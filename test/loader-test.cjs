// Unit tests for js/content-loader.js and the safe-rendering helpers in js/components.js.
// Run: node test/loader-test.cjs     (no dependencies, no browser)
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const FIXTURE = read("test/fixtures/content/content.json");               // the editor's envelope
const FIXTURE_FLAT = JSON.stringify(JSON.parse(FIXTURE).content);            // just the sections

let passed = 0;
let failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail ? `: ${detail}` : ""}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// A fresh "browser" with content.js and the loader loaded. `fetchImpl` stands in for fetch().
// DOM stays "loading" unless ready:true, so components.js can be loaded without building a page.
function makeEnv({ fetchImpl, ready = true, timeoutMs = 60, withComponents = false } = {}) {
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, AbortController, JSON, Promise,
    fetch: fetchImpl,
    CONTENT_TIMEOUT_MS: timeoutMs,
    location: { search: "", protocol: "http:", host: "localhost" },
    scrollY: 0,
    module: { exports: {} },
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.matchMedia = () => ({ matches: false });
  const added = [];
  ctx.document = {
    readyState: ready ? "complete" : "loading",
    addEventListener: (ev, fn) => added.push([ev, fn]),
    documentElement: { classList: { add() {} } },
    body: { hasAttribute: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => ({ set innerHTML(v) {}, setAttribute() {}, classList: { toggle() {}, add() {} } }),
  };
  vm.createContext(ctx);
  vm.runInContext(read("js/content.js"), ctx, { filename: "content.js" });
  vm.runInContext(read("js/content-loader.js"), ctx, { filename: "content-loader.js" });
  if (withComponents) vm.runInContext(read("js/components.js"), ctx, { filename: "components.js" });
  return ctx;
}
const ok200 = (text) => async () => ({ ok: true, status: 200, text: async () => text });
const run = (ctx, expr) => vm.runInContext(expr, ctx);

(async () => {
  // ---------- useContent: validation and in-place update ----------
  {
    const env = makeEnv({ fetchImpl: async () => { throw new Error("offline"); } });
    const L = env.module.exports;
    const defaults = run(env, "JSON.stringify(contentSections)");
    const siteRef = run(env, "SITE");
    const robotsRef = run(env, "ROBOTS");

    check("valid document is accepted", L.useContent(JSON.stringify({ SITE: { mission: "New mission" } })) === true);
    check("published value replaces the default", run(env, "SITE.mission") === "New mission");
    check("keys the file leaves out keep their built-in value", run(env, "SITE.teamName") === "Gears & Buccaneers");
    check("the object is updated in place (same reference)", run(env, "SITE") === siteRef);

    L.restoreDefaults();
    check("restoreDefaults puts the built-ins back", run(env, "JSON.stringify(contentSections)") === defaults);

    check("arrays are replaced wholesale", L.useContent(JSON.stringify({ ROBOTS: [{ year: "2099", game: "Test" }] })) && run(env, "ROBOTS.length") === 1);
    check("the array is updated in place (same reference)", run(env, "ROBOTS") === robotsRef);
    L.restoreDefaults();

    // Documents that must be rejected, leaving the content exactly as it was
    const before = run(env, "JSON.stringify(contentSections)");
    const bad = {
      "not JSON": "this is not json",
      "empty": "",
      "half-written JSON": '{"SITE": {"mission": "cut off',
      "a list": "[1,2,3]",
      "null": "null",
      "no known section": '{"FOO": 1}',
      "empty object": "{}",
      "section of the wrong type (object for list)": '{"ROBOTS": {"year": "2020"}}',
      "section of the wrong type (list for object)": '{"SITE": []}',
      "section of the wrong type (string)": '{"SITE": "text"}',
    };
    for (const [name, text] of Object.entries(bad)) {
      const accepted = L.useContent(text);
      check(`rejects ${name}`, accepted === false && run(env, "JSON.stringify(contentSections)") === before);
    }
    check("rejects a document over the size limit", L.useContent('{"SITE":{"mission":"' + "x".repeat(2.1 * 1024 * 1024) + '"}}') === false);
    check("one bad section rejects the whole document", L.useContent('{"SITE":{"mission":"Partial"},"ROBOTS":"oops"}') === false && run(env, "SITE.mission") !== "Partial");

    // Prototype pollution through keys in the file
    L.useContent('{"SITE":{"__proto__":{"polluted":"yes"},"constructor":{"x":1},"mission":"Safe"}}');
    check("__proto__ keys do not pollute Object", run(env, "({}).polluted") === undefined && run(env, "SITE.polluted") === undefined);
    check("other values in that document still apply", run(env, "SITE.mission") === "Safe");
    L.restoreDefaults();

    // The fixture (all sections, fake data) is a valid document
    check("the fixture document is accepted", L.useContent(FIXTURE) === true);
    check("the fixture's values are live", run(env, "SITE.teamName") === "Fixture Robotics" && run(env, "HISTORY.today.heading") === "Fixture today");
    check("contentGet resolves paths", run(env, 'contentGet("HISTORY.milestones[0].image")') === "media:00000000000000000004" && run(env, 'contentGet("ROBOTS[0].gallery[1]")') === "media:00000000000000000007");
    check("a string section (a URL) is updated and read with contentGet", run(env, 'contentGet("TEAM_CALENDAR_URL")') === "https://example.com/calendar" && run(env, 'contentGet("SPONSOR_PACKET_URL")') === "https://example.com/packet.pdf");
    check("media metadata from the envelope is available", run(env, "Object.keys(CONTENT_MEDIA).length") === 10 && run(env, 'CONTENT_MEDIA["00000000000000000004"].alt') === "Pat Example smiling");
    L.restoreDefaults();
    check("restoreDefaults also clears the media metadata", run(env, "Object.keys(CONTENT_MEDIA).length") === 0 && run(env, 'contentGet("TEAM_CALENDAR_URL")').startsWith("https://calendar.google.com"));

    // The two accepted shapes, and shapes that must be refused
    check("the sections alone (no envelope) are accepted too", L.useContent(FIXTURE_FLAT) === true && run(env, "SITE.teamName") === "Fixture Robotics");
    check("a flat document has no media metadata", run(env, "Object.keys(CONTENT_MEDIA).length") === 0);
    L.restoreDefaults();
    const env1 = JSON.parse(FIXTURE);
    check("an envelope of an unknown format is refused", L.useContent(JSON.stringify({ ...env1, format: 2 })) === false);
    check("an envelope without content is refused", L.useContent(JSON.stringify({ format: 1, version: 1, publishedAt: "x", media: {} })) === false);
    check("an envelope whose content is a list is refused", L.useContent(JSON.stringify({ ...env1, content: [] })) === false);
    check("the editor's draft marker fields are ignored", L.useContent(JSON.stringify({ ...env1, draft: true, rev: 3 })) === true);
    L.restoreDefaults();
    check("a string section of the wrong type is refused", L.useContent(JSON.stringify({ format: 1, content: { TEAM_CALENDAR_URL: { a: 1 } } })) === false);

    // Media metadata is checked: only real ids, known widths, bounded alt text
    L.useContent(JSON.stringify({ format: 1, content: { SITE: { mission: "M" } }, media: {
      "00000000000000000001": { alt: "Good", widths: [400, 123, 1600] },
      "not-an-id": { alt: "Bad id", widths: [400] },
      "00000000000000000002": { alt: 42, widths: "nope" },
      "00000000000000000003": { alt: "x".repeat(900), widths: [800] },
    } }));
    check("media: a bad id is dropped", run(env, 'Object.keys(CONTENT_MEDIA).sort().join(",")') === "00000000000000000001,00000000000000000002,00000000000000000003");
    check("media: unknown widths are dropped", run(env, 'CONTENT_MEDIA["00000000000000000001"].widths.join(",")') === "400,1600");
    check("media: a non-string alt becomes empty and bad widths become none", run(env, 'CONTENT_MEDIA["00000000000000000002"].alt') === "" && run(env, 'CONTENT_MEDIA["00000000000000000002"].widths.length') === 0);
    check("media: alt text is capped", run(env, 'CONTENT_MEDIA["00000000000000000003"].alt.length') === 500);
    L.restoreDefaults();
    check("contentGet returns undefined for a bad path", run(env, 'contentGet("NOPE.x")') === undefined && run(env, 'contentGet("ROBOTS[99].name")') === undefined && run(env, 'contentGet("SITE.__proto__")') === undefined);
  }

  // ---------- load flow: when does the page get which content ----------
  async function load(fetchImpl, opts = {}) {
    const env = makeEnv({ fetchImpl, ...opts });
    const renders = [];
    run(env, "onContent(() => { renders.push(SITE.mission); })".replace("renders", "RENDERS"));
    env.RENDERS = env.RENDERS || [];
    await env.CONTENT_LOADED;
    await tick(5);
    return env;
  }
  const DEFAULT_MISSION = "To build a confident and capable next generation through competitive robotics.";
  {
    let env = makeEnv({ fetchImpl: ok200(JSON.stringify({ SITE: { mission: "Published mission" } })) });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("published content is used when present", run(env, "SEEN[0]") === "Published mission" && env.CONTENT_SOURCE === "published");

    env = makeEnv({ fetchImpl: async () => ({ ok: false, status: 404, text: async () => "Not found" }) });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("404 uses the built-in content", run(env, "SEEN[0]") === DEFAULT_MISSION && env.CONTENT_SOURCE === "default");

    env = makeEnv({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); } });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("a network error uses the built-in content", run(env, "SEEN[0]") === DEFAULT_MISSION);

    env = makeEnv({ fetchImpl: ok200("{ broken") });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("invalid JSON uses the built-in content", run(env, "SEEN[0]") === DEFAULT_MISSION);

    env = makeEnv({ fetchImpl: () => new Promise(() => {}), timeoutMs: 40 });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    const t0 = Date.now();
    await env.CONTENT_LOADED; await tick(5);
    check("a response that never arrives is abandoned after the timeout", run(env, "SEEN[0]") === DEFAULT_MISSION && Date.now() - t0 < 1000);

    env = makeEnv({ fetchImpl: async () => ({ ok: true, status: 200, text: () => new Promise(() => {}) }), timeoutMs: 40 });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("a body that never finishes is abandoned too", run(env, "SEEN[0]") === DEFAULT_MISSION);

    // A render function registered after the load runs straight away
    env = makeEnv({ fetchImpl: ok200(JSON.stringify({ SITE: { mission: "Late" } })) });
    await env.CONTENT_LOADED; await tick(5);
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    check("onContent after the load runs immediately", run(env, "SEEN[0]") === "Late");

    // Waits for the DOM as well as the content
    env = makeEnv({ fetchImpl: ok200(JSON.stringify({ SITE: { mission: "Wait" } })), ready: false });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("nothing renders before the DOM is ready", run(env, "SEEN.length") === 0);

    // A published value the page cannot render must not blank the site
    env = makeEnv({ fetchImpl: ok200(JSON.stringify({ ROBOTS: [{ year: "2099", game: "Test" }] })) });
    run(env, `var SEEN = []; onContent(() => { if (ROBOTS.length < 5) throw new Error("page cannot render this"); SEEN.push("rendered " + ROBOTS.length); });`);
    await env.CONTENT_LOADED; await tick(5);
    check("a render error falls back to the built-in content and renders again", run(env, "SEEN[0]").startsWith("rendered") && env.CONTENT_FALLBACK === true);

    env = makeEnv({ fetchImpl: ok200(JSON.stringify({ SITE: { mission: "x" } })) });
    run(env, `onContent(() => { throw new Error("always broken"); });`);
    let crashed = false;
    try { await env.CONTENT_LOADED; await tick(5); } catch (e) { crashed = true; }
    check("a page that always throws does not crash the loader", !crashed);

    // The editor's live preview
    env = makeEnv({ fetchImpl: async () => { throw new Error("x"); } });
    run(env, "var SEEN = []; onContent(() => SEEN.push(SITE.mission));");
    await env.CONTENT_LOADED; await tick(5);
    check("setContent swaps content and re-renders", run(env, `setContent({ SITE: { mission: "Draft" } })`) === true && run(env, "SEEN[SEEN.length - 1]") === "Draft");
    check("setContent refuses invalid drafts and keeps the page as it was", run(env, `setContent({ SITE: [] })`) === false && run(env, "SITE.mission") === "Draft");
  }

  // ---------- safe rendering helpers (js/components.js) ----------
  {
    const env = makeEnv({ fetchImpl: async () => { throw new Error("x"); }, ready: false, withComponents: true });
    const e = (expr) => run(env, expr);

    check("esc escapes the five HTML characters", e(`esc('<a href="x">&\\'')`) === "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    check("esc turns null and undefined into empty text", e("esc(null)") === "" && e("esc(undefined)") === "");

    const urls = {
      "https://example.com/a?b=1&c=2": "https://example.com/a?b=1&c=2",
      "http://example.com": "http://example.com",
      "mailto:a@example.com": "mailto:a@example.com",
      "robot.html?year=2011": "robot.html?year=2011",
      "#cad-overview": "#cad-overview",
      "/media/x-400.webp": "/media/x-400.webp",
      "javascript:alert(1)": "",
      "JaVaScRiPt:alert(1)": "",
      "java\\tscript:alert(1)": "",
      "java\\nscript:alert(1)": "",
      " javascript:alert(1)": "",
      "data:text/html,<script>alert(1)</script>": "",
      "vbscript:x": "",
      "//evil.example.com/x": "",
      "": "",
    };
    for (const [input, want] of Object.entries(urls)) {
      check(`safeUrl(${JSON.stringify(input)})`, e(`safeUrl("${input.replace(/"/g, '\\"')}")`) === want, `got ${JSON.stringify(e(`safeUrl("${input.replace(/"/g, '\\"')}")`))}`);
    }

    // rich(): the editor's rules (editor/src/lib/content/text.ts). A link must be https:, mailto: or a page
    // on this site; anything else is shown as typed.
    const r = (s) => e(`rich(${JSON.stringify(s)})`);
    check("rich escapes HTML", r("<script>alert(1)</script>") === "&lt;script&gt;alert(1)&lt;/script&gt;");
    check("rich makes a https link open in a new tab", r("[Site](https://example.com/a?x=1&y=2)") === '<a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener">Site</a>');
    check("rich keeps a site link in the same tab", r("[Robot](robot.html?year=2011)") === '<a href="robot.html?year=2011">Robot</a>');
    check("rich allows a mailto link", r("[Mail](mailto:pat@example.com)") === '<a href="mailto:pat@example.com">Mail</a>');
    check("rich allows an in-page link", r("[Top](#cad-overview)") === '<a href="#cad-overview">Top</a>');
    for (const [name, md] of Object.entries({
      "javascript: with a call": "[click](javascript:alert(1))",
      "javascript: without parentheses": "[click](javascript:foo)",
      "JaVaScRiPt:": "[click](JaVaScRiPt:foo)",
      "data:": "[x](data:text/html;base64,AAAA)",
      "http:": "[x](http://example.com)",
      "protocol-relative": "[x](//evil.example.com/a)",
      "a path starting with /": "[x](/etc/passwd)",
      "a path with ..": "[x](../secret.html)",
      "a URL with parentheses": "[w](https://en.wikipedia.org/wiki/Robot_(film))",
    })) {
      const out = r(md);
      check(`rich does not link ${name}`, !out.includes("<a") && out.includes("[") , out);
    }
    check("rich cannot break out of the href attribute", !r('[x](https://e.com/"onmouseover="alert(1))').includes("<a"));
    check("rich supports bold and italic", r("**b** and *i*") === "<strong>b</strong> and <em>i</em>");
    check("rich supports bold and italic inside a link label", r("[**b**](https://example.com)").includes("<strong>b</strong>"));
    check("rich leaves a lone asterisk alone", r("5 * 3 = 15") === "5 * 3 = 15");
    check("rich leaves intra-word asterisks alone", r("a*b*c") === "a*b*c");
    check("rich handles empty and non-string input", r("") === "" && e("rich(undefined)") === "" && e("rich(42)") === "42");

    const m = (src, w) => e(`imgUrl(${JSON.stringify(src)}, ${w})`);
    const ID = "0123456789abcdef0123";
    check("media id resolves to the smallest stored width that fits (300 -> 400)", m(`media:${ID}`, 300) === `/media/${ID}-400.webp`);
    check("media width 400 -> 400", m(`media:${ID}`, 400) === `/media/${ID}-400.webp`);
    check("media width 401 -> 800", m(`media:${ID}`, 401) === `/media/${ID}-800.webp`);
    check("media width 600 -> 800", m(`media:${ID}`, 600) === `/media/${ID}-800.webp`);
    check("media width 800 -> 800", m(`media:${ID}`, 800) === `/media/${ID}-800.webp`);
    check("media width 1200 -> 1600", m(`media:${ID}`, 1200) === `/media/${ID}-1600.webp`);
    check("media width 2000 -> 1600 (the largest stored)", m(`media:${ID}`, 2000) === `/media/${ID}-1600.webp`);
    check("media width 200 or less -> 400 (the thumbnail is for the editor's screens only)", m(`media:${ID}`, 200) === `/media/${ID}-400.webp` && m(`media:${ID}`, 100) === `/media/${ID}-400.webp`);
    check("a media id must be 20 lowercase hex characters", m("media:abc123", 400) === "" && m("media:ABCDEF0123456789ABCD", 400) === "" && m(`media:${ID}0`, 400) === "");
    check("a media id with a path in it is not a media id", m("media:../etc/passwd", 400) === "" && m(`media:${ID}/x`, 400) === "");
    e(`window.CONTENT_MEDIA["${ID}"] = { alt: "Stored alt", widths: [400, 800] }`);
    check("only stored widths are used when the media list says which exist", m(`media:${ID}`, 1200) === `/media/${ID}-800.webp` && m(`media:${ID}`, 300) === `/media/${ID}-400.webp`);
    check("srcset lists the stored widths", e(`imgSrcset("media:${ID}")`) === `/media/${ID}-400.webp 400w, /media/${ID}-800.webp 800w`);
    check("srcset lists every width when nothing is known", e(`imgSrcset("media:ffffffffffffffffffff")`).split(",").length === 3);
    check("srcset is empty for a Drive or site image", e(`imgSrcset("assets/x.png")`) === "" && e(`imgSrcset("1AbCdEfGhIjKlMnOpQrStUv")`) === "");
    check("imgAttrs gives src, srcset and sizes for an upload", e(`imgAttrs("media:${ID}", 600)`) === ` src="/media/${ID}-800.webp" srcset="/media/${ID}-400.webp 400w, /media/${ID}-800.webp 800w" sizes="600px"`);
    check("imgAttrs gives only src for anything else", e(`imgAttrs("assets/placeholder.svg", 600)`) === ' src="assets/placeholder.svg"');
    check("altFor uses the published alt text, else the fallback", e(`altFor("media:${ID}", "Fallback")`) === "Stored alt" && e(`altFor("media:ffffffffffffffffffff", "Fallback")`) === "Fallback" && e(`altFor("assets/x.png", "Fallback")`) === "Fallback");
    check("a bare Drive ID gets the width suffix", m("1AbCdEfGhIjKlMnOpQrStUv", 400) === "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv=w400");
    check("a Drive URL has its size replaced", m("https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv=w2000", 600) === "https://lh3.googleusercontent.com/d/1AbCdEfGhIjKlMnOpQrStUv=w600");
    check("a site path (SVG placeholder) is returned unchanged", m("assets/placeholder-robot.svg", 800) === "assets/placeholder-robot.svg");
    check("a javascript: image source is refused", m("javascript:alert(1)", 400) === "");
    check("an empty image source gives an empty string", m("", 400) === "" && m(undefined, 400) === "");

    const y = (u) => e(`youtubeEmbed(${JSON.stringify(u)})`);
    check("youtubeEmbed: watch URL", y("https://www.youtube.com/watch?v=YWbxcjlY9JY") === "https://www.youtube.com/embed/YWbxcjlY9JY");
    check("youtubeEmbed: short URL with time", y("https://youtu.be/xhr9v2J8u3k?t=110") === "https://www.youtube.com/embed/xhr9v2J8u3k");
    check("youtubeEmbed: embed URL", y("https://www.youtube.com/embed/CB1DmHxDGQw") === "https://www.youtube.com/embed/CB1DmHxDGQw");
    check("youtubeEmbed: refuses other sites", y("https://evil.example.com/embed/aaaaaaaaaaa") === "" && y("https://example.com/watch?v=aaaaaaaaaaa") === "");
    check("youtubeEmbed: refuses javascript:", y("javascript:alert(1)") === "");
    check("youtubeEmbed: refuses a lookalike host", y("https://www.youtube.com.evil.example/watch?v=aaaaaaaaaaa") === "");

    check("ck builds a data-ck attribute", e(`ck("ROBOTS[2].image")`) === ' data-ck="ROBOTS[2].image"');
    check("ck can add a type", e(`ck("X.y", "rich")`) === ' data-ck="X.y" data-ck-type="rich"');
    check("ck escapes its path", e(`ck('a"b')`) === ' data-ck="a&quot;b"');
  }

  console.log(failed === 0 ? `ALL PASSED (${passed})` : `${failed} FAILED, ${passed} passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
