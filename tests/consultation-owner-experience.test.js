const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "consultation", "consultation.js");
const source = fs.readFileSync(scriptPath, "utf8");
const instrumented = source.replace(
  /\r?\n\s*loadConsultation\(\);\s*\r?\n\}\)\(\);\s*$/u,
  "\n  globalThis.__consultationTest = { ownerExperience, hasDetailContent };\n})();\n",
);

const inertNode = {
  addEventListener() {},
  querySelector() { return inertNode; },
};
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

const { ownerExperience, hasDetailContent } = context.__consultationTest || {};
assert.equal(typeof ownerExperience, "function", "ownerExperience helper must exist");
assert.equal(
  ownerExperience(
    { ownerExperience: "Model owners" },
    { ownerExperience: "ConsultationBuilder override" },
  ),
  "ConsultationBuilder override",
  "the published item override must take priority over the model value",
);
assert.equal(
  ownerExperience({ ownersExperience: "Legacy owners field" }, {}),
  "Legacy owners field",
  "the public renderer must accept the plural ownersExperience alias",
);
assert.equal(typeof hasDetailContent, "function", "hasDetailContent helper must exist");
assert.equal(hasDetailContent(["Owner report one", "Owner report two"]), true, "owner bullet arrays must remain visible in comparison details");
assert.equal(hasDetailContent([]), false, "empty arrays must not create empty comparison tabs");

console.log("Consultation owner experience data mapping: OK");
