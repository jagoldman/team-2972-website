# landing

The public website for Team 2972 **and** the logged-in portal home. It is plain HTML/CSS/JS with no
build step. Almost all content lives in `js/content.js` (see README).

- Rules: [../infra/docs/CONVENTIONS.md](../infra/docs/CONVENTIONS.md) · Contract:
  [../infra/docs/INTEGRATION.md](../infra/docs/INTEGRATION.md) (§1 sign-out, §2 routes, §8 portal list) ·
  Plan: [../MASTER_PLAN.md](../MASTER_PLAN.md) Phase 6 (redesign); Phase 3 is done (its work list, kept for the open
  notes it records: [docs/PHASE3_TASKS.md](docs/PHASE3_TASKS.md))
- Start a session from [docs/HANDOFF.md](docs/HANDOFF.md). The first-build prompt is in `docs/archive/`.
- **Public site (release 8.3, D190):** design 8.2 from `../public-redesign-demo/v8.2/` (white, flag black, bumper blue or
  red, light only), styled by `css/site.css`. `docs/PUBLIC_REDESIGN_PROPOSAL.md` (Midnight & brass, dark only) is replaced.
- **Redesign (MASTER_PLAN D101):** this app adopts the `../portal-demo` interface through infra's shell kit
  (`infra/shell/`: tokens and the shared top app bar). UI changes start in the demo; GPT Sol reviews the change (D103).

## How it runs
- Hosts: `SITE_DOMAIN` and `www.SITE_DOMAIN` (public, no login), `portal.SITE_DOMAIN` (login required,
  any active user; the `portal` Authentik application has no bindings).
- Compose service `landing`, image `2972/landing:latest`, built by infra from `../landing`.
- Container: a static Caddy server (pinned exact version) on `0.0.0.0:$PORT`, which is **3001**. Only
  `expose`, never `ports`.
- `GET /healthz` returns `200` and `{"status":"ok"}` with no secret. Nothing else in the body.
- Env it reads (plain names, mapped by `infra/compose.yml`): `PORT`, `SITE_DOMAIN`, `SITE_SCHEME`,
  `PROXY_SHARED_SECRET`. Build every host URL from `SITE_SCHEME` and `SITE_DOMAIN`, so `localhost`
  and `2972robotics.com` both work.
- Portal tiles come from `infra/config/apps.json`, mounted read-only into the container.
  Shape: `[{ "id", "name", "description", "url" | "host" (+ "path") | "path", "groups": [..], "audience" }]`.
  `url` is an outside link (new tab); `host` a subdomain app; `path` alone a page on the public site. `groups: []`
  means every logged-in user. Show a tile when the user's groups overlap `groups`. Below the tiles, "Get access" holds
  the request cards for the Team Drive and Onshape (both invitation only).
- Taskapp lives at `tasks.SITE_DOMAIN`.

## Identity (portal host only)
- Trust `X-Authentik-Email`, `-Name`, `-Username`, `-Groups`, `-Uid` only when `X-Proxy-Secret` equals
  `PROXY_SHARED_SECRET`. Otherwise respond `401` and ignore them. CONVENTIONS asks for a constant-time
  compare (see the open question in PHASE3_TASKS).
- `X-Authentik-Groups` is **pipe-separated** (`mentor|parent`). Empty means no groups.
- Groups: `admin`, `mentor`, `student`, `parent`, `alumni`. Do not invent others.
- No groups: show "your account is waiting for an admin to assign your group". They cannot reach any
  applet. Whether `groups: []` tiles still show to them is an open question (PHASE3_TASKS).
- Sign-out: use the path in INTEGRATION §1. Infra P0 is verifying it. The likely answer is
  `portal.SITE_DOMAIN/outpost.goauthentik.io/sign_out`, possibly followed by Authentik's invalidation flow.
- Public pages ignore identity headers. Caddy strips them there anyway.

## Must not
- Add a framework or build step without agreement. Editing should stay "change `content.js`".
- Handle sign-in. "Team login" links to the portal, and "Request an account" links to `admin.SITE_DOMAIN/request`.
- Commit photos. Photos live on the server: editor uploads (`media:<id>` in the `site_media` volume; the content
  sync copies only their alt text, into `contentMedia`) or Google Drive (`lh3.googleusercontent.com/d/<ID>=w<size>`),
  where new photos go (the user, 2026-11-01). `test/assets-test.cjs` fails if a local image the site names is not
  tracked or is left out by `.dockerignore`. The image build saves Drive copies under `img/drive/` (gitignored) and
  `imgUrl()` prefers them; see `scripts/drive-photos/fetch.cjs`. Keep its Drive ID rule in step with `imgUrl()`.
- Publish student names, emails or private links on public pages. No real people in tests or docs; use
  `@example.com` (CONVENTIONS §9).
- Commit `.env`, secrets, or Drive IDs of files that are not shared publicly. Keep the standard
  `.gitignore` block and the gitleaks scan.
- Treat portal tile filtering as security. Authentik bindings are the real control.
- Write a colour outside the `--token` blocks at the top of `css/site.css` (public pages) or `css/style.css` (portal, install,
  offline, team-login), or change colours without running `test/theme-test.sh` and `test/public-test.mjs`. The public pages are
  design 8.2, **light only** (no theme switch, never touch the shared `theme` cookie). Their one head script is the bumper's: it
  reads `localStorage["2972-alliance"]` and sets `data-alliance` on `<html>`, nothing else; no other script goes in a public
  page's head. They must pass WCAG AA (4.5:1) with the blue and the red accent. Nothing on them moves except the bumper's
  colour change. The portal, install and offline pages keep light, dark and system, and must pass AA in both themes (D56).
- Show a photo with a blurred region (`window.PHOTO_BLUR` in `config.js`, D193) from anywhere but its saved, blurred copy:
  never from Google, never at its old file name. Change its `v` mark whenever its regions change.
- Edit `../infra`, `../admin` or `../taskapp` from here. Write down what infra needs and tell the user.
- Push, or commit without the user's OK.
