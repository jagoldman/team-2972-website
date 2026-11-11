// Opens the theme test with prefers-color-scheme already set on the browser page.
// Chrome's --blink-settings=preferredColorScheme can still answer from the default for an iframe's
// first style pass, after the page's head script has run. Emulation.setEmulatedMedia is sent before
// the test document is opened, so that first read is the scheme under test.
// Usage: node test/theme-scheme.mjs --chrome <path> --profile <dir> --scheme light|dark --url <test url>
import { spawn } from "node:child_process";
import net from "node:net";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : "";
};
const chrome = opt("--chrome");
const profile = opt("--profile");
const scheme = opt("--scheme");
const url = opt("--url");
if (!chrome || !profile || (scheme !== "light" && scheme !== "dark") || !url) {
  console.log("FAIL theme-scheme: usage --chrome --profile --scheme light|dark --url");
  process.exit(1);
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dbg = await freePort();
const proc = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--force-prefers-reduced-motion",
  `--user-data-dir=${profile}`, `--remote-debugging-port=${dbg}`, "--remote-allow-origins=*",
  "about:blank",
], { stdio: "ignore" });
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  try { proc.kill("SIGKILL"); } catch { /* already gone */ }
}
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(1); });
process.on("SIGTERM", () => { stop(); process.exit(1); });

async function json(path) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${dbg}${path}`);
      if (r.ok) return r.json();
    } catch { /* chrome is still starting */ }
    await sleep(100);
  }
  throw new Error("Chrome's debugging port did not answer");
}

try {
  const ver = await json("/json/version");
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", () => reject(new Error("could not attach to Chrome")));
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    const packet = { id: msgId, method, params };
    if (sessionId) packet.sessionId = sessionId;
    ws.send(JSON.stringify(packet));
  });

  const targets = await json("/json/list");
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("Chrome opened no page");
  const attached = await send("Target.attachToTarget", { targetId: page.id, flatten: true });
  const sessionId = attached.result && attached.result.sessionId;
  if (!sessionId) throw new Error("could not attach to the page");
  const emu = await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: scheme }],
  }, sessionId);
  if (emu.error) throw new Error(emu.error.message || "could not set the system colour scheme");
  const nav = await send("Page.navigate", { url }, sessionId);
  if (nav.error) throw new Error(nav.error.message || "could not open the test");

  let html = "";
  for (let i = 0; i < 600; i++) {
    const ev = await send("Runtime.evaluate", {
      expression: "(() => { const done = document.getElementById('done'); if (!done) return ''; const out = document.getElementById('out'); return (out ? out.textContent : '') + '\\n' + done.outerHTML; })()",
      returnByValue: true,
    }, sessionId);
    html = ev.result && ev.result.result && ev.result.result.value || "";
    if (html) break;
    await sleep(250);
  }
  ws.close();
  if (!html) throw new Error("the theme test did not finish");
  process.stdout.write(html);
} catch (err) {
  console.log(`FAIL theme-scheme: ${err.message}`);
  process.exitCode = 1;
} finally {
  stop();
}
