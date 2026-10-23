# App icons

One consistent set for every Team 2972 app: a navy rounded square with a gold glyph, a different glyph per app.

| Folder | App | Glyph |
|---|---|---|
| `site/` | the public website (`SITE_DOMAIN`, `www`) | gear |
| `portal/` | the portal (`portal.SITE_DOMAIN`) | house |
| `tasks/` | the task app | check in a circle |
| `admin/` | the admin app | shield with a check |
| `kickoff/` | the Kickoff app | target |

Each folder has the same five files:

| File | Size | Use |
|---|---|---|
| `icon.svg` | vector | the source; favicon and `purpose: "any"` |
| `icon-192.png` | 192 x 192 | `purpose: "any"` (rounded square, transparent corners) |
| `icon-512.png` | 512 x 512 | `purpose: "any"` |
| `maskable-512.png` | 512 x 512 | `purpose: "maskable"`: full-bleed square, the glyph inside the safe zone, so Android can crop it to any shape |
| `apple-touch-icon.png` | 180 x 180 | `<link rel="apple-touch-icon">`: opaque and full-bleed, iOS rounds it |

## Using them in an app

Copy the folder's five files into the app's own `/icons/` folder (an app serves its own copy), then:

```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
  { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
]
```

```html
<link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

Keep the manifest's `background_color` and `theme_color` your own app's (the icon background is navy in every app).

## Changing them

Colours and glyphs are in `build-icons.cjs`. Run `node pwa-icons/build-icons.cjs` (needs Google Chrome; set
`CHROME=/path/to/chrome` if it is not at the macOS default) and commit the result. `node test/pwa-test.cjs` checks the
sizes, that the corners are transparent or opaque as they should be, and that every glyph stays inside the maskable
safe zone. Tell the other app sessions when the pack changes, so they copy the new files.
