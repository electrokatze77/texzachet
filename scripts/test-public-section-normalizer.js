"use strict";
const assert = require("node:assert/strict");
const { parseTemperatureSection, parseFpsSection } = require("../consultation/public-section-normalizer.js");

const temperatures = parseTemperatureSection("CPU: 75 C\nКонтекст без измерения\nGPU: 62 C\nДополнительная заметка");
assert.deepEqual(temperatures.items.map((item) => item.label), ["CPU", "GPU"]);
assert.deepEqual(temperatures.notes, ["Контекст без измерения", "Дополнительная заметка"]);
const longEvidence = parseTemperatureSection("CPU: 75 C\nВ Fire Strike Stress длительный тест фиксирует CPU и GPU ниже 75 C в режиме Performance при продолжительной нагрузке системы.");
assert.equal(longEvidence.items[1].prose, true);
assert.equal(longEvidence.notes.length, 1);
const fpsByResolution = parseFpsSection("Counter-Strike 2, Very High: 1200p — 289 FPS; 1600p — 203 FPS.");
assert.deepEqual(fpsByResolution.games[0].results, [{ label: "1200P", value: "289" }, { label: "1600P", value: "203" }]);
assert.equal(fpsByResolution.games[0].conditions, "Very High");
const fpsWithConditions = parseFpsSection("Indiana Jones and the Great Circle — 2560×1600, Very Ultra, Full Ray Tracing: около 70 FPS");
assert.equal(fpsWithConditions.games[0].name, "Indiana Jones and the Great Circle");
assert.equal(fpsWithConditions.games[0].conditions, "2560×1600, Very Ultra, Full Ray Tracing");
console.log("public section normalizer: ok");
