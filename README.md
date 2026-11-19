# Team 2972 — Gears & Buccaneers Website

This is the public website for FRC Team 2972 (Gears & Buccaneers, Dawson School) at
2972robotics.com, plus the **team portal** at portal.2972robotics.com. The portal is the page team
members see after they log in, with links to the team apps they're allowed to use. It's plain
HTML, CSS and JavaScript with no build step.

## Changing the website: edit `js/content.js`

Almost everything on the public pages comes from one file: **`js/content.js`**. Team info,
mentors, robots, sponsors, schedule, outreach, resource links and photos are all there. Change a value,
save, and every page that uses it updates. Look for `TODO` comments marking content that's still
missing.

A link set to `"#"` means "not set yet". Pages hide it, so nothing links nowhere.

### Robots

Each season is one object in `ROBOTS`, newest first. Only `year` and `game` are required, and each
page section appears only when its field is set. The comment above `ROBOTS` lists every field.

- **Adding a season:** add a new object at the top of `ROBOTS`. Its archive card and its page at
  `robot.html?year=YEAR` appear automatically.
- **The Blue Alliance:** every season page links to `thebluealliance.com/team/2972/YEAR`. In
  `results`, set `tba` to an event key (such as `"2025mnum"`) to link that event. Results and awards
  are typed in by hand.
- **Unknown names or photos:** leave `name` or `image` as `""`. The site shows "<year> Robot" (for example "2022 Robot") or
  a "Photo wanted" box. If a photo is a screenshot from a match video, say so in `photoSource`.
- **Older results** come from FIRST's event records (frc-events.firstinspires.org/YEAR/team/2972).
  FIRST copies the previous year's robot name forward when nobody updates it, so repeated names are
  left blank with a comment.

### Photos come from Google Drive

Photos are **not** stored in this repo (only SVG placeholders are). They're served from Google Drive:

1. In Drive, right-click the image → Share → "Anyone with the link" (Viewer). Every photo appears on
   the public site, so only share ones the team wants published.
2. Copy the file ID from the share link: `drive.google.com/file/d/FILE_ID/view`.
3. Use `https://lh3.googleusercontent.com/d/FILE_ID=w<width>` in `js/content.js`. The `=w<width>`
   part asks Drive for a smaller copy, so pages load fast. Use:

| Where it's shown | Width |
|---|---|
| Header logo | `=w200` |
| Home page hero | `=w1600` |
| Robot and history photos | `=w800` |
| Mentor headshots, sponsor logos | `=w400` |
| Gallery thumbnails (link the full photo with `=w2000`) | `=w600` |

The live site doesn't make visitors wait on Google: each deploy downloads every Drive photo in `js/content.js`
once, saves it as WebP at 400, 800, 1200 and 1600 px, and serves those copies itself from `/img/drive/`
(`scripts/drive-photos/fetch.cjs`, run by the `Dockerfile`). A photo that can't be downloaded, or one added
after the last deploy, still loads from Drive as before, and so does every photo in a local preview. To try
the download by hand: `cd scripts/drive-photos && npm ci && node fetch.cjs` (writes `img/drive/`, which git
ignores). A changed photo needs a new Drive file, not an edit of the old one, because visitors' browsers keep
the saved copy for a year.

## Look: design 8.2, light only (public pages, release 8.3, D190)

The 13 public pages follow `../public-redesign-demo/v8.2/` (its README has the reasons and the eight rules): white paper, flag
black ink, arena grey bands, and one accent, the bumper colour, blue `#1d43c0` or red `#c3122a`. Headlines and numerals are Big
Shoulders (900), text is Libre Franklin, both self-hosted in `fonts/`. The pages load only `css/site.css`; `css/style.css` is the
portal's (and still holds the old Midnight & brass public block, unused, until the portal's owner agrees to remove it).

- **Light only.** `<html data-site="public">`, `<meta name="color-scheme" content="light">`, `theme-color #ffffff`. The pages
  ignore the system setting and any saved light/dark choice, have no theme switch, and never touch the shared `theme` cookie.
- **The bumper.** Home's hero photo has the bumper across its base: a button that swaps the accent between blue and red. The
  choice is kept in `localStorage["2972-alliance"]` (a colour, nothing personal) and set before the first paint by each public
  page's one head script, so a red choice never flashes blue. That script is the only one allowed in a public page's head.
- **To change a colour, edit one line** in the token block at the top of `css/site.css` (`--ink`, `--paper`, `--floor`,
  `--rule`, `--text-2`, `--mute`, `--accent`, `--accent-press`, `--on-accent`, the footer greys) or the red block under it.
  Don't write colours anywhere else (`node test/theme-test.cjs` catches it).
- **To change the headline face**, change `--display` and its one `@font-face` (one line and one file).
- **The rules:** the accent only for acting and winning; soft corners only for buttons and the bumper; no boxes round content
  (the school's box is the one); no upper-case labels, no middle dots, no arrows on links (an outside link says "opens in a
  new tab" to a screen reader); no text over photographs; nothing moves except the bumper's colour change (none with
  reduced motion).
- **The portal, its install page and the offline page keep Light / Dark / System** (the first token block, written
  `light-dark(light, dark)`, and the shell kit's app bar). Their pages carry the kit's no-flash theme script, written by
  `node scripts/theme-init.mjs` (run it after each kit sync; it skips the public pages).
- **After changing colours, run `test/theme-test.sh` and `test/public-test.mjs`.** The first checks the portal in both themes and that
  public pages stay light under every setting; the second walks every public page at 320, 390 and 1440 px, with blue and red.

## Installable app (PWA)

The public site and the portal can each be installed like an app (Chrome, Edge, Android: "Install"; iPhone: "Add to Home
Screen"). Both are separate apps with their own name and icon: **Team 2972** and **2972 Portal**.

- `manifest.webmanifest` (site) and `portal/manifest.webmanifest` (portal) name the app and list its icons. The server
  gives the portal host the portal's manifest at the same address, `/manifest.webmanifest`.
- `sw.js` is the service worker. It keeps the shared files (styles, scripts, fonts, icons) so the app starts fast, and shows
  `offline.html` when there is no connection. **It never stores a page, `/me.json` or `/apps.json`**, and signing out
  clears everything it stored. Change `VERSION` at the top of `sw.js` when its rules or file list change.
- `pwa-icons/` is the icon pack for the Team 2972 apps (site, portal, tasks, admin). Its `README.md`
  says how the other apps copy it, and `node pwa-icons/build-icons.cjs` redraws it.
- Public on the portal host too, with no secret: `/manifest.webmanifest`, `/sw.js`, `/offline.html` and the exact icon
  files in `/pwa-icons/<app>/`. infra's Caddy must send those paths to landing without forward auth.
- Tests: `node test/pwa-test.cjs` (icons, manifests, page heads, and a simulation of the service worker that tries to
  make it store anything about a person) and the PWA section of `test/container-test.sh`.

## Portal tiles live in infra, not here

The tiles on the team portal (Task App, Calendar, Handbook, …) and which groups see each one are
listed in **`infra/config/apps.json`** in the infra repo, not in this one. They sit next to the
login rules, so the two can be checked against each other. To add, remove or rename a tile, edit that
file (see the infra README).

Hiding a tile is only a convenience. Who can actually open an app is decided by the login system.

## Files

```
index.html, about.html, mentor.html,     Public pages (light only, css/site.css)
member.html, robots.html, robot.html,    (robot.html shows one season: robot.html?year=2025)
sponsors.html, outreach.html, media.html,
resources.html, contact.html, privacy.html, terms.html
team-login.html    Old address; forwards to the portal
portal/index.html  The portal page (only works inside the full site, behind login)

js/content.js      >>> EDIT THIS to change text, links and photos <<<
js/components.js   Shared header and footer, plus helpers
config.js          Site address settings, filled in by the server. Don't edit.
css/site.css       The public pages' styles (design 8.2, light only)
css/style.css      The portal, install, offline and team-login styles (light/dark/system)
fonts/             The fonts and their licenses (Big Shoulders and Libre Franklin for the public pages; Bricolage Grotesque
                   and Inter for the portal); hosted here, not loaded from Google
assets/            SVG placeholders only

Dockerfile, container/   How the server runs (see below)
scripts/drive-photos/    Downloads the Drive photos when the image is built
test/                    Container and portal checks
docs/                    Work plans for developers
```

## Previewing on your computer

From this folder, run:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. The public pages work this way. The portal and the "Team Login"
link need the full site (login, server), so they only work inside the infra stack.

## How it runs (for developers)

The site runs as the `landing` container in the team's server setup (the `infra` repo). It is a
small Caddy web server on port 3001:

- `2972robotics.com` and `www.` serve the public pages, with no login.
- `portal.2972robotics.com` serves the portal. infra's Caddy handles login and passes the user's name and
  groups in headers. This container only trusts them when the request also carries the shared
  proxy secret, and answers `401` otherwise. Details: `container/Caddyfile`, `CLAUDE.md`, and
  `infra/docs/INTEGRATION.md`.
- `GET /healthz` returns `{"status":"ok"}`.

Settings (environment variables): `PORT`, `SITE_DOMAIN`, `SITE_SCHEME` and `PROXY_SHARED_SECRET`.
See `.env.example`. To check the container on its own (needs Docker; the portal check also needs
Google Chrome):

```bash
test/container-test.sh
test/portal-test.sh
test/theme-test.sh     # light and dark themes (needs Chrome)
node test/pwa-test.cjs # installable app: icons, manifests, service worker
node test/drive-photos-test.cjs  # Drive photos saved at build time (needs `npm ci` in scripts/drive-photos)
```

## Deploying

There is no separate hosting. The live site is updated only by running `infra/scripts/deploy.sh` on
the server, which pulls this repo and rebuilds the container. Merging to `main` does not update the
live site by itself.
