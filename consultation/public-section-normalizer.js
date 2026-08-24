(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PublicSectionNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TEMP_VALUE = String.raw`~?\d{2,3}(?:[.,]\d+)?(?:\s*[-–—]\s*~?\d{2,3}(?:[.,]\d+)?)?\s*(?:[\u00b0\u00ba]\s*)?[C\u0421]\b(?:\s*(?:avg|average|max|maximum))?`;
  const NOISE_VALUE = String.raw`~?\d{1,3}(?:[.,]\d+)?(?:\s*(?:avg|average|max|maximum))?(?:\s*[/•·–—]\s*~?\d{1,3}(?:[.,]\d+)?)*\s*(?:dB(?:\s*\(?A\)?)?|\u0434\u0411\u0410?)`;
  const clean = (value) => value == null ? "" : String(value).trim();
  const lines = (raw, temperature = false) => clean(raw).replace(/\r/g, "")
    .replace(temperature ? /\s*[\u2022\u25cf\u25aa]\s*(?=[\p{L}])/gu : /\s*[\u2022\u25cf\u25aa]\s*/gu, "\n")
    .split("\n").map((line) => line.replace(/^\s*[-–—]\s*/, "").trim()).filter(Boolean);
  const highest = (value) => Math.max(...[...String(value).matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(",", "."))));
  function kind(context) {
    const patterns = [["surface", /surface|chassis|keyboard|palm\s*rest|\u043a\u043e\u0440\u043f\u0443\u0441|\u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440|\u043f\u043e\u0432\u0435\u0440\u0445/giu], ["vram", /vram|gpu\s*(?:memory|mem)|video\s*memory|\u0432\u0438\u0434\u0435\u043e\u043f\u0430\u043c/giu], ["gpu", /\bgpu\b|\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442/giu], ["cpu", /\bcpu\b|\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440/giu]];
    let latest = null;
    patterns.forEach(([name, pattern]) => { for (const match of context.matchAll(pattern)) if (!latest || (match.index ?? -1) > latest.index) latest = { name, index: match.index ?? -1 }; });
    return latest?.name || (/prime95|cinebench|cyberpunk|furmark/iu.test(context) ? "cpu" : null);
  }
  function status(metricKind, value) {
    const max = highest(value); if (!Number.isFinite(max)) return "neutral";
    if (metricKind === "noise") return max <= 40 ? "good" : max <= 48 ? "warning" : "bad";
    if (metricKind === "surface") return max <= 42 ? "good" : max <= 48 ? "warning" : "bad";
    if (metricKind === "vram") return max <= 80 ? "good" : max <= 90 ? "warning" : "bad";
    if (metricKind === "gpu") return max <= 75 ? "good" : max <= 85 ? "warning" : "bad";
    return max <= 80 ? "good" : max <= 89 ? "warning" : "bad";
  }
  function metricFragments(label, value) {
    const source = String(value), matches = [];
    for (const match of source.matchAll(new RegExp(`${TEMP_VALUE}(?:\\s*[/•·]\\s*${TEMP_VALUE})*`, "giu"))) { const start = match.index ?? 0; const metricKind = kind(`${label} ${source.slice(Math.max(0, start - 100), start)}`); matches.push({ start, end: start + match[0].length, status: metricKind ? status(metricKind, match[0]) : "neutral" }); }
    for (const match of source.matchAll(new RegExp(NOISE_VALUE, "giu"))) { const start = match.index ?? 0; matches.push({ start, end: start + match[0].length, status: status("noise", match[0]) }); }
    matches.sort((a, b) => a.start - b.start); const fragments = []; let cursor = 0;
    matches.forEach((match) => { if (match.start < cursor) return; if (match.start > cursor) fragments.push({ text: source.slice(cursor, match.start), status: "neutral" }); fragments.push({ text: source.slice(match.start, match.end), status: match.status }); cursor = match.end; });
    if (cursor < source.length) fragments.push({ text: source.slice(cursor), status: "neutral" });
    const marked = fragments.filter((part) => part.status !== "neutral");
    return { fragments: fragments.length ? fragments : undefined, status: marked.length === 1 ? marked[0].status : "neutral" };
  }
  const unique = (items, key) => items.filter((item) => { const id = key(item); if (unique.seen.has(id)) return false; unique.seen.add(id); return true; });
  function parseTemperatureSection(raw) {
    const source = clean(raw); if (!/[\u00b0\u00ba]\s*[C\u0421]|\b\d{2,3}\s*[C\u0421]\b|\bdBA?\b|noise|\u0448\u0443\u043c|thrott/iu.test(source)) return null;
    const items = [], notes = [], temp = new RegExp(TEMP_VALUE, "giu"), noise = new RegExp(NOISE_VALUE, "giu");
    lines(source, true).forEach((line) => {
      const temperatures = [...line.matchAll(temp)], noises = [...line.matchAll(noise)];
      const simple = line.match(/^\s*(CPU\s*\+\s*GPU|CPU|GPU|VRAM|SSD|SoC|\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440|\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u0430|\u0448\u0443\u043c|noise)\s*[:–—-]?\s*(.+)$/iu);
      const throttle = line.match(/^\s*(throttling|\u0442\u0440\u043e\u0442\u0442\u043b\u0438\u043d\u0433)\s*[:–—-]?\s*(.+)$/iu);
      if (simple && (temperatures.length || noises.length)) { const aliases = { "\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440": "CPU", "\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442\u0430": "GPU", "\u0448\u0443\u043c": "\u0428\u0443\u043c" }; const label = aliases[simple[1].toLowerCase()] || simple[1].replace(/\s+/g, " "); items.push({ label, value: simple[2].trim(), ...metricFragments(label, simple[2].trim()) }); return; }
      if (throttle) { items.push({ label: "\u0422\u0440\u043e\u0442\u0442\u043b\u0438\u043d\u0433", value: throttle[2].trim(), status: "neutral" }); return; }
      if (!temperatures.length && !noises.length) { notes.push(line); return; }
      if (line.length > 110) { items.push({ label: "", value: line, prose: true, ...metricFragments("", line) }); notes.push(line); return; }
      const first = [...temperatures, ...noises].map((match) => match.index ?? Infinity).sort((a, b) => a - b)[0]; const separated = line.match(/^(.{2,70}?)(?::|–|—)\s*(.+)$/);
      const label = (separated?.[1] || line.slice(0, first).trim() || "\u0422\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430").trim(), value = separated?.[2]?.trim() || line.slice(first).trim(); items.push({ label, value, ...metricFragments(label, value) });
    });
    unique.seen = new Set(); const normalized = unique(items, (item) => `${item.label.toLowerCase()}|${item.value.toLowerCase()}`);
    return normalized.length || notes.length ? { items: normalized, notes } : null;
  }
  function fpsDisplay(match, source) { const value = match[1].replace(/\s+/g, " ").trim(); return value.endsWith("+") || /(?:\u043f\u043e\u043d\u0430\u0434|over|more\s+than)\s*$/iu.test(source.slice(Math.max(0, (match.index ?? 0) - 24), match.index ?? 0)) ? value : value; }
  function parseFpsSection(raw) {
    const source = clean(raw), matrixSignal = /\b(?:WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[x×]\s*\d{3,4})\b[^\n]{0,24}\d+(?:[.,]\d+)?\s*\/\s*\d+/i;
    if (!/\bFPS\b|frames?\s*(?:per|\/)?\s*second|\u043a\u0430\u0434\u0440\w*\s*(?:\/|\u0437\u0430)\s*\u0441/iu.test(source) && !matrixSignal.test(source)) return null;
    const games = [], notes = [], resolution = source.match(/\b(?:FHD|QHD|UHD|4K|1080p|1200p|1440p|1600p|2160p|\d{3,4}\s*[x×]\s*\d{3,4})\b/i)?.[0], matrix = /\b(WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[x×]\s*\d{3,4})\b\s*[:–—-]?\s*(~?\d+(?:[.,]\d+)?(?:\s*\/\s*~?\d+(?:[.,]\d+)?)*)/giu, fps = /(~?\d+(?:[.,]\d+)?(?:\s*(?:\/|[–—-])\s*~?\d+(?:[.,]\d+)?)*\+?)\s*FPS\b/giu, byResolution = /\b(\d{3,4}p)\s*[-–—]\s*(~?\d+(?:[.,]\d+)?)\s*FPS\b/giu;
    lines(source).forEach((line) => {
      const resolutionMatches = [...line.matchAll(byResolution)];
      if (resolutionMatches.length >= 2) { const heading = line.slice(0, resolutionMatches[0].index).replace(/[,:;\s]+$/u, "").trim(), splitAt = heading.lastIndexOf(","), name = (splitAt >= 0 ? heading.slice(0, splitAt) : heading).trim(), conditions = splitAt >= 0 ? heading.slice(splitAt + 1).trim() : ""; if (!name) { notes.push(line); return; } const results = resolutionMatches.map((match) => ({ label: match[1].toUpperCase(), value: match[2] })); games.push({ name, fps: results.map((result) => result.value).join(" | "), results, ...(conditions && { conditions }) }); return; }
      const matrixMatches = [...line.matchAll(matrix)]; if (matrixMatches.length) { const name = line.slice(0, matrixMatches[0].index).replace(/^[\s,;:–—]+|[,;:–—]+$/g, "").trim(); if (!name) { notes.push(line); return; } const results = matrixMatches.map((match) => ({ label: match[1].toUpperCase(), value: match[2].replace(/\s+/g, " ").trim() })); games.push({ name, fps: results.map((result) => result.value).join(" | "), results }); return; }
      const found = [...line.matchAll(fps)]; if (!found.length) { notes.push(line); return; } const first = found[0].index ?? 0, heading = line.slice(0, first).replace(/^[\s,;:–—]+|[,;:–—]+$/g, "").trim(), separator = heading.lastIndexOf("—"), name = (separator >= 0 ? heading.slice(0, separator) : heading).trim(), conditions = separator >= 0 ? heading.slice(separator + 1).replace(/(?:[:,;]\s*)?(?:около|примерно|понад|about|around|~)\s*$/iu, "").replace(/[,:;\s]+$/g, "").trim() : ""; if (!name) { notes.push(line); return; } const values = found.map((match) => fpsDisplay(match, line)); games.push({ name, fps: values.join(" · "), ...(conditions && { conditions }) });
    });
    unique.seen = new Set(); const normalized = unique(games, (game) => `${game.name.toLowerCase()}|${game.fps}`); return normalized.length ? { resolution, games: normalized, notes } : null;
  }
  return { parseTemperatureSection, parseFpsSection, metricFragments };
});
