export const MAX_MONEY = 99999999900;
export class CheckoutError extends Error {
  constructor(code, message, status = 400) {
    super(message); this.name = 'CheckoutError'; this.code = code; this.status = status; this.canRestart = false;
  }
}
export const money = cents => '₱' + (cents / 100).toLocaleString('en-PH', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});

export function parseCash(raw) {
  if (typeof raw !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ''] = raw.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_MONEY ? cents : null;
}

export function normalizeCheckout(input) {
  const reject = (message) => { throw new CheckoutError('invalid_order', message); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('Invalid checkout request.');
  if (typeof input.requestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) reject('Invalid request ID.');
  if (!Number.isSafeInteger(input.total) || input.total <= 0 || input.total > MAX_MONEY) reject('Invalid order total.');
  if (!['cash', 'qr', 'card'].includes(input.method)) reject('Invalid payment method.');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 100) reject('Select products before paying.');
  const seen = new Set();
  const items = input.items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(item.id) || seen.has(item.id)) reject('Invalid or duplicate product.');
    if (!Number.isSafeInteger(item.qty) || item.qty < 1 || item.qty > 999) reject('Quantity must be between 1 and 999.');
    if (!Number.isSafeInteger(item.price) || item.price <= 0 || item.price > MAX_MONEY) reject('Invalid unit price.');
    seen.add(item.id);
    return { id: item.id, qty: item.qty, price: item.price };
  }).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let paid = null;
  if (input.method === 'cash') {
    paid = parseCash(input.cash);
    if (paid === null) throw new CheckoutError('invalid_payment', 'Enter a valid, non-negative payment amount with up to 2 decimal places.');
    if (paid < input.total) throw new CheckoutError('insufficient_payment', 'Insufficient payment. Please enter at least ' + money(input.total) + '.');
  }
  return { requestId: input.requestId.toLowerCase(), items, total: input.total, method: input.method, paid };
}

export function isReceipt(r) {
  if (!r || typeof r.number !== 'string' || !r.number ||
      typeof r.date !== 'string' || !Number.isFinite(Date.parse(r.date)) ||
      !['Cash','QR Payment','Credit/Debit Card'].includes(r.method) ||
      ![r.total,r.paid,r.change].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=MAX_MONEY) ||
      r.total<=0 || r.paid<r.total || r.change!==r.paid-r.total ||
      (r.method!=='Cash'&&(r.paid!==r.total||r.change!==0)) ||
      !Array.isArray(r.items) || !r.items.length) return false;
  const ids = new Set();
  let total=0;
  for (const item of r.items) {
    if (!item || typeof item.id!=='string' || ids.has(item.id) || typeof item.name!=='string' ||
        !Number.isSafeInteger(item.qty) || item.qty<1 || item.qty>999 ||
        !Number.isSafeInteger(item.price) || item.price<=0 ||
        !Number.isSafeInteger(item.subtotal) || item.subtotal!==item.qty*item.price) return false;
    ids.add(item.id); total+=item.subtotal;
  }
  return total===r.total;
}
