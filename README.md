# Team 2972 — Gears & Buccaneers Website

A plain HTML/CSS/JS static site (no build step, no framework) rebuilt from the
old Google Sites page. It's designed to be easy to update just by asking
Claude (or anyone) to "change X" — almost all real content lives in one file.

## Structure

```
index.html        Home
about.html         About Dawson School + FIRST + mission, values, history, yearly events
team.html          Mentors & coaches
robots.html        Robot archive: one card per season, 2009 to now
robot.html         One season's page, picked by ?year= (e.g. robot.html?year=2025)
team-login.html    Team Login: links to internal apps (each app has its own sign-in)
sponsors.html       Sponsor tiers + sponsorship packet download
outreach.html      Community outreach events
media.html         Photos / videos / publicity + Instagram
resources.html     Documents, handbook, branding, CAD links
contact.html       Email / Instagram / sponsor CTA

css/style.css      All styling (navy & gold theme)
js/content.js      >>> EDIT THIS FILE to change almost all text, links, and images <<<
js/components.js   Shared header/footer + nav, auto-injected on every page
assets/            brand/, robots/, gallery/, mentors/, history/, outreach/ images
```

## Editing content

Open `js/content.js`. It's one file of plain data — team info, mentors,
robots, sponsors, schedule, outreach events, and resource links. Change a
value there and it updates on every page that uses it. Look for `TODO`
comments marking sections that still need real content (2026 robot details,
older robot photos, current sponsors, outreach write-ups, media links).

A link set to `"#"` means "not set yet". Pages hide it, or show it as
"Coming soon" on Team Login, so nothing links nowhere.

### Robots

Each season is one object in `ROBOTS`, newest first. Only `year` and `game`
are required, and each page section appears only when its field is set. The
comment above `ROBOTS` lists every field (stats line, specs, mechanisms,
results, awards, gallery, videos, CAD and code links, and more).

- **Adding a season:** add a new object at the top of `ROBOTS`. The archive
  card and its page at `robot.html?year=YEAR` appear automatically.
- **The Blue Alliance:** every season page gets a link to
  `thebluealliance.com/team/2972/YEAR`, built from the team number. In
  `results`, set `tba` to an event key (such as `"2025mnum"`) to link that
  event. Nothing else is loaded from TBA. Results and awards are typed in by hand.
- **Unknown names or photos:** leave `name` or `image` as `""`. The site shows
  "Robot name unknown" or a "Photo wanted" box and asks alumni for help.
  If a photo is a screenshot from a match video, say so in `photoSource`.
- **Where older results came from:** FIRST's event records
  (frc-events.firstinspires.org/YEAR/team/2972) list a robot name for each
  season since 2015. FIRST copies the previous year's name forward when nobody
  updates it, so names that repeat are left blank with a comment.

### Team Login

`TEAM_APPS` in `content.js` lists the internal tools shown on
`team-login.html`. The page holds no passwords and does no sign-in itself:
each app (such as the Task App at mouro.ai/2972) asks for your account.
Anyone with the link can see the list, so don't put private links on it that
would work without signing in. The page is marked `noindex` to keep it out
of search results.

### Adding images from Google Drive

1. In Drive, right-click the image → Share → set to "Anyone with the link".
2. Copy the file ID out of the share link (`drive.google.com/file/d/FILE_ID/view`).
3. Use this URL format so it actually renders as an image (not a Drive page):
   `https://lh3.googleusercontent.com/d/FILE_ID`
4. Paste that URL into the relevant spot in `js/content.js`.

## Previewing locally

Because the pages load `content.js`/`components.js` as scripts, just
double-clicking `index.html` works in most browsers, but if you hit CORS
issues, run a quick local server from this folder:

```bash
cd "/Users/jacobgoldman/Documents/Robotics/Website"
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Deploying

This is a static site, so it can be hosted anywhere for free:
- **GitHub Pages**: push this folder to a GitHub repo, enable Pages in repo settings.
- **Netlify / Vercel**: drag-and-drop this folder or connect the repo.

No build step is required — the files here are what gets served.
