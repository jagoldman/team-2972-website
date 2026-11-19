// Site host settings. In the container, Caddy fills these in from the env vars
// SITE_SCHEME and SITE_DOMAIN (Caddy "templates"). Do not edit them here.
// Under a plain local server they stay unfilled, and js/components.js works the
// host out from the address bar instead.
// drivePhotos is img/drive/manifest.json, written at image build time by
// scripts/drive-photos/fetch.cjs: the Drive photos this server keeps a copy of.
// Unfilled (local preview), every Drive photo loads from Google as before.
window.SITE_ENV = {
  scheme: '{{env "SITE_SCHEME"}}',
  domain: '{{env "SITE_DOMAIN"}}',
  drivePhotos: '{{readFile "img/drive/manifest.json"}}',
};

// Photos with a region blurred (D193). No photo has a blurred region now: the hero photo's blur was removed at the
// owner's request (D206), and it is saved and served under its plain names like every other Drive photo. The list stays,
// read by js/components.js and at image build time by scripts/drive-photos/fetch.cjs, both through photoBlurList() in
// js/components.js, so a region can be blurred again by adding one line under "photos".
//   format    1. The marker that this is the list: without it (or with anything else wrong) the pages treat the list
//             as not arrived and show no Drive photo at all (see photoBlurList()). An empty list is { format: 1, photos: {} }.
//   photos    keyed by Drive ID, for example
//               "<Drive ID>": { "v": "b1", "ellipses": [[0.5, 0.4, 0.03, 0.05]] }
//     v         a mark in the saved files' names (<id>-<v>-<w>.webp), so a copy of the photo from before the blur, cached
//               for a year under the old name, is never asked for again. Change it whenever the regions change, and
//               never reuse a mark this photo had before.
//     ellipses  [centre x, centre y, radius x, radius y], fractions of the photo after its EXIF rotation.
// For these photos the site never falls back to Google: without a saved, blurred copy the photo is not shown at all.
// Adding a photo here also retires its plain names (they answer 404) and needs a new link-preview name if it is the hero
// (OG.file in fetch.cjs).
// (Never two opening braces in a row in this table: Caddy renders this file as a template.)
window.PHOTO_BLUR = { "format": 1, "photos": {} };
