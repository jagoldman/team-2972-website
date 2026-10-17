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
- **Unknown names or photos:** leave `name` or `image` as `""`. The site shows "Robot name unknown" or
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

## Portal tiles live in infra, not here

The tiles on the team portal (Task App, Calendar, Handbook, …) and which groups see each one are
listed in **`infra/config/apps.json`** in the infra repo, not in this one. They sit next to the
login rules, so the two can be checked against each other. To add, remove or rename a tile, edit that
file (see the infra README).

Hiding a tile is only a convenience. Who can actually open an app is decided by the login system.

## Files

```
index.html, about.html, team.html,     Public pages
robots.html, robot.html, sponsors.html,  (robot.html shows one season: robot.html?year=2025)
outreach.html, media.html,
resources.html, contact.html
team-login.html    Old address; forwards to the portal
portal/index.html  The portal page (only works inside the full site, behind login)

js/content.js      >>> EDIT THIS to change text, links and photos <<<
js/components.js   Shared header and footer, plus helpers
config.js          Site address settings, filled in by the server. Don't edit.
css/style.css      All styling (navy and gold)
assets/            SVG placeholders only

Dockerfile, container/   How the server runs (see below)
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
```

## Deploying

There is no separate hosting. The live site is updated only by running `infra/scripts/deploy.sh` on
the server, which pulls this repo and rebuilds the container. Merging to `main` does not update the
live site by itself.
