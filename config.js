// Site host settings. In the container, Caddy fills these in from the env vars
// SITE_SCHEME and SITE_DOMAIN (Caddy "templates"). Do not edit them here.
// Under a plain local server they stay unfilled, and js/components.js works the
// host out from the address bar instead.
window.SITE_ENV = {
  scheme: '{{env "SITE_SCHEME"}}',
  domain: '{{env "SITE_DOMAIN"}}',
};
