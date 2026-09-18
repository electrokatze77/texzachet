const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "consultation", "consultation.js"), "utf8");

assert.match(
  source,
  /function showsPerformanceInsights\(value\)\s*\{\s*return text\(value\)\.toLowerCase\(\) !== "lite";\s*\}/u,
  "the lite tariff must be denied performance insights",
);
assert.match(
  source,
  /if \(showsPerformanceInsights\(consultationTariff\)\) \{[\s\S]*?addInsight\(performanceInsights, "Температуры и шум"[\s\S]*?addInsight\(performanceInsights, "FPS"[\s\S]*?\}/u,
  "temperature and FPS cards must be rendered only for eligible tariffs",
);

console.log("Consultation basic tariff performance insight visibility: OK");
