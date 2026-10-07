(() => {
  "use strict";
  const {
    paymentMethods,
    createState,
    getOrder,
    parseCash,
    completePayment,
    paymentError,
    updateCart,
    renderScreen,
    renderProgress,
    previewChange,
  } = window.Kiosk;
  let state = createState(),
    toastTimer;
  const app = document.getElementById("app");
  const total = () => getOrder(state.cart).total;
  const count = () => getOrder(state.cart).count;
  function finish(paid) {
    if (completePayment(state, paid)) render();
  }
  function notify(message) {
    const toast = document.getElementById("toast");
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.textContent = "";
    }, 2400);
  }
  function clearToast() {
    clearTimeout(toastTimer);
    const toast = document.getElementById("toast");
    toast.hidden = true;
    toast.textContent = "";
  }
  function render(focusHeading = true) {
    if (focusHeading) clearToast();
    document.getElementById("progress").innerHTML = renderProgress(
      state.screen,
    );
    app.innerHTML = renderScreen(state);
    if (focusHeading) {
      const heading = app.querySelector("h1");
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }
  function navigate(screen) {
    state.screen = screen;
    state.error = "";
    render();
  }
  app.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-action]");
    if (!target || target.disabled || state.busy) return;
    const action = target.dataset.action,
      id = target.dataset.id;
    if (["add", "minus", "remove"].includes(action) && state.screen === 1) {
      const result = updateCart(state.cart, action, id);
      if (result.message) notify(result.message);
      if (!result.changed) return;
      render(false);
      // Preserve keyboard focus where possible after the cart updates.
      app
        .querySelector(`button[data-action="${action}"][data-id="${id}"]`)
        ?.focus({ preventScroll: true });
    } else if (action === "summary" && state.screen === 1 && count())
      navigate(2);
    else if (action === "selection" && state.screen === 2) navigate(1);
    else if (action === "methods" && state.screen === 2 && count()) navigate(3);
    else if (action === "summary-back" && state.screen === 3) navigate(2);
    else if (action === "method" && state.screen === 3 && count()) {
      const method = paymentMethods[Number(target.dataset.method)];
      if (!method) return;
      state.method = method;
      state.cash = "";
      navigate(4);
    } else if (action === "change-method" && state.screen === 4) {
      state.method = null;
      state.cash = "";
      navigate(3);
    } else if (
      action === "confirm" &&
      state.screen === 4 &&
      state.method === "QR Payment"
    )
      finish(total());
    else if (
      action === "process" &&
      state.screen === 4 &&
      state.method === "Credit/Debit Card"
    ) {
      state.busy = true;
      render(false);
      state.timer = setTimeout(() => {
        if (
          state.screen === 4 &&
          state.busy &&
          state.method === "Credit/Debit Card"
        )
          finish(total());
      }, 1400);
    } else if (action === "receipt" && state.screen === 5 && state.receipt)
      navigate(6);
    else if (action === "reset" && state.screen === 6) {
      clearTimeout(state.timer);
      state = createState();
      render();
    }
  });
  app.addEventListener("input", (event) => {
    if (
      event.target.id !== "cash" ||
      state.screen !== 4 ||
      state.method !== "Cash"
    )
      return;
    state.cash = event.target.value;
    state.error = "";
    event.target.setAttribute("aria-invalid", "false");
    const error = document.getElementById("cash-error");
    error.hidden = true;
    error.textContent = "";
    document.getElementById("change-preview").textContent = previewChange(
      state.cash,
      total(),
    );
  });
  app.addEventListener("submit", (event) => {
    if (event.target.id !== "cash-form") return;
    event.preventDefault();
    if (state.screen !== 4 || state.method !== "Cash" || state.busy || !count())
      return;
    const input = document.getElementById("cash"),
      raw = input.value;
    state.cash = raw;
    const paid = parseCash(raw);
    state.error = paymentError(raw, total(), input.validity.badInput);
    if (state.error) {
      const error = document.getElementById("cash-error");
      error.textContent = state.error;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    finish(paid);
  });
  render(false);
})();
