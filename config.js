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
