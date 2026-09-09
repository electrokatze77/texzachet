const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scriptPath = path.join(__dirname, "..", "consultation", "consultation.js");
const source = fs.readFileSync(scriptPath, "utf8");
const instrumented = source.replace(
  /\r?\n\s*loadConsultation\(\);\s*\r?\n\}\)\(\);\s*$/u,
  "\n  globalThis.__conclusionLinkTest = { appendLinkifiedText };\n})();\n",
);

function node(tagName) {
  return {
    tagName,
    children: [],
    append(...children) { this.children.push(...children); },
    addEventListener() {},
    querySelector() { return inertNode; },
  };
}

const inertNode = node("inert");
const context = {
  URL,
  console,
  document: {
    addEventListener() {},
    querySelector() { return inertNode; },
    createElement(tagName) { return node(tagName); },
    createTextNode(value) { return { nodeType: 3, textContent: String(value) }; },
  },
  window: { location: { pathname: "/" } },
};
vm.runInNewContext(instrumented, context, { filename: scriptPath });

const { appendLinkifiedText } = context.__conclusionLinkTest || {};
assert.equal(typeof appendLinkifiedText, "function", "conclusions need a safe URL linkifier");

const host = node("p");
appendLinkifiedText(host, "Деталі: https://example.com/laptop?sku=1.");
assert.equal(host.children.length, 3, "the URL must remain between its surrounding text");
const link = host.children[1];
assert.equal(link.tagName, "a");
assert.equal(link.href, "https://example.com/laptop?sku=1");
assert.equal(link.textContent, "https://example.com/laptop?sku=1");
assert.equal(link.target, "_blank");
assert.equal(link.rel, "noopener noreferrer");

const plainHost = node("p");
appendLinkifiedText(plainHost, "javascript:alert(1)");
assert.equal(plainHost.children.length, 1, "unsafe text must not create a link");
assert.equal(plainHost.children[0].tagName, undefined, "unsafe text stays text");

console.log("Consultation conclusion links: OK");
