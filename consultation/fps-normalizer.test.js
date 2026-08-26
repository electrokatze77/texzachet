"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadCurrentNormalizer() {
  const modulePath = path.join(__dirname, "fps-normalizer.js");
  if (fs.existsSync(modulePath)) return require(modulePath).parseFpsSection;

  const applicationPath = path.join(__dirname, "consultation.js");
  const source = fs.readFileSync(applicationPath, "utf8");
  const bootIndex = source.lastIndexOf("  selectorControl.addEventListener");
  assert.ok(bootIndex > 0, "Could not isolate the consultation FPS parser");
  const instrumented = `${source.slice(0, bootIndex)}  globalThis.__parseFpsSection = (value) => parseBenchmarkMatrix(value) || parseStructuredFpsSection(value) || parseFpsSection(value);\n})();`;
  const context = {
    URL,
    console,
    document: { querySelector: () => ({}) },
    window: { location: { pathname: "/" } },
  };
  vm.createContext(context);
  vm.runInContext(instrumented, context);
  return context.__parseFpsSection;
}

const parseFpsSection = loadCurrentNormalizer();

const browserContext = {};
vm.createContext(browserContext);
vm.runInContext(fs.readFileSync(path.join(__dirname, "fps-normalizer.js"), "utf8"), browserContext);
assert.equal(typeof browserContext.TechZachetFpsNormalizer?.parseFpsSection, "function");

function game(section, name, occurrence = 0) {
  const matches = section?.games.filter((entry) => entry.name === name) || [];
  assert.ok(matches[occurrence], `Missing FPS game: ${name} #${occurrence + 1}`);
  return matches[occurrence];
}

const mixedModes = parseFpsSection(
  "Усі значення — даний конфіг, 1920×1080.\n" +
  "Resident Evil Requiem, Max, RT Off, TAA, MFG Off — 77–78 FPS, 1% low 44–46; RT High, DLSS Quality, MFG 4× — 179–180, 70–72.\n" +
  "DOOM: The Dark Ages, Ultra, RT On, DLSS/MFG Off — 60 FPS, 1% low 42; DLSS Quality, MFG 4× — 184–201, 74–100."
);
assert.deepEqual(game(mixedModes, "Resident Evil Requiem").results, [
  { label: "Max · RT Off · TAA · MFG Off", value: "77–78" },
  { label: "Max · RT Off · TAA · MFG Off · 1% low", value: "44–46" },
  { label: "RT High · DLSS Quality · MFG 4×", value: "179–180" },
  { label: "RT High · DLSS Quality · MFG 4× · 1% low", value: "70–72" },
]);
assert.equal(mixedModes.games.some((entry) => /^MFG Off$/i.test(entry.name)), false);

const resolutions = parseFpsSection(
  "Cyberpunk 2077, QHD Ultra: близько 73 FPS; QHD Medium — 119 FPS; QHD Low — 129 FPS\n" +
  "Cyberpunk 2077 RT Overdrive: 1080p — близько 39 FPS у дискретному режимі; 1440p — 19 FPS у дискретному режимі / 28 FPS у гібридному режимі"
);
assert.deepEqual(game(resolutions, "Cyberpunk 2077", 0).results, [
  { label: "QHD Ultra", value: "73" },
  { label: "QHD Medium", value: "119" },
  { label: "QHD Low", value: "129" },
]);
assert.deepEqual(game(resolutions, "Cyberpunk 2077", 1).results, [
  { label: "RT Overdrive · 1080p · дискретний режим", value: "39" },
  { label: "RT Overdrive · 1440p · дискретний режим", value: "19" },
  { label: "RT Overdrive · 1440p · гібридний режим", value: "28" },
]);

const noteAndPlainFps = parseFpsSection(
  "Основний масив FPS і stress-дані отримані на exact i7-14650HX + RTX 5060\n" +
  "Marvel Rivals — 235 FPS\n" +
  "DOOM: The Dark Ages — 240.63 FPS"
);
assert.deepEqual(noteAndPlainFps.games.map((entry) => [entry.name, entry.fps]), [
  ["Marvel Rivals", "235"],
  ["DOOM: The Dark Ages", "240.63"],
]);
assert.equal(noteAndPlainFps.notes[0], "Основний масив FPS і stress-дані отримані на exact i7-14650HX + RTX 5060");
assert.equal(noteAndPlainFps.games.some((entry) => entry.fps === "0"), false);
assert.equal(game(noteAndPlainFps, "Marvel Rivals").results[0].label, "");

const avgMinMatrix = parseFpsSection(
  "iXBT: максимальні пресети; формат — 2560×1600 Avg/Min | 1920×1200 Avg/Min.\n" +
  "Assassin’s Creed Mirage — 68/38 | 86/56.\n" +
  "Cyberpunk 2077 — 46/26 | 75/39; RT — 18/14 | 29/17; RT + DLSS — 54/27 | 82/32."
);
assert.equal(avgMinMatrix.resolution, undefined);
assert.deepEqual(game(avgMinMatrix, "Assassin’s Creed Mirage").results, [
  { label: "2560×1600 · Avg/Min", value: "68 / 38" },
  { label: "1920×1200 · Avg/Min", value: "86 / 56" },
]);
assert.deepEqual(game(avgMinMatrix, "Cyberpunk 2077").results.slice(-2), [
  { label: "RT + DLSS · 2560×1600 · Avg/Min", value: "54 / 27" },
  { label: "RT + DLSS · 1920×1200 · Avg/Min", value: "82 / 32" },
]);

const contextual = parseFpsSection(
  "Cyberpunk 2077 (FHD Ultra, RT OFF, інший тест): 73–83 FPS без масштабування зображення; DLSS Balanced — 87–100 FPS."
);
assert.equal(game(contextual, "Cyberpunk 2077").conditions, undefined);

const legacyResolutionHeading = parseFpsSection(
  "1920×1200: Cyberpunk 2077 (Ultra) — 100 FPS\n" +
  "1920×1200: Forza Horizon 5 (High) — 90 FPS"
);
assert.equal(game(legacyResolutionHeading, "Cyberpunk 2077").results[0].label, "Ultra");
assert.equal(game(legacyResolutionHeading, "Forza Horizon 5").results[0].label, "High");

console.log("TechZachet FPS normalizer: OK");
