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
    // As the kit's resolveTiles (0.4.0): an entry with group "admin" keeps it and is never "more".
    resolveTiles: (list) => list.map((t) => ({ id: t.id, name: t.name, more: t.group !== "admin" && !!t.more, ...(t.group === "admin" ? { group: "admin" } : {}) })),
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

test("an Admin apps entry reaches Home and the 0.4.0 bar as the kit resolved it (group admin, not More)", async () => {
  const { context, calls } = shellWith("admin", [{ id: "admin", name: "Admin", group: "admin" }, { id: "tasks", name: "Tasks" }]);
  const r = await context.mountPortalShell();
  const home = Object.fromEntries(r.tiles.map((t) => [t.id, t]));
  assert.equal(home.admin.group, "admin");
  assert.equal(home.admin.more, false);
  assert.equal(home.tasks.group, undefined);
  const bar = calls[0].tiles.find((t) => t.id === "admin");
  assert.equal(bar.group, "admin");
  assert.equal(bar.more, false);
});

test("the portal's bar is the guide's portal page: appId portal, and the user carries the raw groups", async () => {
  const { context, calls } = shellWith("admin|mentor");
  const r = await context.mountPortalShell();
  assert.equal(calls[0].appId, "portal");
  assert.deepEqual(Array.from(r.user.groups), ["admin", "mentor"]);
  assert.equal(calls[0].user, r.user);
});

test("display with an extra, non-site group is still the shop screen (the real isDisplayOnly)", async () => {
  const { isDisplayOnly } = await import("../js/portal-home.js");
  const { context, calls } = shellWith("display|authentik Admins");
  context.isDisplayOnly = isDisplayOnly;
  const r = await context.mountPortalShell();
  assert.equal(r.display, true);
  assert.equal(calls.length, 0);
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
