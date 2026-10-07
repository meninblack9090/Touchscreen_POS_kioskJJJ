(() => {
  "use strict";
  const { products, paymentMethods, formatMoney } = window.Kiosk;
  const createState = () => ({
    screen: 1,
    cart: new Map(),
    method: null,
    cash: "",
    receipt: null,
    busy: false,
    error: "",
    timer: null,
  });

  function getOrder(cart) {
    const items = products
      .filter((product) => cart.has(product.id))
      .map((product) => ({
        ...product,
        qty: cart.get(product.id),
        subtotal: product.price * cart.get(product.id),
      }));
    return {
      items,
      total: items.reduce((sum, item) => sum + item.subtotal, 0),
      count: items.reduce((sum, item) => sum + item.qty, 0),
    };
  }
  function updateCart(cart, action, id) {
    const product = products.find((product) => product.id === id);
    if (!product || !["add", "minus", "remove"].includes(action)) {
      return { changed: false, message: "" };
    }
    const quantity = cart.get(id) || 0;
    if (action === "add") {
      if (quantity >= 999) {
        return {
          changed: false,
          message: "Invalid quantity. Maximum 999 per item.",
        };
      }
      cart.set(id, quantity + 1);
      return { changed: true, message: `${product.name} added to your order.` };
    }
    if (action === "minus" && quantity > 1) {
      cart.set(id, quantity - 1);
      return { changed: true, message: "" };
    }
    cart.delete(id);
    return {
      changed: true,
      message: `${product.name} removed from your order.`,
    };
  }

  // Strict parsing accepts monetary values only, with at most two decimal places.
  function parseCash(raw) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
    const [whole, fraction = ""] = raw.trim().split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && cents <= 99999999900 ? cents : null;
  }

  function paymentError(raw, amount, badInput = false) {
    if (badInput) return "Invalid payment. Enter a valid amount.";
    if (!raw.trim()) return "Enter the amount paid.";
    const paid = parseCash(raw);
    if (paid === null) {
      return "Invalid payment. Enter a non-negative amount with up to 2 decimal places.";
    }
    if (paid < amount) {
      return `Insufficient payment. Please enter at least ${formatMoney(amount)}.`;
    }
    return "";
  }

  // Cryptographic randomness plus timestamp protects references across tabs/reloads.
  function transactionNumber() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const random = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
    const now = new Date();
    return `TXN-${now.getFullYear()}-${now.getTime().toString(36).toUpperCase()}-${random}`;
  }

  function completePayment(state, paid) {
    const order = getOrder(state.cart);
    if (
      state.screen !== 4 ||
      state.receipt ||
      !paymentMethods.includes(state.method) ||
      !order.count
    )
      return false;
    const amount = order.total;
    if (!Number.isSafeInteger(paid) || paid < amount || paid < 0) return false;
    if (state.method !== "Cash" && paid !== amount) return false;
    const receiptItems = Object.freeze(
      order.items.map((item) => Object.freeze({ ...item })),
    );
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
    state.error = "";
    state.screen = 5;
    return true;
  }

  Object.assign(window.Kiosk, {
    createState,
    getOrder,
    parseCash,
    paymentError,
    updateCart,
    completePayment,
  });
})();
