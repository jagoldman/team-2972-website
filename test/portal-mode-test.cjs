"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../js/portal-shell.js"), "utf8")
  .replace(/^import .*;$/gm, "").replace(/^export /gm, "");

test("portal mode subscription refreshes after a kit click and can be removed", () => {
  const listeners = new Map();
  const root = {
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const context = vm.createContext({ document: { getElementById: () => root } });
  vm.runInContext(source, context);
  let cookie = "build";
  const observed = [];
  const remove = context.bindPortalModeChange(() => observed.push(cookie));
  const click = (matches) => listeners.get("click")({
    target: { closest: (selector) => selector === ".shbar-mode button" && matches },
  });
  cookie = "competition";
  click(true);
  cookie = "build";
  click(true);
  click(false);
  listeners.get("click")({ target: null });
  assert.deepEqual(observed, ["competition", "build"]);
  remove();
  assert.equal(listeners.size, 0);
});


test("portal passes raw groups to the app bar", async () => {
  let props;
  const context = vm.createContext({
    document: { getElementById: () => ({}) },
    fetch: async (url) => ({ ok: true, json: async () => url === "/me.json" ? { name: "Pat", groups: "display|student" } : [] }),
    siteBase: () => ({ scheme: "https", domain: "example.test" }),
    parseGroups: () => [], resolveTiles: () => [], resolveTools: () => [], isDisplayOnly: () => false,
    mountAppBar: (_root, opts) => { props = opts; },
  });
  vm.runInContext(source, context);
  await context.mountPortalShell();
  assert.deepEqual(Array.from(props.user.groups), ["display", "student"]);
});

// Release 8.1.5: the bell (C3) is on, through the portal's own /_shell/inbox; the shop screen (C9) gets no bar.
function shellWith(groups, apps = []) {
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: () => ({}) },
    fetch: async (url) => ({ ok: true, json: async () => url === "/me.json" ? { name: "Pat", groups } : apps }),
    siteBase: () => ({ scheme: "https", domain: "example.test" }),
    parseGroups: (h) => String(h).split("|").filter((g) => ["admin", "mentor", "student", "parent", "alumni"].includes(g)),
    resolveTiles: (list) => list.map((t) => ({ id: t.id, name: t.name, more: !!t.more })),
    resolveTools: () => [{ id: "tool-gear", name: "Gear and sprocket finder" }],
    isDisplayOnly: (raw) => raw.length > 0 && raw.every((g) => g === "display"),
    mountAppBar: (_root, opts) => calls.push(opts),
  });
  vm.runInContext(source, context);
  return { context, calls };
}

test("portal shows the kit's bell and passes the tools to the bar", async () => {
  const { context, calls } = shellWith("mentor");
  const r = await context.mountPortalShell();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].showBell, true);
  assert.equal(calls[0].tools.length, 1);
  assert.equal(r.display, false);
});

test("an Admin apps entry is marked for Home and stays under More in the 0.3.2 bar", async () => {
  const { context, calls } = shellWith("admin", [{ id: "admin", name: "Admin", group: "admin", more: true }, { id: "tasks", name: "Tasks" }]);
  const r = await context.mountPortalShell();
  const home = Object.fromEntries(r.tiles.map((t) => [t.id, t]));
  assert.equal(home.admin.adminGroup, true);
  assert.equal(home.admin.more, false);
  assert.equal(home.tasks.adminGroup, false);
  assert.equal(calls[0].tiles.find((t) => t.id === "admin").more, true);
});

test("the shop screen (only display) gets no bar, and display with a site group is a person", async () => {
  let { context, calls } = shellWith("display");
  let r = await context.mountPortalShell();
  assert.equal(r.display, true);
  assert.equal(calls.length, 0);
  ({ context, calls } = shellWith("display|student"));
  r = await context.mountPortalShell();
  assert.equal(r.display, false);
  assert.equal(calls.length, 1);
});
