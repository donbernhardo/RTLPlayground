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

// Per-group laghash overwrite tests
vm.runInContext('configuration = []; parseConf("laghash 1 smac dmac\\nlaghash 2 sip dip")', configPage);
check(vm.runInContext('configuration.includes("laghash 1 smac dmac") && configuration.includes("laghash 2 sip dip")', configPage),
      "config persistence: different laghash groups do not overwrite each other");
vm.runInContext('parseConf("laghash 1 sip dip")', configPage);
check(vm.runInContext('!configuration.includes("laghash 1 smac dmac") && configuration.includes("laghash 1 sip dip") && configuration.includes("laghash 2 sip dip")', configPage),
      "config persistence: same laghash group overwrites previous setting");

// verifyConfigLines tests
check(configPage.verifyConfigLines("lag 1 lacp 1 2\nip 192.168.2.85\n", "lag 1 lacp 1 2") === true,
      "verifyConfigLines: finds single expected line in saved config");
check(configPage.verifyConfigLines("ip 192.168.2.85\r\nlag 1 lacp 1 2\r\n", "lag 1 lacp 1 2\nip 192.168.2.85") === true,
      "verifyConfigLines: matches regardless of CRLF or line ordering");
check(configPage.verifyConfigLines("ip 192.168.2.85\n", "lag 1 lacp 1 2") === false,
      "verifyConfigLines: detects missing line");
check(configPage.verifyConfigLines("", "lag 1 lacp 1 2") === false,
      "verifyConfigLines: rejects empty saved config");
check(configPage.verifyConfigLines(null, "lag 1 lacp 1 2") === false,
      "verifyConfigLines: rejects null saved config");

async function testSystemSave() {
  const fetchCalls = [];
  const alertCalls = [];
  let mockPostStatus = 200;
  let mockReadback = "";
  let mockFetchConfigFail = false;

  class MockFormData {
    constructor() { this.entries = {}; }
    append(k, v) { this.entries[k] = v; }
  }
  class MockBlob {
    constructor(parts, opts) { this.parts = parts; this.opts = opts; }
  }

  const sysPage = {
    console: { log() {}, error() {} },
    window: { addEventListener() {} },
    document: {
      getElementById(id) {
        if (id === "config_display") {
          return { value: "hostname switch-test\nlag 1 lacp 1 2\n" };
        }
        return { value: "" };
      }
    },
    FormData: MockFormData,
    Blob: MockBlob,
    setInterval(fn, ms) { return 123; },
    clearInterval(id) {},
    fetch(url, options) {
      fetchCalls.push({ url, options });
      if (url === '/config' && options && options.method === 'POST') {
        return Promise.resolve({
          ok: mockPostStatus === 200,
          status: mockPostStatus,
          text: () => Promise.resolve("")
        });
      }
      if (url === '/config') {
        if (mockFetchConfigFail) return Promise.reject(new Error("Network error"));
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockReadback)
        });
      }
      if (url === '/cmd_log') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("lag 1 lacp 1 2\n")
        });
      }
      if (url === '/cmd_log_clear') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("")
        });
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });
    },
    alert(msg) { alertCalls.push(msg); },
    t(key) { return key; },
    fetchIP() {},
    Number, Set, String, Array, JSON, parseInt
  };

  vm.createContext(sysPage);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../html/config.js"), "utf8"), sysPage);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../html/system.js"), "utf8"), sysPage);

  // Test 1: POST /config failure (e.g. 500) must NOT clear cmd_log
  fetchCalls.length = 0;
  alertCalls.length = 0;
  mockPostStatus = 500;
  mockReadback = "lag 1 lacp 1 2\n";
  let ok = await sysPage.sendConfig("lag 1 lacp 1 2\n");
  check(ok === false, "system save: sendConfig returns false on POST failure");
  check(!fetchCalls.some(c => c.url === '/cmd_log_clear'),
        "system save: /cmd_log_clear NOT called when POST /config fails");
  check(alertCalls.length > 0, "system save: alert shown on POST failure");

  // Test 2: POST /config succeeds but verification fails (readback missing lines)
  fetchCalls.length = 0;
  alertCalls.length = 0;
  mockPostStatus = 200;
  mockReadback = "ip 192.168.2.85\n"; // missing lag 1 lacp 1 2
  ok = await sysPage.sendConfig("lag 1 lacp 1 2\n");
  check(ok === false, "system save: sendConfig returns false on verification mismatch");
  check(!fetchCalls.some(c => c.url === '/cmd_log_clear'),
        "system save: /cmd_log_clear NOT called when verification fails");
  check(alertCalls.some(m => m === 'sys_verify_failed' || m.includes("verification")),
        "system save: verification failure alert triggered");

  // Test 3: POST /config succeeds and verification succeeds
  fetchCalls.length = 0;
  alertCalls.length = 0;
  mockPostStatus = 200;
  mockReadback = "ip 192.168.2.85\nlag 1 lacp 1 2\n";
  ok = await sysPage.sendConfig("lag 1 lacp 1 2\n");
  check(ok === true, "system save: sendConfig returns true when verified");
  check(fetchCalls.some(c => c.url === '/cmd_log_clear'),
        "system save: /cmd_log_clear called when config write is verified");
  check(alertCalls.some(m => m === 'sys_save_success' || m.includes("successfully")),
        "system save: success alert triggered");

  // Test 4: flashSave when fetchConfig returns undefined (e.g. read error)
  fetchCalls.length = 0;
  alertCalls.length = 0;
  mockFetchConfigFail = true;
  ok = await sysPage.flashSave();
  check(ok === false, "system save: flashSave returns false when fetchConfig fails");
  check(!fetchCalls.some(c => c.options && c.options.method === 'POST'),
        "system save: no POST when reading current config fails");
  mockFetchConfigFail = false;

  // Test 5: flashStartupSave awaits sendConfig and verifies
  fetchCalls.length = 0;
  alertCalls.length = 0;
  mockPostStatus = 200;
  mockReadback = "hostname switch-test\nlag 1 lacp 1 2\n";
  ok = await sysPage.flashStartupSave();
  check(ok === true, "system save: flashStartupSave awaits sendConfig and returns true on success");
  check(fetchCalls.some(c => c.url === '/cmd_log_clear'),
        "system save: flashStartupSave cleared cmd_log only after verification");
}

testSystemSave().then(() => {
  console.log(`\n${failures ? "UI TESTS: FAILURES" : "UI TESTS: ALL PASS"} (${failures} failure${failures === 1 ? "" : "s"})`);
  process.exit(failures ? 1 : 0);
}).catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});

