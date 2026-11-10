const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const root = process.env.TEXZACHET_TEST_ROOT || path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "_worker.js"), "utf8");
  const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
  let bytes = "small image";
  let etag = '"small"';
  const env = {
    DB: {}, PLATEGA_MERCHANT_ID: "fixture", PLATEGA_SECRET: "fixture",
    LAPTOP_IMAGES: { async get(key) {
      assert.equal(key, "Asus ROG Strix G18 2025 G814PM.png");
      return { body: bytes, httpEtag: etag, writeHttpMetadata(headers) {
        headers.set("Content-Type", "image/png");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      } };
    } },
  };
  const url = "https://texzachet.com/api/laptop-images/Asus%20ROG%20Strix%20G18%202025%20G814PM.png";
  const first = await worker.fetch(new Request(url), env);
  assert.equal(first.headers.get("Cache-Control"), "public, max-age=0, must-revalidate",
    "Images replaced under the same filename must not be cached for a year");
  assert.equal(first.headers.get("Cloudflare-CDN-Cache-Control"), "no-store",
    "Cloudflare must not serve stale copies of mutable R2 image keys");
  assert.equal(await first.text(), "small image");
  bytes = "full-size replacement";
  etag = '"large"';
  const replaced = await worker.fetch(new Request(url), env);
  assert.equal(await replaced.text(), "full-size replacement");
  assert.equal(replaced.headers.get("ETag"), '"large"');
  const head = await worker.fetch(new Request(url, { method: "HEAD" }), env);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
  console.log("Laptop image replacement cache tests passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
