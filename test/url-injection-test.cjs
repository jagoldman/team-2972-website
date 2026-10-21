// Checks that nothing taken from the address bar can become HTML or a link target.
// Part 1 (this file, Node): the host name that builds links. Part 2 (url-injection-test.sh): ?year= in Chrome.
// Run: node test/url-injection-test.cjs
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` -- ${detail}` : ""}`); if (!ok) failed++; };

function portalUrlFor(host, protocol = "http:") {
  const ctx = { console, location: { host, protocol, search: "", pathname: "/" }, scrollY: 0 };
  ctx.window = ctx;
  ctx.matchMedia = () => ({ matches: false });
  ctx.addEventListener = () => {};
  ctx.document = { addEventListener() {}, body: { hasAttribute: () => false }, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "components.js"), "utf8") + ";globalThis.out = [PORTAL_URL, REQUEST_URL, SIGNOUT_URL];", ctx);
  return ctx.out;
}

const good = {
  "localhost:8000": ["http://portal.localhost:8000/", "http://admin.localhost:8000/request"],
  "www.2972robotics.com": ["http://portal.2972robotics.com/", "http://admin.2972robotics.com/request"],
  "portal.localhost": ["http://portal.localhost/", "http://admin.localhost/request"],
};
for (const [host, [portal, request]] of Object.entries(good)) {
  const out = portalUrlFor(host);
  check(`host ${host} builds the right links`, out[0] === portal && out[1] === request, out.join(" "));
}
const hostile = ['x"onmouseover="alert(1)', "a<b>c.example", "evil.example/x?y", "a b.example", "x'y.example", "javascript:alert(1)", "evil.example@good.example"];
for (const host of hostile) {
  const out = portalUrlFor(host);
  check(`hostile host ${JSON.stringify(host)} is not put into links`, out.every((u) => /^http:\/\/(portal|admin|auth)\.localhost\//.test(u)), out.join(" "));
}
console.log(failed === 0 ? "ALL PASSED" : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
