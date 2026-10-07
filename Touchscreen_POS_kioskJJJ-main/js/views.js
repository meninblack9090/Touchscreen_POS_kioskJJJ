(() => {
  "use strict";
  const {
    products,
    paymentMethods,
    formatMoney,
    escapeHtml,
    getOrder,
    parseCash,
  } = window.Kiosk;
  const html = String.raw;
  const bagIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10h20l-2 18H8L6 10Zm6 2V7a4 4 0 0 1 8 0v5"/></svg>';
  const artworkImage = (folder, name) =>
    html`<img
      src="assets/${folder}/${name}.svg"
      alt=""
      width="160"
      height="144"
      draggable="false"
    />`;
  function cartRow(item) {
    return html`<div class="cart-row" data-cart-id="${item.id}">
      <div class="row-heading">
        <div>
          <strong>${item.name}</strong>
          <div class="unit">${formatMoney(item.price)} each</div>
        </div>
        <strong>${formatMoney(item.subtotal)}</strong>
      </div>
      <div class="row-controls">
        <div class="quantity">
          <button
            type="button"
            data-action="minus"
            data-id="${item.id}"
            aria-label="Decrease ${item.name} quantity"
          >
            −</button
          ><span aria-label="${item.name} quantity">${item.qty}</span
          ><button
            type="button"
            data-action="add"
            data-id="${item.id}"
            aria-label="Increase ${item.name} quantity"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="remove"
          data-action="remove"
          data-id="${item.id}"
          aria-label="Remove ${item.name}"
        >
          Remove
        </button>
      </div>
    </div>`;
  }
  function productCard(item) {
    return html`<button
      type="button"
      class="product"
      data-action="add"
      data-id="${item.id}"
      aria-label="Add ${item.name}, ${formatMoney(item.price)}"
    >
      <span class="product-art" aria-hidden="true"
        >${artworkImage("products", item.id)}</span
      ><span class="product-name">${item.name}</span
      ><span class="product-desc">${item.description}</span
      ><span class="product-bottom"
        ><span>${formatMoney(item.price)}</span
        ><span class="add-icon" aria-hidden="true">+</span></span
      >
    </button>`;
  }
  const button = (label, action, kind = "primary", extra = "") =>
    html`<button
      type="button"
      class="btn ${kind}"
      data-action="${action}"
      ${extra}
    >
      ${label}
    </button>`;
  const due = (order) =>
    html`<div class="amount-box">
      <span>Total due</span><strong>${formatMoney(order.total)}</strong>
    </div>`;
  function summaryRows(list) {
    return list
      .map(
        (item) =>
          html`<div class="summary-row">
            <div>
              <div class="summary-name">${escapeHtml(item.name)}</div>
              <div class="summary-detail">
                ${item.qty} × ${formatMoney(item.price)} =
                ${formatMoney(item.subtotal)}
              </div>
            </div>
            <div class="summary-subtotal">${formatMoney(item.subtotal)}</div>
          </div>`,
      )
      .join("");
  }
  function details(receiptData) {
    return html`<dl class="details">
      <div class="detail">
        <dt>Transaction amount</dt>
        <dd>${formatMoney(receiptData.total)}</dd>
      </div>
      <div class="detail">
        <dt>Amount paid</dt>
        <dd>${formatMoney(receiptData.paid)}</dd>
      </div>
      <div class="detail">
        <dt>Payment method</dt>
        <dd>${escapeHtml(receiptData.method)}</dd>
      </div>
      <div class="detail">
        <dt>Transaction number</dt>
        <dd class="reference">${receiptData.number}</dd>
      </div>
    </dl>`;
  }
  function selection(state, order) {
    return html`<div class="selection-layout">
      <section>
        <div class="intro">
          <div class="terminal-strip">
            <span>Your campus pit stop</span
            ><span><i aria-hidden="true"></i>Ready when you are</span>
          </div>
          <div class="section-label">A good day starts here</div>
          <h1>What can we get you?</h1>
          <p class="muted">Tap an item to add it to your order.</p>
        </div>
        <div class="products">${products.map(productCard).join("")}</div>
        <p class="catalog-note">
          <span aria-hidden="true">//</span> A quick bite, a fresh start, or
          something for class.
        </p>
      </section>
      <aside class="panel" aria-label="Current order">
        <div class="cart-heading">
          <h2>Your order</h2>
          <span class="pill" id="item-count"
            >${order.count} ${order.count === 1 ? "item" : "items"}</span
          >
        </div>
        <div id="cart-items">
          ${
            order.items.length
              ? order.items.map(cartRow).join("")
              : html`<div class="empty">
                  <div class="empty-symbol" aria-hidden="true">${bagIcon}</div>
                  <strong>A little empty in here.</strong>
                  <p>Tap something tasty to get started.</p>
                </div>`
          }
        </div>
        <div class="cart-total">
          <span>Total amount</span
          ><strong id="cart-total">${formatMoney(order.total)}</strong>
        </div>
        ${button('Proceed to Order Summary <span aria-hidden="true">→</span>', "summary", "primary wide", !order.count ? "disabled" : "")}
        <p class="cart-caption">Review your order before you pay.</p>
        <div class="hardware-label">
          <span>Made for your campus day</span><span>Happy shopping</span>
        </div>
      </aside>
    </div>`;
  }
  function summary(state, order) {
    return html`<section class="center-screen">
      <div class="center-intro">
        <div class="section-label">Check the good stuff</div>
        <h1>Your order summary</h1>
        <p class="muted">Everything look right? Let’s make it yours.</p>
      </div>
      <div class="panel">
        ${summaryRows(order.items)}
        <div class="amount-box">
          <span>Total amount · ${order.count} items</span
          ><strong>${formatMoney(order.total)}</strong>
        </div>
      </div>
      <div class="actions">
        ${button("← Back", "selection", "secondary")}${button("Continue to Payment →", "methods")}
      </div>
    </section>`;
  }
  function methods(state, order) {
    return html`<section class="center-screen">
      <div class="center-intro">
        <div class="section-label">Your order is ready</div>
        <h1>How would you like to pay?</h1>
        <p class="muted">Choose a payment method to continue.</p>
      </div>
      <div class="methods">${paymentMethods.map(methodCard).join("")}</div>
      <div class="amount-box">
        <span>Order total</span><strong>${formatMoney(order.total)}</strong>
      </div>
      <div class="actions">
        ${button("← Back to Order Summary", "summary-back", "secondary")}
      </div>
    </section>`;
  }
  function methodCard(method, index) {
    const image = ["cash", "qr", "card"][index];
    const description = [
      "Pay with cash",
      "Scan with your payment app",
      "Tap, insert, or swipe",
    ][index];
    return html`<button
      type="button"
      class="method"
      data-action="method"
      data-method="${index}"
    >
      <span class="method-icon" aria-hidden="true"
        >${artworkImage("payments", image)}</span
      >
      <strong>${method}</strong>
      <small>${description}</small>
    </button>`;
  }
  function payment(state, order) {
    let body = "";
    if (state.method === "Cash") {
      body = html`<form id="cash-form" novalidate>
        <label class="input-label" for="cash">Amount Paid</label
        ><input
          class="cash-input"
          id="cash"
          name="amountPaid"
          type="number"
          inputmode="decimal"
          min="0"
          step="0.01"
          autocomplete="off"
          placeholder="0.00"
          value="${escapeHtml(state.cash)}"
          aria-describedby="cash-help cash-error"
          aria-invalid="${!!state.error}"
        />
        <p id="cash-help" class="cash-help">
          Enter the cash received in pesos.
        </p>
        <div class="change-preview">
          <span>Change</span
          ><strong id="change-preview"
            >${previewChange(state.cash, order.total)}</strong
          >
        </div>
        <div
          id="cash-error"
          class="error"
          role="alert"
          ${state.error ? "" : "hidden"}
        >
          ${escapeHtml(state.error)}
        </div>
        <button class="btn primary wide" type="submit">Pay Now →</button>
      </form>`;
    }
    if (state.method === "QR Payment") {
      body = html`<img
          class="qr-image"
          src="assets/payments/qr-placeholder.svg"
          alt="QR code placeholder for simulated payment"
        />
        <p class="payment-instruction">
          Scan the QR code using your supported payment application.
        </p>
        <p class="demo-note">
          Demo QR placeholder · No funds are transferred.<br />Tap below to
          confirm a simulated payment.
        </p>
        ${button("Confirm Payment →", "confirm", "primary wide")}`;
    }
    if (state.method === "Credit/Debit Card") {
      body = html`<div class="card-terminal" aria-hidden="true">
          ${artworkImage("payments", "card")}
        </div>
        <p class="payment-instruction">
          Please tap, insert, or swipe your card.
        </p>
        <p class="demo-note">
          Simulated card payment · No funds are transferred.
        </p>
        <div
          id="processing"
          class="processing"
          role="status"
          aria-live="polite"
          ${state.busy ? "" : "hidden"}
        >
          <span class="spinner" aria-hidden="true"></span>Processing payment...
        </div>
        ${button("Process Payment →", "process", "primary wide", state.busy ? "disabled" : "")}`;
    }
    return html`<section class="center-screen">
      <div class="center-intro">
        <div class="section-label">One last step</div>
        <h1>
          ${state.method === "Cash" ? "Pay with cash" : state.method === "QR Payment" ? "Scan to pay" : "Pay with your card"}
        </h1>
        <p class="muted">${state.method}</p>
      </div>
      <div class="panel payment-panel">${due(order)}${body}</div>
      <div class="actions payment-panel">
        ${button("← Change Payment Method", "change-method", "secondary wide", state.busy ? "disabled" : "")}
      </div>
    </section>`;
  }
  function success(state, order) {
    const receiptData = state.receipt;
    return html`<section class="center-screen success-screen">
      <div class="center-intro">
        <div class="success-mark" aria-hidden="true">✓</div>
        <div class="section-label success-text">All taken care of</div>
        <h1>Payment successful!</h1>
        <p class="muted">Thank you. Your campus pick-me-up is on its way.</p>
      </div>
      <div class="panel">${details(receiptData)}</div>
      <div class="actions">
        ${button("View Receipt →", "receipt", "primary wide")}
      </div>
    </section>`;
  }
  function receipt(state, order) {
    const receiptData = state.receipt;
    return html`<section class="center-screen">
      <div class="center-intro">
        <div class="section-label">Thanks for stopping by</div>
        <h1>Your digital receipt</h1>
        <p class="muted">A little record of a good campus day.</p>
      </div>
      <article class="panel receipt" aria-label="Digital receipt">
        <div class="receipt-top">
          <h2>campus corner.</h2>
          <p class="muted">Campus Food & Merchandise Outlet</p>
          <p class="receipt-meta">
            Transaction No.<br /><strong class="reference"
              >${receiptData.number}</strong
            ><br /><br />Date:
            ${escapeHtml(new Date(receiptData.date).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }))}
          </p>
        </div>
        <div class="section-label">Purchased items</div>
        <div class="receipt-items">${summaryRows(receiptData.items)}</div>
        <div class="cart-total">
          <span>Total</span><strong>${formatMoney(receiptData.total)}</strong>
        </div>
        <dl class="details">
          <div class="detail">
            <dt>Payment method</dt>
            <dd>${escapeHtml(receiptData.method)}</dd>
          </div>
          <div class="detail">
            <dt>Amount paid</dt>
            <dd>${formatMoney(receiptData.paid)}</dd>
          </div>
          <div class="detail">
            <dt>Change</dt>
            <dd>${formatMoney(receiptData.change)}</dd>
          </div>
          <div class="detail">
            <dt>Status</dt>
            <dd class="success-text">Payment Successful</dd>
          </div>
        </dl>
        <p class="receipt-thanks">
          Thanks for supporting your campus store.<br />See you on your next
          break!
        </p>
      </article>
      <div class="actions receipt-actions">
        ${button("New Transaction →", "reset", "primary wide")}
      </div>
    </section>`;
  }

  function previewChange(cash, amount) {
    const paid = parseCash(cash);
    return paid !== null && paid >= amount ? formatMoney(paid - amount) : "—";
  }

  function renderScreen(state) {
    const order = getOrder(state.cart);
    return [selection, summary, methods, payment, success, receipt][
      state.screen - 1
    ](state, order);
  }
  function renderProgress(screen) {
    const group = screen <= 2 ? screen : screen <= 4 ? 3 : 4;
    return ["Select items", "Review order", "Payment", "Receipt"]
      .map((label, index) => {
        const step = index + 1;
        const status =
          step === group ? "active" : step < group ? "complete" : "";
        return html`<li
          class="${status}"
          ${step === group ? 'aria-current="step"' : ""}
        >
          <span class="step-number">${step < group ? "✓" : step}</span>${label}
        </li>`;
      })
      .join("");
  }
  Object.assign(window.Kiosk, { renderScreen, renderProgress, previewChange });
})();
