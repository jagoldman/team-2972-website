# Team 2972 — Gears & Buccaneers Website

A plain HTML/CSS/JS static site (no build step, no framework) rebuilt from the
old Google Sites page. It's designed to be easy to update just by asking
Claude (or anyone) to "change X" — almost all real content lives in one file.

## Structure

```
index.html        Home
about.html         About Dawson School + FIRST Robotics + mission + schedule
team.html          Mentors & coaches
robots.html        Robot history (2025, 2024, 2023, ...)
sponsors.html       Sponsor tiers + sponsorship packet download
outreach.html      Community outreach events
media.html         Photos / videos / publicity + Instagram
resources.html     Documents, handbook, branding, CAD links
contact.html       Email / Instagram / sponsor CTA

css/style.css      All styling (navy & gold theme)
js/content.js      >>> EDIT THIS FILE to change almost all text, links, and images <<<
js/components.js   Shared header/footer + nav, auto-injected on every page
assets/            Placeholder logo/photos — swap for real images
```

## Editing content

Open `js/content.js`. It's one file of plain data — team info, mentors,
robots, sponsors, schedule, outreach events, and resource links. Change a
value there and it updates on every page that uses it. Look for `TODO`
comments marking sections that still need real content (2024/2023 robot
details, current sponsors, outreach write-ups, media links).

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
