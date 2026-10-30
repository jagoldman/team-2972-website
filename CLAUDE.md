# landing

The public website for Team 2972 **and** the logged-in portal home. It is plain HTML/CSS/JS with no
build step. Almost all content lives in `js/content.js` (see README).

- Rules: [../infra/docs/CONVENTIONS.md](../infra/docs/CONVENTIONS.md) · Contract:
  [../infra/docs/INTEGRATION.md](../infra/docs/INTEGRATION.md) (§1 sign-out, §2 routes, §8 portal list) ·
  Plan: [../MASTER_PLAN.md](../MASTER_PLAN.md) Phase 3 · Work list: [docs/PHASE3_TASKS.md](docs/PHASE3_TASKS.md)
- Start a session with [docs/KICKOFF_PROMPT.md](docs/KICKOFF_PROMPT.md).

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
  Shape: `[{ "id", "name", "description", "url", "groups": [..], "audience" }]`. `groups: []` means
  every logged-in user. Show a tile when the user's groups overlap `groups`.
- Taskapp lives at `tasks.SITE_DOMAIN`. The old mouro.ai/2972 link goes away (D2).

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
- Commit photos. Images are served from Google Drive (`lh3.googleusercontent.com/d/<ID>=w<size>`), and
  only SVG placeholders are tracked. The image build saves copies under `img/drive/` (gitignored) and
  `imgUrl()` prefers them; see `scripts/drive-photos/fetch.cjs`. Keep its Drive ID rule in step with `imgUrl()`.
- Publish student names, emails or private links on public pages. No real people in tests or docs; use
  `@example.com` (CONVENTIONS §9).
- Commit `.env`, secrets, or Drive IDs of files that are not shared publicly. Keep the standard
  `.gitignore` block and the gitleaks scan.
- Treat portal tile filtering as security. Authentik bindings are the real control.
- Write a colour outside the `--token` block at the top of `css/style.css`, or change colours without running
  `test/theme-test.sh`. Every page must pass WCAG AA in both the light and the dark theme (MASTER_PLAN D56).
- Edit `../infra`, `../admin` or `../taskapp` from here. Write down what infra needs and tell the user.
- Push, or commit without the user's OK.
