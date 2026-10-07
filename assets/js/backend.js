import { config } from './config.js';
import { CheckoutError, MAX_MONEY, isReceipt } from './validation.js';

export function createBackend(settings = config, timeoutMs = 15000) {
  async function call(path, options = {}, saving = false) {
    try {
      const response = await fetch(settings.url.replace(/\/$/, '') + path, {
        ...options,
        headers: { apikey: settings.publishableKey, 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(timeoutMs)
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new CheckoutError(result.error?.code || (saving ? 'save_failed' : 'catalog_failed'),
          result.error?.message || (saving ? 'Unable to confirm payment. Please retry.' : 'Unable to load products. Please retry.'), response.status);
        error.definitive = result.error?.definitive === true;
        error.canRestart = result.error?.canRestart === true;
        throw error;
      }
      return result;
    } catch (error) {
      if (error instanceof CheckoutError) throw error;
      const failure = new CheckoutError(saving ? 'save_failed' : 'catalog_failed',
        saving ? 'Unable to confirm the saved payment. Please retry this payment.' : 'Unable to load products. Check your connection and retry.', 503);
      failure.definitive = false;
      throw failure;
    }
  }

  return {
    async loadProducts() {
      const products = await call('/rest/v1/products?select=id,name,description,category,color,price&active=eq.true&order=sort_order.asc,id.asc');
      const ids = new Set();
      if (!Array.isArray(products) || products.some(p => {
        if (!p || typeof p.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(p.id) || ids.has(p.id) ||
            !Number.isSafeInteger(p.price) || p.price <= 0 || p.price > MAX_MONEY ||
            ![p.name,p.description,p.category].every(s=>typeof s==='string') || !/^#[0-9a-fA-F]{6}$/.test(p.color)) return true;
        ids.add(p.id); return false;
      })) throw new CheckoutError('catalog_failed','The product catalog is invalid. Please retry.',503);
      return Object.freeze(products.map(p=>Object.freeze({...p})));
    },
    async saveCheckout(payload) {
      const result = await call('/functions/v1/checkout', { method: 'POST', body: JSON.stringify(payload) }, true);
      if (!isReceipt(result.receipt)) {
        const error = new CheckoutError('save_failed','The saved receipt could not be confirmed. Please retry this payment.',503);
        error.definitive = false; throw error;
      }
      return result.receipt;
    }
  };
}
export const backend = createBackend();
