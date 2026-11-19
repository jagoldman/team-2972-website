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
  ctx.document = { documentElement: { getAttribute: () => null }, body: { hasAttribute: () => false }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => ({}), addEventListener() {}, cookie: "" };
  vm.createContext(ctx);
  ctx.URL = URL;
  // config.js first, as every page loads it (it carries the D193 blur list; without it no Drive photo is shown).
  vm.runInContext(read("config.js"), ctx, { filename: "config.js" });
  vm.runInContext(contentSource || read("js/content.js"), ctx, { filename: "content.js" });
  vm.runInContext(read("js/components.js") + "\n;globalThis.T = { resultType, seasonStats, seasonLog, seasonSummary, parseResult, resultRow, resultsTable, parseEventDates, renderNextUp, sponsorNames, robotsRow, teamDay };", ctx, { filename: "components.js" });
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
// seasonLog draws into an element and wires its scroll box: a stand-in element is enough.
const fakeEl = () => { const box = { addEventListener() {}, scrollWidth: 0, clientWidth: 0 }; return { innerHTML: "", querySelector: () => box }; };
const draw = (opts) => { const el = fakeEl(); T.seasonLog(el, opts); return el.innerHTML; };
const html = draw();
const years = ROBOTS.map((r) => Number(r.year));
const lo = Math.min(...years), hi = Math.max(...years);
check(`one column per year from ${lo} to ${hi}`, (html.match(/class="log-col/g) || []).length === hi - lo + 1);
check("years with no season say 'No season' and are not links (2020, 2021)", /<div class="log-col log-none" data-ck-ignore><span class="log-marks"><\/span><span class="log-year">2020<\/span><span class="log-name">No season<\/span><\/div>/.test(html) && /log-year">2021/.test(html) && !/href="robot\.html\?year=2020"/.test(html));
const marks = (html.match(/class="log-mark"/g) || []).length;
check("one mark per event in ROBOTS[].results", marks === ROBOTS.reduce((n, r) => n + (r.results || []).length, 0), `${marks} marks`);
check("a season column links to its page and its marks carry 'event: result'", html.includes('href="robot.html?year=2026"') && html.includes('aria-label="Utah Regional: Rank 38 of 42 — 2nd pick of Alliance 2, won the event"') && html.includes("<title>Utah Regional: Rank 38 of 42"));
check("a won event is the banner (accent); every mark is 22px", /<path class="m-win" d="M4 1h14v20l-7-5\.2L4 21z"\/>/.test(html) && !/width="28"/.test(html) && (html.match(/<svg width="22" height="22" viewBox="0 0 22 22"/g) || []).length === marks + 4);
check("the four mark kinds all appear (the real data has each): banner, disc, ring with a dot, ring",
  html.includes('class="m-win"') && /<svg[^>]*role="img"[^>]*>(?:<title>[^<]*<\/title>)?<circle class="m-ink" cx="11" cy="11" r="8"\/><\/svg>/.test(html) && /<circle class="m-line"[^>]*\/><circle class="m-ink" cx="11" cy="11" r="3"\/>/.test(html) && /<circle class="m-line" cx="11" cy="11" r="7"\/><\/svg>/.test(html));
check("a text legend with the four meanings sits below", ["Won the event", "Alliance captain", "Picked or in the playoffs", "Played the event"].every((t) => html.includes(t)) && html.indexOf('class="legend"') > html.indexOf('class="log"'));
check("the hint (SITE.homeRecordHint) sits above, keyed", /^<p class="log-hint" data-ck="SITE.homeRecordHint">Select a year to see that robot\.<\/p>/.test(html));
check("the log scrolls inside its own keyboard-focusable region", /class="log-scroll" role="region" aria-label="Season log, scrolls sideways" tabindex="0"/.test(html));
check("editor hooks: the log is the ROBOTS list; columns, years, names and marks are keyed", html.includes('data-ck="ROBOTS"') && html.includes('data-ck="ROBOTS[0]"') && html.includes('data-ck="ROBOTS[0].results[1]"') && html.includes('data-ck="ROBOTS[0].results"') && html.includes('data-ck="ROBOTS[0].year"') && html.includes('data-ck="ROBOTS[0].name"'));
check("{ list: false } leaves the ROBOTS key to the page", !draw({ list: false }).includes('data-ck="ROBOTS"'));
check("the record is one sentence from the same counts, with no middle dot", T.seasonSummary() === `<p class="record-line">${st.seasons} seasons since ${lo}, ${st.wins} event wins and ${st.playoffs} events in the playoffs.</p>`, T.seasonSummary());

// ---------- hostile and odd input ----------
{
  const c = load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "" };
    const ROBOTS = [{ year: "2020", game: "G", name: "<b>x</b>", results: [{ event: "<img src=x onerror=alert(1)>", result: "won the event" }] }, { year: "2018", game: "G", results: [] }, { year: "abc", game: "G" }];`);
  const el = fakeEl(); c.T.seasonLog(el);
  check("hostile event names and robot names are escaped in the log", !/<img src=x|<b>x<\/b>/.test(el.innerHTML) && el.innerHTML.includes("&lt;img src=x"));
  check("a bad year and an empty results list do not break the log", (el.innerHTML.match(/class="log-col/g) || []).length === 3 && el.innerHTML.includes("log-year\">2019"));
  const e2 = fakeEl(); load("const SITE = {}; const ROBOTS = [];").T.seasonLog(e2);
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
  check("a winning row is marked with the banner and 'Winner', the numbers (record with en dashes) and an escaped event", /class="win"/.test(row) && /<span class="won"><svg[^>]*><path class="m-win"[^>]*\/><\/svg>Winner<\/span>/.test(row) && row.includes("38 of 42") && row.includes("2–7–0") && row.includes("Utah &lt;Regional&gt;"));
  check("the TBA key becomes a link to the event, opened safely, saying it opens a new tab", row.includes('href="https://www.thebluealliance.com/event/2026utwv"') && /rel="noopener"/.test(row) && row.includes('The Blue Alliance<span class="vh"> (opens in a new tab)</span>') && !row.includes("↗"));
  const raw = T.resultRow({ event: "Scrimmage day", result: "Scrimmage" });
  check("an unparsed result shows the raw sentence, with dashes for rank and record, and no link", raw.includes("Scrimmage</td>") && !raw.includes("href") && (raw.match(/–/g) || []).length === 2);
  check("the row carries the editor's keys when given a path", T.resultRow({ event: "E", result: "Rank 1" }, "ROBOTS[3].results[0]").includes('data-ck="ROBOTS[3].results[0]"'));
  const table = T.resultsTable({ results: [{ event: "A", result: "Rank 1 of 2" }] }, "ROBOTS[3]");
  check("the table has the five headers (Match data last), a scroll region and the list's key", ["Event", "Rank", "Record", "Playoffs", "Match data"].every((h) => table.includes(`>${h}</th>`)) && /class="tbl-scroll" role="region"/.test(table) && table.includes('data-ck="ROBOTS[3].results"'));
}

// ---------- next event (Home): readable dates in order, unreadable dates kept ----------
function schedule(events) {
  return load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "" };
    const ROBOTS = [];
    const SCHEDULE_2027 = ${JSON.stringify(events)};`);
}
const NOW = new Date(2026, 10, 11);   // 11 Nov 2026, before the 2027 regionals
const rowsOf = (html) => [...html.matchAll(/<tr( class="next")?[^>]*><th scope="row"[^>]*>([^<]*)<\/th><td class="when"[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td class="next-in">(.*?)<\/td><\/tr>/g)].map((m) => ({ next: !!m[1], event: m[2], dates: m[3], place: m[4], when: m[5] }));
{
  const html = T.renderNextUp(NOW);
  const rows = rowsOf(html);
  check("the real schedule: a table, the earlier regional first (the next row), then Denver", /<table class="sched"/.test(html) && rows.length === 2 && rows[0].next && rows[0].event === "Intermountain West Regional" && rows[1].event === "Denver Regional" && !rows[1].next && /<h2 id="sched-h">Next event<\/h2>/.test(html), JSON.stringify(rows));
  check("the table's heads: Event, Dates, Place and a hidden Starts", html.includes('<th scope="col">Event</th><th scope="col">Dates</th><th scope="col">Place</th><th scope="col"><span class="vh">Starts</span></th>'));
  check("ranges are shown with an en dash (display only)", rows[0].dates === "March 24–27, 2027");
  check("parseEventDates reads a same-month range and returns null for a non-date", T.parseEventDates("March 24-27, 2027").start.getMonth() === 2 && T.parseEventDates("Date TBD") === null && T.parseEventDates("") === null);
  check("editor hooks: the band is the list, each row and cell keyed", html.includes('data-ck="SCHEDULE_2027"') && html.includes('data-ck="SCHEDULE_2027[0]"') && html.includes('data-ck="SCHEDULE_2027[1].dates"') && html.includes('data-ck="SCHEDULE_2027[0].location"'));
}
// ---------- next event: the day count (plain line over 60 days, the large number at 60 or fewer), in the team's time zone ----------
{
  const real = T.renderNextUp(NOW);
  check("the Denver Regional's place is the Ritchie Center (user, 2026-11-13)", real.includes("Ritchie Center, University of Denver, Denver,&nbsp;CO"));
  const at = (y, m, d) => T.renderNextUp(new Date(y, m, d, 12));
  const big = (html) => (/<td class="next-in"><span class="count-big">(\d+)<\/span> days to go<\/td>/.exec(html) || [])[1];
  const line = (html) => { const r = rowsOf(html)[0]; return r && !/count-big/.test(r.when) ? r.when : undefined; };
  const far = at(2026, 10, 14);
  check("130 days away (Nov 14): one plain line, 'In 130 days', no large number", line(far) === "In 130 days" && big(far) === undefined, line(far));
  check("61 days away (Jan 22): still the plain line", line(at(2027, 0, 22)) === "In 61 days" && big(at(2027, 0, 22)) === undefined);
  check("60 days away (Jan 23): the large number, 'days to go'", big(at(2027, 0, 23)) === "60" && line(at(2027, 0, 23)) === undefined);
  check("23 days away (Mar 1): the large number", big(at(2027, 2, 1)) === "23");
  check("the day before, the first day and during the event: Starts tomorrow, Starts today, Happening now (plain lines)",
    line(at(2027, 2, 23)) === "Starts tomorrow" && line(at(2027, 2, 24)) === "Starts today" && line(at(2027, 2, 26)) === "Happening now");
  check("only the next row has a count", rowsOf(at(2027, 2, 1)).slice(1).every((r) => r.when === ""));
  check("after the first event ends, the next one is Denver", rowsOf(at(2027, 2, 28))[0].event === "Denver Regional");
  // 11 pm on March 22 in Colorado is already March 23 in UTC (and in most of the world): the count follows Colorado.
  const evening = new Date(Date.UTC(2027, 2, 23, 5, 0));
  check("today is the date in Colorado: 11 pm on Mar 22 Mountain time is still 2 days out, not Starts tomorrow", big(T.renderNextUp(evening)) === "2", line(T.renderNextUp(evening)) || big(T.renderNextUp(evening)));
  check("teamDay: the Colorado date, whatever the instant's UTC date", T.teamDay(evening) === Math.round(Date.UTC(2027, 2, 22) / 86400000));
  const lastDay = new Date(Date.UTC(2027, 2, 28, 5, 30));   // 11:30 pm Mar 27 in Colorado, the event's last day
  check("on the event's last evening in Colorado it is still happening (not moved on to Denver)", line(T.renderNextUp(lastDay)) === "Happening now" && rowsOf(T.renderNextUp(lastDay))[0].event === "Intermountain West Regional");
}
{
  const html = schedule([
    { event: "Later", dates: "April 7-10, 2027", location: "Denver, CO" },
    { event: "Sooner", dates: "March 24-27, 2027", location: "Nampa, ID" },
    { event: "Mystery", dates: "Date TBD", location: "Somewhere, CO" },
  ]).T.renderNextUp(NOW);
  const rows = rowsOf(html);
  check("the next event is the earliest start, not the first row", rows[0].next && rows[0].event === "Sooner", JSON.stringify(rows));
  check("an unreadable date stays in the list, after the other upcoming event", rows.map((r) => r.event).join() === "Sooner,Later,Mystery" && rows[2].dates === "Date TBD");
  check("a listed unreadable date does not end the season", !/The season is over/.test(html));
}
{
  const html = schedule([
    { event: "Done", dates: "March 24-27, 2026", location: "Nampa, ID" },
    { event: "Mystery", dates: "Date TBD", location: "Somewhere, CO" },
  ]).T.renderNextUp(NOW);
  const rows = rowsOf(html);
  check("past readable dates plus an unreadable one: the season is not over; the unreadable one stands as next, with no count", !/The season is over/.test(html) && rows.length === 1 && rows[0].event === "Mystery" && rows[0].when === "" && !html.includes("Done"));
}
{
  const html = schedule([{ event: "Done", dates: "March 24-27, 2026", location: "Nampa, ID" }]).T.renderNextUp(NOW);
  check("every event finished and every date readable: 'The season is over' and its sentence", /<h2 id="sched-h">The season is over<\/h2><p class="next-none">Next season's events appear here when FIRST announces them\.<\/p>/.test(html) && !html.includes("Done") && html.includes('data-ck="SCHEDULE_2027"'));
}
{
  const html = schedule([
    { event: "First mystery", dates: "Date TBD", location: "Somewhere, CO" },
    { event: "Second mystery", dates: "TBA", location: "Elsewhere, CO" },
  ]).T.renderNextUp(NOW);
  const rows = rowsOf(html);
  check("only unreadable dates are listed in order, with no count", rows.map((r) => r.event).join() === "First mystery,Second mystery" && rows.every((r) => r.when === "") && !/The season is over/.test(html));
}

// ---------- Home: the robots (the four newest seasons, from ROBOTS) ----------
{
  const row = T.robotsRow();
  const years = [...row.matchAll(/<a class="robot-a[^"]*" href="robot\.html\?year=(\d{4})"/g)].map((m) => m[1]);
  const want = ROBOTS.map((r) => r.year).sort((a, b) => b - a).slice(0, 4);
  check("robots: the four newest seasons in ROBOTS, newest first (the first large), each a link to its robot page", years.join() === want.join() && /<a class="robot-a robot-big" href="robot\.html\?year=2026"/.test(row), years.join());
  check("robots: names, year and game and taglines come from the data", ROBOTS.filter((r) => want.includes(r.year)).every((r) => row.includes(`>${r.name}</span>`) && row.includes(`>${r.game}</span>`) && (!r.tagline || row.includes(`>${r.tagline}</span>`))));
  check("robots: every photo has alt text and is lazy", (row.match(/<img /g) || []).length === 4 && (row.match(/<img [^>]*alt="[^"]+"/g) || []).length === 4 && (row.match(/<img [^>]*loading="lazy"/g) || []).length === 4);
  const sets = [...row.matchAll(/<img src="([^"]+)" srcset="([^"]+)" sizes="([^"]+)"/g)];
  check("robots: each photo offers 400, 800 and 1600 copies with the spot's width as sizes",
    sets.length === 4 && sets.every(([, src, set]) => /=w400$|-400\.webp$/.test(src) && /400w, \S+ 800w, \S+ 1600w$/.test(set)) && sets[0][3] === "(min-width: 1240px) 680px, (min-width: 900px) 56vw, 100vw" && sets.slice(1).every((m) => m[3] === "(min-width: 900px) 190px, 34vw"), sets.map((m) => m[3]).join(" | "));
  check(`robots: a "See all ${ROBOTS.length} robots" button to the Robots page, and the heading from SITE.homeRobotsHeading`, row.includes(`<a class="btn" href="robots.html">See all ${ROBOTS.length} robots</a>`) && /data-ck="SITE.homeRobotsHeading">The robots</.test(row));
  check("robots: each link is keyed to its season for the editor", want.every((y) => row.includes(`data-ck="ROBOTS[${ROBOTS.findIndex((r) => r.year === y)}]"`)));
  const c = load(`const SITE = { teamNumber: "1", teamName: "T", school: "S", location: "L", founded: "2000", email: "a@example.com", instagram: "#", instagramHandle: "", schoolUrl: "#", logo: "", homeRobotsHeading: "Our machines" };
    const ROBOTS = [{ year: "2019", game: "G19", name: "Old", stats: "1 event · rank 3" }, { year: "2031", game: "<i>G31</i>", name: "<b>New</b>", image: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345" },
      { year: "2030", game: "G30", name: "" }, { year: "2028", game: "G28", name: "Mid" }, { year: "2010", game: "G10", name: "Older" }, { year: "x", game: "bad" }];`);
  const r2 = c.T.robotsRow();
  const y2 = [...r2.matchAll(/href="robot\.html\?year=(\d{4})"/g)].map((m) => m[1]);
  check("robots follow the data: sorted by year whatever the order, an unreadable year left out", y2.join() === "2031,2030,2028,2019", y2.join());
  check("robots: a robot with no name shows '<year> Robot'; one with no photo shows the Photo wanted tile (the year decorative)", r2.includes(">2030 Robot</span>") && /<span class="ph"><b data-ck-ignore aria-hidden="true">2030<\/b><span>Photo wanted<\/span><\/span>/.test(r2));
  check("robots: stats are joined with commas, never a middle dot", r2.includes(">1 event, rank 3</span>") && !r2.includes("·"));
  check("robots: names and games are escaped, and the heading follows SITE.homeRobotsHeading", !/<b>New|<i>G31/.test(r2) && r2.includes("&lt;b&gt;New") && r2.includes(">Our machines</h2>"));
  check("robots: no seasons, no section", load("const SITE = {}; const ROBOTS = [];").T.robotsRow() === "");
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
  check("public: a real logo is a tile whose name shows if the file fails", lis[2].startsWith(' class="logo-tile"') && lis[2].includes('class="sp-name"') && lis[2].includes("data-sponsor-logo"));
  check("public: a sponsor's own link opens in a new tab and says so", lis[0].includes('target="_blank"') && lis[0].includes('<span class="vh"> (opens in a new tab)</span>'));
  check("typeOnly (Home's sponsors): every sponsor is a name in type, a real logo too", !typed.includes("<img") && !typed.includes("logo-tile") && ["Placeholder Co", "Empty Logo", "Real Co"].every((n) => typed.includes(`>${n}</span>`)));
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
