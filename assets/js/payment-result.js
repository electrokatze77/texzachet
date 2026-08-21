(function () {
  "use strict";

  const card = document.querySelector("[data-payment-result]");
  if (!card) {
    return;
  }

  const title = card.querySelector("[data-result-title]");
  const message = card.querySelector("[data-result-message]");
  const summary = card.querySelector("[data-result-summary]");
  const icon = card.querySelector("[data-result-icon]");
  const supportLink = card.querySelector("[data-result-support-link]");
  const emailFallback = card.querySelector("[data-result-email-fallback]");
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order") || "";
  const token = params.get("token") || "";
  const validOrder = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);
  const validToken = /^[0-9a-f]{64}$/i.test(token);
  let attempts = 0;
  let timer = null;

  const states = {
    PENDING: {
      state: "pending",
      icon: "bi-arrow-repeat payment-result-spinner",
      title: "Проверяем оплату",
      message: "Подождите несколько секунд. Мы ожидаем подтверждение от платёжной системы."
    },
    CONFIRMED: {
      state: "confirmed",
      icon: "bi-check-lg",
      title: "Оплата подтверждена",
      message: "Спасибо, что воспользовались услугой. Теперь кратко напишите мне свой бюджет и требования."
    },
    CANCELED: {
      state: "canceled",
      icon: "bi-x-lg",
      title: "Оплата не завершена",
      message: "Платёж отменён или время на оплату закончилось. Вы можете вернуться и попробовать ещё раз."
    },
    CHARGEBACKED: {
      state: "chargebacked",
      icon: "bi-arrow-counterclockwise",
      title: "Платёж возвращён",
      message: "По этой транзакции оформлен возврат средств."
    }
  };

  function renderState(status, payment) {
    const current = states[status] || states.PENDING;
    card.dataset.state = current.state;
    title.textContent = current.title;
    message.textContent = current.message;
    icon.className = `bi ${current.icon}`;

    if (supportLink) {
      supportLink.hidden = status !== "CONFIRMED";
    }
    if (emailFallback) {
      emailFallback.hidden = status !== "CONFIRMED";
    }

    if (payment && payment.plan) {
      summary.textContent = `${payment.plan} · ${payment.amount} ${payment.currency}`;
      summary.hidden = false;
    }

    if (status !== "PENDING" && timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  async function checkStatus() {
    attempts += 1;

    try {
      const endpoint = new URL("/api/payment-status", window.location.origin);
      endpoint.searchParams.set("order", orderId);
      endpoint.searchParams.set("token", token);

      const response = await fetch(endpoint.href, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
      const payment = await response.json().catch(() => ({}));

      if (!response.ok || typeof payment.status !== "string") {
        throw new Error(payment.error || "Статус оплаты недоступен.");
      }

      renderState(payment.status, payment);
      if (payment.status === "PENDING" && attempts < 100) {
        timer = window.setTimeout(checkStatus, 3000);
      } else if (payment.status === "PENDING") {
        message.textContent = "Подтверждение занимает больше времени, чем обычно. Обновите страницу через несколько минут.";
      }
    } catch (error) {
      card.dataset.state = "failed";
      icon.className = "bi bi-exclamation-triangle";
      title.textContent = "Не удалось проверить оплату";
      message.textContent = error instanceof Error
        ? error.message
        : "Попробуйте обновить страницу или обратитесь в поддержку.";
    }
  }

  if (!validOrder || !validToken) {
    card.dataset.state = "failed";
    icon.className = "bi bi-exclamation-triangle";
    title.textContent = "Некорректная ссылка";
    message.textContent = "В ссылке нет данных, необходимых для проверки платежа.";
    return;
  }

  renderState("PENDING");
  checkStatus();
})();
