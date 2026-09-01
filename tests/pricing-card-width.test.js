const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const pricingMarkup = html.match(/<section id="pricing"[\s\S]*?<\/section>/u)?.[0] || "";
const planColumns = [...pricingMarkup.matchAll(/<div class="([^"]*)" data-aos="zoom-in"/gu)].map((match) => match[1]);

assert.equal(planColumns.length, 3, "the pricing section must keep three plan cards");
planColumns.forEach((classes) => {
  assert.match(classes, /\bcol-lg-6\b/u, "desktop pricing cards must span half of the row for readable feature lists");
  assert.match(classes, /\bcol-md-6\b/u, "tablet pricing cards must remain two per row");
});

console.log("Pricing cards use a wide desktop layout: OK");
