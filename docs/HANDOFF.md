# landing: handoff

## 2026-11-18: release 8.3, the public site in design 8.2 (D190) and the hero blur (D193), branch `r83-site`

The 13 public pages follow `../public-redesign-demo/v8.2/` (`47a6d87`); the brief is `new-apps/briefs/r83/PUBLIC_SITE.md`
and the work list `new-apps/adoption/r83/GAP_PUBLIC_SITE.md`. `docs/PUBLIC_REDESIGN_PROPOSAL.md` (Midnight & brass) is replaced.

- **Styles:** the public pages load only `css/site.css` (tokens at the top, light only, the red block under them).
  `css/style.css` is the portal's, install's, offline's and team-login's; its old public block stays, unused, until the
  portal's owner agrees to remove it. Fonts: Big Shoulders (`--display`) and Libre Franklin; `sw.js` precaches both (v8).
- **Head:** each public page is `color-scheme light`, `theme-color #ffffff`, and has one head script, the bumper's
  (reads `localStorage["2972-alliance"]`, sets `data-alliance`). `test/theme-test.cjs` pins its exact text.
- **`js/components.js`:** new `extLink`, `dash`, `statParts`, `wordmark`, `siteAddress`, `bumperLabel`/`renderBumper`/
  `swapBumpers`, `robotShot`/`robotMeta`, `siteRequestAccess`, `siteFooter`, `hasPhoto`. Rewritten for the public pages:
  `renderHeader`, `renderFooter` (its portal branch is unchanged), `renderNextUp` (a table; "Starts tomorrow", "days to go",
  "The season is over"), `seasonMark`/`seasonLog`/`seasonSummary`/`renderRecord`/`scrollLogToNewest` (banner for a win,
  22px marks, "No season" years, the record as one sentence), `robotsRow`, `resultRow`/`resultsTable`, `sponsorNames`,
  `renderTeamTools`, `copyAddress` (keeps its own label), `mountLayout`, `loginLabel` ("Team login"). Removed:
  `renderCompactFooter`, `seasonStatRow`, `tickerRun`, `initTickers`, `initTimeline`, `timeline*`, `REDUCED_MOTION`.
  Unchanged for the portal: `renderRequestAccess`, `emailAddress`, `schoolMark`, `siteBase`, `PORTAL_URL`.
- **Kept sections the demo has no place for**, drawn with the demo's own parts: the robot Photos gallery, awards, photo
  source; About's How we work; sponsor logos (and links, banners); Join's Team calendar and the three FIRST links;
  Resources' Code, CAD and the Team Drive with Request access; outreach dates; Media's photo grid and Follow along.
- **D193, a face blurred at the owner's request in the hero photo:** the one blur table is `window.PHOTO_BLUR` in
  `config.js` (Drive ID, a version mark `v`, ellipses as fractions of the rotated photo). `scripts/drive-photos/fetch.cjs`
  reads it (Docker copies `config.js` into the photo stage), blurs the full download before any resize (5x5 blocks, back
  up, a wide Gaussian, a soft mask fully opaque over the ellipse), and writes `<id>-<v>-<w>.webp`; the link-preview picture
  is `og-image-b1.jpg`. `imgUrl()` never gives a Google address for a blurred ID; without a saved copy the photo is not
  shown (`hasPhoto()`), and the build log says `PRIVACY (D193)` loudly. Change `v` whenever the regions change.
- **Tests:** `test/public-test.mjs` rewritten (see its header); `theme-test`, `season-test`, `legal-test`, `pwa-test`,
  `install-test`, `site-test.html`, `menu-test.html`, `portal-shell-test.mjs`, `drive-photos-test` and `container-test.sh`
  updated.

## 2026-11-14: release 8.1.5, shell kit 0.4.0 (branch `r815`)

From `new-apps/briefs/r815/SYNC_040.md`. The static kit is synced from infra `release-8.1.5` `c0e09bb`
(`scripts/sync-shell.sh static`; `scripts/check-shell.sh static` passes). What the portal does with it:

- **Home's rows** are the kit's `mountHomeGroups` (`/shell/static/shell.js`); landing's own `js/portal-groups.js` is
  gone. Home passes the resolved tiles (`update({ tiles, tools, mode })`); the kit splits them with `splitGroups` and
  Home's own grid draws `splitGroups(tiles).main`. Admin apps are the kit's `tile.group === "admin"` in the bar too
  (the 0.3.2 workaround under More is gone). A row opened in another tab is followed when the tab comes back
  (`visibilitychange`), as the kit does.
- **The guide:** `mountHomeGuide` draws the "Get started" card into `[data-guide-card]` after the rows are drawn (the
  admin's "Let new people in" rings Home's Admin link in the Admin apps row; the mentor's and admin's "wait" rings the
  Waiting on you card, which appears when `/today.json` answers). The bar gets `appId: "portal"`, so a stop on Home
  counts as on its page, and the user with the raw groups. The shop screen's home mounts neither the bar nor the
  guide.
- **The shop screen's notice (C16):** `?blocked=` is the refusing app's host label (`tasks`, `calendar`, `parts`, `skills`,
  `compete`, `account`, `admin`, `editor`, `tools`); `blockedAppName` names it from the fixed table `BLOCKED_APPS`, never
  from the address or the shop screen's own app list (which never holds the refusing app). Any other value: no notice.
- **The bell** is the kit's button and panel (`showBell`); "Mark all read" posts `{"all":true}` to the portal's
  `/_shell/inbox/read`, which infra's Caddy sends to Account (C3). The event-day banner needs nothing from landing.
- **Tests:** `test/portal-shell-test.mjs` adds the bell panel and Mark all read, the Apps menu's rows and ×, the scrim,
  44 px icons, the banner (with a fake `/event.json` and `/event-status.json`), the guide's card, both Home stops,
  "Start the tour again", and no engine for an ended guide or the shop screen.

## 2026-11-14: release 8.1.5, the portal home as the demo's and the "2972 Team" header (branch `r815`)

Built from `new-apps/briefs/r815/LANDING.md`, its addendum 1 and CONTRACT C1, C2, C3, C4, C8, C9, C12.

- **Portal home** (`portal/index.html`): above the tiles, in the demo's order (`portal-demo/js/core.js` `views.portal`),
  the guide's slot `<div data-guide-card></div>` (empty until the kit 0.4.0 sync wires `mountGuideCard`), then
  **Waiting on you** (`data-guide="wait"`), **Today** and the student's **next-task card** (gold Done posts `{taskId}`
  to same-origin `/today/task-done`; on an error the card offers "Open task"). Under the tiles: **Tools, Admin apps,
  More** as three closed rows, then **Recent activity** (not for a parent-only person). The search box, "Get access"
  and the install banner stay; search opens a row that has a match without saving it.
- **Data:** `GET /today.json` (infra's Caddy sends it to Account `/api/today`). `js/portal-home.js` checks every part
  (`parseToday`: version 1, on-site links only, text cut to length, `modes` per row, C12). A part with no data is not
  drawn; a failed, missing or wrong-version answer leaves the home as release 8.1 had it. The service worker never
  stores it (only `/css/`, `/js/` and the like are storable).
- **The rows** (since kit 0.4.0 the kit's `mountHomeGroups`; first built as `js/portal-groups.js`): apps.json entries with `"group": "admin"` are Admin apps,
  `tool: true` entries are Tools (same tab, "All tools" last, `tools.<domain>/`), the rest of `more` is More. Open or
  closed is the site-wide `shellgroups` cookie with ids `tools`, `adminapps`, `more`. This one module is landing's
  own code until the kit's static profile has the helper; **the kit 0.4.0 sync replaces it**. Until then the 0.3.2
  bar shows the Admin apps under its More (`js/portal-shell.js` `barTiles`) and its Tools row from `resolveTools`.
- **Bell:** `showBell: true` on the portal; the kit reads same-origin `/_shell/inbox` (portal host only, C3). With no
  inbox route there the kit draws no bell.
- **Shop screen (C9):** a person whose only group is `display` gets no bar and no footer, only "Pick what this screen
  shows" with Door QR (`calendar./here/kiosk`), Pit monitor (`compete./pit/monitor`) and Projector
  (`tasks./projector`, C13). An extra Authentik group next to `display` still gets the picker; no install banner there.
- **Fix round after the review (C13, C14):** Recent activity shows the app first; the next-task card is the demo's in
  full (project › subteam, milestone, steps, Waiting on, on hold, Blocked; "I'm stuck" and "Request a part" only with
  their links; Done gold only when the task is not held back; Open is the ghost button); empty states once
  `/today.json` answered (staff: "Nothing is waiting on you.", a student: "Nothing assigned to you"); on an event day
  (`/event.json` `happeningNow`) the compact card and Competition's shift rows (`compete:` ids) first; the shop
  screen's notice from `?blocked=<host label>` (C16: the refusing app's host label, named from the fixed table `BLOCKED_APPS` in `js/portal-home.js`; anything else, no notice). GET and POST give up after 10 s (`WAIT_MS`): 403/404
  offer "Open task", a 5xx puts Done back, no answer says "We couldn't tell if that worked." and asks again. Done's
  messages are one lasting `role=status` line (`#home-done-status`). `sw.js` v6 names `/today.json` and `/today/`.
- **Public header (C8):** every page but Home reads "2972 Team" on one line, in a more compact bar on a phone
  (`renderHeader`, `.brand-short`). Home is unchanged. Shown first in `public-redesign-demo/inner-v2.html`.
- **Tests:** `node --test test/portal-mode-test.cjs test/portal-home-test.mjs`; `test/portal-shell-test.mjs` covers the
  four roles with fake `/today.json` at 1280 and 390, Done and its error, C12, no `/today.json`, the rows, search, the
  shop screen and the bell (`PORTAL_TEST_SHOTS=<dir>` saves screenshots); `test/public-test.mjs` covers the header.

## 2026-11-14: Home, second version (D154, release 8.1)

Home (`index.html`) now matches the approved prototype `public-redesign-demo/home-v2.html`: the team name leads the hero
eyebrow; "The robots" row (the four newest `ROBOTS`, `robotsRow()`); the record has a hint and its log opens at the newest
year on a phone (`scrollLogToNewest()`); the next-event count is a plain line ("In 130 days") until 60 days or fewer,
counted from the date in Colorado (`TEAM_TIME_ZONE`, `teamDay()`); "Our workshop" is chips only and links to About; the
sponsor strip sits in the doors' band, names in type, one "All sponsors" link; a compact footer (`renderCompactFooter()`).
The phone header's team name and the compact footer are Home only (`<body data-home>`), so other pages are unchanged.
New content keys are listed in `docs/CONTENT_EDITING.md`.

**Link previews:** Caddy renders `index.html` as a template on the public and direct hosts (`home_page` in
`container/Caddyfile`, `Cache-Control: no-cache`), so its `og:` tags carry full addresses built from `SITE_SCHEME` and
`SITE_DOMAIN`. Keep every `{{...}}` inside an attribute value (test/drive-photos-test.cjs checks), or a plain local server
breaks the head. `og-image-b1.jpg` is made at image build time by `scripts/drive-photos/fetch.cjs` from the built-in
`SITE.heroImage` (a Drive photo), framed by `heroPosition`; without it the tag names `pwa-icons/site/icon-512.png`. A hero
changed only in the editor reaches the preview picture after the content sync and the next image build.

## 2026-11-11: public site redesign built (Midnight & brass, dark only; replaced by design 8.2 in release 8.3, D190)

Built from `docs/PUBLIC_REDESIGN_PROPOSAL.md` and its approved demo (`public-redesign-demo/`) on `simple-ui`, one commit per
work package, **not pushed or deployed**. Public pages are dark only: `<html data-site="public">` + `<meta name="color-scheme"
content="dark">`, no theme script, no switch, no storage or OS handlers, and they never touch the shared `theme` cookie. The portal,
`portal/install.html`, `offline.html` and `team-login.html` keep light/dark/system (the first token block, the kit's head script,
`scripts/theme-init.mjs`, which now skips the public pages). `sw.js` is `v5`.

- **Where things are:** tokens, header, footer and every page style in `css/style.css`; the shared pieces in `js/components.js`
  (`renderHeader/Footer`, `emailAddress` + Copy, `renderNextUp`, `seasonLog`, `parseResult/resultsTable`, `sponsorNames`,
  `tickerRun`, `initTimeline`). Home, Robots, Robot, Sponsors, Join (member + mentor), About, Resources, Outreach, Media and Contact
  render in their own page script inside `onContent()`; every field still carries its `data-ck` / `data-ck-href` hook.
- **Moved because of the redesign:** `ANNUAL_EVENTS` and the team calendar are on the two Join pages (not About); the competition
  `HISTORY` items are the Robots page's "Highlights", the team ones are About's timeline; `VALUES` and `STRATEGY` are About only;
  videos open on YouTube (nothing is embedded); a sponsor year with no sponsors is hidden (still in the page for the editor).
- **Not built / content the demo invented:** the demo's hero caption names the place ("West Valley City") and its photo alt names the
  event; `content.js` has no such fields, so the caption is derived from the newest award and robot and the alt comes from
  `altFor(SITE.heroImage, ...)`. The workshop machine chips on Home are fixed page text taken from the `HISTORY.today` paragraph.
  The demo lists 49 resource links; `content.js` has 51 (it also has the team logo download and the CAD overview anchor).
- **Tests:** see §6. New: `test/public-test.mjs` (Playwright; every public page at 320/390/1440 with OS dark, OS light and a saved
  light choice, contrast, overflow, console, opacity, text over photos, keyboard walk-throughs, the 1440x900 Home acceptance) and
  `test/season-test.cjs` (season log marks and counts, the results-table parser).

## 2026-11-09: shell 0.1.12 lint correction

Synced the static kit from infra `8d25c35f49c834187f4b6c593039db9af4136fa1` into the clean
`redesign/portal-shell` worktree at `3d0f632`. The reviewed central correction moves mode-cookie assignment
into `setModeCookie` and adds its type declaration; runtime behavior is unchanged. Landing's portal mode
subscription and home refresh remain intact. No app-owned runtime files changed in this correction.

Validation: source/stamp hashes match 0.1.12; generated theme heads are current; portal mode subscription
1/1, theme 175/175, PWA 274/274, install 46/46, and infra offline core/contrast 19/19 pass (including the new
mode-cookie helper test). Syntax checks on the landing adapter, kit static/core modules and SW pass;
`git diff --check` passes. Browser/container/stack checks and the release secret scan remain with the lead.
No heavy jobs, new review/delegates, pushes, merges or deploys ran.

## 2026-11-09: reviewed shell 0.1.11 adoption (D109/D112)

`redesign/portal-shell` resumed from `da30fd2`, matching local `main`, with a clean worktree; no fast-forward
was needed. Synced the static profile from infra `7caa0baa176e120eeda6787247a25fa41a6a42f7` using
`scripts/sync-shell.sh`. The kit is unchanged locally and includes the reviewed Build / Competition buttons
inside Apps, the left launcher, collapsed More with link-outs, and cross-app links opening new tabs.
Landing subscribes to the mode buttons after their cookie write so the home grid, app count and mode label
refresh immediately, including the label for users waiting for a group. The subscription is scoped to the
protected portal; public header/identity behavior, gate routes, theme initialization and SW exclusions are preserved.

Lightweight validation for this adoption:

- Infra `scripts/check-shell.sh static <this worktree>`: 0.1.11 source/stamp hashes match.
- `node scripts/theme-init.mjs --check`: generated heads current; read-only offline output preserved.
- `node --test test/portal-mode-test.cjs`: 1 pass (mode callback, unrelated clicks, cleanup).
- `node test/theme-test.cjs`: 175 pass; `node test/pwa-test.cjs`: 274 pass;
  `node test/install-test.cjs`: 46 pass.
- Infra offline core/contrast tests: 18 pass, including groups, modes, cookies and light/dark token contrast.
- `node --check` on the adapter, kit browser/core modules, SW and inline portal module; `git diff --check`: pass.

Remaining gates belong to the lead's heavy slot: landing browser regressions (especially immediate grid refresh
through Apps mode buttons, keyboard/focus, More, responsive layout and themes), container/stack checks, and the
release secret scan. No builds, browsers, stack jobs, new delegates, pushes, merges or deploys ran for this adoption.

Written 2026-10-25 when the long-running landing session closed. Read this first, then `CLAUDE.md`, `README.md`
and `../infra/docs/{CONVENTIONS,INTEGRATION}.md`. State at hand-off: `main` = `origin/main` = `459dd21`, nothing
uncommitted (this file aside).

## 1. What this repo is

The public website for Team 2972 **and** the logged-in portal home. Plain HTML, CSS and JS, no build step, no
framework. It runs as the `landing` container (static Caddy 2.11.7, port 3001, `expose` only).

| Host | What | Login |
|---|---|---|
| `SITE_DOMAIN`, `www.` | public pages | none |
| `portal.SITE_DOMAIN` | portal home (`portal/index.html`) | any active user, through infra's Caddy |

## 2. How the pages are built

- **`js/content.js`** holds nearly all text, links and photo URLs as plain constants (`SITE`, `HISTORY`, `ROBOTS`, ...).
  Editing the site means editing this file (README explains each field). `"#"` means "not set"; pages hide it.
- **`js/components.js`** draws the shared header and footer, and holds helpers: `hostUrl(sub, path)`, `PORTAL_URL`,
  `REQUEST_URL`, `TASKS_URL`, `SIGNOUT_URL`, the theme switch, the service worker registration and
  `clearOfflineCaches()`. Sign-out links carry `data-signout`; a click handler clears the offline caches first.
- **Every page** loads `config.js` (host settings), then `content.js`, then `components.js`, then renders itself.
  `robot.html?year=YEAR` shows one season; the year is validated against `ROBOTS` (see `test/url-injection-test.*`).
- **`config.js`** is a Caddy template rendered from `SITE_SCHEME` and `SITE_DOMAIN`. Unrendered (plain
  `python3 -m http.server`), the JS falls back to `location.host` with `www.` or `portal.` stripped.
- **Portal data flow:** `portal/index.html` fetches `/me.json` (the identity headers, JSON-escaped by a Caddy template
  in `container/me.json`) and `/apps.json` (`infra/config/apps.json`, mounted read-only at `/config/apps.json`).
  It splits `X-Authentik-Groups` on `|`, shows tiles whose `groups` is `[]` or overlaps the user's, and shows the
  "waiting for an admin" notice, with no tiles, when the user has no group. **Tile filtering is a convenience only.**
  Authentik bindings are the real control. Tile shape: `{id, name, description, host|url, path?, groups, audience,
  comingSoon?}`. Tiles are edited in infra, not here.
- **Photos** come from Google Drive (`lh3.googleusercontent.com/d/<ID>=w<size>`). No rasters are tracked, only SVG
  placeholders in `assets/`. Sizes per place are in README. See section 7 for the photo task (on hold, D68).

## 3. Look, themes and accessibility (MASTER_PLAN D56; public redesign 2026-11-11)

- **Public pages: design 8.2, light only (release 8.3, D190).** `css/site.css`: Big Shoulders + Libre Franklin, self-hosted in
  `fonts/`; every colour is a token at its top (and the red bumper block). The portal keeps `css/style.css` (light-dark tokens).
- Public pages ignore saved theme choices and the OS setting by construction: their one head script is the bumper colour's. The
  portal's app bar and the kit own the `theme` cookie; `test/portal-shell-test.mjs` checks that public pages leave it alone.
- **After touching colours run `test/theme-test.sh` and `LANDING_TEST_NODE_MODULES=... node test/public-test.mjs`.**

## 4. Installable app (PWA, D61)

- `manifest.webmanifest` (site, "Team 2972") and `portal/manifest.webmanifest` ("2972 Portal"). Caddy serves the portal
  one at `/manifest.webmanifest` on the portal host.
- `sw.js`: precaches shared static files (css, js, fonts, icons) and shows `offline.html` when offline. **It never stores a
  page, `/me.json` or `/apps.json`.** Caches are named `2972-static-<VERSION>`; bump `VERSION` when its rules or list
  change. Sign-out clears everything.
- **Public routes needed on both hosts, no secret:** `/manifest.webmanifest`, `/sw.js`, `/offline.html`, and the exact
  icon files `/pwa-icons/<app>/<file>`. Inside this container that is already done. **infra's edge Caddy must send
  those paths to landing without forward auth on the portal host**, or the portal cannot be installed. At hand-off
  I had not confirmed infra did this, so check installability on the live portal after deploy (Chrome DevTools >
  Application > Manifest, "Installability").
- **Icon pack `pwa-icons/`** is for the team apps (`site`, `portal`, `tasks`, `admin`): navy rounded square, gold
  glyph, five files each (`icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png`, `apple-touch-icon.png`).
  Other apps copy their folder into their own `/icons/` (their README: `pwa-icons/README.md`).
  `node pwa-icons/build-icons.cjs` redraws the whole set. Maskable glyphs stay inside the safe zone (tested).

## 5. Container and the gate

`container/Caddyfile` (read its header comment; it is the contract):
`/healthz` is open on every host. Portal host: everything needs `X-Proxy-Secret` equal to `PROXY_SHARED_SECRET` or gets
`401`. On other hosts `/portal/*`, `/me.json`, `/apps.json` are gated too, and on the two public hosts they are `404`.
The gate is a plain header match (CONVENTIONS §4 exception for landing: internal network only, guards only the
viewer's own identity). `container/entrypoint.sh` refuses to start with an empty, short (<16) or odd-character secret.
Gated blocks are inside `route {}` so the 401 runs before any `handle`. Portal responses send `Cache-Control: no-store`
and `X-Robots-Tag: noindex`. Env: `PORT`, `SITE_DOMAIN`, `SITE_SCHEME`, `PROXY_SHARED_SECRET` (`.env.example`).

**How infra deploys it:** `compose.yml` builds `../landing` as `2972/landing:latest`, mounts
`./config/apps.json:/config/apps.json:ro`, and its Caddy proxies the public hosts (identity headers stripped) and the
portal host (forward auth, then `header_up X-Proxy-Secret`) to `landing:3001`. Live updates happen only by running
`infra/scripts/deploy.sh` on the server. Merging or pushing to `main` does not deploy. infra checks out whatever branch
is in `../landing`, so keep `main` checked out there and use `git worktree` for side work.

## 6. Tests and how to run them

| Command | Needs | Covers |
|---|---|---|
| `test/container-test.sh` | docker, curl | build, `/healthz`, the 401/404/200 matrix, escaping in `/me.json`, headers, PWA routes, no photos in the image |
| `test/portal-test.sh` | docker, Chrome | a fake user per group (and none): which tiles show, through the real container and Caddy |
| `test/theme-test.sh` | Chrome | the portal in both themes (WCAG AA, theme choice, following the system); public pages dark under every setting and a saved light choice; tokens-only colours |
| `test/menu-test.sh` | Chrome | the phone Menu button on public pages: opens under the bar, every item on screen and 44px, Escape |
| `LANDING_TEST_NODE_MODULES=<node_modules with playwright> node test/public-test.mjs` | Playwright | every public page, 3 widths x 3 ways of asking for light: dark, no overflow, no console errors, contrast, no text over photos; keyboard walk-throughs; Home 1440x900 |
| `node test/season-test.cjs` | node | season log marks and counts, results-table parser, hostile input |
| `node --test test/portal-mode-test.cjs test/portal-home-test.mjs` | node | the portal adapter (mode, bell, Admin apps, shop screen) and the `/today.json` checks (links, modes, dates, roles) |
| `LANDING_TEST_NODE_MODULES=<node_modules with playwright> node test/portal-shell-test.mjs` | Playwright + its Chromium (an existing install, e.g. another app's) | portal app bar and home grid (D101): tiles per group, main then More, mode cookie, Apps menu keyboard, new-tab links, theme cookie, 320px, sign-out; public pages have no bar. No server: requests are answered in memory |
| `test/url-injection-test.sh` | Chrome | `robot.html?year=` cannot inject markup |
| `node test/legal-test.cjs` | node | privacy and terms pages: head, links, contact, no placeholders, no invented retention/consent claims |
| `node test/install-test.cjs` | node | install banner rules, iPhone detection, offline QR (vendored hash), Share fallback, `/install` Caddy routes |
| `node test/pwa-test.cjs` | node | icons, manifests, page heads, offline page, service worker simulation, Caddy PWA routes |
| gitleaks (Docker image `zricethezav/gitleaks`) | docker | run before each commit; config `.gitleaks.toml`, CI `.github/workflows/gitleaks.yml` |

Chrome path defaults to macOS Google Chrome (`CHROME=` overrides). Fixtures use `@example.com` only.

## 7. Open work

1. **Photo IDs (Phase 3 remainder), ON HOLD (user, 2026-10-27, MASTER_PLAN D68).** Do not start this until the user
   says so. `docs/photo-ids.csv` (76 photo rows) is for the user to fill in with Drive IDs; when it comes back, the plan below
   applies. 43 distinct local files must be uploaded to Drive ("Anyone with the link") and their
   IDs put into `content.js`: gallery 21, robots 7, mentors 6, brand 5, history 2, outreach 2 (some reused).
   Not referenced, skip: `history/early-robot.jpg`, `robots/2025-reefscape-logo.png`. The full table of which field
   takes which file and size is in `docs/PHASE3_TASKS.md` §1. **The user supplies** the Sheet (or the list) of
   file name to Drive ID; I could read it with the Sheets connector. Then: store IDs once and add a `driveImg(id, width)`
   helper, add `width`/`height` + `loading="lazy"`, rewrite the `content.js` top comment (Drive only), do a clean-clone
   check, and run Lighthouse mobile (goal 80+).
2. **D63: install banner, `/install` page, Share button (built 2026-10-27, uncommitted until the user OKs).** Files: `js/install.js`,
   `portal/install.html`, `js/vendor/` (QR library + README), Caddy `/install` routes, footer link, tests in `test/install-test.cjs`.
   Still to do: check on the live site with a real iPhone and Android phone. Tell admin the path `/install`. Original spec:
   - *Banner* on the portal home only (never on public pages): hidden when installed (`display-mode: standalone` or
     `navigator.standalone`); "Not now" remembered 30 days and "Don't show again", both in `localStorage` in try/catch;
     follows light/dark; a fixed overlay so nothing shifts; `role="region"`, focus and Escape handled, reduced motion
     respected. Title "Add the Team 2972 app to your home screen". Chrome/Edge/Android: stash `beforeinstallprompt`,
     an Install button calls `prompt()`, hide on `appinstalled`. iPhone/iPad Safari (detect iPadOS as MacIntel + touch):
     steps "Share, then Add to Home Screen" with small inline icons and a note that notifications will need the app on the
     Home Screen. Other browsers: a "How to install" link to `/install`.
   - *`/install` page* on the portal host (add a Caddy `@install path /install /install/` rewrite to `/portal/install.html`
     after the gate): steps for iPhone, Android, computer; "what you get"; a QR code of the portal address generated in
     the browser from `SITE_SCHEME` + `SITE_DOMAIN`; a "Share this app" button (`navigator.share({title,text,url})` if
     present, else "Copy link" with a short "Copied", clipboard in try/catch). The note that phones cannot install from
     `http://portal.localhost` belongs in a developer HTML comment only.
   - *QR library:* **qrcode-generator 1.4.4** (MIT), vendored at `js/vendor/qrcode.js` with its license and a README
     (provenance + hash). sha256 `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780`, 56694 bytes; admin
     (session admin-92) confirmed the same file so both apps share one version. Draw the SVG yourself from `qr.isDark(r,c)`
     with a 4-module quiet zone, black on white.
   - Footer link "Install the app" on the portal. Tell admin the final path: `/install` on `portal.SITE_DOMAIN`.
   - Tests: banner rules (installed, dismissed, remembered 30 days), iOS branch by user agent, QR produced offline (no
     network calls, vendored hash), share fallback to copy, AA contrast in both themes (extend `theme-test.html`), banner
     absent from every public page, `/install` 401 without secret / 200 with / 404 on public hosts.
3. **Editor groundwork (D55), MERGED into `main` (2026-10-30).** Branch `feature/editable-content` (`764248e`, rebased on `d2c4189`) was merged into `main` with a merge commit, and the branch was fast-forwarded to it, so both names deploy the same code. It adds
   `js/content-loader.js` (content.js is the default; `/content/content.json` from the editor replaces it when valid),
   `data-ck` keys on every field, media image support, container routes for `/content/content.json` and
   `/media/<id>-<400|800|1600>.webp`, `docs/CONTENT_EDITING.md` (the contract with the `editor` repo), loader and
   in-browser tests. The merge kept main's photo work (Drive photos for 2012-2019, outreach photos, the 2020 and 2021 robots removed)
   and adds the new framing fields `SITE.heroPosition` and `ROBOTS[].imagePosition` (checked by `safePosition()` in `js/components.js`).
   Schema changes for the editor are listed at the end of `docs/CONTENT_EDITING.md`. Lead session to log the change to D55 in MASTER_PLAN.
4. **BACKLOG** (`docs/BACKLOG.md`): History is now a timeline (done 2026-10-27) and the mentor listing is gone. "Role of the mentors" section is on `mentor.html` (done 2026-10-27). 2027 regional dates are in (2026-11-07: Intermountain West, Nampa ID, March 24-27; Denver April 7-10). Open: Theseus/Sea Shanty/sponsor/outreach content.
5. **Deploy and verify (infra).** Deploy `459dd21` and check installability on both hosts (section 4). The public
   "Game Analysis Template" link stays. The Kickoff app is no longer part of the suite.
6. **Constant-time secret compare** is an accepted exception (CONVENTIONS §4), listed in `docs/PHASE3_TASKS.md`; revisit
   only if landing ever becomes reachable outside the Docker network.

7a. **Dawson brand (D99, 2026-11-03).** Dawson's wordmark is a base resource, `brand/dawson-school-logo.png` (white
   artwork from dawsonschool.org, allowed in `.gitignore` like the team logo). `schoolMark()` in `js/components.js` draws it as
   a CSS mask filled with `currentColor`, so it takes the text colour of wherever it sits, in both themes; it links to
   `SITE.schoolUrl` and hides everywhere if the file fails to load. Header (every page, portal too): Dawson's Mustang "D" (`brand/dawson-mustang.png`, full colour, transparent with its
   white keyline, made from an image the user supplied) left of the team logo, its own link to `SITE.schoolUrl`.
   Wordmark used: Home "About us" and About page (right column with a
   gold divider; above the heading on phones), and the footer under "FRC Team 2972 · Dawson School" (muted). Media page
   Publicity has a press-inquiry line. Stats row on Home: the top line is gone; thin `--line-2` dividers sit between stats with a 40px gap (24px on phones, between the two columns only). No new content keys (no editor-schema
   change); `SITE.schoolLogo` (media) still feeds the sponsors list. Hero and student photos untouched.
7b. **Event rows (`.schedule-list`, 2026-11-07).** Home schedule, About annual events and robot results share one row style:
   name left, details in a fixed 20rem column (date on top in `--text`, place below), centred. The list is a CSS container and
   stacks (name, date, place) under 720px of its own width, so Home's half-width column always stacks. `keepState()` in
   `js/components.js` keeps ", ID" with its city. Outreach and Contact use cards, not rows, so they were left as is.

## 8. Rules that bit us

- Never commit photos, `.env`, secrets or private Drive IDs; no real people in tests (`@example.com`); keep the gitleaks
  block in `.gitignore`.
- Don't edit `../infra`, `../admin`, `../taskapp` from here; write the need down and tell the user or the lead session.
- Commit only with the user's OK; the user pushes.
- Headless Chrome `--dump-dom` can hang on a page that embeds YouTube. Tests poll for a ready marker instead.
- Keep `light-dark()` to colours; opacity and other values need a separate rule or media query.
