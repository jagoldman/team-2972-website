# TEST ONLY (test/container-test.sh). Never built by infra and never pushed. The landing image (BASE, built from the repo
# Dockerfile just before) with its saved Drive photos replaced by one made-up photo that IS in a blur list, so the
# container test can prove over HTTP that a blurred photo's plain names and old marks answer 404 (D193).
#   docker build --build-context fixture=test/fixtures/blur -f test/fixtures/blur/Dockerfile --build-arg BASE=<image> .
# The main context is the repo root (its .dockerignore applies); the fixture files come from the "fixture" context.
ARG BASE=2972/landing:test

# Stage 1: the real build step (fetch.cjs and the photo rules in js/components.js, as in the repo Dockerfile), reading the
# fixture config.js and content.js, against a local stand-in for lh3 that serves a generated test picture (serve.cjs).
FROM node:24.22.2-alpine3.24 AS drive-photos
WORKDIR /build/scripts/drive-photos
COPY scripts/drive-photos/package.json scripts/drive-photos/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY scripts/drive-photos/fetch.cjs ./
COPY js/components.js /build/js/components.js
COPY --from=fixture config.js /build/config.js
COPY --from=fixture content.js /build/js/content.js
COPY --from=fixture serve.cjs ./serve.cjs
RUN node serve.cjs /build/js/content.js /out/drive

# Stage 2: the landing image with the fixture's photos and its generated drive-retired.caddy (the repo Dockerfile's last step).
FROM ${BASE}
USER root
RUN rm -rf /srv/site/img/drive
COPY --from=drive-photos /out/drive /srv/site/img/drive
RUN mv /srv/site/img/drive/drive-retired.caddy /etc/caddy/drive-retired.caddy
USER nobody
