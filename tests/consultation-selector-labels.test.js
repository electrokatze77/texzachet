const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "consultation", "consultation.js");
const source = fs.readFileSync(scriptPath, "utf8");
const instrumented = source.replace(
  /\r?\n\s*loadConsultation\(\);\s*\r?\n\}\)\(\);\s*$/u,
  "\n  globalThis.__selectorLabelTest = { selectorLabel, normalizeRole };\n})();\n",
);
assert.notEqual(instrumented, source, "test instrumentation must find the script entry point");

const inertNode = { addEventListener() {}, querySelector() { return inertNode; } };
const context = {
  URL,
  console,
  document: {
    addEventListener() {},
    querySelector() { return inertNode; },
  },
  window: { location: { pathname: "/" } },
};
vm.runInNewContext(instrumented, context, { filename: scriptPath });

const { selectorLabel, normalizeRole } = context.__selectorLabelTest || {};
assert.equal(typeof selectorLabel, "function");
const makeView = (role, rank, name = "ASUS TUF Gaming F16") => ({
  role, item: { rank }, model: { name }, overrides: {},
});
assert.equal(selectorLabel(makeView("recommendation", 1)), "№1 — ASUS TUF Gaming F16");
assert.equal(selectorLabel(makeView("recommendation", 2)), "№2 — ASUS TUF Gaming F16");
assert.equal(selectorLabel(makeView("alternative")), "+ Альтернатива — ASUS TUF Gaming F16");
assert.equal(selectorLabel(makeView("upgrade")), "+ Вариант с доплатой — ASUS TUF Gaming F16");
assert.equal(selectorLabel(makeView("anti")), "× Не рекомендую — ASUS TUF Gaming F16");
assert.equal(normalizeRole("anti_recommendation"), "anti", "legacy anti roles must use the same selector label");
assert.equal(
  selectorLabel({ ...makeView("anti"), overrides: { name: "Точная конфигурация" } }),
  "× Не рекомендую — Точная конфигурация",
  "consultation-level model name override must be reflected in the selector",
);
console.log("Consultation selector role labels: OK");
