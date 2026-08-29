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

const tufA18Fa808up = parseFpsSection(
  "RTX 5070 у FA808UP-S8022W: офіційно 100 Вт + 15 Вт Dynamic Boost = 115 Вт max TGP; у Turbo видима перевага, у Performance ноут відстає від інших 5070 (Notebookcheck)\n" +
  "Full HD low / mid / high / QHD / 4K\n" +
  "Cyberpunk 2077 FHD Ultra: 93.6 FPS Performance / 105.5 FPS Turbo; тривалий прогін — близько 87.2 / 95.2 FPS\n" +
  "GTA V — 175.7 / 159 / 107.8 / 107 (QHD)\n" +
  "Dota 2 Reborn — 150.9 / 147.5 / 131.2 / 124.9\n" +
  "Final Fantasy XV Benchmark — 204 / 156.2 / 123.3 / — / 93.7 (QHD), 53 (4K)\n" +
  "X-Plane 11.11 — 110 / 97.2 / 80.9\n" +
  "Strange Brigade — 324 / 274 / 260 / 234 / 229.6 (QHD), 89.8 (4K)\n" +
  "Baldur’s Gate 3 — 97.7 QHD DLSS Quality / 61 QHD native / 58.1 4K DLSS Quality / 43.2 4K native\n" +
  "Cyberpunk 2077 2.2 Phantom Liberty — 140.8 / 120.4 / 104.1 / 68.5 / 60.8 (QHD), 26.9 (4K)\n" +
  "Indiana Jones and the Great Circle — 125.9 / — / 39.1\n" +
  "Assassin’s Creed Shadows — 100 / 93 / 77 / 53 / 40 (QHD), 35 FPS 4K native Ultra High\n" +
  "F1 25 — 163.8 / 160.3 / 151.5 / 27.2 FPS 1080p Ultra Max; 30.9 QHD DLSS Quality / 14.3 QHD native / 8.3 4K DLSS / 3.07 4K native\n" +
  "Anno 117: Pax Romana — 107.6 / 85.6 / 66.2 / 34.2; 38.2 QHD DLSS Max Quality / 25.3 QHD native / 23.2 4K DLSS Max Quality"
);
assert.equal(tufA18Fa808up.resolution, undefined);
assert.deepEqual(tufA18Fa808up.games.map((entry) => entry.name), [
  "Cyberpunk 2077",
  "GTA V",
  "Dota 2 Reborn",
  "Final Fantasy XV Benchmark",
  "X-Plane 11.11",
  "Strange Brigade",
  "Baldur’s Gate 3",
  "Cyberpunk 2077 2.2 Phantom Liberty",
  "Indiana Jones and the Great Circle",
  "Assassin’s Creed Shadows",
  "F1 25",
  "Anno 117: Pax Romana",
]);
assert.deepEqual(game(tufA18Fa808up, "Cyberpunk 2077").results, [
  { label: "FHD Ultra · Performance", value: "93.6" },
  { label: "FHD Ultra · Turbo", value: "105.5" },
  { label: "FHD Ultra · тривалий прогін · Performance", value: "87.2" },
  { label: "FHD Ultra · тривалий прогін · Turbo", value: "95.2" },
]);
assert.deepEqual(game(tufA18Fa808up, "GTA V").results, [
  { label: "Full HD low", value: "175.7" },
  { label: "Full HD mid", value: "159" },
  { label: "Full HD high", value: "107.8" },
  { label: "QHD", value: "107" },
]);
assert.deepEqual(game(tufA18Fa808up, "Baldur’s Gate 3").results, [
  { label: "QHD DLSS Quality", value: "97.7" },
  { label: "QHD Native", value: "61" },
  { label: "4K DLSS Quality", value: "58.1" },
  { label: "4K Native", value: "43.2" },
]);
assert.deepEqual(game(tufA18Fa808up, "F1 25").results.slice(-5), [
  { label: "1080p Ultra Max", value: "27.2" },
  { label: "QHD DLSS Quality", value: "30.9" },
  { label: "QHD Native", value: "14.3" },
  { label: "4K DLSS", value: "8.3" },
  { label: "4K Native", value: "3.07" },
]);
assert.equal(tufA18Fa808up.games.some((entry) => /FPS/iu.test(entry.name)), false);
assert.deepEqual(tufA18Fa808up.notes, [
  "RTX 5070 у FA808UP-S8022W: офіційно 100 Вт + 15 Вт Dynamic Boost = 115 Вт max TGP; у Turbo видима перевага, у Performance ноут відстає від інших 5070 (Notebookcheck)",
  "Full HD low / mid / high / QHD / 4K",
]);

console.log("TechZachet FPS normalizer: OK");
