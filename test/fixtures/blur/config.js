// TEST FIXTURE, never served and never in the production image (test/container-test.sh builds a test-only image with it).
// A blur list naming one made-up Drive ID, read by the real build step (scripts/drive-photos/fetch.cjs) in
// test/fixtures/blur/Dockerfile, so the drive-retired.caddy that Caddy loads in that image retires this photo's plain
// names and old marks (D193). The production config.js keeps its own list, empty since D206.
window.PHOTO_BLUR = { "format": 1, "photos": { "1TeStOnLyBlUrFiXtUrEiDzZzZzZzZ42": { "v": "b7", "ellipses": [[0.5, 0.45, 0.06, 0.09]] } } };
