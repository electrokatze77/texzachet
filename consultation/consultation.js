(function () {
  "use strict";

  const API_ORIGIN = "https://app.techrate.com.ua";
  const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
  const ROLE_LABELS = Object.freeze({
    recommendation: "Рекомендация",
    alternative: "Альтернатива",
    upgrade: "Апгрейд",
    anti: "Не рекомендуется"
  });
  const TARIFF_LABELS = Object.freeze({
    lite: "Lite",
    pro: "Pro",
    expert: "Expert"
  });

  const status = document.querySelector("#status");
  const statusTitle = document.querySelector("#status-title");
  const statusMessage = document.querySelector("#status-message");
  const loader = document.querySelector(".loader");
  const retryButton = document.querySelector("#retry-button");
  const consultationView = document.querySelector("#consultation");
  const modelsList = document.querySelector("#models-list");

  function hasValue(value) {
    return value !== null
      && value !== undefined
      && (typeof value !== "string" || value.trim() !== "");
  }

  function asText(value) {
    if (!hasValue(value)) {
      return "";
    }
    if (typeof value === "object") {
      return "";
    }
    return String(value).trim();
  }

  function firstValue(primary, fallback) {
    return hasValue(primary) ? primary : fallback;
  }

  function field(model, overrides, name) {
    return firstValue(overrides[name], model[name]);
  }

  function safeUrl(value, base) {
    const source = asText(value);
    if (!source) {
      return null;
    }

    try {
      const url = base ? new URL(source, base) : new URL(source);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  }

  function externalLink(value, label, className) {
    const url = safeUrl(value);
    if (!url) {
      return null;
    }

    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    if (className) {
      link.className = className;
    }
    return link;
  }

  function getToken() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.length === 2 && parts[0] === "c" ? parts[1] : "";
  }

  function setState(type, title, message) {
    status.hidden = false;
    consultationView.hidden = true;
    status.dataset.state = type;
    status.setAttribute("aria-busy", type === "loading" ? "true" : "false");
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    loader.hidden = type !== "loading";
    retryButton.hidden = type !== "error";
  }

  function addMeta(container, label, value) {
    const text = asText(value);
    if (!text) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "meta-item";
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = text;
    wrapper.append(term, description);
    container.append(wrapper);
  }

  function addBadge(container, text, className) {
    if (!text) {
      return;
    }
    const badge = document.createElement("span");
    badge.className = className;
    badge.textContent = text;
    container.append(badge);
  }

  function addSpec(container, label, value) {
    const text = asText(value);
    if (!text) {
      return;
    }

    const item = document.createElement("div");
    item.className = "spec-item";
    const itemLabel = document.createElement("span");
    itemLabel.className = "spec-label";
    itemLabel.textContent = label;
    const itemValue = document.createElement("span");
    itemValue.className = "spec-value";
    itemValue.textContent = text;
    item.append(itemLabel, itemValue);
    container.append(item);
  }

  function addScore(container, label, value) {
    const text = asText(value);
    if (!text) {
      return;
    }

    const item = document.createElement("div");
    item.className = "score-item";
    const itemLabel = document.createElement("span");
    itemLabel.className = "score-label";
    itemLabel.textContent = label;
    const itemValue = document.createElement("span");
    itemValue.className = "score-value";
    itemValue.textContent = text;
    item.append(itemLabel, itemValue);
    container.append(item);
  }

  function linesFrom(value) {
    const source = Array.isArray(value) ? value : asText(value).split(/\r?\n/);
    return source
      .map((line) => asText(line).replace(/^[\s•*\-–—]+/, "").trim())
      .filter(Boolean);
  }

  function addDetail(container, title, value, options) {
    const settings = options || {};
    const lines = settings.list ? linesFrom(value) : [];
    const text = settings.list ? "" : asText(value);
    if ((!settings.list && !text) || (settings.list && !lines.length)) {
      return;
    }

    const block = document.createElement("section");
    block.className = `detail-block${settings.wide ? " wide" : ""}`;
    const heading = document.createElement("h3");
    heading.textContent = title;
    block.append(heading);

    if (settings.list) {
      const list = document.createElement("ul");
      list.className = "detail-list";
      lines.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        list.append(item);
      });
      block.append(list);
    } else {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      block.append(paragraph);
    }

    container.append(block);
  }

  function normalizeExtraLink(entry, index) {
    if (typeof entry === "string") {
      return { url: entry, label: `Дополнительная ссылка ${index + 1}` };
    }
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return {
      url: entry.url || entry.href,
      label: asText(entry.label || entry.title || entry.name) || `Дополнительная ссылка ${index + 1}`
    };
  }

  function addLinksBlock(container, extraLinks) {
    if (!Array.isArray(extraLinks)) {
      return;
    }

    const links = extraLinks
      .map(normalizeExtraLink)
      .map((entry) => entry && externalLink(entry.url, entry.label))
      .filter(Boolean);

    if (!links.length) {
      return;
    }

    const block = document.createElement("section");
    block.className = "detail-block wide";
    const heading = document.createElement("h3");
    heading.textContent = "Дополнительные материалы";
    const list = document.createElement("ul");
    list.className = "links-list";
    links.forEach((link) => {
      const item = document.createElement("li");
      item.append(link);
      list.append(item);
    });
    block.append(heading, list);
    container.append(block);
  }

  function renderImage(container, imageValue, modelName) {
    const imageUrl = safeUrl(imageValue, API_ORIGIN);
    if (!imageUrl) {
      const placeholder = document.createElement("span");
      placeholder.className = "model-placeholder";
      placeholder.textContent = "Изображение модели не добавлено";
      container.append(placeholder);
      return;
    }

    const image = document.createElement("img");
    image.src = imageUrl.href;
    image.alt = modelName ? `Ноутбук ${modelName}` : "Рекомендованный ноутбук";
    image.loading = "lazy";
    image.decoding = "async";
    container.append(image);
  }

  function renderModel(item, consultation) {
    const models = consultation.models && typeof consultation.models === "object"
      ? consultation.models
      : {};
    const model = models[item.modelId] && typeof models[item.modelId] === "object"
      ? models[item.modelId]
      : {};
    const overrides = item.overrides && typeof item.overrides === "object"
      ? item.overrides
      : {};
    const role = Object.prototype.hasOwnProperty.call(ROLE_LABELS, item.role)
      ? item.role
      : "recommendation";
    const modelName = asText(field(model, overrides, "name")) || "Модель без названия";

    const card = document.createElement("article");
    card.className = "model-card";
    card.dataset.role = role;

    const main = document.createElement("div");
    main.className = "model-card-main";
    const media = document.createElement("div");
    media.className = "model-media";
    renderImage(media, field(model, overrides, "imageUrl"), modelName);

    const summary = document.createElement("div");
    summary.className = "model-summary";
    const badges = document.createElement("div");
    badges.className = "model-badges";
    addBadge(badges, hasValue(item.rank) ? `№ ${asText(item.rank)}` : "", "rank-badge");
    addBadge(badges, ROLE_LABELS[role], `role-badge ${role}`);
    addBadge(
      badges,
      hasValue(item.relatedToRank) ? `Связано с № ${asText(item.relatedToRank)}` : "",
      "related-badge"
    );

    const name = document.createElement("h2");
    name.className = "model-name";
    name.textContent = modelName;
    summary.append(badges, name);

    const price = asText(field(model, overrides, "price"));
    if (price) {
      const priceElement = document.createElement("p");
      priceElement.className = "model-price";
      priceElement.textContent = price;
      summary.append(priceElement);
    }

    const specs = document.createElement("div");
    specs.className = "specs-grid";
    addSpec(specs, "Процессор", field(model, overrides, "cpu"));
    addSpec(specs, "Видеокарта", field(model, overrides, "gpu"));
    addSpec(specs, "Оперативная память", field(model, overrides, "ram"));
    addSpec(specs, "Накопитель", field(model, overrides, "storage"));
    addSpec(specs, "Экран", field(model, overrides, "display"));
    if (specs.childElementCount) {
      summary.append(specs);
    }

    const scores = document.createElement("div");
    scores.className = "scores-grid";
    addScore(scores, "Игры", field(model, overrides, "gamingScore"));
    addScore(scores, "Работа", field(model, overrides, "workScore"));
    addScore(scores, "Контент", field(model, overrides, "contentScore"));
    addScore(scores, "Стабильность", field(model, overrides, "stabilityScore"));
    if (scores.childElementCount) {
      summary.append(scores);
    }

    const productLink = externalLink(
      field(model, overrides, "productUrl"),
      "Открыть страницу модели ↗",
      "product-link"
    );
    if (productLink) {
      summary.append(productLink);
    }

    main.append(media, summary);
    card.append(main);

    const details = document.createElement("div");
    details.className = "model-details";
    addDetail(details, "Комментарий эксперта", item.customConclusion, { wide: true });
    addDetail(details, "Плюсы", field(model, overrides, "pros"), { list: true });
    addDetail(details, "Минусы", field(model, overrides, "cons"), { list: true });
    addDetail(details, "Температуры и шум", field(model, overrides, "temperaturesAndNoise"), { list: true });
    addDetail(details, "FPS в играх", field(model, overrides, "fps"), { list: true });
    addLinksBlock(details, item.extraLinks);
    if (details.childElementCount) {
      card.append(details);
    }

    return card;
  }

  function tariffLabel(value) {
    const key = asText(value).toLowerCase();
    return TARIFF_LABELS[key] || asText(value);
  }

  function renderConsultation(consultation) {
    const clientName = asText(consultation.clientName);
    const title = asText(consultation.title) || "Персональный подбор ноутбука";
    const intro = asText(consultation.intro);
    const conclusion = asText(consultation.conclusion);

    document.title = `${title} — ТехЗачёт`;
    document.querySelector("#tariff").textContent = tariffLabel(consultation.tariff) || "Консультация";
    document.querySelector("#client-name").textContent = clientName ? `Подготовлено для ${clientName}` : "Персональная консультация";
    document.querySelector("#consultation-title").textContent = title;
    const introElement = document.querySelector("#consultation-intro");
    introElement.textContent = intro;
    introElement.hidden = !intro;

    const meta = document.querySelector("#consultation-meta");
    meta.replaceChildren();
    addMeta(meta, "Клиент", clientName);
    addMeta(meta, "Бюджет", consultation.budget);
    addMeta(meta, "Тариф", tariffLabel(consultation.tariff));
    meta.hidden = !meta.childElementCount;

    modelsList.replaceChildren();
    const items = Array.isArray(consultation.items) ? consultation.items : [];
    items
      .filter((item) => item && typeof item === "object")
      .forEach((item) => modelsList.append(renderModel(item, consultation)));

    if (!modelsList.childElementCount) {
      const empty = document.createElement("p");
      empty.className = "model-placeholder";
      empty.textContent = "В этой консультации пока нет опубликованных моделей.";
      modelsList.append(empty);
    }

    const conclusionSection = document.querySelector("#conclusion-section");
    document.querySelector("#consultation-conclusion").textContent = conclusion;
    conclusionSection.hidden = !conclusion;

    status.hidden = true;
    status.setAttribute("aria-busy", "false");
    consultationView.hidden = false;
  }

  function extractConsultation(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    if (payload.consultation && typeof payload.consultation === "object") {
      return payload.consultation;
    }
    if (payload.data && payload.data.consultation && typeof payload.data.consultation === "object") {
      return payload.data.consultation;
    }
    return payload;
  }

  async function loadConsultation() {
    const token = getToken();
    if (!TOKEN_PATTERN.test(token)) {
      setState(
        "invalid",
        "Некорректная ссылка",
        "Проверьте, что адрес консультации скопирован полностью."
      );
      return;
    }

    setState("loading", "Загружаем вашу консультацию", "Собираем рекомендации и результаты тестов.");

    try {
      const endpoint = new URL(`/api/public/consultations/${encodeURIComponent(token)}`, API_ORIGIN);
      const response = await fetch(endpoint.href, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });

      if (response.status === 400) {
        setState("invalid", "Некорректная ссылка", "Проверьте адрес консультации и попробуйте открыть его снова.");
        return;
      }
      if (response.status === 404) {
        setState("not-found", "Консультация не найдена", "Ссылка недействительна или консультация ещё не опубликована.");
        return;
      }
      if (!response.ok) {
        throw new Error(`TechRate response ${response.status}`);
      }

      const payload = await response.json();
      const consultation = extractConsultation(payload);
      if (!consultation) {
        throw new Error("Invalid consultation payload");
      }
      renderConsultation(consultation);
    } catch (error) {
      console.error("Consultation loading failed", error);
      setState(
        "error",
        "Не удалось загрузить консультацию",
        "Сервис временно недоступен. Проверьте соединение и попробуйте ещё раз."
      );
    }
  }

  retryButton.addEventListener("click", loadConsultation);
  loadConsultation();
})();
