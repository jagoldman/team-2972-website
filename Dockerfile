# landing: static Caddy serving the public site and the portal home on $PORT (3001).
# Built by infra (build: ../landing). Env: PORT, SITE_DOMAIN, SITE_SCHEME, PROXY_SHARED_SECRET.
# Portal tiles: infra mounts apps.json read-only at /config/apps.json.
# Published site content: infra mounts the editor's volumes read-only at /srv/content (content.json)
# and /srv/media (<id>-<w>.webp). Without them the site renders its built-in content.

# Stage 1: download the Google Drive photos named in js/content.js and save them as WebP in img/drive
# (scripts/drive-photos/fetch.cjs). A photo that fails is left out and loads from Google as before; the
# build goes on. Docker reuses this layer until content.js or the script changes.
FROM node:24.22.0-alpine3.23 AS drive-photos
WORKDIR /build/scripts/drive-photos
COPY scripts/drive-photos/package.json scripts/drive-photos/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY scripts/drive-photos/fetch.cjs ./
COPY js/content.js /build/js/content.js
RUN node fetch.cjs /build/js/content.js /out/drive

# Stage 2: the site.
FROM caddy:2.11.7-alpine

ENV PORT=3001
# The base image keeps Caddy state in /config and /data. /config is our apps.json mount, and
# nothing here needs saved state, so point Caddy at /tmp (it runs as nobody).
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data

COPY container/Caddyfile /etc/caddy/Caddyfile
COPY container/me.json /srv/templates/me.json
COPY --chmod=0755 container/entrypoint.sh /usr/local/bin/landing-entrypoint
COPY . /srv/site
# config.js reads img/drive/manifest.json, so it must exist (it is "{}" when every download failed).
COPY --from=drive-photos /out/drive /srv/site/img/drive
RUN rm -rf /srv/site/container /srv/site/scripts && test -f /srv/site/img/drive/manifest.json \
	&& mkdir -p /config /srv/content /srv/media

EXPOSE 3001
USER nobody
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/landing-entrypoint"]
