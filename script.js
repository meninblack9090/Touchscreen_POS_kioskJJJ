(() => {
  'use strict';
  const artwork = {
    coffee:
      '<img src="assets/products/coffee.svg" alt="" width="160" height="144" draggable="false">',
    sandwich:
      '<img src="assets/products/sandwich.svg" alt="" width="160" height="144" draggable="false">',
    soda: '<img src="assets/products/soda.svg" alt="" width="160" height="144" draggable="false">',
    cookies:
      '<img src="assets/products/cookies.svg" alt="" width="160" height="144" draggable="false">',
    water:
      '<img src="assets/products/water.svg" alt="" width="160" height="144" draggable="false">',
    chocolate:
      '<img src="assets/products/chocolate.svg" alt="" width="160" height="144" draggable="false">',
    notebook:
      '<img src="assets/products/notebook.svg" alt="" width="160" height="144" draggable="false">',
    pen: '<img src="assets/products/pen.svg" alt="" width="160" height="144" draggable="false">',
    bag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10h20l-2 18H8L6 10Zm6 2V7a4 4 0 0 1 8 0v5"/></svg>',
    cash: '<img src="assets/payments/cash.svg" alt="" width="160" height="144" draggable="false">',
    qr: '<img src="assets/payments/qr.svg" alt="" width="160" height="144" draggable="false">',
    card: '<img src="assets/payments/card.svg" alt="" width="160" height="144" draggable="false">',
    cassette:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="26" height="20" rx="3"/><rect x="7" y="10" width="18" height="9" rx="3"/><circle cx="11" cy="14.5" r="2"/><circle cx="21" cy="14.5" r="2"/><path d="m9 26 2-5h10l2 5"/></svg>',
  };
  // Prices and all calculations are integer centavos, never floating-point pesos.
  const products = Object.freeze([
    {
      id: 'coffee',
      name: 'Coffee',
      price: 4500,
      color: '#eee5d7',
      description: 'Your daily pick-me-up',
      category: 'Drink',
    },
    {
      id: 'sandwich',
      name: 'Sandwich',
      price: 5000,
      color: '#edf0dc',
      description: 'A little lunch-time fuel',
      category: 'Food',
    },
    {
      id: 'soda',
      name: 'Soft Drink',
      price: 3500,
      color: '#f6e1d8',
      description: 'Chilled & refreshing',
      category: 'Drink',
    },
    {
      id: 'cookies',
      name: 'Cookies',
      price: 2500,
      color: '#f3e7d3',
      description: 'A sweet study companion',
      category: 'Food',
    },
    {
      id: 'water',
      name: 'Bottled Water',
      price: 2000,
      color: '#e0ecec',
      description: 'Stay hydrated, stay focused',
      category: 'Drink',
    },
    {
      id: 'chocolate',
      name: 'Chocolate',
      price: 2500,
      color: '#ebe0db',
      description: 'For your well-earned break',
      category: 'Food',
    },
    {
      id: 'notebook',
      name: 'Campus Notebook',
      price: 6500,
      color: '#e4e8f0',
      description: 'Big ideas start here',
      category: 'Merchandise',
    },
    {
      id: 'pen',
      name: 'Ballpoint Pen',
      price: 1500,
      color: '#eee6ed',
      description: 'Ready for the next lecture',
      category: 'Merchandise',
    },
  ]);
  const METHODS = ['Cash', 'QR Payment', 'Credit/Debit Card'];
  const fresh = () => ({
    screen: 1,
    cart: new Map(),
    method: null,
    cash: '',
    receipt: null,
    busy: false,
    error: '',
    timer: null,
  });
  let state = fresh(),
    toastTimer;
  const app = document.getElementById('app');
  const money = (cents) =>
    '₱' +
    (cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const items = () =>
    products
      .filter((p) => state.cart.has(p.id))
      .map((p) => ({ ...p, qty: state.cart.get(p.id), subtotal: p.price * state.cart.get(p.id) }));
  const total = () => items().reduce((sum, p) => sum + p.subtotal, 0);
  const count = () => items().reduce((sum, p) => sum + p.qty, 0);
  const button = (label, action, kind = 'primary', extra = '') =>
    `<button type="button" class="btn ${kind}" data-action="${action}" ${extra}>${label}</button>`;
  const due = () =>
    `<div class="amount-box"><span>Total due</span><strong>${money(total())}</strong></div>`;
  function notify(message) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toast.textContent = '';
    }, 2400);
  }
  function summaryRows(list) {
    return list
      .map(
        (p) =>
          `<div class="summary-row"><div><div class="summary-name">${escape(p.name)}</div><div class="summary-detail">${p.qty} × ${money(p.price)} = ${money(p.subtotal)}</div></div><div class="summary-subtotal">${money(p.subtotal)}</div></div>`,
      )
      .join('');
  }
  function details(r, includeChange = false) {
    return `<dl class="details"><div class="detail"><dt>Transaction amount</dt><dd>${money(r.total)}</dd></div><div class="detail"><dt>Amount paid</dt><dd>${money(r.paid)}</dd></div><div class="detail"><dt>Payment method</dt><dd>${escape(r.method)}</dd></div>${includeChange ? `<div class="detail"><dt>Change</dt><dd>${money(r.change)}</dd></div>` : ''}<div class="detail"><dt>Transaction number</dt><dd class="reference">${r.number}</dd></div></dl>`;
  }
  function selection() {
    return `<div class="selection-layout"><section><div class="intro"><div class="terminal-strip"><span>Your campus pit stop</span><span><i aria-hidden="true"></i>Ready when you are</span></div><div class="section-label">A good day starts here</div><h1>What can we get you?</h1><p class="muted">Tap an item to add it to your order.</p></div><div class="products">${products.map((p) => `<button type="button" class="product" data-action="add" data-id="${p.id}" aria-label="Add ${p.name}, ${money(p.price)}"><span class="product-art" aria-hidden="true">${artwork[p.id]}</span><span class="product-name">${p.name}</span><span class="product-desc">${p.description}</span><span class="product-bottom"><span>${money(p.price)}</span><span class="add-icon" aria-hidden="true">+</span></span></button>`).join('')}</div><p class="catalog-note"><span aria-hidden="true"></p></section><aside class="panel" aria-label="Current order"><div class="cart-heading"><h2>Your order</h2><span class="pill" id="item-count">${count()} ${count() === 1 ? 'item' : 'items'}</span></div><div id="cart-items">${
      items().length
        ? items()
            .map(
              (p) =>
                `<div class="cart-row" data-cart-id="${p.id}"><div class="row-heading"><div><strong>${p.name}</strong><div class="unit">${money(p.price)} each</div></div><strong>${money(p.subtotal)}</strong></div><div class="row-controls"><div class="quantity"><button type="button" data-action="minus" data-id="${p.id}" aria-label="Decrease ${p.name} quantity">−</button><span aria-label="${p.name} quantity">${p.qty}</span><button type="button" data-action="add" data-id="${p.id}" aria-label="Increase ${p.name} quantity">+</button></div><button type="button" class="remove" data-action="remove" data-id="${p.id}" aria-label="Remove ${p.name}">Remove</button></div></div>`,
            )
            .join('')
        : `<div class="empty"><div class="empty-symbol" aria-hidden="true">${artwork.bag}</div><strong>A little empty in here.</strong><p>Tap something tasty to get started.</p></div>`
    }</div><div class="cart-total"><span>Total amount</span><strong id="cart-total">${money(total())}</strong></div>${button('Proceed to Order Summary <span aria-hidden="true">→</span>', 'summary', 'primary wide', !count() ? 'disabled' : '')}<p class="cart-caption">Review your order before you pay.</p><div class="hardware-label"><span>Made for your campus day</span><span>Happy shopping</span></div></aside></div>`;
  }
  function summary() {
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">Check the good stuff</div><h1>Your order summary</h1><p class="muted">Everything look right? Let’s make it yours.</p></div><div class="panel">${summaryRows(items())}<div class="amount-box"><span>Total amount · ${count()} items</span><strong>${money(total())}</strong></div></div><div class="actions">${button('← Back', 'selection', 'secondary')}${button('Continue to Payment →', 'methods')}</div></section>`;
  }
  function methods() {
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">Your order is ready</div><h1>How would you like to pay?</h1><p class="muted">Choose a payment method to continue.</p></div><div class="methods">${METHODS.map((m, i) => `<button type="button" class="method" data-action="method" data-method="${i}"><span class="method-icon" aria-hidden="true">${[artwork.cash, artwork.qr, artwork.card][i]}</span><strong>${m}</strong><small>${['Pay with cash', 'Scan with your payment app', 'Tap, insert, or swipe'][i]}</small></button>`).join('')}</div><div class="amount-box"><span>Order total</span><strong>${money(total())}</strong></div><div class="actions">${button('← Back to Order Summary', 'summary-back', 'secondary')}</div></section>`;
  }
  // An embedded image, deliberately labeled as a placeholder; no real payment payload.
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><rect width="150" height="150" fill="white"/><g fill="#292b25"><path d="M5 5h40v40H5zm100 0h40v40h-40zM5 105h40v40H5z"/><path d="M55 5h10v20H55zm20 0h20v10H75zM55 35h30v10H55zm35-10h10v30H90zM5 55h20v10H5zm30 0h30v20H35zm40 0h10v30H75zm30 0h30v10h-30zm30 20h10v20h-10zM5 75h10v20H5zm20 10h40v10H25zm30 20h20v10H55zm30-10h20v30H85zm30-20h10v40h-10zm20 30h10v20h-10zM55 125h10v20H55zm20 10h20v10H75zm30-10h20v20h-20zm30 10h10v10h-10z"/></g><g fill="white"><path d="M12 12h26v26H12zm100 0h26v26h-26zM12 112h26v26H12z"/></g><g fill="#292b25"><path d="M19 19h12v12H19zm100 0h12v12h-12zM19 119h12v12H19z"/></g></svg>`;
  function payment() {
    let body = '';
    if (state.method === 'Cash') {
      body = `<form id="cash-form" novalidate><label class="input-label" for="cash">Amount Paid</label><input class="cash-input" id="cash" name="amountPaid" type="number" inputmode="decimal" min="0" step="0.01" autocomplete="off" placeholder="0.00" value="${escape(state.cash)}" aria-describedby="cash-help cash-error" aria-invalid="${!!state.error}"><p id="cash-help" class="cash-help">Enter the cash received in pesos.</p><div class="change-preview"><span>Change</span><strong id="change-preview">${previewChange()}</strong></div><div id="cash-error" class="error" role="alert" ${state.error ? '' : 'hidden'}>${escape(state.error)}</div><button class="btn primary wide" type="submit">Pay Now →</button></form>`;
    }
    if (state.method === 'QR Payment') {
      body = `<img class="qr-image" src="data:image/svg+xml,${encodeURIComponent(qrSvg)}" alt="QR code placeholder for simulated payment"><p class="payment-instruction">Scan the QR code using your supported payment application.</p><p class="demo-note">Demo QR placeholder · No funds are transferred.<br>Tap below to confirm a simulated payment.</p>${button('Confirm Payment →', 'confirm', 'primary wide')}`;
    }
    if (state.method === 'Credit/Debit Card') {
      body = `<div class="card-terminal" aria-hidden="true">${artwork.card}</div><p class="payment-instruction">Please tap, insert, or swipe your card.</p><p class="demo-note">Simulated card payment · No funds are transferred.</p><div id="processing" class="processing" role="status" aria-live="polite" ${state.busy ? '' : 'hidden'}><span class="spinner" aria-hidden="true"></span>Processing payment...</div>${button('Process Payment →', 'process', 'primary wide', state.busy ? 'disabled' : '')}`;
    }
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">One last step</div><h1>${state.method === 'Cash' ? 'Pay with cash' : state.method === 'QR Payment' ? 'Scan to pay' : 'Pay with your card'}</h1><p class="muted">${state.method}</p></div><div class="panel payment-panel">${due()}${body}</div><div class="actions payment-panel">${button('← Change Payment Method', 'change-method', 'secondary wide', state.busy ? 'disabled' : '')}</div></section>`;
  }
  function success() {
    const r = state.receipt;
    return `<section class="center-screen success-screen"><div class="center-intro"><div class="success-mark" aria-hidden="true">✓</div><div class="section-label success-text">All taken care of</div><h1>Payment successful!</h1><p class="muted">Thank you. Your campus pick-me-up is on its way.</p></div><div class="panel">${details(r)}</div><div class="actions">${button('View Receipt →', 'receipt', 'primary wide')}</div></section>`;
  }
  function receipt() {
    const r = state.receipt;
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">Thanks for stopping by</div><h1>Your digital receipt</h1><p class="muted">A little record of a good campus day.</p></div><article class="panel receipt" aria-label="Digital receipt"><div class="receipt-top"><h2>campus corner.</h2><p class="muted">Campus Food & Merchandise Outlet</p><p class="receipt-meta">Transaction No.<br><strong class="reference">${r.number}</strong><br><br>Date: ${escape(new Date(r.date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))}</p></div><div class="section-label">Purchased items</div><div class="receipt-items">${summaryRows(r.items)}</div><div class="cart-total"><span>Total</span><strong>${money(r.total)}</strong></div><dl class="details"><div class="detail"><dt>Payment method</dt><dd>${escape(r.method)}</dd></div><div class="detail"><dt>Amount paid</dt><dd>${money(r.paid)}</dd></div><div class="detail"><dt>Change</dt><dd>${money(r.change)}</dd></div><div class="detail"><dt>Status</dt><dd class="success-text">Payment Successful</dd></div></dl><p class="receipt-thanks">Thanks for supporting your campus store.<br>See you on your next break!</p></article><div class="actions receipt-actions">${button('New Transaction →', 'reset', 'primary wide')}</div></section>`;
  }
  function render(focusHeading = true) {
    if (focusHeading) {
      clearTimeout(toastTimer);
      const toast = document.getElementById('toast');
      toast.hidden = true;
      toast.textContent = '';
    }
    const group = state.screen <= 2 ? state.screen : state.screen <= 4 ? 3 : 4;
    document.getElementById('progress').innerHTML = [
      'Select items',
      'Review order',
      'Payment',
      'Receipt',
    ]
      .map(
        (label, i) =>
          `<li class="${i + 1 === group ? 'active' : i + 1 < group ? 'complete' : ''}" ${i + 1 === group ? 'aria-current="step"' : ''}><span class="step-number">${i + 1 < group ? '✓' : i + 1}</span>${label}</li>`,
      )
      .join('');
    app.innerHTML = [selection, summary, methods, payment, success, receipt][state.screen - 1]();
    if (focusHeading) {
      const heading = app.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  // Strict parsing accepts monetary values only, with at most two decimal places.
  function parseCash(raw) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
    const [whole, fraction = ''] = raw.trim().split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents <= 99999999900 ? cents : null;
  }
  function previewChange() {
    const paid = parseCash(state.cash);
    return paid !== null && paid >= total() ? money(paid - total()) : '—';
  }
  // Cryptographic randomness plus timestamp protects references across tabs/reloads.
  function transactionNumber() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const random = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const now = new Date();
    return `TXN-${now.getFullYear()}-${now.getTime().toString(36).toUpperCase()}-${random}`;
  }
  function finish(paid) {
    if (state.screen !== 4 || state.receipt || !METHODS.includes(state.method) || !count()) return;
    const amount = total();
    if (!Number.isSafeInteger(paid) || paid < amount || paid < 0) return;
    if (state.method !== 'Cash' && paid !== amount) return;
    const receiptItems = Object.freeze(items().map((p) => Object.freeze({ ...p })));
    state.receipt = Object.freeze({
      number: transactionNumber(),
      date: new Date().toISOString(),
      items: receiptItems,
      total: amount,
      paid,
      change: paid - amount,
      method: state.method,
    });
    state.busy = false;
    state.timer = null;
    state.error = '';
    state.screen = 5;
    render();
  }
  function navigate(screen) {
    state.screen = screen;
    state.error = '';
    render();
  }
  app.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled || state.busy) return;
    const action = target.dataset.action,
      id = target.dataset.id;
    if (['add', 'minus', 'remove'].includes(action) && state.screen === 1) {
      const product = products.find((p) => p.id === id);
      if (!product) return;
      const qty = state.cart.get(id) || 0;
      if (action === 'add') {
        if (qty >= 999) {
          notify('Invalid quantity. Maximum 999 per item.');
          return;
        }
        state.cart.set(id, qty + 1);
        notify(`${product.name} added to your order.`);
      } else if (action === 'minus') {
        if (qty <= 1) {
          state.cart.delete(id);
          notify(`${product.name} removed from your order.`);
        } else state.cart.set(id, qty - 1);
      } else {
        state.cart.delete(id);
        notify(`${product.name} removed from your order.`);
      }
      render(false);
      // Preserve keyboard focus where possible after the cart updates.
      app
        .querySelector(`button[data-action="${action}"][data-id="${id}"]`)
        ?.focus({ preventScroll: true });
    } else if (action === 'summary' && state.screen === 1 && count()) navigate(2);
    else if (action === 'selection' && state.screen === 2) navigate(1);
    else if (action === 'methods' && state.screen === 2 && count()) navigate(3);
    else if (action === 'summary-back' && state.screen === 3) navigate(2);
    else if (action === 'method' && state.screen === 3 && count()) {
      const method = METHODS[Number(target.dataset.method)];
      if (!method) return;
      state.method = method;
      state.cash = '';
      navigate(4);
    } else if (action === 'change-method' && state.screen === 4) {
      state.method = null;
      state.cash = '';
      navigate(3);
    } else if (action === 'confirm' && state.screen === 4 && state.method === 'QR Payment')
      finish(total());
    else if (action === 'process' && state.screen === 4 && state.method === 'Credit/Debit Card') {
      state.busy = true;
      render(false);
      state.timer = setTimeout(() => {
        if (state.screen === 4 && state.busy && state.method === 'Credit/Debit Card')
          finish(total());
      }, 1400);
    } else if (action === 'receipt' && state.screen === 5 && state.receipt) navigate(6);
    else if (action === 'reset' && state.screen === 6) {
      clearTimeout(state.timer);
      clearTimeout(toastTimer);
      state = fresh();
      const toast = document.getElementById('toast');
      toast.hidden = true;
      toast.textContent = '';
      render();
    }
  });
  app.addEventListener('input', (event) => {
    if (event.target.id !== 'cash' || state.screen !== 4 || state.method !== 'Cash') return;
    state.cash = event.target.value;
    state.error = '';
    event.target.setAttribute('aria-invalid', 'false');
    const error = document.getElementById('cash-error');
    error.hidden = true;
    error.textContent = '';
    document.getElementById('change-preview').textContent = previewChange();
  });
  app.addEventListener('submit', (event) => {
    if (event.target.id !== 'cash-form') return;
    event.preventDefault();
    if (state.screen !== 4 || state.method !== 'Cash' || state.busy || !count()) return;
    const input = document.getElementById('cash'),
      raw = input.value;
    state.cash = raw;
    const paid = parseCash(raw);
    state.error = input.validity.badInput
      ? 'Invalid payment. Enter a valid amount.'
      : !raw.trim()
        ? 'Enter the amount paid.'
        : paid === null
          ? 'Invalid payment. Enter a non-negative amount with up to 2 decimal places.'
          : paid < total()
            ? `Insufficient payment. Please enter at least ${money(total())}.`
            : '';
    if (state.error) {
      const error = document.getElementById('cash-error');
      error.textContent = state.error;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    finish(paid);
  });
  render(false);
})();
