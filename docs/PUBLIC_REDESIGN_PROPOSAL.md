# Public site redesign: proposal and build brief

Status: **visual direction approved; production implementation pending**. Written 2026-11-10; updated
2026-11-11 after the user chose Midnight & brass and dark mode only. The lead still needs to record the
production rollout decision before landing application changes. Scope: the public pages only (`index`,
`robots`, `robot`, `sponsors`, `member`, `mentor`, `about`, `resources`, `outreach`, `media`, `contact`). The portal, the app bar and the shell kit are out of scope and unchanged.

A clickable demo of this proposal is published as a private Claude artifact ("Team 2972 Redesign Demo").
The current local demo is [public-redesign-demo](../../public-redesign-demo/index.html) in the parent
workspace. The older artifact does not reflect the 2026-11-11 palette decision.

## Delivery requirement (user, 2026-11-11)

Include this approved public-site redesign, Midnight & brass palette, dark-only appearance, and borderless
“Find your way in” panels in the **next coordinated push owned by “Simplify App UI and Usability”**.
The user explicitly requested this handoff. Carry these requirements into that release's versioned files;
the local prototype alone does not update the live site. The coordination thread has received the current
demo path, token values, scope and verification results. This does not request an immediate push/deploy
or change theme behavior in the portal or other apps.

## 1. What is wrong with the current public site

Looked at on 2026-11-10 (production, both themes, 1440px and 390px).

1. **The hero hides the best photo.** The Utah Regional winners photo is dimmed to near black and the
   team name is set over the students' faces. The name is already in the header, so the largest text on the
   site says nothing new. The 2026 event win appears nowhere in the home page's text.
2. **Visitors are not routed.** Three kinds of people arrive: students and parents, sponsors, mentors. The
   home page gives them a mission line, a robot carousel and two buttons. "Join the team" is the third
   button down.
3. **Decoration without meaning.** Sections are numbered 01–05 although they are not a sequence. There is a
   scrolling marquee, film grain, magnetic buttons, tilting cards, a pointer-following glow and
   reveal-on-scroll (content starts invisible). None of it is about robotics.
4. **Weak numbers.** The stat row counts "2008, year we started" as a statistic. The real record
   (16 seasons, event wins in 2011 and 2026, alliance captain four times) is in `content.js` but is shown
   only as one line of small text per card.
5. **The sponsors page undersells.** Eight of nine 2024 sponsors show a grey box that says "logo". The top
   block reads "2025 Sponsors … being finalized" in November 2026. Nothing says what a gift pays for.
6. **The schedule is passive.** Two events in a list; no "next event" and no countdown.
7. **Robot pages have good facts in a weak layout.** Results are a list of sentences
   ("Rank 42 of 47 (3-8-0)") instead of a table; each section takes a full screen for three lines.

## 2. Direction: "match sheet"

Use the approved **Midnight & brass** palette, Bricolage Grotesque + Inter, and **dark mode only**
on the public website. Keep the existing token names; the approved values are in §5b. Change the layout
and the hierarchy. The visual language comes from the paperwork of an FRC event: match schedules, rank "9 of 47", records "7-5-0", event keys, bumper numbers. Solid surfaces, thin
rules, tabular numbers, photos at full brightness, no ambient effects.

### Shared
- **Header:** one solid bar. Brand at left. Flat links: Robots · About · Sponsors · Join · Resources.
  The gold "Team login" stays. Remove the public-site theme switch. No dropdowns (Outreach, Media and
  Contact move to the footer and to links inside About).
- **Footer:** three short columns plus Outreach, Media, Contact, Privacy, Terms. No giant "2972".
- **Section heads:** a plain `h2` and an optional one-line lead. No numbered kickers.
- **Motion:** hover and focus states only. Everything is visible at load.

### Home
1. **Hero, two columns.** Left: eyebrow "FRC Team 2972 · Dawson School · Lafayette, Colorado"; `h1` built
   from the newest award in `ROBOTS[].awards` ("Utah Regional winners, 2026."), falling back to
   `SITE.teamName`; `SITE.mission` as the lead; buttons "Join the team" and "Sponsor a season". Right: the
   hero photo, undimmed, with a caption. On phones the photo goes first.
2. **Next-up strip.** The next event in `SCHEDULE_2027` that has not ended: name, dates, place and
   "in N days". The other events follow in smaller type. After the last one: "Season complete".
3. **Season log** (the signature component, §3).
4. **Three doors.** Students · Sponsors · Mentors. One sentence each and one link.
5. **Workshop.** A shop photo, `HISTORY.today`, and the machines as a short spec list.
6. **Sponsors strip.** Sponsor names set in type (logos when a real one exists) and "Become a sponsor".

### Robots
Season log at the top, then filter chips (All · Event winners · Playoffs · In service), then the card grid.
A season without a photo shows a "Photo wanted" card that links to the contact address.

### Robot
Photo beside the name, year, game and the `stats` line. **Results as a table**: Event · Rank · Record ·
Playoffs · TBA link, parsed from `results[].result` (show the raw sentence when it does not parse). Specs
as a definition list, mechanisms as a two-column list, the game summary, videos, links, then
previous / next season. Sections with no data are not rendered (as now).

### Sponsors
A lead that says what gifts have paid for (from `HISTORY.today`: the workshop, the machines, the practice
field), the sponsor packet button, the contact address, then sponsors by year with names in type. A year
with no sponsors yet is not rendered.

### Join (member + mentor)
Keep the two pages. Add the year at a glance (`ANNUAL_EVENTS`, a real sequence, so it may be a numbered
timeline) and the values list beside the existing copy.

## 3. Season log

One column per year from the first season to the newest; one mark per event in `ROBOTS[].results`.

| Mark | Rule (regex on `result`, case-insensitive) |
|---|---|
| Gold filled, large, with a ring | `won the event` |
| Gold filled | `captain` |
| Gold outline with a gold centre dot | `pick|playoffs|semifinal|quarterfinal` (and not the two above) |
| Grey outline | anything else (played) |

Years with no entry in `ROBOTS` (2020, 2021) keep an empty column, so the gap is visible. Each column is
a link to `robot.html?year=YYYY`; the robot name sits under the year when there is one. A mark's `title`
and `aria-label` are "`event`: `result`". A text legend sits below. On phones the chart scrolls sideways
inside its own box. The summary line above it counts seasons, event wins and playoff events from the same
data, so nothing is typed by hand.

## 4. Rules for the build (Opus 5.5 in a landing session)

- No framework, no build step. Content stays in `js/content.js`; every element keeps its `data-ck` /
  `data-ck-href` hooks so the editor keeps working. Render inside `onContent()` as today.
- **Approved palette:** use §5b through the token block in `css/style.css`; keep WCAG AA contrast.
  Public pages use dark mode only and ignore saved light/system preferences. Update public-site theme
  checks for this behavior; retain both-theme checks for the portal and shared shell. Coordinate shared
  token changes through infra before production adoption.
- Do not touch `portal/`, `shell/`, `sw.js` logic (bump the cache version only), or the sign-in links.
- No student names, no new photos in git, no invented facts (sponsor tiers, prices, dates). Where the
  content is missing, hide the block.
- Delete what the redesign retires: the marquee, grain, magnetic and tilt handlers, the pointer glow,
  the parallax, `data-reveal` hidden states, the footer "2972", the numbered kickers.
- Work in a `git worktree` on a `redesign/public` branch. Commit locally; do not push.

### Work packages (each is one reviewable commit)
1. **Header, footer, base type and section styles**; remove the retired effects site-wide.
2. **Home**: hero, next-up strip, three doors, workshop, sponsors strip.
3. **Season log** as a function in `components.js` (`seasonLog(el, { compact })`), used on Home and Robots.
4. **Robots and Robot** pages: filters, results table (with a parser and unit tests in `test/`).
5. **Sponsors, Member, Mentor, About** layouts.
6. **Checks**: `test/theme-test.sh`, `test/assets-test.cjs`, 320px / 390px / 1440px with both light and dark OS preferences (public pages stay dark),
   keyboard walk-through, the editor's click-to-edit on every changed page.

### Acceptance
- At 1440×900 the home page shows, without scrolling: the headline, both buttons, the whole photo at full
  brightness, and the next event.
- No text is set over a photograph anywhere.
- With JavaScript content loaded, no element has `opacity: 0` at rest.
- `content.js` needs **no** new fields. (Optional later: `SPONSOR_TIERS[].sponsors[].logo` real logos.)

## 5. User feedback on the first demo (2026-11-10), now in the demo

- **Dawson School is more visible.** The Mustang "D" sits first in the header (linked to the school), the
  wordmark sits under the hero buttons ("A Dawson School team"), in the footer and in a box on About.
- **Two timelines, each shown once.** The *competition record* is the season log (Home and Robots); the
  `kind: "comp"` milestones are a "Highlights" list under it on Robots. *How the team grew* (About) shows only
  the `kind: "team"` milestones, with their photos. Neither repeats the other.
- **About opens with little text:** the mission line, a six-row team sheet (team, school, home, founded,
  seasons played, event wins: the last two computed), and the Dawson box with one sentence. The full
  `ABOUT_FIRST` and `ABOUT_SCHOOL` paragraphs sit in two closed `<details>`. `VALUES` moved here from Join.
- **Join has little text:** a Students | Mentors switch, two or three sentences each, mentor roles cut to a
  name and one sentence, and the year at a glance. On the real site this is `member.html` and `mentor.html`
  with the same trimmed copy (the switch becomes two links).
- **The countdown is computed in the browser** from `SCHEDULE_2027` on every load, and again when the tab
  is shown and every 30 minutes. No server job and no editing.
- **The demo stays separate from `portal-demo/`** (answers question 4 below).

## 5a. Effects from `infra/docs/UI_LIBRARIES.md` (user, 2026-11-10)

The user asked for the listed libraries to be used, then narrowed it: **only where an effect is needed and
effective, and taken from the library instead of invented.** Landing takes no packages, so "taken from the
library" means porting the component's own source (structure, sizes, durations, easings) to plain CSS and a
little vanilla JS, with colours swapped for the tokens and a static `prefers-reduced-motion` fallback.
**This replaces "Motion: hover and focus states only" in §2.** The old marquee, grain, magnetic buttons,
tilt, pointer glow, parallax and hidden `data-reveal` states still go. Everything stays visible at rest.

| Component | Source ported | Where, and why it earns its place |
|---|---|---|
| Border Beam | Magic UI `registry/magicui/border-beam.tsx` (50px beam, 6s, 1px ring, `offset-path`) | Home next-event card: the one time-sensitive item on the page |
| Number Ticker | Magic UI `number-ticker.tsx` (spring: damping 60, stiffness 100; once, on first view) | The three competition-record stats on Home |
| Bento Grid | Magic UI `bento-grid.tsx` (3 columns, 1rem gap, card anatomy, hover wash) | Home "Find your way in": Students, Sponsors, Mentors, Workshop in one block. Rows are shorter than the source and the link is always visible, because our tiles are text, not artwork |
| Timeline | Aceternity UI `components/ui/timeline.tsx` (sticky marker and year, masked track, scroll-driven fill from 10% to 50%) | About "How the team grew". Row spacing is tighter than the source because entries are one sentence |

Tried and dropped as not earning their place: a sponsor marquee (nine names read better all at once),
a pointer spotlight, focus cards on the robots grid, a dot-pattern hero background, rolling digits on the
countdown.

## 5b. Approved palette and appearance (user, 2026-11-11)

The user selected **Midnight & brass** and **dark mode only** for the public website. This supersedes
previous light/dark/system behavior in this proposal. The portal and other team applications keep their
existing behavior; this decision concerns the public-site redesign.

| Token | Value | Purpose |
|---|---|---|
| `--ink` | `#101827` | Page and header background |
| `--ink-2` | `#152033` | Alternate sections and footer |
| `--ink-3` | `#1C293B` | Panels |
| `--text` | `#F3F5FA` | Primary text |
| `--text-2` | `#C5CFDD` | Supporting text |
| `--mute` | `#B4C0D1` | Captions and secondary labels |
| `--gold`, `--accent` | `#E6B849` | Buttons, links and competition marks |
| `--gold-2`, `--accent-2` | `#F2CD74` | Hover emphasis |
| `--on-gold` | `#101827` | Text on brass buttons |

Set `color-scheme: dark` from the first paint, including native inputs. Remove the theme control and its
storage handlers. Saved light-mode choices and light OS preferences must not change the public site's
appearance. Preserve the borderless “Find your way in” panels requested by the user.

The local demo implements this decision. It also includes Resources, Outreach, Media and Contact.
The previously published Claude artifact has not been republished with these changes.

## 6. Open questions for the user
1. Flat header (no dropdowns): accept moving Outreach, Media and Contact to the footer?
2. Should the home headline follow the newest award automatically, or be an editor field?
3. Sponsor logos: collect real ones, or keep names in type?
4. D101 says UI changes start in `portal-demo/`. This proposal's demo is a separate artifact, because
   `portal-demo` covers the portal. Fold it into `portal-demo` or keep it apart?
