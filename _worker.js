const PLATEGA_API_BASE = "https://app.platega.io/";
const ALLOWED_STATUSES = new Set([
  "PENDING",
  "CONFIRMED",
  "CANCELED",
  "CHARGEBACKED"
]);
const PLANS = Object.freeze({
  lite: Object.freeze({ name: "БАЗОВЫЙ", amount: 2000, currency: "RUB" }),
  pro: Object.freeze({ name: "РАСШИРЕННЫЙ", amount: 3000, currency: "RUB" }),
  expert: Object.freeze({ name: "МАКСИМАЛЬНЫЙ", amount: 4200, currency: "RUB" })
});
const API_HEADERS = Object.freeze({
  "Cache-Control": "no-store, private",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});
const EMPTY_HEADERS = Object.freeze({
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});
const BLOCKED_COUNTRIES = new Set(["UA"]);
const PLATEGA_WEBHOOK_PATHS = new Set([
  "/api/platega-webhook",
  "/api/platega-webhook.php"
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: API_HEADERS
  });
}

function emptyResponse(status = 200, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: { ...EMPTY_HEADERS, ...extraHeaders }
  });
}

function geoBlockedResponse() {
  return Response.error();
}

function isConsultationPath(pathname) {
  return /^\/c\/[A-Za-z0-9_-]{40,64}\/?$/.test(pathname);
}

function shouldGeoBlock(request, pathname) {
  const country = String((request.cf && request.cf.country) || "").toUpperCase();
  return BLOCKED_COUNTRIES.has(country)
    && !PLATEGA_WEBHOOK_PATHS.has(pathname)
    && !isConsultationPath(pathname);
}

function requireBindings(env) {
  if (!env.DB) {
    throw new Error("Missing D1 binding: DB");
  }
  if (!env.PLATEGA_MERCHANT_ID || !env.PLATEGA_SECRET) {
    throw new Error("Missing Platega secrets");
  }
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUuid(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isAllowedRedirect(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "platega.io" || url.hostname.endsWith(".platega.io"));
  } catch {
    return false;
  }
}

function constantTimeEqual(leftValue, rightValue) {
  const left = String(leftValue);
  const right = String(rightValue);
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

async function readJsonBody(request, maximumBytes = 16384) {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(400, "Content-Type должен быть application/json.");
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(413, "Запрос слишком большой.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new HttpError(413, "Запрос слишком большой.");
  }

  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw new HttpError(400, "Некорректный JSON.");
  }
}

function assertSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return;
  }

  const requestUrl = new URL(request.url);
  const expectedOrigin = env.APP_URL
    ? new URL(env.APP_URL).origin
    : requestUrl.origin;

  if (origin !== expectedOrigin) {
    throw new HttpError(403, "Запрос с другого сайта запрещён.");
  }
}

async function enforceRateLimit(request, env) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const clientKey = await sha256(address);
  const now = Date.now();
  const windowLength = 10 * 60 * 1000;
  const maximumAttempts = 10;
  const existing = await env.DB.prepare(
    "SELECT window_started_at, attempt_count FROM payment_rate_limits WHERE client_key = ?"
  ).bind(clientKey).first();

  if (!existing || Number(existing.window_started_at) <= now - windowLength) {
    await env.DB.prepare(
      `INSERT INTO payment_rate_limits (client_key, window_started_at, attempt_count)
       VALUES (?, ?, 1)
       ON CONFLICT(client_key) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         attempt_count = 1`
    ).bind(clientKey, now).run();
    return;
  }

  if (Number(existing.attempt_count) >= maximumAttempts) {
    throw new HttpError(429, "Слишком много попыток. Подождите несколько минут.");
  }

  await env.DB.prepare(
    "UPDATE payment_rate_limits SET attempt_count = attempt_count + 1 WHERE client_key = ?"
  ).bind(clientKey).run();
}

async function plategaRequest(env, method, path, body = null) {
  const url = new URL(path.replace(/^\/+/, ""), PLATEGA_API_BASE);
  const headers = {
    "Accept": "application/json",
    "X-MerchantId": env.PLATEGA_MERCHANT_ID,
    "X-Secret": env.PLATEGA_SECRET
  };
  const options = {
    method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20000)
  };

  if (body !== null) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let responseBody = {};

  if (text.trim()) {
    try {
      responseBody = JSON.parse(text);
    } catch {
      throw new Error("Platega returned invalid JSON");
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body: responseBody && typeof responseBody === "object" ? responseBody : {}
  };
}

function checkoutOrigin(request, env) {
  const requestOrigin = new URL(request.url).origin;
  if (!env.APP_URL) {
    return requestOrigin;
  }

  const configured = new URL(env.APP_URL);
  if (configured.protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS");
  }
  return configured.origin;
}

function validContact(value) {
  if (typeof value !== "string") {
    return false;
  }

  const contact = value.trim();
  if (!contact || contact.length > 160) {
    return false;
  }

  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const telegram = /^@?[A-Za-z0-9_]{5,32}$/.test(contact)
    || /^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\/?$/i.test(contact);

  return email || telegram;
}

async function handleCreatePayment(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Метод не поддерживается." }, 405);
  }

  assertSameOrigin(request, env);
  await enforceRateLimit(request, env);
  const input = await readJsonBody(request);
  const planKey = typeof input.plan === "string" ? input.plan.trim().toLowerCase() : "";
  const plan = PLANS[planKey];
  const contact = typeof input.contact === "string" ? input.contact.trim() : "";

  if (!plan) {
    throw new HttpError(422, "Неизвестный тариф.");
  }
  if (!validContact(contact)) {
    throw new HttpError(422, "Укажите корректный Telegram или email.");
  }
  if (input.acceptedTerms !== true) {
    throw new HttpError(422, "Для продолжения необходимо принять условия.");
  }

  const orderId = crypto.randomUUID();
  const publicToken = randomToken();
  const publicTokenHash = await sha256(publicToken);
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO payment_orders (
       order_id, public_token_hash, plan_key, plan_name, contact,
       amount, currency, status, created_at, updated_at, terms_accepted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INITIALIZING', ?, ?, ?)`
  ).bind(
    orderId,
    publicTokenHash,
    planKey,
    plan.name,
    contact,
    plan.amount,
    plan.currency,
    now,
    now,
    now
  ).run();

  const origin = checkoutOrigin(request, env);
  const resultQuery = new URLSearchParams({
    order: orderId,
    token: publicToken
  });
  const successUrl = `${origin}/payment-success.html?${resultQuery}`;
  const failedUrl = `${origin}/payment-failed.html?${resultQuery}`;

  let providerResponse;
  try {
    providerResponse = await plategaRequest(env, "POST", "v2/transaction/process", {
      paymentDetails: {
        amount: plan.amount,
        currency: plan.currency
      },
      description: `Персональный подбор ноутбука — тариф ${plan.name}`,
      return: successUrl,
      failedUrl,
      payload: orderId,
      metadata: {
        userId: orderId
      }
    });
  } catch (error) {
    await env.DB.prepare(
      "UPDATE payment_orders SET status = 'PROVIDER_ERROR', updated_at = ? WHERE order_id = ?"
    ).bind(Date.now(), orderId).run();
    throw error;
  }

  const transactionId = normalizeUuid(providerResponse.body.transactionId);
  const redirect = String(providerResponse.body.url || providerResponse.body.redirect || "");

  if (
    !providerResponse.ok
    || !isUuid(transactionId)
    || !isAllowedRedirect(redirect)
  ) {
    await env.DB.prepare(
      "UPDATE payment_orders SET status = 'PROVIDER_ERROR', updated_at = ? WHERE order_id = ?"
    ).bind(Date.now(), orderId).run();
    throw new HttpError(502, "Платёжный сервис временно недоступен. Попробуйте ещё раз.");
  }

  const providerStatus = ALLOWED_STATUSES.has(String(providerResponse.body.status || "").toUpperCase())
    ? String(providerResponse.body.status).toUpperCase()
    : "PENDING";

  await env.DB.prepare(
    `UPDATE payment_orders
     SET status = 'PENDING', provider_status = ?, transaction_id = ?,
         provider_expires_in = ?, updated_at = ?
     WHERE order_id = ?`
  ).bind(
    providerStatus,
    transactionId,
    providerResponse.body.expiresIn || null,
    Date.now(),
    orderId
  ).run();

  return jsonResponse({ redirect });
}

function publicOrder(order) {
  const status = order.provider_status || order.status || "PENDING";
  return {
    orderId: order.order_id,
    plan: order.plan_name,
    amount: Number(order.amount),
    currency: order.currency,
    status,
    paid: status === "CONFIRMED"
  };
}

async function sendTelegramPaymentNotification(order, env) {
  const botToken = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID || "").trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken) || !/^-?\d+$/.test(chatId)) {
    throw new Error("Telegram notification secrets have an invalid format");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          "✅ Нова підтверджена оплата",
          `Тариф: ${order.plan_name}`,
          `Сума: ${order.amount} ${order.currency}`,
          `Контакт: ${order.contact}`,
          `Спосіб оплати: ${order.payment_method || "не вказано"}`,
          `Замовлення: ${order.order_id}`
        ].join("\n"),
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(10000)
    }
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok !== true) {
    throw new Error(
      `Telegram notification failed (${response.status}): ${result.description || "unknown error"}`
    );
  }
}

async function notifyPaymentConfirmed(order, env, requestId) {
  if (
    !order
    || order.provider_status !== "CONFIRMED"
    || !env.TELEGRAM_BOT_TOKEN
    || !env.TELEGRAM_CHAT_ID
  ) {
    if (
      order
      && order.provider_status === "CONFIRMED"
      && (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    ) {
      console.error(`[payments][${requestId}] Telegram notification secrets are missing`);
    }
    return false;
  }

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payment_notifications (
       order_id TEXT PRIMARY KEY,
       created_at INTEGER NOT NULL,
       sent_at INTEGER,
       FOREIGN KEY (order_id) REFERENCES payment_orders(order_id) ON DELETE CASCADE
     )`
  ).run();

  const now = Date.now();
  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO payment_notifications (order_id, created_at)
     VALUES (?, ?)`
  ).bind(order.order_id, now).run();

  if (!claim.meta || Number(claim.meta.changes) !== 1) {
    return false;
  }

  try {
    await sendTelegramPaymentNotification(order, env);
    await env.DB.prepare(
      "UPDATE payment_notifications SET sent_at = ? WHERE order_id = ?"
    ).bind(Date.now(), order.order_id).run();
    return true;
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM payment_notifications WHERE order_id = ? AND sent_at IS NULL"
    ).bind(order.order_id).run();
    throw error;
  }
}

async function refreshOrderStatus(order, env, requestId) {
  if (
    order.provider_status !== "PENDING"
    || !isUuid(order.transaction_id)
    || (order.last_provider_check_at && Number(order.last_provider_check_at) > Date.now() - 10000)
  ) {
    return order;
  }

  const claim = await env.DB.prepare(
    `UPDATE payment_orders
     SET last_provider_check_at = ?
     WHERE order_id = ?
       AND provider_status = 'PENDING'
       AND (last_provider_check_at IS NULL OR last_provider_check_at <= ?)`
  ).bind(Date.now(), order.order_id, Date.now() - 10000).run();

  if (!claim.meta || Number(claim.meta.changes) !== 1) {
    return order;
  }

  try {
    const providerResponse = await plategaRequest(
      env,
      "GET",
      `transaction/${encodeURIComponent(order.transaction_id)}`
    );
    const body = providerResponse.body;
    const status = String(body.status || "").toUpperCase();
    const transactionId = normalizeUuid(body.id);
    const details = body.paymentDetails && typeof body.paymentDetails === "object"
      ? body.paymentDetails
      : {};
    const matches = providerResponse.ok
      && isUuid(transactionId)
      && constantTimeEqual(order.transaction_id, transactionId)
      && Number(details.amount) === Number(order.amount)
      && constantTimeEqual(order.currency, String(details.currency || "").toUpperCase())
      && ALLOWED_STATUSES.has(status);

    if (matches) {
      await env.DB.prepare(
        `UPDATE payment_orders
         SET status = ?, provider_status = ?, payment_method = ?, updated_at = ?
         WHERE order_id = ?`
      ).bind(
        status,
        status,
        body.paymentMethod || null,
        Date.now(),
        order.order_id
      ).run();
    } else if (providerResponse.ok) {
      console.error(`[payments][${requestId}] Status response does not match order`);
    }
  } catch (error) {
    console.error(`[payments][${requestId}] Status refresh failed: ${error.message}`);
  }

  return await env.DB.prepare(
    "SELECT * FROM payment_orders WHERE order_id = ?"
  ).bind(order.order_id).first();
}

async function handlePaymentStatus(request, env, requestId) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Метод не поддерживается." }, 405);
  }

  const url = new URL(request.url);
  const orderId = normalizeUuid(url.searchParams.get("order"));
  const token = String(url.searchParams.get("token") || "").trim().toLowerCase();

  if (!isUuid(orderId) || !/^[0-9a-f]{64}$/.test(token)) {
    throw new HttpError(400, "Некорректные параметры заказа.");
  }

  let order = await env.DB.prepare(
    "SELECT * FROM payment_orders WHERE order_id = ?"
  ).bind(orderId).first();

  if (!order || !constantTimeEqual(order.public_token_hash, await sha256(token))) {
    throw new HttpError(404, "Заказ не найден.");
  }

  order = await refreshOrderStatus(order, env, requestId);
  if (order && order.provider_status === "CONFIRMED") {
    try {
      await notifyPaymentConfirmed(order, env, requestId);
    } catch (error) {
      console.error(`[payments][${requestId}] ${error.message}`);
    }
  }
  return jsonResponse(publicOrder(order));
}

async function handleWebhook(request, env, requestId) {
  if (request.method !== "POST") {
    return emptyResponse(405, { "Allow": "POST" });
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 65536) {
    return emptyResponse(413);
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 65536) {
    return emptyResponse(413);
  }

  // Platega validates the callback URL with an empty POST request.
  if (!text.trim()) {
    return emptyResponse(200);
  }

  if (
    !constantTimeEqual(env.PLATEGA_MERCHANT_ID, request.headers.get("X-MerchantId") || "")
    || !constantTimeEqual(env.PLATEGA_SECRET, request.headers.get("X-Secret") || "")
  ) {
    console.error(`[payments][${requestId}] Rejected webhook credentials`);
    return emptyResponse(401);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return emptyResponse(400);
  }

  const orderId = normalizeUuid(payload && payload.payload);
  const transactionId = normalizeUuid(payload && payload.id);
  const status = String((payload && payload.status) || "").trim().toUpperCase();
  const currency = String((payload && payload.currency) || "").trim().toUpperCase();
  const amount = payload ? payload.amount : null;

  if (
    !isUuid(orderId)
    || !isUuid(transactionId)
    || !ALLOWED_STATUSES.has(status)
    || !Number.isFinite(Number(amount))
    || !currency
  ) {
    return emptyResponse(400);
  }

  const order = await env.DB.prepare(
    "SELECT * FROM payment_orders WHERE order_id = ?"
  ).bind(orderId).first();

  if (!order) {
    console.error(`[payments][${requestId}] Webhook references unknown order`);
    return emptyResponse(200);
  }

  if (
    !constantTimeEqual(order.transaction_id || "", transactionId)
    || Number(order.amount) !== Number(amount)
    || !constantTimeEqual(order.currency, currency)
  ) {
    console.error(`[payments][${requestId}] Webhook does not match order`);
    return emptyResponse(409);
  }

  const previous = order.provider_status || "";
  const terminal = previous === "CONFIRMED" || previous === "CHARGEBACKED";
  const allowedTransition = !terminal
    || previous === status
    || (previous === "CONFIRMED" && status === "CHARGEBACKED");

  if (allowedTransition) {
    await env.DB.prepare(
      `UPDATE payment_orders
       SET status = ?, provider_status = ?, payment_method = ?,
           updated_at = ?, last_webhook_at = ?
       WHERE order_id = ?`
    ).bind(
      status,
      status,
      payload.paymentMethod || null,
      Date.now(),
      Date.now(),
      orderId
    ).run();

    if (status === "CONFIRMED") {
      await notifyPaymentConfirmed({
        ...order,
        status,
        provider_status: status,
        payment_method: payload.paymentMethod || order.payment_method || null,
        updated_at: Date.now()
      }, env, requestId);
    }
  }

  return emptyResponse(200);
}

async function handleApiRequest(request, env, requestId) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";

  switch (path) {
    case "/api/create-payment":
    case "/api/create-payment.php":
      return handleCreatePayment(request, env);
    case "/api/payment-status":
    case "/api/payment-status.php":
      return handlePaymentStatus(request, env, requestId);
    case "/api/platega-webhook":
    case "/api/platega-webhook.php":
      return handleWebhook(request, env, requestId);
    default:
      return jsonResponse({ error: "API route not found." }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (shouldGeoBlock(request, pathname)) {
      return geoBlockedResponse();
    }

    if (isConsultationPath(pathname)) {
      const consultationUrl = new URL("/consultation/", request.url);
      return env.ASSETS.fetch(new Request(consultationUrl, request));
    }

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const requestId = crypto.randomUUID();

    try {
      requireBindings(env);
      return await handleApiRequest(request, env, requestId);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({
          error: error.message,
          requestId
        }, error.status);
      }

      console.error(`[payments][${requestId}] ${error && error.stack ? error.stack : error}`);
      return jsonResponse({
        error: "Внутренняя ошибка. Сообщите поддержке код запроса.",
        requestId
      }, 500);
    }
  }
};
