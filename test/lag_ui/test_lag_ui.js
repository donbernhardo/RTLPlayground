"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let failures = 0;
function check(condition, name) {
  console.log((condition ? "PASS  " : "FAIL  ") + name);
  if (!condition) failures++;
}

const browser = {
  console: { log() {}, error() {} },
  window: { addEventListener() {} },
  document: {},
  Number, Set, String, Array, JSON, parseInt,
};
vm.createContext(browser);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../html/lag.js"), "utf8"), browser);

for (let index = 0; index < 4; index++) {
  const group = index + 1;
  check(browser.lagCommand(index, true, [1, 2]) === `lag ${group} lacp 1 2`,
        `UI group ${group}: LACP command uses one-based group`);
  check(browser.lagCommand(index, false, [1, 2]) === `lag ${group} 1 2`,
        `UI group ${group}: static command uses one-based group`);
  check(browser.lagOffCommand(index) === `lag ${group} lacp off`,
        `UI group ${group}: disable command uses one-based group`);
  check(browser.lagHashCommand(index, {kw: "smac dmac"}) === `laghash ${group} smac dmac`,
        `UI group ${group}: hash command uses one-based group`);
}

const configPage = { console: { log() {}, error() {} }, fetch() {} };
vm.createContext(configPage);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../html/config.js"), "utf8"), configPage);
vm.runInContext('parseConf("lag 1 1 2\\nlag 1 lacp 1 2")', configPage);
check(vm.runInContext('configuration.length === 1 && configuration[0] === "lag 1 lacp 1 2"', configPage),
      "config persistence: LACP replaces static configuration for its group");
vm.runInContext('parseConf("lag 1 lacp off\\nlag 2 lacp 3 4\\nlag 0 lacp 1 2")', configPage);
check(vm.runInContext('configuration.includes("lag 1 lacp off") && configuration.includes("lag 2 lacp 3 4") && !configuration.some(x => x.startsWith("lag 0"))', configPage),
      "config persistence: explicit off retained, invalid group rejected");

console.log(`\n${failures ? "UI TESTS: FAILURES" : "UI TESTS: ALL PASS"} (${failures} failure${failures === 1 ? "" : "s"})`);
process.exit(failures ? 1 : 0);
