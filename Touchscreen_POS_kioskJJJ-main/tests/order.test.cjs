const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

const context = vm.createContext({ window: {}, crypto: webcrypto });
for (const name of ["data", "format", "order"]) {
  const file = path.join(__dirname, "..", "js", `${name}.js`);
  if (fs.existsSync(file))
    vm.runInContext(fs.readFileSync(file, "utf8"), context);
}
const kiosk = context.window.Kiosk || {};

test("cart updates cap quantity and remove items consistently", () => {
  assert.equal(typeof kiosk.updateCart, "function");
  const cart = new Map();
  kiosk.updateCart(cart, "add", "coffee");
  assert.equal(cart.get("coffee"), 1);
  cart.set("coffee", 999);
  assert.equal(kiosk.updateCart(cart, "add", "coffee").changed, false);
  assert.equal(cart.get("coffee"), 999);
  kiosk.updateCart(cart, "minus", "coffee");
  assert.equal(cart.get("coffee"), 998);
  kiosk.updateCart(cart, "remove", "coffee");
  assert.equal(cart.size, 0);
  kiosk.updateCart(cart, "add", "coffee");
  kiosk.updateCart(cart, "minus", "coffee");
  assert.equal(cart.size, 0);
  assert.equal(kiosk.updateCart(cart, "add", "unknown").changed, false);
});

test("cash validation distinguishes empty, malformed and insufficient payments", () => {
  assert.equal(typeof kiosk.paymentError, "function");
  assert.match(kiosk.paymentError("", 4500), /Enter the amount paid/);
  assert.match(kiosk.paymentError("45.001", 4500), /Invalid payment/);
  assert.match(kiosk.paymentError("", 4500, true), /Invalid payment/);
  assert.match(kiosk.paymentError("44.99", 4500), /Insufficient payment/);
  assert.equal(kiosk.paymentError("45", 4500), "");
  assert.equal(kiosk.paymentError("50.10", 4500), "");
});

test("cash parsing accepts centavos precisely and rejects invalid amounts", () => {
  assert.equal(
    typeof kiosk.parseCash,
    "function",
    "Cash parsing must be available independently of the UI",
  );
  for (const [raw, expected] of [
    ["0", 0],
    ["45", 4500],
    ["45.1", 4510],
    [" 50.10 ", 5010],
    ["999999999", 99999999900],
  ]) {
    assert.equal(kiosk.parseCash(raw), expected);
  }
  for (const raw of [
    "",
    "-1",
    "1e2",
    "45.001",
    "NaN",
    "Infinity",
    "1,000",
    "1000000000",
  ]) {
    assert.equal(kiosk.parseCash(raw), null);
  }
});

test("orders keep catalog order and calculate exact totals", () => {
  assert.equal(typeof kiosk.getOrder, "function");
  const order = kiosk.getOrder(
    new Map([
      ["sandwich", 1],
      ["coffee", 2],
    ]),
  );
  assert.equal(order.total, 14000);
  assert.equal(order.count, 3);
  assert.equal(order.items[0].id, "coffee");
  assert.equal(order.items[0].subtotal, 9000);
  assert.equal(order.items[1].subtotal, 5000);
  assert.equal(kiosk.getOrder(new Map()).total, 0);
});

test("payment guards reject underpayment, duplicate payment, empty carts and incorrect screens", () => {
  assert.equal(typeof kiosk.completePayment, "function");
  const state = kiosk.createState();
  state.cart.set("coffee", 1);
  state.method = "Cash";
  assert.equal(kiosk.completePayment(state, 4500), false);
  state.screen = 4;
  assert.equal(kiosk.completePayment(state, 4499), false);
  assert.equal(kiosk.completePayment(state, 4500.1), false);
  assert.equal(kiosk.completePayment(state, 5010), true);
  assert.equal(state.receipt.change, 510);
  assert.equal(state.screen, 5);
  state.cart.set("coffee", 3);
  assert.equal(state.receipt.items[0].qty, 1);
  assert.ok(Object.isFrozen(state.receipt.items[0]));
  state.screen = 4;
  assert.equal(kiosk.completePayment(state, 13500), false);
  const empty = kiosk.createState();
  empty.screen = 4;
  empty.method = "Cash";
  assert.equal(kiosk.completePayment(empty, 0), false);
});

test("non-cash payments require exact totals and generate unique references", () => {
  assert.equal(typeof kiosk.completePayment, "function");
  const references = new Set();
  for (const method of ["QR Payment", "Credit/Debit Card"]) {
    const state = kiosk.createState();
    Object.assign(state, { screen: 4, method });
    state.cart.set("coffee", 1);
    assert.equal(kiosk.completePayment(state, 5000), false);
    assert.equal(kiosk.completePayment(state, 4500), true);
    assert.equal(state.receipt.change, 0);
    assert.match(state.receipt.number, /^TXN-\d{4}-[A-Z0-9]+-[A-F0-9]{32}$/);
    references.add(state.receipt.number);
  }
  assert.equal(references.size, 2);
});
