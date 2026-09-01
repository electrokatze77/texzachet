(function () {
  "use strict";

  const checkoutButtons = document.querySelectorAll("[data-checkout-plan]");
  if (!checkoutButtons.length) {
    return;
  }

  const notice = document.querySelector("[data-payment-notice]");
  const modalElement = document.querySelector("#checkoutModal");
  const form = document.querySelector("[data-checkout-form]");
  const contactInput = document.querySelector("#checkoutContact");
  const termsInput = document.querySelector("#checkoutTerms");
  const planName = document.querySelector("[data-checkout-plan-name]");
  const planPrice = document.querySelector("[data-checkout-plan-price]");
  const submitButton = document.querySelector("[data-checkout-submit]");
  const checkoutError = document.querySelector("[data-checkout-error]");
  if (
    !modalElement
    || !form
    || !contactInput
    || !termsInput
    || !planName
    || !planPrice
    || !submitButton
    || !checkoutError
    || !window.bootstrap
  ) {
    return;
  }

  const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
  const plans = {
    lite: { name: "БАЗОВЫЙ", price: "2000 RUB" },
    pro: { name: "РАСШИРЕННЫЙ", price: "3000 RUB" },
    expert: { name: "МАКСИМАЛЬНЫЙ", price: "4300 RUB" }
  };
  let selectedPlan = "";
  let checkoutInProgress = false;

  function showError(message, requestId) {
    const fullMessage = requestId
      ? `${message} Код запроса: ${requestId}`
      : message;

    if (checkoutError && modalElement && modalElement.classList.contains("show")) {
      checkoutError.textContent = fullMessage;
      checkoutError.hidden = false;
      return;
    }

    if (!notice) {
      window.alert(fullMessage);
      return;
    }

    notice.textContent = fullMessage;
    notice.hidden = false;
    notice.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function clearError() {
    if (notice) {
      notice.textContent = "";
      notice.hidden = true;
    }
    checkoutError.textContent = "";
    checkoutError.hidden = true;
  }

  function setLoading(isLoading) {
    if (!submitButton) {
      return;
    }
    submitButton.disabled = isLoading;
    submitButton.setAttribute("aria-busy", isLoading ? "true" : "false");
    submitButton.textContent = isLoading ? "Создаём платёж…" : "Перейти к оплате";
  }

  checkoutButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (checkoutInProgress) {
        return;
      }

      selectedPlan = button.dataset.checkoutPlan || "";
      if (!plans[selectedPlan] || !modal || !form) {
        showError("Форма оплаты временно недоступна.");
        return;
      }

      clearError();
      planName.textContent = plans[selectedPlan].name;
      planPrice.textContent = `К оплате: ${plans[selectedPlan].price}`;
      form.reset();
      modal.show();
      window.setTimeout(() => contactInput && contactInput.focus(), 250);
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (checkoutInProgress || !form.reportValidity()) {
      return;
    }

    checkoutInProgress = true;
    clearError();
    setLoading(true);

    try {
      const response = await fetch("/api/create-payment", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          plan: selectedPlan,
          contact: contactInput.value.trim(),
          acceptedTerms: termsInput.checked
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.redirect !== "string") {
        throw Object.assign(
          new Error(payload.error || "Не удалось создать платёж."),
          { requestId: payload.requestId }
        );
      }

      const redirect = new URL(payload.redirect);
      if (redirect.protocol !== "https:" || !/(^|\.)platega\.io$/i.test(redirect.hostname)) {
        throw new Error("Платёжный сервис вернул некорректную ссылку.");
      }

      window.location.assign(redirect.href);
    } catch (error) {
      checkoutInProgress = false;
      setLoading(false);
      showError(
        error instanceof Error ? error.message : "Не удалось начать оплату.",
        error && typeof error.requestId === "string" ? error.requestId : ""
      );
    }
  });
})();
