import { normalizeCheckout, isReceipt } from './validation.js';
const KEY = 'campus-corner.checkout.v1';

export function createSession(storage) {
  return {
    load() {
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      try {
        const saved = JSON.parse(raw);
        if (saved.version !== 1) return null;
        if (saved.receipt && isReceipt(saved.receipt)) return saved;
        if (saved.pending && saved.confirmed) {
          normalizeCheckout(saved.pending);
          if (saved.confirmed.total !== saved.pending.total || !Array.isArray(saved.confirmed.items)) return null;
          return saved;
        }
      } catch { /* Discard malformed local state; never submit it automatically. */ }
      return null;
    },
    savePending(pending, confirmed) {
      storage.setItem(KEY, JSON.stringify({version:1,pending,confirmed,receipt:null}));
    },
    saveReceipt(receipt) {
      storage.setItem(KEY, JSON.stringify({version:1,pending:null,confirmed:null,receipt}));
    },
    clear() { storage.removeItem(KEY); }
  };
}
