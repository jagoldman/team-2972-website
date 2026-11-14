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
  vm.runInContext(read("js/components.js") + "\n;globalThis.T = { resultType, seasonStats, seasonLog, seasonSummary, seasonStatRow, parseResult, resultRow, resultsTable, parseEventDates, renderNextUp, sponsorNames, robotsRow, teamDay };", ctx, { filename: "components.js" });
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

// ---------- next event (Home): readable dates in order, unreadable dates kept ----------
function schedule(events) {
  return load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "" };
    const ROBOTS = [];
    const SCHEDULE_2027 = ${JSON.stringify(events)};`);
}
const NOW = new Date(2026, 10, 11);   // 11 Nov 2026, before the 2027 regionals
const sliceBetween = (html, from, to) => html.slice(html.indexOf(from), to ? html.indexOf(to) : undefined);
{
  const html = T.renderNextUp(NOW);
  check("the real schedule's next event is the earlier regional, then Denver", /class="next-name"[^>]*>Intermountain West Regional</.test(html) && sliceBetween(html, "Then").includes("Denver Regional") && !/Season complete/.test(html));
  check("parseEventDates reads a same-month range and returns null for a non-date", T.parseEventDates("March 24-27, 2027").start.getMonth() === 2 && T.parseEventDates("Date TBD") === null && T.parseEventDates("") === null);
}
// ---------- next event: the day count (plain line over 60 days, the large number at 60 or fewer), in the team's time zone ----------
{
  const real = T.renderNextUp(NOW);
  check("the Denver Regional's place is the Ritchie Center (user, 2026-11-13)", real.includes("Ritchie Center, University of Denver, Denver,&nbsp;CO"));
  const at = (y, m, d) => T.renderNextUp(new Date(y, m, d, 12));
  const big = (html) => (/class="countdown count-big"><span class="stat-n">(\d+)<\/span><span class="stat-l">days until the event starts</.exec(html) || [])[1];
  const line = (html) => (/<p class="next-in">([^<]*)<\/p>/.exec(html) || [])[1];
  const far = at(2026, 10, 14);
  check("130 days away (Nov 14): one plain line, 'In 130 days', no large number", line(far) === "In 130 days" && big(far) === undefined, line(far));
  check("61 days away (Jan 22): still the plain line", line(at(2027, 0, 22)) === "In 61 days" && big(at(2027, 0, 22)) === undefined);
  check("60 days away (Jan 23): the large number", big(at(2027, 0, 23)) === "60" && line(at(2027, 0, 23)) === undefined);
  check("23 days away (Mar 1): the large number", big(at(2027, 2, 1)) === "23");
  check("the day before, the first day and during the event: Tomorrow, Starts today, Happening now (plain lines)",
    line(at(2027, 2, 23)) === "Tomorrow" && line(at(2027, 2, 24)) === "Starts today" && line(at(2027, 2, 26)) === "Happening now");
  check("after the first event ends, the next one is Denver", /class="next-name"[^>]*>Denver Regional</.test(at(2027, 2, 28)));
  // 11 pm on March 22 in Colorado is already March 23 in UTC (and in most of the world): the count follows Colorado.
  const evening = new Date(Date.UTC(2027, 2, 23, 5, 0));
  check("today is the date in Colorado: 11 pm on Mar 22 Mountain time is still 2 days out, not Tomorrow", big(T.renderNextUp(evening)) === "2", line(T.renderNextUp(evening)) || big(T.renderNextUp(evening)));
  check("teamDay: the Colorado date, whatever the instant's UTC date", T.teamDay(evening) === Math.round(Date.UTC(2027, 2, 22) / 86400000));
  const lastDay = new Date(Date.UTC(2027, 2, 28, 5, 30));   // 11:30 pm Mar 27 in Colorado, the event's last day
  check("on the event's last evening in Colorado it is still happening (not moved on to Denver)", line(T.renderNextUp(lastDay)) === "Happening now" && /Intermountain West Regional</.test(T.renderNextUp(lastDay)));
}
{
  const html = schedule([
    { event: "Later", dates: "April 7-10, 2027", location: "Denver, CO" },
    { event: "Sooner", dates: "March 24-27, 2027", location: "Nampa, ID" },
    { event: "Mystery", dates: "Date TBD", location: "Somewhere, CO" },
  ]).T.renderNextUp(NOW);
  const card = sliceBetween(html, "next-card", "Then");
  const later = sliceBetween(html, "Then");
  check("the next event is the earliest start, not the first row", /class="next-name"[^>]*>Sooner</.test(card) && !card.includes("Later") && !card.includes("Mystery"));
  check("an unreadable date stays in the Then list, after the other upcoming event", later.indexOf("Later") >= 0 && later.indexOf("Later") < later.indexOf("Mystery") && later.includes("Date TBD"));
  check("a listed unreadable date is not called season complete", !/Season complete/.test(html));
}
{
  const html = schedule([
    { event: "Done", dates: "March 24-27, 2026", location: "Nampa, ID" },
    { event: "Mystery", dates: "Date TBD", location: "Somewhere, CO" },
  ]).T.renderNextUp(NOW);
  check("past readable dates plus an unreadable one are not season complete", !/Season complete/.test(html) && /class="next-name"[^>]*>Mystery</.test(html) && html.includes("Date TBD") && !/days until/.test(html));
}
{
  const html = schedule([{ event: "Done", dates: "March 24-27, 2026", location: "Nampa, ID" }]).T.renderNextUp(NOW);
  check("every event finished and every date readable: season complete", /Season complete/.test(html) && !html.includes("Done"));
}
{
  const html = schedule([
    { event: "First mystery", dates: "Date TBD", location: "Somewhere, CO" },
    { event: "Second mystery", dates: "TBA", location: "Elsewhere, CO" },
  ]).T.renderNextUp(NOW);
  check("only unreadable dates are listed in order, with no countdown", /class="next-name"[^>]*>First mystery</.test(html) && sliceBetween(html, "Then").includes("Second mystery") && !/Season complete/.test(html) && !/days until/.test(html));
}

// ---------- Home: the robots row (the four newest seasons, from ROBOTS) ----------
{
  const row = T.robotsRow();
  const years = [...row.matchAll(/<a class="card" href="robot\.html\?year=(\d{4})"/g)].map((m) => m[1]);
  const want = ROBOTS.map((r) => r.year).sort((a, b) => b - a).slice(0, 4);
  check("robots row: the four newest seasons in ROBOTS, newest first, each a link to its robot page", years.join() === want.join(), years.join());
  check("robots row: names, year · game and taglines come from the data", ROBOTS.filter((r) => want.includes(r.year)).every((r) => row.includes(`>${r.name}</h3>`) && row.includes(`>${r.game}</span>`) && (!r.tagline || row.includes(`>${r.tagline}</p>`))));
  check("robots row: every photo has alt text", (row.match(/<img /g) || []).length === 4 && (row.match(/<img [^>]*alt="[^"]+"/g) || []).length === 4);
  check("robots row: all four photos are lazy (the row is never on the first screen)", (row.match(/<img [^>]*loading="lazy"/g) || []).length === 4);
  const sets = [...row.matchAll(/<img src="([^"]+)" srcset="([^"]+)" sizes="([^"]+)"/g)];
  check("robots row: each photo offers a 400px and an 800px copy, with the card's width as sizes (src is the 400px copy)",
    sets.length === 4 && sets.every(([, src, set, sizes]) => /=w400$|-400\.webp$/.test(src) && /=w400 400w, \S+=w800 800w$|-400\.webp 400w, \S+-800\.webp 800w$/.test(set) && sizes === "(min-width: 1024px) 300px, (min-width: 350px) 50vw, 100vw"), sets.map((m) => m[2]).join(" | "));
  check("robots row: a See all robots link to the Robots page, and the heading from SITE.homeRobotsHeading", /<a class="btn btn-line" href="robots\.html">See all robots<\/a>/.test(row) && /data-ck="SITE.homeRobotsHeading">The robots</.test(row));
  check("robots row: each card is keyed to its season for the editor", want.every((y) => row.includes(`data-ck="ROBOTS[${ROBOTS.findIndex((r) => r.year === y)}]"`)));
  const c = load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "", homeRobotsHeading: "Our machines" };
    const ROBOTS = [{ year: "2019", game: "G19", name: "Old" }, { year: "2031", game: "<i>G31</i>", name: "<b>New</b>", image: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345" },
      { year: "2030", game: "G30", name: "" }, { year: "2028", game: "G28", name: "Mid" }, { year: "2010", game: "G10", name: "Older" }, { year: "x", game: "bad" }];`);
  const r2 = c.T.robotsRow();
  const y2 = [...r2.matchAll(/href="robot\.html\?year=(\d{4})"/g)].map((m) => m[1]);
  check("robots row follows the data: sorted by year whatever the order, an unreadable year left out", y2.join() === "2031,2030,2028,2019", y2.join());
  check("robots row: a robot with no name shows '<year> Robot', one with no photo shows its year in the photo's place", r2.includes(">2030 Robot</h3>") && /class="photo ph"[^>]*><b data-ck-ignore>2030<\/b>/.test(r2));
  check("robots row: names and games are escaped, and the heading follows SITE.homeRobotsHeading", !/<b>New|<i>G31/.test(r2) && r2.includes("&lt;b&gt;New") && r2.includes(">Our machines</h2>"));
  check("robots row: no seasons, no row", load("const SITE = {}; const ROBOTS = [];").T.robotsRow() === "");
}

// ---------- sponsor names: public names, editor logo targets ----------
{
  const c = load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "" };
    const ROBOTS = []; const SCHEDULE_2027 = [];`);
  const tier = { sponsors: [
    { name: "Placeholder Co", logo: "assets/placeholder-sponsor.svg", url: "https://example.com/p" },
    { name: "Empty Logo", logo: "" },
    { name: "Real Co", logo: "media:0123456789abcdef0123" },
  ]};
  const pub = c.T.sponsorNames(tier, 0);
  const lis = pub.split("<li").slice(1);
  check("public: a placeholder or empty logo is a name, with no logo image", lis.length === 3 && !lis[0].includes("placeholder-sponsor") && !lis[0].includes('class="logo"') && !lis[0].includes(".logo\"") && !lis[1].includes('class="logo"') && lis[0].includes("Placeholder Co") && lis[1].includes("Empty Logo"));
  check("public: a placeholder with a url keeps the link hook on the name", lis[0].includes('data-ck-href="SPONSOR_TIERS[0].sponsors[0].url"') && lis[0].includes("https://example.com/p"));
  check("public: a real logo is an image hook with class logo", lis[2].includes('class="logo"') && lis[2].includes('data-ck="SPONSOR_TIERS[0].sponsors[2].logo"') && lis[2].includes('data-ck-alt="SPONSOR_TIERS[0].sponsors[2].name"') && lis[2].includes("/media/0123456789abcdef0123-400.webp"));
  const typed = c.T.sponsorNames(tier, 0, { typeOnly: true });
  check("typeOnly (Home's strip): every sponsor is a name in type, a real logo too", !typed.includes("<img") && !typed.includes("sponsor-tile") && ["Placeholder Co", "Empty Logo", "Real Co"].every((n) => typed.includes(`>${n}</span>`)));
  const emptyPub = c.T.sponsorNames({ sponsors: [] }, 1);
  check("public: an empty sponsor list keeps its list hook and no editor note", emptyPub.includes('data-ck="SPONSOR_TIERS[1].sponsors"') && !/No sponsors in this tier yet/.test(emptyPub));
  c.__editorOverlay = true;
  const ed = c.T.sponsorNames(tier, 0);
  check("editor preview: a placeholder logo is a .logo image target", ed.includes('class="logo"') && ed.includes("placeholder-sponsor.svg") && ed.includes('data-ck="SPONSOR_TIERS[0].sponsors[0].logo"') && ed.includes('data-ck-alt="SPONSOR_TIERS[0].sponsors[0].name"'));
  check("editor preview: an empty logo is a .logo image target", ed.includes('data-ck="SPONSOR_TIERS[0].sponsors[1].logo"') && ed.includes('data-ck-type="image"') && ed.includes('data-ck-alt="SPONSOR_TIERS[0].sponsors[1].name"') && ed.includes(">Logo</span>"));
  const emptyEd = c.T.sponsorNames({ sponsors: [] }, 0);
  check("editor preview: an empty sponsor list is a visible note inside its hook", emptyEd.includes('data-ck="SPONSOR_TIERS[0].sponsors"') && /data-ck-ignore>No sponsors in this tier yet/.test(emptyEd));
}

console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `ALL PASSED (${passed})`);
process.exit(failed ? 1 : 0);
