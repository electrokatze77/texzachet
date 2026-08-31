const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "consultation", "consultation.js"), "utf8");
const css = fs.readFileSync(path.join(root, "consultation", "consultation.css"), "utf8");

assert.match(
  js,
  /addInsight\(primaryInsights,\s*"Плюсы"[\s\S]*addInsight\(primaryInsights,\s*"Минусы"[\s\S]*addInsight\(primaryInsights,\s*"Опыт владельцев"[\s\S]*addInsight\(performanceInsights,\s*"Температуры и шум"[\s\S]*addInsight\(performanceInsights,\s*"FPS"/u,
  "insights must render as Pros, Cons, Owner experience, Temperatures, FPS",
);
assert.match(js, /\["Опыт",\s*"[^"]+",\s*"experience"/u, "comparison details need the compact Опыт tab");
assert.match(css, /\.insights-primary\s*\{[^}]*grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/su, "the first row needs three equal cards");
assert.match(css, /\.insights-performance\s*\{[^}]*grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/su, "the second row needs two equal cards");
assert.match(css, /@media\s*\(max-width:\s*820px\)[\s\S]*?\.insights-row\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/u, "mobile and narrow tablet layouts need one min-width-safe column");
assert.match(css, /\.insight-card[^}]*min-width\s*:\s*0/su, "cards must be allowed to shrink");
assert.match(css, /\.detail-list\s+li[^}]*overflow-wrap\s*:\s*anywhere/su, "long owner text must wrap");
assert.match(css, /\.comparison-list[^}]*max-width\s*:\s*100%/su, "comparison list must remain inside the viewport");
const experienceCardRule = css.match(/\.insight-card\[data-tone="experience"\]\s*\{([^}]*)\}/su)?.[1] || "";
assert.match(experienceCardRule, /background\s*:\s*#11141c/su, "owner experience must use the same neutral surface as the other cards");
assert.doesNotMatch(experienceCardRule, /radial-gradient/su, "owner experience must not have a purple glow");

console.log("Consultation owner experience responsive layout: OK");
