(function () {
  "use strict";

  const API_ORIGIN = "https://app.techrate.com.ua";
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
  const ROLE = Object.freeze({
    recommendation: { label: "Рекомендация", hero: "Главная рекомендация", mark: "★", position: null },
    alternative: { label: "Альтернатива", hero: "Альтернатива к рекомендации", mark: "+", position: "+" },
    upgrade: { label: "Вариант с доплатой", hero: "Вариант с доплатой", mark: "★", position: "+" },
    anti: { label: "Не рекомендую", hero: "Не рекомендую к покупке", mark: "×", position: "×" }
  });
  const TARIFFS = Object.freeze({ lite: "БАЗОВЫЙ", pro: "РАСШИРЕННЫЙ", expert: "МАКСИМАЛЬНЫЙ" });
  const GPU_COLORS = Object.freeze({
    "RTX 5090": "#cc0000", "RTX 4090": "#e06666", "RTX 5080": "#ff00ff", "RTX 5070 TI": "#9900ff",
    "RTX 5070": "#0000ff", "RTX 5060": "#3c78d8", "RTX 4080": "#134f5c", "RTX 4070": "#38761d",
    "RTX 4060": "#34a870", "RTX 5050": "#ff9900", "RTX 4050": "#93c47d", "RX 7600S": "#7f6000", "RADEON 780M": "#073763"
  });

  const $ = (selector) => document.querySelector(selector);
  const status = $("#status");
  const statusTitle = $("#status-title");
  const statusMessage = $("#status-message");
  const retryButton = $("#retry-button");
  const consultationView = $("#consultation");
  const selectorMenu = $("#selector-menu");
  const selectorControl = $("#selector-control");
  let views = [];
  let activeIndex = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && (typeof value !== "string" || value.trim() !== "");
  }

  function text(value) {
    return hasValue(value) && typeof value !== "object" ? String(value).trim() : "";
  }

  function effective(model, overrides, name) {
    const aliases = name === "name" ? ["name", "model"] : name === "price" ? ["price", "priceText"] : [name];
    for (const key of aliases) {
      if (hasValue(overrides[key])) return overrides[key];
    }
    for (const key of aliases) {
      if (hasValue(model[key])) return model[key];
    }
    return "";
  }

  function normalizeRole(role) {
    if (role === "anti" || role === "anti_recommendation") return "anti";
    return Object.prototype.hasOwnProperty.call(ROLE, role) ? role : "recommendation";
  }

  function safeUrl(value, base) {
    const source = text(value);
    if (!source) return null;
    try {
      const parsed = base ? new URL(source, base) : new URL(source);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
    } catch {
      return null;
    }
  }

  function localImageUrl(value) {
    const source = text(value);
    if (!source) return null;
    try {
      const parsed = new URL(source, API_ORIGIN);
      const prefix = "/api/laptop-images/";
      if (!parsed.pathname.startsWith(prefix)) return null;
      const decodedPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
      const filename = decodedPath.split("/").pop();
      return filename ? `/assets/laptop-images/${encodeURIComponent(filename)}` : null;
    } catch {
      return null;
    }
  }

  function externalLink(value, label, className) {
    const url = safeUrl(value);
    if (!url) return null;
    const link = element("a", className, label);
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function getToken() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "c" ? parts[1] : "";
  }

  function listLines(value) {
    const raw = Array.isArray(value) ? value : text(value).split(/\r?\n|(?=^\s*[•▪●◦✓✕×]\s+)/m);
    return raw.map((line) => text(line).replace(/^[\s•▪●◦*\-–—✓✕×]+/, "").trim()).filter(Boolean);
  }

  function smartLines(raw, temperature = false) {
    const bullets = temperature ? /\s*[\u2022\u25cf\u25aa]\s*(?=[\p{L}])/gu : /\s*[\u2022\u25cf\u25aa]\s*/gu;
    return text(raw).replace(/\r/g, "").replace(bullets, "\n").split("\n")
      .map((line) => line.replace(/^\s*[-–—]\s*/, "").trim()).filter(Boolean);
  }

  const TEMP_VALUE = String.raw`~?\d{2,3}(?:[.,]\d+)?(?:\s*[-–—]\s*~?\d{2,3}(?:[.,]\d+)?)?\s*(?:[\u00b0\u00ba]\s*)?[C\u0421]\b(?:\s*(?:avg|average|max|maximum))?`;
  const NOISE_VALUE = String.raw`~?\d{1,3}(?:[.,]\d+)?(?:\s*(?:avg|average|max|maximum))?(?:\s*[/•·–—]\s*~?\d{1,3}(?:[.,]\d+)?)*\s*(?:dB(?:\s*\(?A\)?)?|\u0434\u0411\u0410?)`;

  function highestNumber(value) {
    const values = [...String(value).matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => Number(match[0].replace(",", ".")));
    return values.length ? Math.max(...values) : null;
  }

  function temperatureKind(context) {
    const patterns = [
      ["surface", /surface|chassis|keyboard|palm\s*rest|\u043a\u043e\u0440\u043f\u0443\u0441|\u043a\u043b\u0430\u0432\u0438\u0430\u0442\u0443\u0440|\u043f\u043e\u0432\u0435\u0440\u0445/giu],
      ["vram", /vram|gpu\s*(?:memory|mem)|video\s*memory|\u0432\u0438\u0434\u0435\u043e\u043f\u0430\u043c/giu],
      ["gpu", /\bgpu\b|\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442/giu],
      ["cpu", /\bcpu\b|\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440/giu],
    ];
    let latest = null;
    patterns.forEach(([kind, pattern]) => { for (const match of context.matchAll(pattern)) {
      const index = match.index ?? -1; if (!latest || index > latest.index) latest = { kind, index };
    }});
    if (latest) return latest.kind;
    return /prime95|cinebench|cyberpunk|furmark/iu.test(context) ? "cpu" : null;
  }

  function metricStatus(kind, value) {
    const maximum = highestNumber(value); if (maximum === null) return "neutral";
    if (kind === "noise") return maximum <= 40 ? "good" : maximum <= 48 ? "warning" : "bad";
    if (kind === "surface") return maximum <= 50 ? "good" : maximum <= 58 ? "warning" : "bad";
    if (kind === "vram") return maximum <= 80 ? "good" : maximum <= 90 ? "warning" : "bad";
    if (kind === "gpu") return maximum <= 75 ? "good" : maximum <= 85 ? "warning" : "bad";
    return maximum <= 80 ? "good" : maximum <= 90 ? "warning" : "bad";
  }

  function metricFragments(label, value) {
    const source = String(value); const matches = [];
    for (const match of source.matchAll(new RegExp(`${TEMP_VALUE}(?:\\s*[/•·]\\s*${TEMP_VALUE})*`, "giu"))) {
      const start = match.index ?? 0; const kind = temperatureKind(`${label} ${source.slice(Math.max(0, start - 100), start)}`);
      matches.push({ start, end: start + match[0].length, status: kind ? metricStatus(kind, match[0]) : "neutral" });
    }
    for (const match of source.matchAll(new RegExp(NOISE_VALUE, "giu"))) {
      const start = match.index ?? 0; matches.push({ start, end: start + match[0].length, status: metricStatus("noise", match[0]) });
    }
    matches.sort((a, b) => a.start - b.start); const fragments = []; let cursor = 0;
    matches.forEach((match) => { if (match.start < cursor) return; if (match.start > cursor) fragments.push({ text: source.slice(cursor, match.start), status: "neutral" }); fragments.push({ text: source.slice(match.start, match.end), status: match.status }); cursor = match.end; });
    if (cursor < source.length) fragments.push({ text: source.slice(cursor), status: "neutral" });
    const evaluated = fragments.filter((fragment) => fragment.status !== "neutral");
    return { fragments: fragments.length ? fragments : undefined, status: evaluated.length === 1 ? evaluated[0].status : "neutral" };
  }

  function temperatureTextFragments(value) {
    return metricFragments("", value).fragments || [{ text: value, status: "neutral" }];
  }

  function fpsConditions(value) {
    return value
      .replace(/(?:^|[,:;–—-]\s*)(?:about|around|~)?\s*~?\d+(?:[.,]\d+)?(?:\s*[–—-]\s*~?\d+(?:[.,]\d+)?)?\s*FPS\b/giu, "")
      .replace(/\s*[.,:;–—-]+\s*$/u, "")
      .trim();
  }

  function parseTemperatureSection(raw) {
    const source = text(raw); if (!/[\u00b0\u00ba]\s*[C\u0421]|\b\d{2,3}\s*[C\u0421]\b|\bdBA?\b|noise|\u0448\u0443\u043c|thrott/iu.test(source)) return null;
    const items = [], notes = [], entries = []; const temperaturePattern = new RegExp(TEMP_VALUE, "giu"); const noisePattern = new RegExp(NOISE_VALUE, "giu");
    smartLines(source, true).forEach((line) => {
      const temperatures = [...line.matchAll(temperaturePattern)]; const noises = [...line.matchAll(noisePattern)];
      const simple = line.match(/^\s*(CPU|GPU|VRAM|SSD|SoC|\u043f\u0440\u043e\u0446\u0435\u0441\u0441\u043e\u0440|\u0432\u0438\u0434\u0435\u043e\u043a\u0430\u0440\u0442|\u0448\u0443\u043c|noise)\s*[:–—-]?\s*(.+)$/iu);
      const throttle = line.match(/^\s*(throttling|\u0442\u0440\u043e\u0442\u0442\u043b\u0438\u043d\u0433)\s*[:–—-]?\s*(.+)$/iu);
      if (simple && (temperatures.length || noises.length)) { const aliases = { процессор: "CPU", видеокарта: "GPU", шум: "Шум" }; const label = aliases[simple[1].toLowerCase()] || simple[1]; const value = simple[2].trim(); const item = { label, value, ...metricFragments(label, value) }; items.push(item); entries.push({ type: "metric", item }); return; }
      if (throttle) { const item = { label: "Троттлинг", value: throttle[2].trim(), status: "neutral" }; items.push(item); entries.push({ type: "metric", item }); return; }
      const measurements = [...temperatures, ...noises]; if (!measurements.length) { notes.push(line); entries.push({ type: "note", text: line }); return; }
      const separated = line.match(/^(.{2,70}?)(?::|–|—)\s*(.+)$/); const first = measurements.map((match) => match.index ?? Infinity).sort((a, b) => a - b)[0];
      const label = (separated?.[1] || line.slice(0, first).trim() || "Температура").trim(); const value = separated?.[2]?.trim() || line.slice(first).trim();
      const item = { label, value, ...metricFragments(label, value) }; items.push(item); entries.push({ type: "metric", item });
    });
    const unique = []; const seen = new Set(); items.forEach((item) => { const key = `${item.label.toLowerCase()}|${item.value.toLowerCase()}`; if (!seen.has(key)) { seen.add(key); unique.push(item); } });
    const orderedEntries = [
      ...unique.map((item) => ({ type: "metric", item })),
      ...notes.map((note) => ({ type: "note", text: note })),
    ];
    return unique.length || notes.length ? { items: unique, notes, entries: orderedEntries } : null;
  }

  function parseFpsSection(raw) {
    const source = text(raw); const matrixSignal = /\b(?:WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[x×]\s*\d{3,4})\b[^\n]{0,24}\d+(?:[.,]\d+)?\s*\/\s*\d+/i;
    if (!/\bFPS\b|frames?\s*(?:per|\/)?\s*second|\u043a\u0430\u0434\u0440\w*\s*(?:\/|\u0437\u0430)\s*\u0441/iu.test(source) && !matrixSignal.test(source)) return null;
    const games = [], notes = [], entries = []; const resolution = source.match(/\b(?:FHD|QHD|UHD|4K|1080p|1200p|1440p|1600p|2160p|\d{3,4}\s*[x×]\s*\d{3,4})\b/i)?.[0];
    const matrix = /\b(WUXGA|WQXGA|FHD\+?|QHD|UHD|4K|\d{3,4}\s*[x×]\s*\d{3,4})\b\s*[:–—-]?\s*(~?\d+(?:[.,]\d+)?(?:\s*\/\s*~?\d+(?:[.,]\d+)?)*)/giu; const fps = /(~?\d+(?:[.,]\d+)?(?:\s*(?:\/|[–—-])\s*~?\d+(?:[.,]\d+)?)*\+?)\s*FPS\b/giu;
    smartLines(source).forEach((line) => { const matrixMatches = [...line.matchAll(matrix)]; if (matrixMatches.length) { const name = line.slice(0, matrixMatches[0].index).replace(/^[\s,;:–—]+|[,;:–—]+$/g, "").trim(); if (!name) { notes.push(line); entries.push({ type: "note", text: line }); return; } const results = matrixMatches.map((match) => ({ label: match[1].toUpperCase(), value: match[2].replace(/\s+/g, " ").trim() })); const game = { name, fps: results.map((result) => result.value).join(" | "), results }; games.push(game); entries.push({ type: "game", game }); return; } const found = [...line.matchAll(fps)]; if (!found.length) { notes.push(line); entries.push({ type: "note", text: line }); return; } const first = found[0].index ?? 0; const name = line.slice(0, first).replace(/\([^)]*(?:FHD|QHD|UHD|4K)[^)]*\).*$/i, "").replace(/^[\s,;:–—]+|[,;:–—]+$/g, "").trim(); if (!name) { notes.push(line); entries.push({ type: "note", text: line }); return; } const values = found.map((match) => match[1].replace(/\s+/g, " ").trim()); const game = { name, fps: values.join(" · ") }; games.push(game); entries.push({ type: "game", game }); });
    const unique = []; const seen = new Set(); games.forEach((game) => { const key = `${game.name.toLowerCase()}|${game.fps}`; if (!seen.has(key)) { seen.add(key); unique.push(game); } }); return unique.length ? { resolution, games: unique, notes, entries } : null;
  }

  function setState(type, title, message) {
    status.hidden = false;
    consultationView.hidden = true;
    status.dataset.state = type;
    status.setAttribute("aria-busy", type === "loading" ? "true" : "false");
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    $(".loader").hidden = type !== "loading";
    retryButton.hidden = type !== "error";
  }

  function scoreNumber(value) {
    const number = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(number) ? number : null;
  }

  function scoreColor(value) {
    const number = scoreNumber(value);
    if (number === null) return "#697387";
    if (number >= 9.4) return "#ec3838";
    if (number >= 9) return "#e738e3";
    if (number >= 8.6) return "#a33eea";
    if (number >= 8) return "#4a86e8";
    if (number >= 7.5) return "#57ba8a";
    if (number >= 7) return "#7ead6a";
    return "#b45f06";
  }

  function scoreNode(label, value, table) {
    const numeric = scoreNumber(value);
    const valid = numeric !== null;
    const normalized = valid ? Math.min(10, Math.max(0, numeric)) : 0;
    const ring = element("span", table ? "table-score" : "score-ring");
    ring.style.setProperty(table ? "--table-score-color" : "--score-color", scoreColor(value));
    if (table) ring.style.setProperty("--table-score-progress", `${normalized * 10}%`);
    else ring.style.setProperty("--score-target-progress", `${normalized * 10}%`);
    ring.append(element("strong", "", valid ? normalized.toFixed(1) : "—"));
    if (!table) {
      const card = element("div", "score-card");
      card.append(ring, element("span", "", label));
      return card;
    }
    const wrapper = element("div", "table-score-wrap");
    wrapper.append(ring, element("small", "", label));
    return wrapper;
  }

  function gpuColor(value) {
    const upper = text(value).toUpperCase();
    const key = Object.keys(GPU_COLORS).find((candidate) => upper.includes(candidate));
    return key ? GPU_COLORS[key] : "#8f98aa";
  }

  function roleDescription(item) {
    const role = normalizeRole(item.role);
    if (role === "alternative") return item.relatedToRank ? `Альтернатива к рекомендации №${text(item.relatedToRank)}` : ROLE.alternative.hero;
    if (role === "recommendation") return Number(item.rank) === 1 ? ROLE.recommendation.hero : `Рекомендация №${text(item.rank) || "—"}`;
    return ROLE[role].hero;
  }

  function viewFor(item, consultation, index) {
    const models = consultation.models && typeof consultation.models === "object" ? consultation.models : {};
    const model = models[item.modelId] && typeof models[item.modelId] === "object" ? models[item.modelId] : {};
    return { item, model, overrides: item.overrides && typeof item.overrides === "object" ? item.overrides : {}, index, role: normalizeRole(item.role) };
  }

  function modelName(view) {
    return text(effective(view.model, view.overrides, "name")) || "Модель без названия";
  }

  function selectorLabel(view) {
    const prefix = view.role === "anti" ? "×" : view.role === "alternative" || view.role === "upgrade" ? "+" : `№${text(view.item.rank) || "—"}`;
    return `${prefix} — ${modelName(view)}`;
  }

  function extraLinks(item, labelOverride = "") {
    if (!Array.isArray(item.extraLinks)) return [];
    return item.extraLinks.map((entry, index) => {
      const fallbackLabel = labelOverride || `Дополнительная ссылка ${index + 1}`;
      if (typeof entry === "string") return { url: entry, label: fallbackLabel };
      if (!entry || typeof entry !== "object") return null;
      return { url: entry.url || entry.href, label: text(entry.label || entry.title || entry.name) || fallbackLabel };
    }).filter(Boolean);
  }

  function renderSelector() {
    selectorMenu.replaceChildren();
    views.forEach((view, index) => {
      const option = element("button", "selector-option", selectorLabel(view));
      option.type = "button";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === activeIndex));
      option.addEventListener("click", () => {
        activeIndex = index;
        selectorMenu.hidden = true;
        selectorControl.setAttribute("aria-expanded", "false");
        renderActive(true);
      });
      selectorMenu.append(option);
    });
  }

  function specIcon(label) {
    const paths = {
      GPU: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="12" r="3"/><path d="M9 9v6m-3-3h6m7-3v6m-4-6v6M6 18v3m4-3v3m4-3v3m4-3v3"/>',
      CPU: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M8 1v3m4-3v3m4-3v3M8 20v3m4-3v3m4-3v3M1 8h3m-3 4h3m-3 4h3m16-8h3m-3 4h3m-3 4h3"/>',
      RAM: '<path d="M3 6h18v12H3zM6 9v6m3-6v6m3-6v6m3-6v6m3-6v6M6 18v3m4-3v3m4-3v3m4-3v3"/>',
      SSD: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="17" cy="12" r="1.4"/><path d="M6 10h6m-6 4h6M7 18v3m5-3v3m5-3v3"/>',
      DISPLAY: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M9 21h6m-3-4v4"/>'
    };
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.classList.add("spec-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    const key = label.toUpperCase() === "ДИСПЛЕЙ" ? "DISPLAY" : label.toUpperCase();
    icon.innerHTML = paths[key] || paths.CPU;
    return icon;
  }

  function addSpec(container, label, value) {
    const row = element("div");
    row.append(specIcon(label));
    row.append(element("dt", "", label), element("dd", "", text(value) || "—"));
    container.append(row);
  }

  function addPlainInsight(container, title, icon, tone, value) {
    const lines = listLines(value);
    if (!lines.length) return;
    const card = element("article", "insight-card");
    card.dataset.tone = tone;
    const header = element("header");
    header.append(element("span", "", icon), element("h2", "", title));
    const list = element("ul", "detail-list");
    lines.forEach((line) => list.append(element("li", "", line)));
    card.append(header, list);
    container.append(card);
    setupMoreControl(card, list);
  }

  function setupMoreControl(card, content) {
    content.classList.add("expandable-content");
    const button = element("button", "more-button", "Больше");
    button.type = "button";
    button.hidden = true;
    button.addEventListener("click", () => {
      const expanded = card.classList.toggle("is-expanded");
      button.textContent = expanded ? "Свернуть" : "Больше";
    });
    card.append(button);
    window.requestAnimationFrame(() => {
      button.hidden = content.scrollHeight <= content.clientHeight + 4;
    });
  }

  function renderImage(container, value, name) {
    container.replaceChildren();
    const url = localImageUrl(value);
    if (!url) {
      container.append(element("span", "image-placeholder", "Изображение модели не добавлено"));
      return;
    }
    const image = element("img");
    image.src = url;
    image.alt = name;
    image.loading = "eager";
    image.decoding = "async";
    image.addEventListener("error", () => { image.replaceWith(element("span", "image-placeholder", "Изображение модели недоступно")); });
    container.append(image);
  }

  function appendSectionNotes(card, notes) {
    if (!notes.length) return;
    const section = element("div", "section-notes"); notes.forEach((note) => section.append(element("p", "", note))); card.append(section);
  }

  function addSmartInsight(container, title, icon, tone, value, kind) {
    const section = kind === "temperature" ? parseTemperatureSection(value) : parseFpsSection(value);
    if (!section) { addPlainInsight(container, title, icon, tone, value); return; }
    const card = element("article", "insight-card"); card.dataset.tone = tone;
    const header = element("header"); header.append(element("span", "", icon), element("h2", "", kind === "fps" && section.resolution ? `${title} · ${section.resolution}` : title)); card.append(header);
    const list = element("div", kind === "temperature" ? "metric-list" : "fps-list");
    if (kind === "temperature") (section.entries || []).forEach((entry) => {
      if (entry.type === "note") {
        const note = element("div", "section-notes"); const paragraph = element("p");
        temperatureTextFragments(entry.text).forEach((fragment) => { const part = element("span", "temperature-metric-fragment", fragment.text); part.dataset.status = fragment.status; paragraph.append(part); });
        note.append(paragraph); list.append(note); return;
      }
      const item = entry.item; const row = element("div", "metric-row temperature-metric-row"); row.dataset.status = item.status;
      row.append(element("span", "", item.label)); const strong = element("strong");
      if (item.fragments?.length) item.fragments.forEach((fragment) => { const part = element("span", "temperature-metric-fragment", fragment.text); part.dataset.status = fragment.status; strong.append(part); }); else strong.textContent = item.value;
      row.append(strong); const indicator = element("i"); indicator.className = item.status; row.append(indicator); list.append(row);
    });
    if (kind === "fps") section.games.forEach((game) => { const row = element("div", "fps-row"); const title = element("div", "fps-title"); title.append(element("span", "", game.name)); if (game.conditions) title.append(element("small", "", game.conditions)); row.append(title); if (game.results?.length) { const results = element("div", "fps-results"); game.results.forEach((result) => { const part = element("span"); part.append(element("small", "", result.label), element("strong", "", result.value)); results.append(part); }); row.append(results); } else row.append(element("strong", "", `${game.fps} FPS`)); list.append(row); });
    const content = element("div", "insight-content");
    content.append(list); appendSectionNotes(content, section.notes);
    card.append(content); container.append(card); setupMoreControl(card, content);
  }

  function addInsight(container, title, icon, tone, value) {
    if (tone === "temperature") return addSmartInsight(container, title, icon, tone, value, "temperature");
    if (tone === "fps") return addSmartInsight(container, title, icon, tone, value, "fps");
    return addPlainInsight(container, title, icon, tone, value);
  }

  function scrollToActiveModel() {
    const hero = document.querySelector(".hero-card");
    if (!hero) return;
    const stickyHeader = document.querySelector(".sticky-header");
    const headerHeight = stickyHeader ? stickyHeader.getBoundingClientRect().height : 0;
    const top = Math.max(0, window.scrollY + hero.getBoundingClientRect().top - headerHeight - 12);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function renderActive(shouldScroll = false) {
    const view = views[activeIndex];
    if (!view) return;
    const { item, model, overrides, role } = view;
    const name = modelName(view);
    const image = effective(model, overrides, "imageUrl");
    const productUrl = effective(model, overrides, "productUrl");
    const price = text(effective(model, overrides, "price")) || "Цену уточняйте";
    const details = {
      pros: effective(model, overrides, "pros"), cons: effective(model, overrides, "cons"),
      temperatures: effective(model, overrides, "temperaturesAndNoise"), fps: effective(model, overrides, "fps")
    };

    selectorControl.querySelector("span").textContent = selectorLabel(view);
    renderSelector();
    const activeRole = $("#active-role");
    activeRole.dataset.role = role;
    activeRole.querySelector("span").textContent = ROLE[role].mark;
    activeRole.querySelector("strong").textContent = roleDescription(item);
    const hero = document.querySelector(".hero-card");
    if (hero) hero.dataset.role = role;
    const rank = $("#rank-badge");
    rank.dataset.role = role;
    rank.querySelector("strong").textContent = ROLE[role].position || text(item.rank) || "—";
    $("#model-name").textContent = name;
    $("#model-price").textContent = price;
    renderImage($("#image-wrap"), image, name);

    const specs = $("#specs");
    specs.replaceChildren();
    addSpec(specs, "GPU", effective(model, overrides, "gpu"));
    addSpec(specs, "CPU", effective(model, overrides, "cpu"));
    addSpec(specs, "RAM", effective(model, overrides, "ram"));
    addSpec(specs, "SSD", effective(model, overrides, "storage"));
    addSpec(specs, "Дисплей", effective(model, overrides, "display"));

    const actions = $("#purchase-actions");
    actions.replaceChildren();
    const mainLink = externalLink(productUrl, "Купить можно здесь", "primary-action");
    actions.append(mainLink || element("span", "disabled-action", "Цены недоступны"));
    const secondary = extraLinks(item, text(overrides.extraLinkText)).map((link) => externalLink(link.url, link.label, "secondary-action")).find(Boolean);
    if (secondary) actions.append(secondary);

    const scorePanel = $("#score-panel");
    scorePanel.replaceChildren();
    [["Игры", "gamingScore"], ["Работа", "workScore"], ["Контент", "contentScore"], ["Стабильность", "stabilityScore"]]
      .forEach(([label, key]) => scorePanel.append(scoreNode(label, effective(model, overrides, key), false)));

    const conclusion = text(item.customConclusion) || (role === "anti" ? text(model.notes) || text(details.cons) : text(model.notes));
    const reason = $("#recommendation-reason");
    reason.hidden = !conclusion;
    $("#reason-label").textContent = role === "anti"
      ? "Почему я не рекомендую эту модель"
      : role === "recommendation" && Number(item.rank) === 1
        ? "Почему эта модель — лучшая в подборе"
        : "Почему эта модель в подборе";
    $("#reason-text").textContent = conclusion;

    const insights = $("#insights");
    insights.replaceChildren();
    insights.dataset.anti = String(role === "anti");
    if (role === "anti") {
      addInsight(insights, "Минусы", "×", "negative", details.cons);
    } else {
      addInsight(insights, "Плюсы", "✓", "positive", details.pros);
      addInsight(insights, "Минусы", "×", "negative", details.cons);
      addInsight(insights, "Температуры и шум", "♨", "temperature", details.temperatures);
      addInsight(insights, "FPS", "⌁", "fps", details.fps);
    }
    if (!insights.childElementCount) insights.append(element("p", "empty-detail", "Для этой модели нет дополнительных данных в опубликованной консультации."));
    if (hero) {
      hero.classList.remove("hero-reveal");
      void hero.offsetWidth;
      hero.classList.add("hero-reveal");
    }
    if (shouldScroll) window.requestAnimationFrame(scrollToActiveModel);
  }

  function detailTab(row, content, title, icon, key, raw, tone) {
    const tab = element("button", "", `${icon} ${title}`);
    tab.type = "button";
    tab.dataset.section = key;
    tab.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = row.getAttribute("aria-expanded") === "true";
      const isActive = tab.getAttribute("aria-selected") === "true";
      if (isOpen && isActive) {
        row.setAttribute("aria-expanded", "false");
        content.hidden = true;
        tab.setAttribute("aria-selected", "false");
        return;
      }
      row.setAttribute("aria-expanded", "true");
      content.hidden = false;
      row.querySelectorAll(".comparison-tabs button").forEach((button) => button.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      content.dataset.section = key;
      content.replaceChildren(element("h3", "", `${icon} ${title}`));
      if (key === "temperatures" || key === "fps") {
        const host = element("div");
        addSmartInsight(host, title, icon, tone === "#f1a044" ? "temperature" : "fps", raw, key === "temperatures" ? "temperature" : "fps");
        const card = host.firstElementChild;
        if (card) Array.from(card.children).slice(1).forEach((child) => content.append(child));
        content.style.setProperty("--detail-color", tone);
        return;
      }
      const lines = key === "conclusion" ? [] : listLines(raw);
      if (key === "conclusion") content.append(element("p", "", text(raw) || "Нет отдельного вывода."));
      else if (lines.length) { const list = element("ul", "detail-list"); lines.forEach((line) => list.append(element("li", "", line))); content.append(list); }
      else content.append(element("p", "", "Для этой модели данных нет."));
      content.style.setProperty("--detail-color", tone);
    });
    return tab;
  }

  function comparisonSection(title, description, variant, entries) {
    if (!entries.length) return null;
    const section = element("section", "comparison");
    section.dataset.variant = variant;
    const header = element("header", "comparison-header");
    header.append(element("h2", "", title), element("p", "", description));
    const list = element("div", "comparison-list");
    if (variant === "recommendations") list.append(comparisonTableHeader());
    entries.forEach((view) => list.append(comparisonRow(view)));
    section.append(header, list);
    return section;
  }

  function comparisonTableHeader() {
    const row = element("div", "comparison-table-header");
    ["№", "Модель", "GPU", "CPU", "RAM / SSD", "Дисплей", "Цена", "Игры", "Работа", "Контент", "Стабильность"]
      .forEach((label) => row.append(element("span", "", label)));
    return row;
  }

  function comparisonRow(view) {
    const { item, model, overrides, role } = view;
    const row = element("article", "comparison-row-card");
    row.dataset.role = role;
    row.tabIndex = 0;
    row.setAttribute("aria-expanded", "false");
    const position = ROLE[role].position || text(item.rank) || "—";
    const name = modelName(view);
    const productUrl = effective(model, overrides, "productUrl");
    const price = text(effective(model, overrides, "price")) || "—";
    const cell = (className) => element("div", `comparison-cell${className ? ` ${className}` : ""}`);
    const positionCell = cell(); positionCell.append(element("span", "position-badge", position)); row.append(positionCell);
    const nameCell = cell(); const nameWrap = element("div", "comparison-name"); nameWrap.append(element("strong", "", name));
    nameWrap.append(element("span", "role-small", roleDescription(item)));
    nameCell.append(nameWrap); row.append(nameCell);
    const gpuCell = cell(); const gpu = element("span", "comparison-gpu", text(effective(model, overrides, "gpu")) || "—"); gpu.style.setProperty("--gpu-color", gpuColor(gpu.textContent)); gpuCell.append(gpu); row.append(gpuCell);
    const cpuCell = cell(); cpuCell.textContent = text(effective(model, overrides, "cpu")) || "—"; row.append(cpuCell);
    const memory = cell(); const memoryWrap = element("span", "ram-storage");
    const ramValue = text(effective(model, overrides, "ram")) || "—";
    const storageValue = text(effective(model, overrides, "storage")) || "—";
    const capacityMatch = storageValue.match(/\d+(?:[.,]\d+)?\s*(?:ГБ|GB|ТБ|TB)/i);
    const storageCapacity = capacityMatch ? capacityMatch[0] : "";
    const storageLabel = storageCapacity ? storageValue.replace(capacityMatch[0], "").replace(/[,:;]+/g, "").trim() : storageValue;
    memoryWrap.append(element("span", "", `${ramValue} ОЗУ`), element("small", "", storageCapacity ? `${storageCapacity} ${storageLabel}` : storageLabel)); memory.append(memoryWrap); row.append(memory);
    const displayCell = cell(); displayCell.textContent = text(effective(model, overrides, "display")) || "—"; row.append(displayCell);
    const priceCell = cell("comparison-price"); const priceLink = externalLink(productUrl, price, ""); priceCell.append(priceLink || document.createTextNode(price)); row.append(priceCell);
    [["Игры", "gamingScore"], ["Работа", "workScore"], ["Контент", "contentScore"], ["Стабильность", "stabilityScore"]].forEach(([label, key]) => { const scoreCell = cell(); scoreCell.append(scoreNode(label, effective(model, overrides, key), true)); row.append(scoreCell); });

    const details = element("div", "comparison-details");
    const tabs = element("div", "comparison-tabs"); tabs.setAttribute("role", "tablist");
    const content = element("div", "comparison-detail-content"); content.hidden = true;
    const conclusion = text(item.customConclusion) || (role === "anti" ? text(model.notes) || text(effective(model, overrides, "cons")) : text(model.notes));
    const allTabs = [["Вывод", "?", "conclusion", conclusion, "#66a0ff"], ["Плюсы", "✓", "pros", effective(model, overrides, "pros"), "#48ce91"], ["Минусы", "×", "cons", effective(model, overrides, "cons"), "#f05a68"], ["Температуры и шум", "♨", "temperatures", effective(model, overrides, "temperaturesAndNoise"), "#f1a044"], ["FPS", "⌁", "fps", effective(model, overrides, "fps"), "#5799ed"]];
    allTabs.filter((tab) => role !== "anti" || tab[2] === "conclusion" || tab[2] === "cons").filter((tab) => text(tab[3])).forEach((tab) => tabs.append(detailTab(row, content, tab[0], tab[1], tab[2], tab[3], tab[4])));
    if (tabs.childElementCount) { details.append(tabs, content); row.append(details); }
    const toggle = () => { if (!tabs.childElementCount) return; const open = row.getAttribute("aria-expanded") === "true"; row.setAttribute("aria-expanded", String(!open)); content.hidden = open; if (!open && !content.childElementCount) tabs.querySelector("button").click(); };
    row.addEventListener("click", (event) => { if (event.target.closest("a, button")) return; toggle(); });
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } });
    return row;
  }

  function renderComparisons() {
    const root = $("#comparison-sections"); root.replaceChildren();
    const regular = views.filter((view) => view.role !== "anti" && view.role !== "upgrade");
    const upgrades = views.filter((view) => view.role === "upgrade");
    const anti = views.filter((view) => view.role === "anti");
    const sections = [
      comparisonSection("Все рекомендации", "Быстрое сравнение характеристик, цен и оценок. Нажмите на модель, чтобы открыть подробности.", "recommendations", regular),
      comparisonSection("Варианты с доплатой", "Модели с более высоким бюджетом и дополнительным запасом возможностей.", "upgrade", upgrades),
      comparisonSection("Не рекомендую", "Модели, которые не подходят под задачи этой консультации.", "anti", anti)
    ].filter(Boolean);
    sections.forEach((section) => root.append(section));
  }

  function tariff(value) {
    const key = text(value).toLowerCase();
    return TARIFFS[key] || text(value) || "Консультация";
  }

  function extractConsultation(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    if (payload.consultation && typeof payload.consultation === "object") return payload.consultation;
    if (payload.data && payload.data.consultation && typeof payload.data.consultation === "object") return payload.data.consultation;
    return payload;
  }

  function renderConsultation(consultation) {
    const items = Array.isArray(consultation.items) ? consultation.items.filter((item) => item && typeof item === "object") : [];
    views = items.map((item, index) => viewFor(item, consultation, index)).filter((view) => Object.keys(view.model).length);
    if (!views.length) { setState("not-found", "Консультация пока пуста", "В опубликованной консультации пока нет доступных моделей."); return; }
    activeIndex = 0;
    const title = text(consultation.title) || (text(consultation.clientName) ? `Подбор для ${text(consultation.clientName)}` : "Персональный подбор ноутбука");
    document.title = `${title} — ТехЗачёт`;
    $("#header-title").textContent = title;
    const tariffBadge = $("#tariff-badge");
    const tariffValue = text(consultation.tariff);
    tariffBadge.textContent = tariff(tariffValue);
    tariffBadge.hidden = !tariffValue;
    const budget = text(consultation.budget) || "Персональная консультация";
    $("#header-subtitle").textContent = budget;
    $("#consultation-conclusion").textContent = text(consultation.conclusion);
    $("#final").hidden = !text(consultation.conclusion);
    renderComparisons();
    renderActive();
    status.hidden = true;
    consultationView.hidden = false;
  }

  async function copyLink() {
    const label = $("#copy-button .copy-label");
    try {
      await navigator.clipboard.writeText(window.location.href);
      label.textContent = "Ссылка скопирована";
      window.setTimeout(() => { label.textContent = "Скопировать ссылку"; }, 1800);
    } catch {
      label.textContent = "Не удалось скопировать";
      window.setTimeout(() => { label.textContent = "Скопировать ссылку"; }, 1800);
    }
  }

  async function loadConsultation() {
    const token = getToken();
    if (!TOKEN_PATTERN.test(token)) { setState("invalid", "Некорректная ссылка", "Проверьте, что адрес консультации скопирован полностью."); return; }
    setState("loading", "Загружаем консультацию", "Собираем рекомендации и результаты тестов.");
    try {
      const endpoint = new URL(`/api/public/consultations/${encodeURIComponent(token)}`, API_ORIGIN);
      const response = await fetch(endpoint.href, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", referrerPolicy: "no-referrer" });
      if (response.status === 400) { setState("invalid", "Некорректная ссылка", "Проверьте адрес консультации и попробуйте открыть его снова."); return; }
      if (response.status === 404) { setState("not-found", "Консультация не найдена", "Ссылка недействительна или консультация ещё не опубликована."); return; }
      if (!response.ok) throw new Error(`TechRate response ${response.status}`);
      const consultation = extractConsultation(await response.json());
      if (!consultation) throw new Error("Invalid consultation payload");
      renderConsultation(consultation);
    } catch (error) {
      console.error("Consultation loading failed", error);
      setState("error", "Не удалось загрузить консультацию", "Сервис временно недоступен. Проверьте соединение и попробуйте ещё раз.");
    }
  }

  selectorControl.addEventListener("click", () => { const opening = selectorMenu.hidden; selectorMenu.hidden = !opening; selectorControl.setAttribute("aria-expanded", String(opening)); });
  document.addEventListener("pointerdown", (event) => { if (!$("#model-selector").contains(event.target)) { selectorMenu.hidden = true; selectorControl.setAttribute("aria-expanded", "false"); } });
  $("#copy-button").addEventListener("click", () => { void copyLink(); });
  retryButton.addEventListener("click", loadConsultation);
  loadConsultation();
})();
