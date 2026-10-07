import { config } from '../../../assets/js/config.js';
import { CheckoutError } from '../../../assets/js/validation.js';
import { handleCheckout } from './handler.js';

const messages: Record<string, string> = {
  invalid_order: 'Invalid order. Please review your items and quantities.',
  invalid_product: 'An item is no longer available. Please review your order.',
  invalid_payment: 'Enter a valid, non-negative payment amount with up to 2 decimal places.',
  insufficient_payment: 'Insufficient payment. Please enter at least the order total.',
  catalog_changed: 'The product catalog changed. Please review and confirm the updated order.',
  request_conflict: 'This payment request was already used with different details. Retry the original payment request.'
};

Deno.serve((req: Request) => handleCheckout(req, {
  publishableKey: config.publishableKey,
  complete: async (request: unknown) => {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new Error('Missing server configuration');
    const response = await fetch(url + '/rest/v1/rpc/complete_checkout', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_request: request }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'P0001' && messages[data.message]) {
        const message = data.message === 'insufficient_payment' && typeof data.details === 'string'
          ? data.details : messages[data.message];
        const error = new CheckoutError(data.message, message,
          ['catalog_changed', 'request_conflict'].includes(data.message) ? 409 : 400);
        // These database errors are raised only after checking that no order exists for this request ID.
        error.canRestart = ['catalog_changed', 'invalid_product', 'insufficient_payment'].includes(data.message);
        throw error;
      }
      throw new Error('Database save failed');
    }
    return data;
  }
}));
