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
  // Supabase is the source of catalog prices; all money is integer centavos.
  let products = [], catalogLoading = true, catalogError = '';
  const ATTEMPT_KEY = 'triple-j-kiosk-checkout';
  const METHODS = ['Cash', 'QR Payment', 'Credit/Debit Card'];
  const fresh = () => ({
    screen: 1,
    cart: new Map(),
    method: null,
    cash: '',
    receipt: null,
    feedback: { rating: '', comment: '', submitted: false, skipped: false, saving: false, attempt: null },
    busy: false,
    error: '',
    timer: null,
    confirmed: null,
    attempt: null,
    uncertain: false,
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
    state.screen >= 3 && state.confirmed ? state.confirmed.items : products
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
    return `<dl class="details"><div class="detail"><dt>Transaction amount</dt><dd>${money(r.total)}</dd></div><div class="detail"><dt>Amount paid</dt><dd>${money(r.paid)}</dd></div><div class="detail"><dt>Payment method</dt><dd>${escape(r.method)}</dd></div>${includeChange ? `<div class="detail"><dt>Change</dt><dd>${money(r.change)}</dd></div>` : ''}<div class="detail"><dt>Transaction number</dt><dd class="reference">${escape(r.number)}</dd></div></dl>`;
  }
  function selection() {
    return `<div class="selection-layout"><section><div class="intro"><div class="terminal-strip"><span>Your campus pit stop</span><span><i aria-hidden="true"></i>Ready when you are</span></div><div class="section-label">A good day starts here</div><h1>What can we get you?</h1><p class="muted">Tap an item to add it to your order.</p></div><div class="products">${products.map((p) => `<button type="button" class="product" data-action="add" data-id="${p.id}" aria-label="Add ${escape(p.name)}, ${money(p.price)}"><span class="product-art" aria-hidden="true">${artwork[p.id] || artwork.bag}</span><span class="product-name">${escape(p.name)}</span><span class="product-desc">${escape(p.description)}</span><span class="product-bottom"><span>${money(p.price)}</span><span class="add-icon" aria-hidden="true">+</span></span></button>`).join('')}</div><p class="catalog-note"><span aria-hidden="true"></p></section><aside class="panel" aria-label="Current order"><div class="cart-heading"><h2>Your order</h2><span class="pill" id="item-count">${count()} ${count() === 1 ? 'item' : 'items'}</span></div><div id="cart-items">${
      items().length
        ? items()
            .map(
              (p) =>
                `<div class="cart-row" data-cart-id="${p.id}"><div class="row-heading"><div><strong>${escape(p.name)}</strong><div class="unit">${money(p.price)} each</div></div><strong>${money(p.subtotal)}</strong></div><div class="row-controls"><div class="quantity"><button type="button" data-action="minus" data-id="${p.id}" aria-label="Decrease ${escape(p.name)} quantity">−</button><span aria-label="${escape(p.name)} quantity">${p.qty}</span><button type="button" data-action="add" data-id="${p.id}" aria-label="Increase ${escape(p.name)} quantity">+</button></div><button type="button" class="remove" data-action="remove" data-id="${p.id}" aria-label="Remove ${escape(p.name)}">Remove</button></div></div>`,
            )
            .join('')
        : `<div class="empty"><div class="empty-symbol" aria-hidden="true">${artwork.bag}</div><strong>A little empty in here.</strong><p>Tap something tasty to get started.</p></div>`
    }</div><div class="cart-total"><span>Total amount</span><strong id="cart-total">${money(total())}</strong></div>${button('Proceed to Order Summary <span aria-hidden="true">→</span>', 'summary', 'primary wide', !count() ? 'disabled' : '')}<p class="cart-caption">Review your order before you pay.</p><div class="hardware-label"><span>Made for your campus day</span><span>Happy shopping</span></div></aside></div>`;
  }
  function summary() {
    return `<section class="center-screen">${state.error ? '<div class="error" role="alert">' + escape(state.error) + '</div>' : ''}<div class="center-intro"><div class="section-label">Check the good stuff</div><h1>Your order summary</h1><p class="muted">Everything look right? Let’s make it yours.</p></div><div class="panel">${summaryRows(items())}<div class="amount-box"><span>Total amount · ${count()} items</span><strong>${money(total())}</strong></div></div><div class="actions">${button('← Back', 'selection', 'secondary')}${button('Continue to Payment →', 'methods')}</div></section>`;
  }
  function methods() {
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">Your order is ready</div><h1>How would you like to pay?</h1><p class="muted">Choose a payment method to continue.</p></div><div class="methods">${METHODS.map((m, i) => `<button type="button" class="method" data-action="method" data-method="${i}"><span class="method-icon" aria-hidden="true">${[artwork.cash, artwork.qr, artwork.card][i]}</span><strong>${m}</strong><small>${['Pay with cash', 'Scan with your payment app', 'Tap, insert, or swipe'][i]}</small></button>`).join('')}</div><div class="amount-box"><span>Order total</span><strong>${money(total())}</strong></div><div class="actions">${button('← Back to Order Summary', 'summary-back', 'secondary')}</div></section>`;
  }
  // An embedded image, deliberately labeled as a placeholder; no real payment payload.
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><rect width="150" height="150" fill="white"/><g fill="#292b25"><path d="M5 5h40v40H5zm100 0h40v40h-40zM5 105h40v40H5z"/><path d="M55 5h10v20H55zm20 0h20v10H75zM55 35h30v10H55zm35-10h10v30H90zM5 55h20v10H5zm30 0h30v20H35zm40 0h10v30H75zm30 0h30v10h-30zm30 20h10v20h-10zM5 75h10v20H5zm20 10h40v10H25zm30 20h20v10H55zm30-10h20v30H85zm30-20h10v40h-10zm20 30h10v20h-10zM55 125h10v20H55zm20 10h20v10H75zm30-10h20v20h-20zm30 10h10v10h-10z"/></g><g fill="white"><path d="M12 12h26v26H12zm100 0h26v26h-26zM12 112h26v26H12z"/></g><g fill="#292b25"><path d="M19 19h12v12H19zm100 0h12v12h-12zM19 119h12v12H19z"/></g></svg>`;
  function payment() {
    let body = '';
    if (state.method === 'Cash') {
      body = `<form id="cash-form" novalidate><label class="input-label" for="cash">Amount Paid</label><input class="cash-input" id="cash" name="amountPaid" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${escape(state.cash)}" ${state.busy || state.uncertain ? 'disabled' : ''} aria-describedby="cash-help cash-error" aria-invalid="${!!state.error}"><p id="cash-help" class="cash-help">Enter the cash received in pesos.</p><div class="change-preview"><span>Change</span><strong id="change-preview">${previewChange()}</strong></div><div id="cash-error" class="error" role="alert" ${state.error ? '' : 'hidden'}>${escape(state.error)}</div><button class="btn primary wide" type="submit" ${state.busy || state.uncertain ? 'disabled' : ''}>${state.busy ? 'Saving payment...' : 'Pay Now →'}</button></form>`;
    }
    if (state.method === 'QR Payment') {
      body = `<img class="qr-image" src="data:image/svg+xml,${encodeURIComponent(qrSvg)}" alt="QR code placeholder for simulated payment"><p class="payment-instruction">Scan the QR code using your supported payment application.</p><p class="demo-note">Demo QR placeholder · No funds are transferred.<br>Tap below to confirm a simulated payment.</p>${button(state.busy ? 'Saving payment...' : 'Confirm Payment →', 'confirm', 'primary wide', state.busy || state.uncertain ? 'disabled' : '')}`;
    }
    if (state.method === 'Credit/Debit Card') {
      body = `<div class="card-terminal" aria-hidden="true">${artwork.card}</div><p class="payment-instruction">Please tap, insert, or swipe your card.</p><p class="demo-note">Simulated card payment · No funds are transferred.</p><div id="processing" class="processing" role="status" aria-live="polite" ${state.busy ? '' : 'hidden'}><span class="spinner" aria-hidden="true"></span>Processing payment...</div>${button('Process Payment →', 'process', 'primary wide', state.busy || state.uncertain ? 'disabled' : '')}`;
    }
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">One last step</div><h1>${state.method === 'Cash' ? 'Pay with cash' : state.method === 'QR Payment' ? 'Scan to pay' : 'Pay with your card'}</h1><p class="muted">${state.method}</p></div><div class="panel payment-panel">${due()}${body}${state.method !== 'Cash' && state.error ? '<div class="error" role="alert">' + escape(state.error) + '</div>' : ''}${state.uncertain ? button('Retry Payment →', 'retry-payment', 'primary wide', state.busy ? 'disabled' : '') : ''}</div><div class="actions payment-panel">${button('← Change Payment Method', 'change-method', 'secondary wide', state.busy || state.uncertain ? 'disabled' : '')}</div></section>`;
  }
  function success() {
    const r = state.receipt;
    return `<section class="center-screen success-screen"><div class="center-intro"><div class="success-mark" aria-hidden="true">✓</div><div class="section-label success-text">All taken care of</div><h1>Payment successful!</h1><p class="muted">Thank you. Your campus pick-me-up is on its way.</p></div><div class="panel">${details(r)}</div><div class="actions">${button('View Receipt →', 'receipt', 'primary wide')}</div></section>`;
  }
  function receipt() {
    const r = state.receipt;
    return `<section class="center-screen"><div class="center-intro"><div class="section-label">Thanks for stopping by</div><h1>Your digital receipt</h1><p class="muted">A little record of a good campus day.</p></div><article class="panel receipt" aria-label="Digital receipt"><div class="receipt-top"><h2>campus corner.</h2><p class="muted">Campus Food & Merchandise Outlet</p><p class="receipt-meta">Transaction No.<br><strong class="reference">${escape(r.number)}</strong><br><br>Date: ${escape(new Date(r.date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))}</p></div><div class="section-label">Purchased items</div><div class="receipt-items">${summaryRows(r.items)}</div><div class="cart-total"><span>Total</span><strong>${money(r.total)}</strong></div><dl class="details"><div class="detail"><dt>Payment method</dt><dd>${escape(r.method)}</dd></div><div class="detail"><dt>Amount paid</dt><dd>${money(r.paid)}</dd></div><div class="detail"><dt>Change</dt><dd>${money(r.change)}</dd></div><div class="detail"><dt>Status</dt><dd class="success-text">Payment Successful</dd></div></dl><p class="receipt-thanks">Thanks for supporting your campus store.<br>See you on your next break!</p></article><div class="actions receipt-actions">${button('Leave Feedback →', 'feedback', 'primary wide')}${button('New Transaction →', 'reset', 'secondary wide')}</div></section>`;
  }
  function feedback() {
    const f = state.feedback;
    if (f.submitted || f.skipped) {
      return `<section class="center-screen feedback-screen"><div class="center-intro"><div class="success-mark" aria-hidden="true">✓</div><div class="section-label">See you next time</div><h1>${f.submitted ? 'Thanks for your feedback!' : 'Thanks for stopping by!'}</h1><p class="muted">${f.submitted ? 'Your thoughts help make every campus visit a little better.' : 'Enjoy your order and have a great campus day.'}</p></div><div class="actions">${button('New Transaction →', 'reset', 'primary wide')}</div></section>`;
    }
    return `<section class="center-screen feedback-screen"><div class="center-intro"><div class="section-label">A little feedback goes a long way</div><h1>How was your visit?</h1><p class="muted">Tell us about your kiosk experience.</p></div><form id="feedback-form" class="panel" novalidate><fieldset class="feedback-rating" ${f.saving || f.attempt ? 'disabled' : ''}><legend>Rate your experience</legend><div class="rating-options">${['Poor', 'Fair', 'Good', 'Great', 'Excellent'].map((label, i) => `<label class="rating-option"><input type="radio" name="rating" value="${i + 1}" ${f.rating === String(i + 1) ? 'checked' : ''} aria-describedby="feedback-error"><span class="rating-tile"><span class="rating-star" aria-hidden="true">★</span><strong>${i + 1}</strong><small>${label}</small></span></label>`).join('')}</div></fieldset><label class="input-label" for="feedback-comment">Anything else to share? <span class="muted">(optional)</span></label><textarea id="feedback-comment" name="comment" class="feedback-comment" ${f.saving || f.attempt ? 'disabled' : ''} rows="4" maxlength="500" placeholder="What went well? What could be better?" aria-describedby="feedback-help">${escape(f.comment)}</textarea><p id="feedback-help" class="cash-help">Up to 500 characters. Please avoid sharing personal details.</p><div id="feedback-error" class="error" role="alert" ${state.error ? '' : 'hidden'}>${escape(state.error)}</div><button type="submit" class="btn primary wide" ${f.saving ? 'disabled' : ''}>${f.saving ? 'Saving feedback...' : f.attempt ? 'Retry Feedback →' : 'Submit Feedback →'}</button></form><div class="actions">${button('← Back to Receipt', 'feedback-receipt', 'secondary', f.saving ? 'disabled' : '')}${button('Skip Feedback →', 'skip-feedback', 'secondary', f.saving ? 'disabled' : '')}</div></section>`;
  }
  async function submitFeedback(form) {
    const f=state.feedback;
    if (state.screen !== 7 || !state.receipt || f.submitted || f.skipped || f.saving) return;
    if (!f.attempt) {
      const rating=Number(form.elements.rating.value);
      const rawComment=form.elements.comment.value;
      f.rating=form.elements.rating.value; f.comment=rawComment;
      let message='';
      if (!Number.isInteger(rating) || rating<1 || rating>5) message='Choose a rating from 1 to 5 before submitting.';
      else if (rawComment.length>500) message='Please keep your comment within 500 characters.';
      if (message) {
        state.error=message;
        const error=document.getElementById('feedback-error');
        error.textContent=message;error.hidden=false;error.tabIndex=-1;error.focus();return;
      }
      f.attempt=Object.freeze({transactionNumber:state.receipt.number,rating,comment:rawComment.trim()});
    }
    f.saving=true;state.error='';render(false);
    try {
      await KioskAPI.feedback(f.attempt);
      f.submitted=true; f.attempt=null;
    } catch (error) {
      state.error=error.code ? error.message : 'Unable to confirm feedback. Retry to recover your saved submission.';
      // Keep the original payload when the server may already have saved it.
      if (['INVALID_FEEDBACK','ORDER_NOT_FOUND'].includes(error.code)) f.attempt=null;
    } finally {f.saving=false;render(false);}
  }
  function render(focusHeading = true) {
    if (focusHeading) {
      clearTimeout(toastTimer);
      const toast = document.getElementById('toast');
      toast.hidden = true;
      toast.textContent = '';
    }
    const group = state.screen <= 2 ? state.screen : state.screen <= 4 ? 3 : state.screen <= 6 ? 4 : 5;
    document.getElementById('progress').innerHTML = [
      'Select items',
      'Review order',
      'Payment',
      'Receipt',
      'Feedback',
    ]
      .map(
        (label, i) =>
          `<li class="${i + 1 === group ? 'active' : i + 1 < group ? 'complete' : ''}" ${i + 1 === group ? 'aria-current="step"' : ''}><span class="step-number">${i + 1 < group ? '✓' : i + 1}</span>${label}</li>`,
      )
      .join('');
    app.innerHTML = (catalogLoading || catalogError) && !state.attempt && state.screen <= 2
      ? '<section class="center-screen"><div class="panel"><h1>' + (catalogLoading ? 'Loading products...' : 'Products unavailable') + '</h1><p role="status">' + escape(catalogError || 'Connecting to the campus store.') + '</p>' + (catalogError ? button('Retry Loading Products →', 'retry-catalog', 'primary wide') : '') + '</div></section>'
      : [selection, summary, methods, payment, success, receipt, feedback][state.screen - 1]();
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

  async function loadCatalog() {
    catalogLoading = true; catalogError = '';
    render(false);
    try {
      products = await KioskAPI.products();
      for (const id of state.cart.keys()) if (!products.some(p=>p.id===id)) state.cart.delete(id);
    } catch (error) { catalogError = error.message; }
    finally { catalogLoading = false; render(false); }
  }
  function clearAttempt() {
    state.attempt = null; state.uncertain = false;
    try { sessionStorage.removeItem(ATTEMPT_KEY); } catch {}
  }
  function persistAttempt() {
    try {
      const saved=JSON.stringify({payload:state.attempt,confirmed:state.confirmed});
      sessionStorage.setItem(ATTEMPT_KEY,saved);
      return sessionStorage.getItem(ATTEMPT_KEY) === saved;
    } catch { return false; }
  }
  function restoreAttempt() {
    try {
      const saved=JSON.parse(sessionStorage.getItem(ATTEMPT_KEY));
      if (!saved) return;
      if (!saved.payload || !saved.confirmed || !METHODS.includes(saved.payload.method) ||
          !Array.isArray(saved.confirmed.items) || !saved.confirmed.items.length ||
          !Number.isSafeInteger(saved.confirmed.total) || saved.confirmed.total<=0 ||
          saved.confirmed.total!==saved.payload.expectedTotal ||
          !/^[0-9a-f-]{36}$/i.test(saved.payload.requestId)) throw Error('Invalid stored checkout');
      state.attempt=saved.payload; state.confirmed=saved.confirmed;
      state.cart=new Map(saved.payload.items.map(i=>[i.id,i.qty]));
      state.method=saved.payload.method; state.cash=saved.payload.cash || '';
      state.screen=4; state.uncertain=true;
      state.error='A payment confirmation is pending. Retry this payment to recover its receipt.';
    } catch { clearAttempt(); }
  }
  async function finish() {
    if (state.screen !== 4 || state.receipt || !METHODS.includes(state.method) || !state.confirmed) return;
    state.busy=true; state.error=''; state.timer=null;
    if (!state.attempt) {
      state.attempt=Object.freeze({
        requestId:crypto.randomUUID(),
        items:state.confirmed.items.map(p=>({id:p.id,qty:p.qty})),
        method:state.method, cash:state.method==='Cash'?state.cash:null,
        expectedTotal:state.confirmed.total
      });
      if (!persistAttempt()) {
        clearAttempt(); state.busy=false;
        state.error='This browser cannot save payment recovery information. Enable browser storage and try again.';
        render(false); return;
      }
    }
    render(false);
    try {
      const saved=await KioskAPI.checkout(state.attempt);
      state.receipt=Object.freeze({...saved,items:Object.freeze(saved.items.map(p=>Object.freeze({...p})))});
      clearAttempt(); state.error=''; state.screen=5;
    } catch (error) {
      state.error=error.code ? error.message : 'Unable to confirm payment. Retry this payment to recover its receipt.';
      const confirmedRejection=['INVALID_PAYMENT','INSUFFICIENT_PAYMENT','TOTAL_CHANGED','INVALID_CART'].includes(error.code);
      // Authentication or transport errors on a retry cannot resolve an earlier commit.
      if (error.uncertain || !error.code || error.code==='REQUEST_CONFLICT' ||
          (state.uncertain && !confirmedRejection)) state.uncertain=true;
      else {
        clearAttempt();
        if (error.code==='TOTAL_CHANGED' || error.code==='INVALID_CART') {
          state.confirmed=null; state.method=null; state.cash=''; state.screen=2;
          await loadCatalog();
        }
      }
    } finally { state.busy=false; render(); }
  }


  function navigate(screen) {
    state.screen = screen;
    state.error = '';
    render();
  }
  app.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled || state.busy || state.feedback.saving) return;
    const action = target.dataset.action,
      id = target.dataset.id;
    if (action === 'retry-catalog') { loadCatalog(); return; }
    if (action === 'retry-payment' && state.uncertain && state.attempt) { finish(); return; }
    if (state.uncertain) return;
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
    else if (action === 'methods' && state.screen === 2 && count()) {
      state.confirmed = Object.freeze({items:Object.freeze(items().map(p=>Object.freeze({...p}))), total:total()});
      navigate(3);
    }
    else if (action === 'summary-back' && state.screen === 3) { state.confirmed=null; navigate(2); }
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
    else if (action === 'feedback' && state.screen === 6 && state.receipt) navigate(7);
    else if (action === 'feedback-receipt' && state.screen === 7 && !state.feedback.submitted && !state.feedback.skipped) navigate(6);
    else if (action === 'skip-feedback' && state.screen === 7 && !state.feedback.submitted && !state.feedback.skipped) {
      state.feedback.skipped = true;
      state.error = '';
      render();
    }
    else if (action === 'reset' && [6, 7].includes(state.screen)) {
      clearTimeout(state.timer);
      clearTimeout(toastTimer);
      clearAttempt();
      state = fresh();
      const toast = document.getElementById('toast');
      toast.hidden = true;
      toast.textContent = '';
      render();
    }
  });
  app.addEventListener('input', (event) => {
    if (state.screen === 7 && !state.feedback.submitted && !state.feedback.skipped && !state.feedback.saving && !state.feedback.attempt) {
      if (event.target.name === 'rating') state.feedback.rating = event.target.value;
      else if (event.target.id === 'feedback-comment') state.feedback.comment = event.target.value;
      else return;
      state.error = '';
      const error = document.getElementById('feedback-error');
      error.hidden = true;
      error.textContent = '';
      return;
    }
    if (event.target.id !== 'cash' || state.screen !== 4 || state.method !== 'Cash' || state.busy || state.uncertain) return;
    state.cash = event.target.value;
    state.error = '';
    event.target.setAttribute('aria-invalid', 'false');
    const error = document.getElementById('cash-error');
    error.hidden = true;
    error.textContent = '';
    document.getElementById('change-preview').textContent = previewChange();
  });
  app.addEventListener('submit', (event) => {
    if (event.target.id === 'feedback-form') {
      event.preventDefault();
      submitFeedback(event.target);
      return;
    }
    if (event.target.id !== 'cash-form') return;
    event.preventDefault();
    if (state.screen !== 4 || state.method !== 'Cash' || state.busy || state.uncertain || !count()) return;
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
  restoreAttempt();
  render(false);
  loadCatalog();
})();
