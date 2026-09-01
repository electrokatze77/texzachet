const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "main.css"), "utf8");
const pricingMarkup = html.match(/<section id="pricing"[\s\S]*?<\/section>/u)?.[0] || "";
const planColumns = [...pricingMarkup.matchAll(/<div class="([^"]*)" data-aos="zoom-in"/gu)].map((match) => match[1]);

assert.equal(planColumns.length, 3, "the pricing section must keep three plan cards");
assert.match(pricingMarkup, /<div class="container pricing-content"(?:\s|>)/u, "pricing cards need their own wider container");
assert.match(css, /\.pricing\s+\.pricing-content\s*\{[^}]*max-width\s*:\s*1520px/u, "the pricing container must be 15% wider than the site default");
planColumns.forEach((classes) => {
  assert.match(classes, /\bcol-lg-4\b/u, "desktop pricing cards must stay in one compact row");
  assert.match(classes, /\bcol-md-6\b/u, "tablet pricing cards must remain two per row");
});

console.log("Pricing cards use a wider three-column desktop layout: OK");
