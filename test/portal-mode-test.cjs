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
