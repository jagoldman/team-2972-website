# landing: static Caddy serving the public site and the portal home on $PORT (3001).
# Built by infra (build: ../landing). Env: PORT, SITE_DOMAIN, SITE_SCHEME, PROXY_SHARED_SECRET.
# Portal tiles: infra mounts apps.json read-only at /config/apps.json.
FROM caddy:2.11.7-alpine

ENV PORT=3001
# The base image keeps Caddy state in /config and /data. /config is our apps.json mount, and
# nothing here needs saved state, so point Caddy at /tmp (it runs as nobody).
ENV XDG_CONFIG_HOME=/tmp/caddy-config XDG_DATA_HOME=/tmp/caddy-data

COPY container/Caddyfile /etc/caddy/Caddyfile
COPY container/me.json /srv/templates/me.json
COPY --chmod=0755 container/entrypoint.sh /usr/local/bin/landing-entrypoint
COPY . /srv/site
RUN rm -rf /srv/site/container && mkdir -p /config

EXPOSE 3001
USER nobody
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
ENTRYPOINT ["/usr/local/bin/landing-entrypoint"]
