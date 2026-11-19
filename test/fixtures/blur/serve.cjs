// TEST FIXTURE, run inside test/fixtures/blur/Dockerfile only. Serves one generated test picture (plain colour bands, no
// real photo, no network) as a stand-in for lh3, runs the real build step against it with the fixture config.js and
// content.js, and fails the build unless the made-up photo was saved under its marked names and retired in Caddy.
//   node serve.cjs <content.js> <out dir>
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const sharp = require("sharp");

const ID = "1TeStOnLyBlUrFiXtUrEiDzZzZzZzZ42";
const [contentFile, outDir] = process.argv.slice(2);

(async () => {
  const W = 1600, H = 1000, raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; raw[i] = (x * 255 / W) | 0; raw[i + 1] = (y * 255 / H) | 0; raw[i + 2] = 128; }
  const picture = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  const server = http.createServer((req, res) => {
    if (req.url === `/d/${ID}=w1600`) { res.writeHead(200, { "content-type": "image/png" }); res.end(picture); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const env = { ...process.env, DRIVE_BASE_URL: `http://127.0.0.1:${server.address().port}/d/` };
  // Asynchronously, so this process keeps answering the build step's requests.
  const code = await new Promise((r) => spawn(process.execPath, [path.join(__dirname, "fetch.cjs"), contentFile, outDir], { env, stdio: "inherit" }).on("exit", r));
  server.close();
  if (code !== 0) throw new Error(`fetch.cjs exited ${code}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8"));
  const caddy = fs.readFileSync(path.join(outDir, "drive-retired.caddy"), "utf8");
  if (JSON.stringify(manifest[ID]) !== "[400,800,1200,1600]") throw new Error(`the fixture photo was not saved: ${JSON.stringify(manifest)}`);
  for (const w of manifest[ID]) if (!fs.existsSync(path.join(outDir, `${ID}-b7-${w}.webp`))) throw new Error(`no ${ID}-b7-${w}.webp`);
  if (!caddy.includes(ID)) throw new Error("drive-retired.caddy does not name the fixture photo");
  console.log("blur fixture: the made-up photo is saved under its b7 names and retired in drive-retired.caddy");
})().catch((e) => { console.error(e); process.exit(1); });
