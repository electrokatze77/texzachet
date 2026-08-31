const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "consultation", "consultation.css"), "utf8");

assert.match(css, /--anti\s*:\s*#e5ad7a/iu, "the anti-recommendation palette needs one pale-orange token");
assert.match(css, /\.active-role\[data-role="anti"\][^}]*color\s*:\s*var\(--anti\)/su, "the anti label must use pale orange");
assert.match(css, /\.active-role\[data-role="anti"\]\s*>\s*span[^}]*color\s*:\s*var\(--anti\)/su, "the anti icon must use pale orange");
assert.match(css, /\.rank-badge\[data-role="anti"\][^}]*border-color\s*:\s*var\(--anti\)/su, "the anti rank badge must use the shared accent");
assert.match(css, /\.hero-card\[data-role="anti"\][^}]*background\s*:\s*radial-gradient[^}]*229\s+173\s+122/su, "the anti hero needs a restrained warm background tint");
assert.match(css, /\.insights\[data-anti="true"\][\s\S]*?\.insight-card\[data-tone="negative"\][^}]*--card-accent\s*:\s*var\(--anti\)/u, "the anti detail card must share the pale-orange accent");
assert.match(css, /\.comparison-row-card\[data-role="anti"\][^}]*--position-accent\s*:\s*var\(--anti\)/su, "the anti comparison row must share the pale-orange accent");

console.log("Consultation anti-recommendation palette: OK");
