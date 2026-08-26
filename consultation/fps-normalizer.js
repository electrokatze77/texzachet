(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TechZachetFpsNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const fpsNumberSource = String.raw`~?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*~?\d+(?:[.,]\d+)?)?`;
  const explicitSettingPattern = /\b(?:FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4}|very\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|max(?:imum)?|native|RT\b|DLSS\b|FSR\b|XeSS\b|TAA\b|MSAA\b|FG\b|MFG\b|ray\s*tracing|трасування\S*\s+промен|максимальн\S*\s+налаштуван)/iu;
  const explicitSettingStartPattern = /^(?:FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4}|very\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|max(?:imum)?|native|RT\b|DLSS\b|FSR\b|XeSS\b|TAA\b|MSAA\b|FG\b|MFG\b|ray\s*tracing|трасування\S*\s+промен|максимальн\S*\s+налаштуван)/iu;

  function lines(raw) {
    return String(raw ?? "").replace(/\r/g, "").replace(/\s*[•●▪]\s*/gu, "\n").split("\n")
      .map((line) => line.replace(/^\s*[-–—]\s*/u, "").trim()).filter(Boolean);
  }

  function cleanGameName(value) {
    return value.trim().replace(/^[•\s,;:—-]+/u, "").replace(/[,:;—-]+\s*$/u, "").trim();
  }

  function settingLabel(value) {
    return value.trim()
      .replace(/^[,:;\s]+|[,:;.\s]+$/gu, "")
      .replace(/^з\s+(?=DLSS|FSR|XeSS|FG|MFG)/iu, "")
      .replace(/генерацією\s+кадрів/iu, "генерація кадрів")
      .replace(/\b(native)\b/giu, "Native")
      .replace(/\b(rt|dlss|fsr|xess|taa|msaa|fg|mfg)\s+off\b/giu, (_, technology) => `${technology.toUpperCase()} Off`)
      .replace(/\b(rt|dlss|fsr|xess|taa|msaa|fg|mfg)\s+on\b/giu, (_, technology) => `${technology.toUpperCase()} On`)
      .replace(/^максимальні\s+налаштування$/iu, "Максимальні налаштування")
      .replace(/\s*,\s*/g, " · ").replace(/\s+·\s+/g, " · ");
  }

  function resultLabel(parts) {
    const seen = new Set();
    return parts.flatMap((part) => part ? [settingLabel(part)] : []).filter((part) => {
      if (!part) return false;
      const key = part.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(" · ");
  }

  function splitParentheticalContext(value) {
    const match = value.match(/\(([^()]*)\)\s*$/u);
    if (!match) return { text: value.trim(), settings: "", context: "" };
    const settings = [], context = [];
    for (const part of match[1].split(/\s*,\s*/u)) {
      (explicitSettingPattern.test(part) ? settings : context).push(part.trim());
    }
    return {
      text: value.slice(0, match.index).trim(),
      settings: resultLabel(settings),
      context: context.filter((part) => !/^інший\s+тест$/iu.test(part)).join(", "),
    };
  }

  function splitGameAndSettings(value) {
    const parenthetical = splitParentheticalContext(value);
    const source = parenthetical.text.replace(/[,:;\s]+$/u, "").trim();
    const resolutionHeading = source.match(/^(?:\d{3,4}\s*[×x]\s*\d{3,4}|\d{3,4}p|FHD|QHD|UHD|4K)[^:]*:\s*(.+)$/iu);
    const presentation = resolutionHeading?.[1]?.trim() || source;
    let name = presentation;
    let settings = parenthetical.settings;
    let sharedSettings = "";
    const dash = presentation.match(/^(.*?)\s+[—-]\s+(.+)$/u);
    if (dash && explicitSettingPattern.test(dash[2])) {
      name = dash[1].trim();
      settings = resultLabel([dash[2], settings]);
    }
    const colon = name === presentation ? presentation.lastIndexOf(":") : -1;
    if (colon >= 0) {
      const candidate = presentation.slice(colon + 1).trim();
      if (explicitSettingStartPattern.test(candidate)) {
        name = presentation.slice(0, colon).trim();
        settings = resultLabel([candidate, settings]);
      }
    }
    const parts = name.split(/\s*,\s*/u);
    const settingIndex = parts.findIndex((part, index) => index > 0 && explicitSettingPattern.test(part));
    if (settingIndex > 0) {
      name = parts.slice(0, settingIndex).join(", ").trim();
      settings = resultLabel([parts.slice(settingIndex).join(", "), settings]);
    }
    const suffix = name.match(/^(.*?)\s+(RT\s+Overdrive)$/iu);
    if (suffix) {
      name = suffix[1].trim();
      settings = resultLabel([suffix[2], settings]);
      sharedSettings = suffix[2];
    }
    return { name: cleanGameName(name), settings, sharedSettings, context: parenthetical.context };
  }

  function clauseParts(value) {
    const dash = value.match(/^(.+)\s+[—-]\s+(.+)$/u);
    if (dash) return { label: dash[1].trim(), result: dash[2].trim() };
    const colon = value.match(/^(.+?)\s*:\s*(.+)$/u);
    return colon ? { label: colon[1].trim(), result: colon[2].trim() } : null;
  }

  function firstClauseParts(value) {
    const fpsIndex = value.search(/\bFPS\b/iu);
    if (fpsIndex < 0) return null;
    const prefix = value.slice(0, fpsIndex);
    const colon = prefix.lastIndexOf(":");
    const dashMatches = [...prefix.matchAll(/\s+[—-]\s+/gu)];
    const dashMatch = dashMatches[dashMatches.length - 1];
    const dash = dashMatch?.index ?? -1;
    let separator = Math.max(colon, dash);
    let separatorLength = separator === colon ? 1 : dashMatch?.[0].length ?? 0;
    if (colon >= 0 && dash > colon && explicitSettingStartPattern.test(prefix.slice(colon + 1, dash).trim())) {
      separator = colon;
      separatorLength = 1;
    }
    if (separator < 0) return null;
    return { label: value.slice(0, separator).trim(), result: value.slice(separator + separatorLength).trim() };
  }

  function clauseResultLabel(base, clause) {
    if (!clause) return base;
    const hasResolution = /\b(?:FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4})\b/iu;
    const startsNewPreset = /\b(?:very\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|max(?:imum)?|native|RT|DLSS|FSR|XeSS|TAA|MSAA|FG|MFG|ray\s*tracing)\b/iu.test(clause);
    return (hasResolution.test(base) && hasResolution.test(clause)) || startsNewPreset ? settingLabel(clause) : resultLabel([base, clause]);
  }

  function descriptorLabel(value) {
    const descriptor = value.replace(/^[\s,./]+|[\s,.;]+$/gu, "")
      .replace(/^у\s+дискретному\s+режимі$/iu, "дискретний режим")
      .replace(/^у\s+гібридному\s+режимі$/iu, "гібридний режим");
    return /^(?:без\s+масштабування\s+зображення|без\s+RT|з\s+RT|у\s+дискретному\s+режимі|у\s+гібридному\s+режимі)$/iu.test(value.trim()) ? descriptor : "";
  }

  function normalizedFpsValue(value) {
    return value.replace(/\s+/g, " ").replace(/~/g, "").trim();
  }

  function pushFpsResult(results, label, value) {
    const result = { label: settingLabel(label), value: normalizedFpsValue(value) };
    const key = `${result.label.toLocaleLowerCase()}|${result.value}`;
    if (!results.some((entry) => `${entry.label.toLocaleLowerCase()}|${entry.value}` === key)) results.push(result);
  }

  function avgMinResolutions(raw) {
    return [...raw.matchAll(/\b(\d{3,4}\s*[×x]\s*\d{3,4})\s+Avg\s*\/\s*Min\b/giu)]
      .map((match) => match[1].replace(/\s+/g, ""));
  }

  function parseAvgMinGame(line, resolutions) {
    const clauses = line.split(/;\s*/u).filter(Boolean);
    const first = clauseParts(clauses.shift() ?? "");
    if (!first) return null;
    const results = [];
    const addClause = (value, mode = "") => {
      const pairs = [...value.matchAll(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/gu)];
      pairs.forEach((pair, index) => {
        const resolution = resolutions[index];
        if (resolution) pushFpsResult(results, resultLabel([mode, resolution, "Avg/Min"]), `${pair[1]} / ${pair[2]}`);
      });
    };
    addClause(first.result);
    clauses.forEach((clause) => { const parts = clauseParts(clause); if (parts) addClause(parts.result, parts.label); });
    if (!results.length) return null;
    return { name: cleanGameName(first.label), fps: results.map((result) => result.value).join(" · "), results, detail: line };
  }

  function parseClauseResults(resultText, baseLabel, inferLow) {
    const results = [];
    const labelledMetric = new RegExp(`(${fpsNumberSource})\\s*(?:FPS\\s*)?(середні|середній|average|avg|максимум|maximum|max|мінімум|minimum|min)(?=\\s|[/,.;]|$)`, "giu");
    for (const match of resultText.matchAll(labelledMetric)) {
      const metric = /серед|average|avg/iu.test(match[2]) ? "Середній" : /макс|maximum|max/iu.test(match[2]) ? "Максимум" : "Мінімум";
      pushFpsResult(results, metric, match[1]);
    }
    if (results.length >= 2) return results;
    const explicit = new RegExp(`(${fpsNumberSource})\\s*FPS\\b([^/;]*)`, "giu");
    for (const match of resultText.matchAll(explicit)) pushFpsResult(results, resultLabel([baseLabel, descriptorLabel(match[2])]), match[1]);
    const low = resultText.match(new RegExp(`1%\\s*low\\s*(${fpsNumberSource})`, "iu"));
    if (low) pushFpsResult(results, resultLabel([baseLabel, "1% low"]), low[1]);
    if (!results.length) {
      const values = [...resultText.matchAll(new RegExp(fpsNumberSource, "gu"))].map((match) => match[0]).filter((value) => !/^1$/u.test(value));
      if (values[0]) pushFpsResult(results, baseLabel, values[0]);
      if (values[1] && inferLow) pushFpsResult(results, resultLabel([baseLabel, "1% low"]), values[1]);
    } else if (inferLow && !low) {
      const explicitValues = new Set(results.map((result) => result.value));
      const remaining = [...resultText.matchAll(new RegExp(fpsNumberSource, "gu"))]
        .map((match) => normalizedFpsValue(match[0])).filter((value) => !/^1$/u.test(value) && !explicitValues.has(value));
      if (remaining[0]) pushFpsResult(results, resultLabel([baseLabel, "1% low"]), remaining[0]);
    }
    return results;
  }

  function parseFpsSection(raw) {
    const source = String(raw ?? "");
    const matrixSignal = /\b(?:WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[×x]\s*\d{3,4})\b[^\n]{0,24}\d+(?:[.,]\d+)?\s*\/\s*\d+/i;
    const matrixResolutions = avgMinResolutions(source);
    const avgMinSignal = matrixResolutions.length >= 2 && /\s[—–-]\s*\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*\|/u.test(source);
    if (!/\bFPS\b|frames?\s*(?:per|\/)?\s*second|кадр(?:ів|и)?\s*(?:\/|за)\s*с/i.test(source) && !matrixSignal.test(source) && !avgMinSignal) return null;
    const resolution = avgMinSignal ? undefined : source.match(/\b(?:FHD|QHD|UHD|4K|1080p|1200p|1440p|1600p|2160p|\d{3,4}\s*[×x]\s*\d{3,4})\b/i)?.[0];
    const games = [], notes = [];
    for (const line of lines(source)) {
      if (avgMinSignal) {
        if (avgMinResolutions(line).length >= 2) { notes.push(line); continue; }
        const game = parseAvgMinGame(line, matrixResolutions);
        if (game) { games.push(game); continue; }
      }
      const explicitFpsValue = new RegExp(`${fpsNumberSource}\\s*FPS\\b`, "iu");
      if (!explicitFpsValue.test(line) && !matrixSignal.test(line)) { notes.push(line); continue; }
      const grouped = line.match(/^([^:]+):\s*(.+?)\s+[—–-]\s*(.+)$/u);
      if (grouped && /\s\/\s/u.test(grouped[2]) && /\bFPS\b/i.test(grouped[3])) {
        const names = grouped[2].split(/\s\/\s/u).map((name) => name.trim()).filter(Boolean);
        const first = `${grouped[1].trim()}: ${names.shift() ?? ""}`;
        const value = normalizedFpsValue(line.match(new RegExp(`(${fpsNumberSource})\\s*FPS`, "iu"))?.[1] ?? "");
        const setting = grouped[3].slice(0, grouped[3].search(/(?:понад\s+)?\d/iu)).replace(/[,:;—–-]+$/u, "").trim();
        [first, ...names].forEach((name) => games.push({ name: cleanGameName(name), fps: value, results: [{ label: settingLabel(setting), value }], detail: line }));
        continue;
      }
      const matrix = /\b(WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[×x]\s*\d{3,4})\b\s*[:—-]?\s*(~?\d+(?:[.,]\d+)?(?:\s*\/\s*~?\d+(?:[.,]\d+)?)*)/giu;
      const matrixMatches = [...line.matchAll(matrix)];
      if (matrixMatches.length >= 2) {
        const split = splitGameAndSettings(line.slice(0, matrixMatches[0].index));
        const results = matrixMatches.map((match) => ({ label: resultLabel([split.settings, match[1].toUpperCase()]), value: normalizedFpsValue(match[2]) }));
        games.push({ name: split.name, fps: results.map((result) => result.value).join(" | "), results, detail: line });
        continue;
      }
      const clauses = line.split(/;\s*/u).filter(Boolean);
      const firstWithResult = clauses.findIndex((clause) => explicitFpsValue.test(clause));
      if (firstWithResult < 0) { notes.push(line); continue; }
      const leading = clauses.splice(0, firstWithResult + 1).join("; ");
      const firstParts = firstClauseParts(leading);
      const firstFps = leading.search(new RegExp(`${fpsNumberSource}\\s*FPS`, "iu"));
      const split = splitGameAndSettings(firstParts?.label ?? leading.slice(0, firstFps).trim());
      if (!split.name) { notes.push(line); continue; }
      const firstResult = firstParts?.result ?? leading.slice(firstFps).trim();
      const results = [];
      const hasLowPattern = /1%\s*low/i.test(line);
      const firstResultParts = clauseParts(firstResult);
      results.push(...parseClauseResults(firstResultParts?.result ?? firstResult, clauseResultLabel(split.settings, firstResultParts?.label ?? ""), hasLowPattern));
      clauses.forEach((clause) => {
        const parts = clauseParts(clause);
        const clauseFps = clause.search(new RegExp(`${fpsNumberSource}\\s*FPS`, "iu"));
        const label = parts?.label ?? "";
        const value = parts?.result ?? (clauseFps >= 0 ? clause.slice(clauseFps) : clause);
        results.push(...parseClauseResults(value, clauseResultLabel(split.sharedSettings || split.settings, label), hasLowPattern));
      });
      const uniqueResults = [];
      results.forEach((result) => pushFpsResult(uniqueResults, result.label, result.value));
      if (!uniqueResults.length) { notes.push(line); continue; }
      games.push({ name: split.name, fps: uniqueResults.map((result) => result.value).join(" · "), ...(split.context ? { conditions: split.context } : {}), results: uniqueResults, detail: line });
    }
    const seen = new Set();
    const uniqueGames = games.filter((game) => {
      const key = `${game.name.toLocaleLowerCase()}|${game.conditions?.toLocaleLowerCase() ?? ""}|${game.results?.map((result) => `${result.label}:${result.value}`).join("|") ?? game.fps}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const entries = [...uniqueGames.map((game) => ({ type: "game", game })), ...notes.map((note) => ({ type: "note", text: note }))];
    return uniqueGames.length ? { resolution, games: uniqueGames, notes, entries } : null;
  }

  return Object.freeze({ parseFpsSection });
});
