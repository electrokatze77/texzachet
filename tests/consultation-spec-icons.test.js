const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "consultation", "consultation.js");
const source = fs.readFileSync(scriptPath, "utf8");
const instrumented = source.replace(
  /\r?\n\s*loadConsultation\(\);\s*\r?\n\}\)\(\);\s*$/u,
  "\n  globalThis.__specIconTest = { specIcon };\n})();\n",
);
const inertNode = { addEventListener() {}, querySelector() { return inertNode; } };
const context = {
  URL,
  console,
  document: {
    addEventListener() {},
    querySelector() { return inertNode; },
    createElementNS() {
      return {
        attributes: {},
        classList: { add() {} },
        dataset: {},
        innerHTML: "",
        setAttribute(name, value) { this.attributes[name] = String(value); },
      };
    },
  },
  window: { location: { pathname: "/" } },
};
vm.runInNewContext(instrumented, context, { filename: scriptPath });

const { specIcon } = context.__specIconTest;
const gpu = specIcon("GPU");
const cpu = specIcon("CPU");
const ram = specIcon("RAM");
const ssd = specIcon("SSD");
const display = specIcon("Дисплей");

assert.equal((gpu.innerHTML.match(/<circle\b/g) || []).length, 2, "GPU icon must show two recognizable cooling fans");
assert.equal((ram.innerHTML.match(/<rect\b/g) || []).length, 4, "RAM icon must show four memory chips");
assert.equal((ssd.innerHTML.match(/<circle\b/g) || []).length, 2, "M.2 SSD icon must show its mounting points");
assert.match(cpu.innerHTML, /<rect\b[\s\S]*<rect\b/u, "CPU icon must show an outer package and inner die");
assert.match(display.innerHTML, /<rect\b[\s\S]*M9 21h6/u, "display icon must show a screen and stand");
for (const icon of [gpu, cpu, ram, ssd, display]) {
  assert.equal(icon.attributes.viewBox, "0 0 24 24", "all specification icons must share one viewBox");
}

console.log("Consultation specification icon semantics: OK");
