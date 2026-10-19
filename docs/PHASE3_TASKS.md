# Phase 3 tasks: landing

Concrete work list for the landing part of [MASTER_PLAN Phase 3](../../MASTER_PLAN.md). Line numbers are
from the working tree on 2026-10-17 and will drift. Rules come from
[CONVENTIONS](../../infra/docs/CONVENTIONS.md) and [INTEGRATION](../../infra/docs/INTEGRATION.md).

## Where things stand
- One commit (`5734376 Initial commit`). Since then: about 950 changed lines across `.gitignore`,
  `README.md`, `about.html`, `css/style.css`, `index.html`, `js/components.js`, `js/content.js`,
  `resources.html`, `robots.html`, all uncommitted.
- Untracked: `robot.html`, `team-login.html`, `CLAUDE.md`, `docs/`.
- Real photos sit in `assets/` but are ignored by `.gitignore` (`*.jpg`, `*.png`, …). A clean clone
  has only the SVG placeholders, so today **a clean clone shows broken images** everywhere.
- `.gitignore` already has the standard block (uncommitted). There is no `Dockerfile`, `.gitleaks.toml`
  or `.github/workflows/`.
- `infra` has no commits yet. `infra/config/apps.json`, `compose.yml` and the Caddyfile do not exist.

## Tasks, in order

### 0. Baseline and safety
- [ ] With the user's OK, commit the current work as a baseline (check `git status --ignored` first:
      no `.jpg`/`.png`, no `.DS_Store`, no `.env`).
- [ ] `gitleaks git .` (history) and `gitleaks dir .` (tree). Report findings before going on.
- [ ] Add `.gitleaks.toml` and `.github/workflows/gitleaks.yml` (same as infra's).
- [ ] Keep the existing image ignore rules in `.gitignore` above the standard block.

### 1. Images from Google Drive (no infra needed)
Every local raster reference in `js/content.js` moves to `https://lh3.googleusercontent.com/d/<ID>=w<size>`.
The user supplies the Drive IDs. Each file must be shared "Anyone with the link".

| `content.js` | Field | Files | Suggested size |
|---|---|---|---|
| l.35 | `SITE.logo` | `brand/logo.png` | `=w200` (header logo) |
| l.36 | `SITE.heroImage` | `brand/team-2025.jpg` | `=w1600` |
| l.37 | `SITE.schoolLogo` | `brand/dawson-school.png` | `=w400` (field is unused by any page; drop it or use it) |
| l.108, 127, 164 | `HISTORY[].image` | `history/rc-dawson-logo.jpg`, `history/physics-room-2017.jpg`, `brand/team-2025.jpg` | `=w800` |
| l.193–228 | `MENTORS[].photo` | 6 files in `mentors/` | `=w400` |
| l.285, 344, 363, 427 | `ROBOTS[].image` | `robots/2025-sea-bunny.jpg`, `2024-sea-shanty.jpg`, `2023-scurvy.jpg`, `2019-robot.jpg` | `=w800` |
| l.310–331 | `ROBOTS[2025].gallery` | `robots/2025-sea-bunny-cad.png`, `gallery/2025-competition-1…7.jpg`, `gallery/2025-build-1…14.jpg` | `=w600` thumb, link to `=w2000` |
| l.355 | `ROBOTS[2024].gallery` | `robots/2024-sea-shanty-2.jpg` | same as above |
| l.385 | `ROBOTS[2023].binder` | `robots/2023-scurvy-info-sheet.png` | link, `=w2000` or the Drive `/view` page |
| l.566 | sponsor logo | `brand/dawson-school.png` | `=w400` |
| l.589 | `RESOURCE_LINKS` "Team logo (PNG)" | `brand/logo.png` | full size (download link) |
| l.723–730 | `MEDIA_PHOTOS` | `brand/team-2025.jpg`, `brand/hero-field.jpg`, `brand/students-lab.jpg`, `outreach/community-fair.jpg`, `outreach/sponsor-visit.jpg`, `gallery/2025-competition-1.jpg`, `gallery/2025-build-1.jpg`, `history/physics-room-2017.jpg` | `=w600` |

That is 43 distinct files (21 in `gallery/`, 7 in `robots/`, 6 in `mentors/`, 5 in `brand/`, 2 in
`history/`, 2 in `outreach/`; some are used twice). Two local files are not referenced:
`history/early-robot.jpg` and `robots/2025-reefscape-logo.png`.

Also:
- [ ] Simplest for editors: store the Drive ID once per photo and let a helper in `js/components.js`
      add the size per place it is shown (for example `driveImg(id, 400)`). Full URLs must still work.
- [ ] Add `width`/`height` or `aspect-ratio` and `loading="lazy"` (not on the hero) to the `<img>` tags in
      `index.html`, `team.html`, `robots.html`, `robot.html`, `about.html`, `media.html`,
      `outreach.html`, `sponsors.html` and the header logo in `components.js` (l.56).
- [ ] Rewrite the top comment in `content.js` (l.9–17): it says "put image files in assets/ (preferred)",
      which contradicts D8. Drive only, with the size suffix.
- [ ] Clean clone check: `git clone` to a temp folder, serve it, no broken images.

### 2. Host names and public links
- [ ] One setting gives every host URL: portal, `admin.*/request`, `tasks.*`, sign-out. Built from
      `SITE_SCHEME` and `SITE_DOMAIN` (see open question 1 for how a static page learns them).
- [ ] `js/components.js` l.66 (header) and l.88 (footer): "Team Login" points to the portal, not
      `team-login.html`. Add "Request an account" to `admin.SITE_DOMAIN/request` (footer at least).
- [ ] `team-login.html`: becomes a redirect to the portal (`<meta http-equiv="refresh">` plus a plain
      link, keep `noindex`). Its tile code (l.29–46) moves to the portal page.
- [ ] `css/style.css` l.497–520 (`.app-grid`, `.app-card`, `.app-audience`, `.coming-soon`, `.app-note`):
      reuse for portal tiles.

### 3. Container
- [ ] `Dockerfile`: pinned `caddy:2.x.y-alpine`, copy the site, an in-container `Caddyfile`, listen on
      `:{$PORT}` (3001), `EXPOSE 3001`. Add a `.dockerignore` that leaves out `assets/**/*.jpg|png`,
      `.git`, `docs/`.
- [ ] `GET /healthz` → `200 {"status":"ok"}`, no secret.
- [ ] Requests for the portal host (or portal paths, see open question 2) need `X-Proxy-Secret` ==
      `PROXY_SHARED_SECRET`, else `401`.
- [ ] Public host never serves portal files or the identity endpoint.
- [ ] Portal pages send `X-Robots-Tag: noindex`.

### 4. Portal home (portal host)
- [ ] A tiny identity endpoint (D10), for example `/me.json` rendered by Caddy `templates` from the
      `X-Authentik-*` headers. JSON-escape the values. No other headers.
- [ ] `/apps.json` served from the read-only mount.
- [ ] Portal page: "Hi, <name>" (set with `textContent`), tiles where `groups` overlap the user's
      pipe-separated groups (`groups: []` = everyone logged in), the "waiting for an admin to assign
      your group" notice when groups are empty, and a sign-out link (INTEGRATION §1).
- [ ] Uses the shared header/footer from `components.js` so it looks like the public site.

### 5. Retire `TEAM_APPS`
- [ ] `content.js` l.665–719 (`TEAM_APPS`) is the seed for `infra/config/apps.json` (the infra kickoff
      copies it, plus Tasks and Admin). Once apps.json exists, delete `TEAM_APPS` here.
- [ ] Mapping: add `id` and `groups` to each entry; `audience` stays as the label. "Task App"
      (`https://mouro.ai/2972`, l.674) becomes `tasks.SITE_DOMAIN` with groups
      `admin, mentor, student, parent`. Entries with `url: "#"` (Scouting, Team Drive) need a decision
      (open question 5).
- [ ] `TEAM_CALENDAR_URL` (l.59–61) is also used on the public About page (`about.html`
      `calendar-link`); keep it in `content.js`.

### 6. README
- [ ] Start with a plain "what is this" paragraph (Phase 5 asks for it in every repo).
- [ ] Structure list: `team-login.html` (l.15) is now a redirect; add the portal page, `Dockerfile`, `docs/`.
- [ ] "Team Login" section (l.61–67): remove mouro.ai; say tiles now live in `infra/config/apps.json`.
- [ ] "Adding images from Google Drive" (l.69–76): add the `=w<size>` suffix and the sizes to use.
- [ ] "Previewing locally" (l.84): `/Users/jacobgoldman/Documents/Robotics/Website` is a stale personal
      path. Use "from this folder". Say the portal only works inside the infra stack.
- [ ] "Deploying" (l.89–96): delete GitHub Pages and Netlify/Vercel. Say it runs inside the infra stack
      and production updates only through `infra/scripts/deploy.sh`.
- [ ] Keep "edit `content.js`" first for non-developers.

### 7. Hand-off to infra (do not edit infra)
Write down for the user: the compose service (`build: ../landing`, `expose: 3001`, env `PORT`,
`SITE_DOMAIN`, `SITE_SCHEME`, `PROXY_SHARED_SECRET`, healthcheck on `/healthz`, memory limit), the
read-only `apps.json` mount and its container path, and the Caddy blocks (`@`/`www` public with headers
stripped and `/healthz` routed; `portal` with `import protected` and `header_up X-Proxy-Secret`).

### 8. Phase 3 test checklist
- [ ] The root domain loads with no login and no broken images from a clean clone.
- [ ] Portal tiles differ correctly for admin, mentor, student, parent, alumni and no-group test users.
- [ ] Forged groups sent to the public host or the portal host are stripped (portal shows the real groups).
- [ ] Lighthouse performance score is 80 or more on mobile for the home page (image sizes OK).
- Also: a direct request to `landing:3001` for a portal route with fake headers and no or a wrong
  secret gets `401`; `/healthz` gets `200`; `gitleaks` is clean.

## Depends on infra
- `infra/config/apps.json`, the compose service, the Caddy site blocks and test users (P0). None exist yet.
- Exact sign-out path (INTEGRATION §1, verify in P0).
- The request link works end to end only after admin P1.
- Until then: test the container alone with `docker run` and headers sent by hand, and a local
  `apps.json` with fake data.

## Open questions and conflicts
1. **How static pages learn `SITE_DOMAIN`/`SITE_SCHEME`.** Options: Caddy `templates` render a tiny
   `/config.js` from env; or derive from `location.host` by stripping `www.`/`portal.`. The first is
   explicit; the second needs nothing from infra. Local preview with `python3 -m http.server` must still
   work (fall back to relative links).
   **Resolved ([MASTER_PLAN D21](../../MASTER_PLAN.md)):** Caddy-templated `/config.js`; falls back to
   `location.host` when unrendered.
2. **What "portal routes" means.** The plan says "proxy-secret check on portal routes" but not whether the
   container tells portal from public by `Host` header or by a path like `/portal/`. If by `Host`, a direct
   request to `landing:3001` with `Host: landing` is public and returns `200`, so `check.sh`'s forged-header
   test (MASTER_PLAN §5 expects `401` from `landing:3001`) must send the portal `Host` or hit a portal path.
   INTEGRATION should state which.
   **Resolved ([MASTER_PLAN D26](../../MASTER_PLAN.md)):** gated by `Host` *and* path. Portal host needs the
   secret on every path; public hosts 404 portal paths; any other host (direct `landing:3001`) needs the
   secret for `/portal/*`, `/me.json`, `/apps.json`.
3. **Constant-time compare.** CONVENTIONS §4 requires a constant-time secret compare. A static Caddy
   `header` matcher is a plain string compare. Either CONVENTIONS allows this for landing (internal
   network only, no data behind it beyond names and groups), or landing needs a tiny non-Caddy server,
   which goes against D10.
   **Resolved ([MASTER_PLAN D26](../../MASTER_PLAN.md)):** static Caddy's plain string compare is accepted
   for landing. Secrets are ≥16 URL-safe characters with no `*` or spaces (the entrypoint enforces this).
4. **`apps.json` details.** (a) Container mount path is not in the plan; `/config/apps.json` is proposed.
   (b) How a tile names a site host so it works on `localhost` and production (a host-relative form such as
   `"url": "tasks"`, or a `{SITE_DOMAIN}` placeholder landing fills in). (c) `check.sh` compares apps.json
   with bindings; outside links (Calendar, Handbook, GitHub) have no binding and should be skipped.
   INTEGRATION §8 should record all three.
   **Resolved ([MASTER_PLAN D27](../../MASTER_PLAN.md), INTEGRATION §8):** mounted at `/config/apps.json`;
   site tiles use `host` (+ `path`), outside links use `url`, unfinished tiles `comingSoon: true`.
5. **"Coming soon" tiles.** `TEAM_APPS` shows `url: "#"` entries as "Coming soon". Does apps.json allow
   that, or are unfinished tiles left out?
   **Resolved ([MASTER_PLAN D27](../../MASTER_PLAN.md)):** allowed as `comingSoon: true`; shown as a
   disabled card, skipped by `check.sh`.
6. **No-group users and `groups: []` tiles.** CONVENTIONS §3 says no-group users "cannot reach any
   applet". Should they still see everyone-tiles like the handbook and calendar, or only the notice?
   **Resolved ([MASTER_PLAN D27](../../MASTER_PLAN.md)):** notice only. `groups: []` means anyone with a
   group; users with no group see no tiles.
7. **Sign-out path.** INTEGRATION §1 links to Authentik's invalidation flow. With forward auth the
   embedded outpost also sets a cookie per host; the outpost's `/outpost.goauthentik.io/sign_out` may be
   needed too. Infra should confirm in P0.
8. **Who edits tiles.** Today a non-developer edits `content.js`; after Phase 3 tiles live in another repo
   (`infra/config/apps.json`). That is a second place to edit. README must say so; or the plan accepts it.
   **Resolved (MASTER_PLAN Q10):** accepted. README section "Portal tiles live in infra, not here".
9. **Possibly private links on public pages.** `TEAM_CALENDAR_URL` (calendar ID, public About page),
   the handbook and game-analysis Google Docs (public Resources page), and the sponsor packet Drive link
   are in git and on public pages. Confirm each is meant to be public; otherwise move them to portal tiles.
   **Resolved (user, 2026-10-17):** all four are meant to be public. No change.
10. **Real names and photos in `content.js`.** Mentor names, bios and headshots, and adults named in
    `HISTORY`, are published site content. CONVENTIONS §9 bans real people in seeds, tests and docs, not
    in chosen site content, but say so explicitly and confirm the mentors agreed. No students are named.
   **Resolved (MASTER_PLAN Q11):** mentors agreed; their names and photos stay as chosen site content.
