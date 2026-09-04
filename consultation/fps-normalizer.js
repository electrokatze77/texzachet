(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TechZachetFpsNormalizer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const fpsNumberSource = String.raw`(?:[>≥]\s*|~|майже\s+)?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*(?:[>≥]\s*|~)?\d+(?:[.,]\d+)?)?\+?`;
  const resolutionSource = String.raw`FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|≈\s*2K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4}`;
  const resolutionGlobalPattern = new RegExp(`(?:${resolutionSource})`, "giu");
  const explicitSettingPattern = new RegExp(`(?:${resolutionSource}|very\\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|balanced|highest|standard|epic|minimum|max(?:imum)?|native|RT\\b|DLSS\\b|FSR\\b|XeSS\\b|TAA\\b|MSAA\\b|FG\\b|MFG\\b|ray\\s*tracing|трасування\\S*\\s+промен|максимальн\\S*\\s+налаштуван)`, "iu");
  const explicitSettingStartPattern = new RegExp(`^(?:${resolutionSource}|very\\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|balanced|highest|standard|epic|minimum|max(?:imum)?|native|RT\\b|DLSS\\b|FSR\\b|XeSS\\b|TAA\\b|MSAA\\b|FG\\b|MFG\\b|ray\\s*tracing|трасування\\S*\\s+промен|максимальн\\S*\\s+налаштуван)`, "iu");

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
    const resolution = new RegExp(`(?:${resolutionSource})`, "iu");
    const baseResolution = base.match(resolution)?.[0];
    const clauseResolution = clause.match(resolution)?.[0];
    const startsNewPreset = /\b(?:very\s+(?:high|low|ultra)|low|medium|high|ultra|nightmare|cinematic|extreme|balanced|highest|standard|epic|minimum|max(?:imum)?|native|RT|DLSS|FSR|XeSS|TAA|MSAA|FG|MFG|ray\s*tracing)\b/iu.test(clause);
    if (baseResolution && clauseResolution) return settingLabel(clause);
    if (startsNewPreset) return resultLabel([baseResolution, clause]);
    return resultLabel([base, clause]);
  }

  function descriptorLabel(value) {
    const descriptor = value.replace(/^[\s,./]+|[\s,.;]+$/gu, "")
      .replace(/^у\s+дискретному\s+режимі$/iu, "дискретний режим")
      .replace(/^у\s+гібридному\s+режимі$/iu, "гібридний режим");
    return /^(?:без\s+масштабування\s+зображення|без\s+RT|з\s+RT|у\s+дискретному\s+режимі|у\s+гібридному\s+режимі)$/iu.test(value.trim()) ? descriptor : "";
  }

  function normalizedFpsValue(value) {
    return value.replace(/^майже\s+/iu, "≈").replace(/^~\s*/u, "≈").replace(/^([>≥])\s*/u, "$1").replace(/\s+/g, " ").trim();
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
    const labelledMetric = new RegExp(`(${fpsNumberSource})\\s*(?:FPS\\s*)?(середні|середній|average|avg|максимум|maximum|max|мінімальн\\S*|мінімум|minimum|min)(?=\\s|[/,.;]|$)`, "giu");
    for (const match of resultText.matchAll(labelledMetric)) {
      const metric = /серед|average|avg/iu.test(match[2]) ? "Середній" : /макс|maximum|max/iu.test(match[2]) ? "Максимум" : "Мінімальний";
      pushFpsResult(results, resultLabel([baseLabel, metric]), match[1]);
    }
    const lowPattern = new RegExp(`1%\\s*low\\s*(${fpsNumberSource})(?:\\s*FPS)?`, "iu");
    const low = resultText.match(lowPattern);
    if (results.length) {
      if (low) pushFpsResult(results, resultLabel([baseLabel, "1% low"]), low[1]);
      return results;
    }
    const withoutLow = resultText.replace(new RegExp(lowPattern.source, "giu"), "");
    const explicit = new RegExp(`(${fpsNumberSource})\\s*FPS\\b([^/;]*)`, "giu");
    for (const match of withoutLow.matchAll(explicit)) pushFpsResult(results, resultLabel([baseLabel, descriptorLabel(match[2])]), match[1]);
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

  function slashMatrixLabels(raw) {
    const heading = lines(raw).find((line) => {
      const parts = line.split(/\s*\/\s*/u);
      return parts.length >= 3
        && /\b(?:Full\s*HD|FHD|QHD|UHD|4K|low|mid|medium|high|ultra)\b/iu.test(line)
        && !/\bFPS\b/iu.test(line);
    });
    if (!heading) return [];
    let carriedResolution = "";
    return heading.split(/\s*\/\s*/u).map((part) => {
      const label = part.trim();
      const resolution = label.match(/\b(?:Full\s*HD|FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p)\b/iu)?.[0];
      if (resolution) carriedResolution = resolution;
      if (!resolution && carriedResolution && /^(?:low|mid(?:dle)?|medium|high|ultra)$/iu.test(label)) {
        return `${carriedResolution} ${label}`;
      }
      return label;
    });
  }

  function splitTableGameAndSettings(value) {
    const split = splitGameAndSettings(value);
    if (split.settings) return split;
    const trailingSettings = value.match(/^(.*?)\s+((?:FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p)\s+(?:very\s+(?:high|low|ultra)|low|mid(?:dle)?|medium|high|ultra|nightmare|cinematic|extreme|max(?:imum)?)(?:\s+.*)?)$/iu);
    return trailingSettings
      ? { ...split, name: cleanGameName(trailingSettings[1]), settings: settingLabel(trailingSettings[2]) }
      : split;
  }

  function tableGameParts(line) {
    const colon = line.match(/^(.+?):\s*((?:близько\s+)?~?\d.+)$/iu);
    if (colon) return { label: colon[1].trim(), result: colon[2].trim() };
    const dash = line.match(/^(.+?)\s+[–—]\s+(.+)$/u);
    return dash ? { label: dash[1].trim(), result: dash[2].trim() } : null;
  }

  function parseSlashMatrixGame(line, columnLabels) {
    const parts = tableGameParts(line);
    if (!parts || !/^(?:близько\s+)?(?:~?\d|—)/iu.test(parts.result)) return null;
    const split = splitTableGameAndSettings(parts.label);
    if (!split.name) return null;
    const results = [];
    let priorLabels = [];
    parts.result.split(/;\s*/u).filter(Boolean).forEach((rawClause) => {
      let clause = rawClause.trim();
      let clauseLabel = "";
      const continuation = clause.match(/^(.+?)\s+[–—]\s+(.+)$/u);
      if (continuation && !/^(?:близько\s+)?~?\d/iu.test(continuation[1])) {
        clauseLabel = continuation[1].trim();
        clause = continuation[2].trim();
      }
      const currentLabels = [];
      clause.replace(/,\s+(?=(?:близько\s+)?~?\d)/giu, " / ").split(/\s*\/\s*/u).forEach((segment, index) => {
        const source = segment.trim();
        if (!source || /^—$/u.test(source)) return;
        const match = source.match(/^(?:близько\s+)?(~?\d+(?:[.,]\d+)?)(?:\s*FPS\b)?\s*(.*)$/iu);
        if (!match) return;
        const explicitLabel = match[2].replace(/^[\s,.;:()]+|[\s,.;:()]+$/gu, "").trim();
        const inferredLabel = explicitLabel || priorLabels[index] || columnLabels[index] || "";
        currentLabels[index] = inferredLabel;
        pushFpsResult(results, resultLabel([split.settings, clauseLabel, inferredLabel]), match[1]);
      });
      if (currentLabels.some(Boolean)) priorLabels = currentLabels;
    });
    return results.length
      ? { name: split.name, fps: results.map((result) => result.value).join(" · "), results, detail: line }
      : null;
  }

  function parseGroupedResolutionLine(line) {
    const grouped = line.match(/^((?:FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4})(?:\s+[^:]*)?):\s*(.+)$/iu);
    if (!grouped) return null;
    const heading = settingLabel(grouped[1]);
    const segments = grouped[2].split(/;\s*/u).map((segment) => segment.trim()).filter(Boolean);
    const namedResults = segments.map((segment) => segment.match(new RegExp(`^(.+?)\\s+(${fpsNumberSource})(?:\\s*FPS)?[.]?$`, "iu")));
    if (segments.length >= 2 && namedResults.every(Boolean) && segments.some((segment) => /\bFPS\b/iu.test(segment))) {
      return namedResults.map((match) => ({ name: cleanGameName(match[1]), label: heading, value: normalizedFpsValue(match[2]) }));
    }
    const valueOnly = grouped[2].match(new RegExp(`^(${fpsNumberSource})\\s*FPS[.]?$`, "iu"));
    const detailedHeading = grouped[1].match(/^(FHD\+?|QHD|UHD|WUXGA|WQXGA|4K|\d{3,4}p|\d{3,4}\s*[×x]\s*\d{3,4})\s+(.+)$/iu);
    if (!valueOnly || !detailedHeading) return null;
    const detail = detailedHeading[2].trim();
    const settingIndex = detail.search(explicitSettingPattern);
    if (settingIndex <= 0) return null;
    return [{
      name: cleanGameName(detail.slice(0, settingIndex)),
      label: resultLabel([detailedHeading[1], detail.slice(settingIndex)]),
      value: normalizedFpsValue(valueOnly[1]),
    }];
  }

  function parseFpsSection(raw) {
    const source = String(raw ?? "");
    const matrixSignal = /\b(?:WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[×x]\s*\d{3,4})\b[^\n]{0,24}\d+(?:[.,]\d+)?\s*\/\s*\d+/i;
    const matrixResolutions = avgMinResolutions(source);
    const avgMinSignal = matrixResolutions.length >= 2 && /\s[—–-]\s*\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*\|/u.test(source);
    if (!/\bFPS\b|frames?\s*(?:per|\/)?\s*second|кадр(?:ів|и)?\s*(?:\/|за)\s*с/i.test(source) && !matrixSignal.test(source) && !avgMinSignal) return null;
    const matrixLabels = slashMatrixLabels(source);
    const sourceResolutions = [...source.matchAll(resolutionGlobalPattern)].map((match) => match[0].replace(/\s+/g, "").toUpperCase());
    const resolution = avgMinSignal || matrixLabels.length || new Set(sourceResolutions).size !== 1 ? undefined : sourceResolutions[0];
    const games = [], notes = []; const groupedGames = new Map(); let hasGroupedMetrics = false;
    for (const line of lines(source)) {
      if (avgMinSignal) {
        if (avgMinResolutions(line).length >= 2) { notes.push(line); continue; }
        const game = parseAvgMinGame(line, matrixResolutions);
        if (game) { games.push(game); continue; }
      }
      if (matrixLabels.length) {
        const game = parseSlashMatrixGame(line, matrixLabels);
        if (game) { games.push(game); continue; }
      }
      const groupedResults = parseGroupedResolutionLine(line);
      if (groupedResults) {
        hasGroupedMetrics = true;
        groupedResults.forEach((result) => {
          const key = result.name.toLocaleLowerCase();
          let game = groupedGames.get(key);
          if (!game) {
            game = { name: result.name, fps: "", results: [], detail: line };
            groupedGames.set(key, game); games.push(game);
          }
          pushFpsResult(game.results, result.label, result.value);
          game.fps = game.results.map((entry) => entry.value).join(" · ");
        });
        continue;
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
    return uniqueGames.length ? { resolution: hasGroupedMetrics ? undefined : resolution, games: uniqueGames, notes, entries } : null;
  }

  return Object.freeze({ parseFpsSection });
});
