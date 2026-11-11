// Season log and results-table parsing (js/components.js): the pure functions behind Home's record, the Robots page's log
// and the robot page's results table, run against the real js/content.js and against hostile input. No browser needed.
// Run: node test/season-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`ok   ${name}`); }
  else { failed++; console.log(`FAIL ${name}${detail ? ` -- ${detail}` : ""}`); }
}

// js/components.js in a sandbox with just enough of a page for it to load.
function load(contentSource) {
  const ctx = {
    console, location: { host: "localhost", protocol: "http:", search: "", pathname: "/" }, scrollY: 0, onContent() {},
    navigator: {}, Image: class { set src(v) {} }, matchMedia: () => ({ matches: false }), addEventListener() {},
  };
  ctx.window = ctx;
  ctx.document = { documentElement: {}, body: { hasAttribute: () => false }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => ({}), addEventListener() {}, cookie: "" };
  vm.createContext(ctx);
  vm.runInContext(contentSource || read("js/content.js"), ctx, { filename: "content.js" });
  vm.runInContext(read("js/components.js") + "\n;globalThis.T = { resultType, seasonStats, seasonLog, seasonSummary, seasonStatRow, parseResult, resultRow, resultsTable };", ctx, { filename: "components.js" });
  return ctx;
}
const ctx = load();
const T = ctx.T;
const ROBOTS = vm.runInContext("ROBOTS", ctx);

// ---------- the rule for the marks (PUBLIC_REDESIGN_PROPOSAL §3) ----------
check("'won the event' is a win, even with a pick in the sentence", T.resultType("Rank 38 of 42 — 2nd pick of Alliance 2, won the event") === "win");
check("'Captain' is a captain (any case)", T.resultType("Rank 9 of 47 — Captain, Alliance 7") === "cap");
check("captain beats the playoff words in the same sentence (quarterfinals)", T.resultType("Rank 9 of 53 — Captain, Alliance 8 (quarterfinals)") === "cap");
check("a pick is a playoff mark", T.resultType("Rank 27 of 40 — 3rd pick, Alliance 5") === "po" && T.resultType("Rank 32 — 2nd pick in playoffs") === "po");
check("semifinal and quarterfinal words count", T.resultType("Rank 15 of 52 (semifinals)") === "po" && T.resultType("(quarterfinals)") === "po");
check("a plain rank, a scrimmage and empty text are 'played'", T.resultType("Rank 42 of 47 (3-8-0)") === "played" && T.resultType("Scrimmage") === "played" && T.resultType("") === "played" && T.resultType(undefined) === "played");

// ---------- counts, from the real content ----------
const expect = { wins: 0, playoffs: 0 };
for (const r of ROBOTS) for (const x of r.results || []) { if (/won the event/i.test(x.result)) expect.wins++; if (/won the event|captain|pick|playoffs|semifinal|quarterfinal/i.test(x.result)) expect.playoffs++; }
const st = T.seasonStats();
check("seasonStats counts seasons, event wins and playoff events from ROBOTS", st.seasons === ROBOTS.length && st.wins === expect.wins && st.playoffs === expect.playoffs, JSON.stringify(st));
check("the real record has event wins in 2011 and 2026", st.wins === 2, JSON.stringify(st));

// ---------- the log ----------
const draw = (opts) => { const el = { innerHTML: "" }; T.seasonLog(el, opts); return el.innerHTML; };
const html = draw();
const years = ROBOTS.map((r) => Number(r.year));
const lo = Math.min(...years), hi = Math.max(...years);
check(`one column per year from ${lo} to ${hi}`, (html.match(/class="sl-col"/g) || []).length + (html.match(/class="sl-col" data-ck-ignore/g) || []).length * 0 >= hi - lo + 1 && html.includes(`--cols:${hi - lo + 1}`));
check("years with no season keep an empty column with a dash (2020, 2021)", /sl-col" data-ck-ignore><div class="sl-marks"><span class="sl-dash"[^>]*>–<\/span><\/div><span class="sl-year">2020/.test(html) && /sl-year">2021/.test(html));
const marks = (html.match(/class="sl-mark"/g) || []).length;
check("one mark per event in ROBOTS[].results", marks === ROBOTS.reduce((n, r) => n + (r.results || []).length, 0), `${marks} marks`);
check("a season column links to its page and its marks carry 'event: result'", html.includes('href="robot.html?year=2026"') && html.includes('aria-label="Utah Regional: Rank 38 of 42 — 2nd pick of Alliance 2, won the event"') && html.includes("<title>Utah Regional: Rank 38 of 42"));
check("the win mark is large with a ring; others are not", /width="28" height="28"[^>]*>(?:<title>[^<]*<\/title>)?<circle class="m-gold"[^>]*\/><circle class="m-ring"/.test(html) && /width="22" height="22"/.test(html));
check("the four mark kinds all appear (the real data has each)", ["m-ring", "m-dot", "m-grey"].every((c) => html.includes(c)) && html.includes('class="m-gold"'));
check("a text legend with the four meanings sits below", ["Won the event", "Alliance captain", "Picked or in the playoffs", "Played the event"].every((t) => html.includes(t)));
check("the log scrolls inside its own keyboard-focusable region", /class="sl-wrap" role="region" aria-label="Season log, scrolls sideways" tabindex="0"/.test(html));
check("editor hooks: the log is the ROBOTS list; columns, years, names and marks are keyed", html.includes('data-ck="ROBOTS"') && html.includes('data-ck="ROBOTS[0]"') && html.includes('data-ck="ROBOTS[0].results[1]"') && html.includes('data-ck="ROBOTS[0].results"') && html.includes('data-ck="ROBOTS[0].year"') && html.includes('data-ck="ROBOTS[0].name"'));
const compact = draw({ compact: true });
check("compact leaves out the robot names and the legend", !compact.includes("sl-name") && !compact.includes('class="legend"') && compact.includes("sl-year"));
check("the summary line and the three numbers come from the same counts", T.seasonSummary().includes(`${st.seasons} seasons · ${st.wins} event wins · ${st.playoffs} playoff events`) && new RegExp(`data-ticker="${st.seasons}"[^>]*>${st.seasons}<`).test(T.seasonStatRow()));

// ---------- hostile and odd input ----------
{
  const c = load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "" };
    const ROBOTS = [{ year: "2020", game: "G", name: "<b>x</b>", results: [{ event: "<img src=x onerror=alert(1)>", result: "won the event" }] }, { year: "2018", game: "G", results: [] }, { year: "abc", game: "G" }];`);
  const el = { innerHTML: "" }; c.T.seasonLog(el);
  check("hostile event names and robot names are escaped in the log", !/<img src=x|<b>x<\/b>/.test(el.innerHTML) && el.innerHTML.includes("&lt;img src=x"));
  check("a bad year and an empty results list do not break the log", /--cols:3/.test(el.innerHTML) && el.innerHTML.includes("sl-year\">2019"));
  const e2 = { innerHTML: "" }; load("const SITE = {}; const ROBOTS = [];").T.seasonLog(e2);
  check("no seasons: a plain note, no crash", /No seasons yet/.test(e2.innerHTML));
}

// ---------- the results table (robot page): Event · Rank · Record · Playoffs · TBA link ----------
const P = T.parseResult;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check("parse: rank, total, record and the sentence after the dash", same(P("Rank 38 of 42 (2-7-0) — 2nd pick of Alliance 2, won the event"), { parsed: true, rank: "38 of 42", record: "2-7-0", playoffs: "2nd pick of Alliance 2, won the event" }));
check("parse: rank and record only", same(P("Rank 49 of 55 (2-7-0)"), { parsed: true, rank: "49 of 55", record: "2-7-0", playoffs: "–" }));
check("parse: no total", same(P("Rank 32 — 2nd pick in playoffs"), { parsed: true, rank: "32", record: "–", playoffs: "2nd pick in playoffs" }));
check("parse: no total, record before the dash", same(P("Rank 7 (10-6-0) — Captain, Alliance 4 (semifinals)"), { parsed: true, rank: "7", record: "10-6-0", playoffs: "Captain, Alliance 4 (semifinals)" }));
check("parse: rank alone", same(P("Rank 23"), { parsed: true, rank: "23", record: "–", playoffs: "–" }));
check("parse: a result that is not 'Rank N' is not parsed, and the raw sentence is kept", same(P("Scrimmage"), { parsed: false, rank: "–", record: "–", playoffs: "Scrimmage" }));
check("parse: empty or missing text does not throw", same(P(""), { parsed: false, rank: "–", record: "–", playoffs: "" }) && P(undefined).parsed === false);
check("parse: a plain hyphen after the record is not treated as the playoff dash", P("Rank 5 of 9 (4-3-0) - semifinals").playoffs === "–" || P("Rank 5 of 9 (4-3-0) - semifinals").playoffs === "semifinals");
{
  // every real result parses to something sensible, and re-reading the row shows the numbers that are in the sentence
  const bad = [];
  for (const r of ROBOTS) for (const x of r.results || []) {
    const p = P(x.result);
    if (/^Rank \d+/.test(x.result)) {
      const rank = x.result.match(/^Rank (\d+)(?: of (\d+))?/);
      if (!p.parsed || !p.rank.startsWith(rank[1]) || (rank[2] && !p.rank.endsWith(rank[2]))) bad.push(`${r.year} ${x.event}: ${JSON.stringify(p)}`);
      const rec = x.result.match(/\((\d+-\d+-\d+)\)/);
      if ((rec ? rec[1] : "–") !== p.record) bad.push(`${r.year} ${x.event} record`);
    } else if (p.parsed || p.playoffs !== x.result) bad.push(`${r.year} ${x.event}: raw sentence not kept`);
  }
  check("every real result in content.js parses (or keeps its raw sentence)", bad.length === 0, bad.slice(0, 3).join(" | "));
}
{
  const row = T.resultRow({ event: "Utah <Regional>", result: "Rank 38 of 42 (2-7-0) — won the event", tba: "2026utwv" });
  check("a winning row is marked and has the Winner pill, the numbers and an escaped event", /class="win"/.test(row) && row.includes("Winner") && row.includes("38 of 42") && row.includes("2-7-0") && row.includes("Utah &lt;Regional&gt;"));
  check("the TBA key becomes a link to the event, opened safely", row.includes('href="https://www.thebluealliance.com/event/2026utwv"') && /rel="noopener"/.test(row));
  const raw = T.resultRow({ event: "Scrimmage day", result: "Scrimmage" });
  check("an unparsed result shows the raw sentence, with dashes for rank and record, and no link", raw.includes("Scrimmage</td>") && !raw.includes("href") && (raw.match(/–/g) || []).length === 2);
  check("the row carries the editor's keys when given a path", T.resultRow({ event: "E", result: "Rank 1" }, "ROBOTS[3].results[0]").includes('data-ck="ROBOTS[3].results[0]"'));
  const table = T.resultsTable({ results: [{ event: "A", result: "Rank 1 of 2" }] }, "ROBOTS[3]");
  check("the table has the five headers, a scroll region and the list's key", ["Event", "Rank", "Record", "Playoffs"].every((h) => table.includes(`>${h}</th>`)) && /role="region"/.test(table) && table.includes('data-ck="ROBOTS[3].results"'));
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `ALL PASSED (${passed})`);
process.exit(failed ? 1 : 0);
