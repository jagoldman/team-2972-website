# Editable content: how landing works with the site editor

MASTER_PLAN D55. The site editor (repo `editor`) lets admins and mentors change the public pages. It never
edits this repo: it publishes two things into shared volumes, and landing reads them.

```
editor  --Publish-->  site_content/content.json   --> landing: GET /content/content.json
        --Upload--->  site_media/<id>-<w>.webp    --> landing: GET /media/<id>-<w>.webp
```

`js/content.js` stays in git as the **built-in default**. A clean clone, or a site where nothing has been
published, renders from it. The contract with the editor is its zod schema, `editor/src/lib/content/schema.ts`.
Tell the editor session before renaming or adding a section or key.

## The published file

`/content/content.json` is the editor's envelope. Landing also accepts just the sections.

```json
{ "format": 1, "version": 7, "publishedAt": "2026-10-20T12:00:00.000Z",
  "content": { "SITE": {…}, "ROBOTS": […], "TEAM_CALENDAR_URL": "https://…", … },
  "media":   { "<20 hex chars>": { "alt": "…", "width": 3000, "height": 2000, "widths": [400, 800, 1600] } } }
```

- `content` has one key per section of `js/content.js`: the 20 names listed in `contentSections` at the bottom
  of that file. Object sections (`SITE`, …) are merged over the defaults, so a key left out keeps its built-in
  value. Lists and the two URL strings (`TEAM_CALENDAR_URL`, `SPONSOR_PACKET_URL`) are replaced.
- `media` gives each uploaded image its alt text and stored widths.
- An envelope with another `format`, a section of the wrong type, or text that is not JSON is **ignored as a
  whole**. The page then uses the built-in content. Unknown keys and `draft`/`rev` fields are ignored.

## Loader: `js/content-loader.js`

Loaded after `js/content.js` and before `js/components.js` on every page. It starts the fetch at once, waits at
most 1.5 s, and never throws.

| Name | What it is |
|---|---|
| `onContent(fn)` | Run `fn` when the DOM is ready **and** the content has loaded (or the fallback applies). Every page renders inside it. If `fn` throws, the built-in content is restored and `fn` runs again. |
| `setContent(json)` | The editor's live preview: validate, swap the content in place, run every `onContent` function again. Returns `true` if used. Render functions are written so this is safe. |
| `contentGet("ROBOTS[2].image")` | Value at a `data-ck` path (`undefined` if absent). The only way to read the two URL strings. |
| `window.CONTENT_URL` | Set before the script runs to read content from somewhere else (the editor sets this to its draft). Default `/content/content.json`. |
| `window.CONTENT_TIMEOUT_MS` | Wait limit. Default 1500. |
| `CONTENT_SOURCE`, `CONTENT_FALLBACK`, `CONTENT_LOADED`, `CONTENT_MEDIA` | `"published"` or `"default"`; true if a render error forced the built-ins; a promise; the media map. |

## Keys for the editor's overlay: `data-ck`

Every element that shows a content field carries `data-ck="<path>"`. Paths are dotted names plus `[index]`
(`SITE.mission`, `ROBOTS[0].gallery[3]`). The helpers `ck()`, `ckHref()` and `ckAlt()` in `js/components.js`
write the attributes.

- **Lists:** the container has the list's path (`data-ck="ROBOTS"`), even when the list is empty, so "add item"
  always has somewhere to go. Each item's element has the item's path (`ROBOTS[2]`), and its fields have theirs.
  Where the item is a bare link or button with only its label keyed, the item's path is the label's path
  without the last `.field`.
- **Indexes are the real ones** in the full list, even when a page shows only some items (the home page's
  robot reel, resource links hidden because their url is `#`).
- **A field that is not set yet** may still be keyed (a robot with no `tagline`); its parent exists.
- **Extra attributes:** `data-ck-type="rich"` (Markdown subset, so use the value, not the element's text),
  `"image"` (an image shown as a CSS background or in a "Photo wanted" box, so it is not an `<img>`), `"url"`
  (an embed such as a video); `data-ck-href="<path>"` when a link's address is its own field (the text is
  keyed separately); `data-ck-alt="<path>"` on an `<img>` whose alt text comes from another field.
- **`data-ck-ignore`** marks text that only happens to match a content value (page headings, decorative numbers).
- Page text that is written in the HTML files, not in `content.js`, is **not editable** yet (headings, section
  intros, "Become a Sponsor" blurbs, nav labels). To make it editable it must first move into a section.

## What may be in a field

Everything from content is escaped before it reaches the page; nothing is inserted as HTML.

- **Plain text:** shown as typed.
- **Rich text** (bios, descriptions, history paragraphs, CAD notes): `[label](url)`, `**bold**`, `*italic*`,
  exactly the editor's rules (`editor/src/lib/content/text.ts`). A link must be `https:`, `mailto:`, or a page on
  this site (`robot.html?year=2011`, `#top`); anything else stays as typed text.
- **Links from fields** (`url`, `instagram`, …) additionally allow `http:`; `javascript:`, `data:` and
  protocol-relative links are dropped. YouTube embeds are only built from YouTube addresses.

## Images

A field holds `media:<20 hex chars>`, a Google Drive ID or URL, an `https:` URL, or a site path.

- `media:<id>` becomes `/media/<id>-<w>.webp`, where `w` is the smallest of 400, 800, 1600 that is at least
  the width the spot needs (the largest if none is). Uploaded images also get `srcset` of the stored widths.
  `<id>-thumb.webp` is for the editor's screens and is not served.
- Alt text comes from the `media` map when there is one, else from a nearby field (a name, a robot). For
  `media:` values in the built-in content, the map is `contentMedia` at the bottom of `js/content.js` (written by
  the content sync).
- Drive images keep working: `imgUrl()` adds the `=w<size>` suffix as before.
- **Framing a cropped photo:** `SITE.heroPosition` (the hero background) and `ROBOTS[].imagePosition` (the robot's
  photo on cards and its page) are optional CSS positions, `"<x> <y>"` such as `"67% 84%"`. One or two parts, each a
  percentage or `left`/`center`/`right`/`top`/`bottom` (`safePosition()` in `js/components.js`); any other value
  is ignored and the photo is centred.

## Serving (container)

`container/Caddyfile`, snippet `published`. infra mounts the editor's volumes **read-only**:

| Mount in the container | Served as | Headers |
|---|---|---|
| `/srv/content/content.json` | `/content/content.json` | `Cache-Control: no-cache` (revalidates with the ETag), `nosniff` |
| `/srv/media/<id>-<w>.webp` | `/media/<id>-<w>.webp` | `public, max-age=31536000, immutable`, `nosniff` (only when the file exists) |

Nothing else under `/content` or `/media` is served (a half-written `content.json.tmp`, directory listings,
other names, other widths all give 404). Both are public on the public hosts. On the portal host they follow
the portal's login rule. Without the mounts every request is a plain 404 and the built-in content is used.
The pages never set `X-Frame-Options`, and the editor reads them server-side, so no framing is needed.

## Content sync: copying published edits back into git

The editor publishes straight to the live site, so git falls behind. `scripts/content-sync/sync.cjs` copies the
**published** content back into this repo and opens a pull request. It runs on a person's computer with their own
`gh` login; the server never gets a GitHub credential (the user chose this over editor auto-commits, 2026-10-31).

```bash
node scripts/content-sync/sync.cjs --dry-run   # show the diff and the PR text; changes nothing
node scripts/content-sync/sync.cjs             # commit on content-sync/<date>, push it, open a PR
node scripts/content-sync/sync.cjs --no-push   # commit on a local content-sync/<date> branch only
```

Needs Node 20+, `git`, `gh` signed in (`gh auth login`), and gitleaks or Docker for the secret scan. Run it from
any landing checkout; it works in a temporary `git worktree` on `origin/main`, so your checkout and its branch
(which infra builds) are never touched. `--site <url>` reads another site.

What it does:

1. Downloads `https://2972robotics.com/content/content.json`. A 404 means nothing is published yet: it says so
   and exits 0. The file is checked by running `js/content-loader.js` itself (anything the site would ignore is
   refused), plus stricter rules: the editor's envelope, `format: 1`, no `draft`/`rev` fields, at most 2 MB,
   no redirects. Any refusal exits non-zero and writes nothing.
2. Updates `js/content.js` to what the site shows (published sections laid over the built-ins, exactly as the
   loader does), changing as little as it can: a value that did not change keeps its source text and its
   comments; a list or object written over several lines is patched item by item and key by key (equal items
   are matched, so adding a robot at the top touches only the new lines); anything else that changed is written
   fresh in the file's style. It then checks that the new file evaluates to exactly the published content.
3. Writes the alt text and sizes of the uploads the content refers to into `contentMedia` (bottom of
   `js/content.js`); the loader uses it for the built-in content, so the fallback keeps its alt text.
4. Downloads every stored width of each referenced upload (`/media/<id>-<w>.webp`) into `media/`, and deletes
   files there that nothing refers to any more. Uploads nothing refers to are never downloaded. Limits: each
   file must be WebP and at most 2 MB, and at most 50 MB of new images per run.
5. No difference: prints "no changes". Otherwise runs gitleaks, commits, pushes `content-sync/YYYY-MM-DD`
   (`-2`, `-3`, … if taken) and opens a PR against `main` listing the changed sections and images. It never
   pushes to `main` and never merges.

`media/` is the one place photos are committed: the user made editor uploads an exception to "no photos in
git" (2026-10-31), so a clean clone has them. `.gitignore` allows `media/*.webp`, and `.dockerignore` keeps
them out of the image (the container serves `/media/` from the editor's volume).

**How often:** after a batch of edits in the editor, or weekly. Running it twice is harmless: the second run
says "no changes" (or, if the first PR is not merged yet, opens a second PR with the same changes, so merge
or close the open one first).

**What to review in the PR:**

- The changes are ones the team meant to publish (the editor's history shows who published what).
- Nothing private on a public page: no student names with contact details, emails, or private links
  (CONVENTIONS §9). The repo is public; the PR is the last check before the text is in git history.
- New images are fine to keep in a public repo.
- A value written fresh loses the comments inside it, and a changed value that was computed is written as
  plain text (`${SITE.teamNumber}` becomes `2972`; `SITE.github` becomes the URL if `SITE.github` itself
  changed). Put back any comment worth keeping.
- A section listed under "Ignored" is one the editor has but landing does not know: landing needs a code change.

Merging changes nothing on the live site (it already shows the published content); it updates the built-in
fallback and keeps the editor's import (`editor/src/lib/content/importer.ts`) in step with git.

## Tests

```bash
node test/loader-test.cjs      # loader fallback, validation, media, escaping, rich text (no browser)
test/site-test.sh              # every page in headless Chrome: keys, escaping, media, 3 scenarios
test/container-test.sh         # the container: gates, /content and /media routes (needs docker)
test/portal-test.sh            # the portal per group (needs docker and Chrome)
node test/content-sync-test.cjs  # the content sync: refusals, rewrites, images, git (local server, no network)
```

`test/fixtures/content/content.json` is a fake-people envelope with a few deliberately hostile values (an HTML
tag, a `javascript:` link) that the editor's own validator would refuse; they check that landing is safe
even if something other than the editor wrote the file.

## Notes on the contract with the editor (2026-10-20)

Things found while building landing's side, kept here so they are not rediscovered:

- **The file is an envelope.** The editor's publish step writes `{format, version, publishedAt, content, media}`.
  The design doc once said the file has the flat shape of `content.js`; the editor's handoff now says envelope.
  Landing reads both. `draft` and `rev` (added by the editor's preview endpoint) are ignored.
- **Two URLs stay top-level.** The editor's schema has `TEAM_CALENDAR_URL` and `SPONSOR_PACKET_URL` as top-level
  string keys, so landing keeps them there too (they are not in `SITE`). Strings cannot be updated in place, so pages
  read them with `contentGet()`.
- **`main`'s `content.js` did not pass the editor's validator** (5 problems: four history paragraphs written as
  HTML `<a>` links, and `http://frcdesign.org`). On this branch the links are `[text](url)` and the URL is
  `https:`, and the whole default validates as 20 sections. Check again after editing `content.js`:
  run the editor's `validateContent` over it (see `editor/src/lib/content/importer.ts`).
- **The registry is `contentSections`, in camelCase on purpose.** The editor's importer collects every
  UPPER_SNAKE name in `content.js`, so an UPPER_SNAKE registry would be imported as a bogus section.
- **Much visible copy lives in the HTML, not in `content.js`:** page titles and intros, "Become a Sponsor",
  "Our Mission" headings, button labels, navigation. It cannot be edited by the editor until it moves into a section.
- **`robot.html?year=` was written into the page as HTML.** Fixed on `main` separately (commit
  "Escape the year from the address bar", with `test/url-injection-test.sh`). On this branch every
  content value is escaped as well.

## Changes since this branch was cut (rebased onto main, 2026-10-27)

The editor's schema (`editor/src/lib/content/schema.ts`) must follow these:

- `HISTORY` is now an object, not a list of eras: `{ milestones: [{ year, items: [{ kind: "comp"|"team", text }], image?, imageAlt? }], today: { heading, paragraphs[], image?, imageAlt? } }`.
  Milestone item text is rich text (`[text](url)`), not HTML.
- `SCHEDULE_2026` is now `SCHEDULE_2027`.
- `MENTORS` and `PAST_MENTORS` are gone (the mentor listing was removed from the site).
- `RESOURCE_LINKS` items may have a `download` file name.
- `RESOURCE_LINKS[].items[]` may have an optional `note` (one line shown under the label).
- `SPONSOR_TIERS[]` may have an optional `banner` (a Drive ID or `media:<id>`), shown above the tier's sponsors.
- `MEDIA_VIDEOS` items are a URL string or `{ url, caption }`.
- New list `REQUEST_ACCESS: [{ name, what }]` (invite-only resources; shown on Resources and the portal home as "Request access" mail buttons).
- `SITE.onshapePublic`: the public Onshape publication of the robots (Resources page link; the 2025 robot's CAD link).
- Data only: the 2015 robot was renamed.

## Changes from `main` merged on 2026-10-30

The editor's schema must follow these too:

- New optional `SITE.heroPosition` and `ROBOTS[].imagePosition` (strings; see "Framing a cropped photo" above).
- Data only: `SITE.heroImage`, `HISTORY.today.image`, most `ROBOTS[].image` and every `OUTREACH_EVENTS[].image` are now
  Google Drive IDs; the 2023 robot's `binder` is a Drive file link (`https://drive.google.com/file/d/…/view`), not a
  site path. The 2020 and 2021 robots were removed; the 2012 and 2022 robots have names.
