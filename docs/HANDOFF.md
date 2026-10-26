# landing: handoff

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

- **`js/content.js`** holds nearly all text, links and photo URLs as plain constants (`SITE`, `MENTORS`, `ROBOTS`, ...).
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
  placeholders in `assets/`. Sizes per place are in README. See section 7 for the open photo task.

## 3. Look, themes and accessibility (MASTER_PLAN D56)

- "Night workshop" design: Bricolage Grotesque + Inter, self-hosted in `fonts/` (licenses included).
- **Every colour is a `--token` in the `:root` block at the top of `css/style.css`**, written `light-dark(light, dark)`.
  Colours may appear nowhere else. `--gold` fills (with `--on-gold` text); `--accent` is gold as text and is darker in the
  light theme. The home hero and robot photo cards stay dark in both themes; sponsor logos sit on white tiles.
- Light / Dark / System switch in every header (portal too). The choice is in `localStorage` (try/catch). A one-line
  script in each `<head>` applies it before paint; "System" needs no script (`color-scheme: light dark`).
- **After touching colours run `test/theme-test.sh`.** It checks every page in both themes for WCAG AA and for the
  colour-outside-tokens rule.

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
- **Icon pack `pwa-icons/`** is for all five apps (`site`, `portal`, `tasks`, `admin`, `kickoff`): navy rounded square, gold
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
| `test/portal-test.sh` | docker, Chrome | a fake user per group (and none): which tiles show |
| `test/theme-test.sh` | Chrome | every page, both themes: WCAG AA, tokens-only colours, theme switch |
| `test/menu-test.sh` | Chrome | phone menu on pages with the glass header |
| `test/url-injection-test.sh` | Chrome | `robot.html?year=` cannot inject markup |
| `node test/pwa-test.cjs` | node | icons, manifests, page heads, offline page, service worker simulation, Caddy PWA routes |
| gitleaks (Docker image `zricethezav/gitleaks`) | docker | run before each commit; config `.gitleaks.toml`, CI `.github/workflows/gitleaks.yml` |

Chrome path defaults to macOS Google Chrome (`CHROME=` overrides). Fixtures use `@example.com` only.

## 7. Open work

1. **Photo IDs (Phase 3 remainder).** 43 distinct local files must be uploaded to Drive ("Anyone with the link") and their
   IDs put into `content.js`: gallery 21, robots 7, mentors 6, brand 5, history 2, outreach 2 (some reused).
   Not referenced, skip: `history/early-robot.jpg`, `robots/2025-reefscape-logo.png`. The full table of which field
   takes which file and size is in `docs/PHASE3_TASKS.md` §1. **The user supplies** the Sheet (or the list) of
   file name to Drive ID; I could read it with the Sheets connector. Then: store IDs once and add a `driveImg(id, width)`
   helper, add `width`/`height` + `loading="lazy"`, rewrite the `content.js` top comment (Drive only), do a clean-clone
   check, and run Lighthouse mobile (goal 80+).
2. **D63: install banner, `/install` page, Share button (not built).** I had a working draft in a scratch worktree, but
   the scratch folder was deleted before it could be committed, so **none of it is in git.** Redo from this spec:
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
3. **Editor groundwork (D55), paused.** Branch `feature/editable-content` (`918789c`, local only, not pushed). Adds
   `js/content-loader.js` (content.js is the default; `/content/content.json` from the editor replaces it when valid),
   `data-ck` keys on every field, media image support, container routes for `/content/content.json` and
   `/media/<id>-<400|800|1600>.webp`, `docs/CONTENT_EDITING.md` (the contract with the `editor` repo), loader and
   in-browser tests. **It was cut before the redesign, themes and PWA, so it must be rebased onto `main`** (expect
   conflicts in every page, `components.js` and the Caddyfile). Revive only if the editor app goes ahead.
4. **BACKLOG** (`docs/BACKLOG.md`): rewrite the History section (one paragraph still ends mid-sentence, a `TODO`), and add
   a "role of the mentors" area. Ask the user two questions first: a short explanation of the mentor role, or a per-mentor
   roles list; and where it goes (Team page, "Become a Mentor" block, or About).
5. **Deploy and verify (infra).** Deploy `459dd21` and check installability on both hosts (section 4). Also open: should
   the public "Game Analysis Template" link stay now that Kickoff replaces it on the portal (default: leave it).
6. **Constant-time secret compare** is an accepted exception (CONVENTIONS §4), listed in `docs/PHASE3_TASKS.md`; revisit
   only if landing ever becomes reachable outside the Docker network.

## 8. Rules that bit us

- Never commit photos, `.env`, secrets or private Drive IDs; no real people in tests (`@example.com`); keep the gitleaks
  block in `.gitignore`.
- Don't edit `../infra`, `../admin`, `../taskapp` from here; write the need down and tell the user or the lead session.
- Commit only with the user's OK; the user pushes.
- Headless Chrome `--dump-dom` can hang on a page that embeds YouTube. Tests poll for a ready marker instead.
- Keep `light-dark()` to colours; opacity and other values need a separate rule or media query.
