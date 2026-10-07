
(() => {
  'use strict';
  const config = globalThis.KIOSK_CONFIG || {};
  class APIError extends Error {
    constructor(code, message, uncertain=false) { super(message); this.code=code; this.uncertain=uncertain; }
  }
  async function request(path, body) {
    if (!config.url || !config.publishableKey) throw new APIError('CONFIGURATION','The kiosk backend is not configured.');
    let response, data;
    try {
      response = await fetch(config.url.replace(/\/$/,'') + '/functions/v1/kiosk/' + path, {
        method: body ? 'POST':'GET',
        headers: { apikey:config.publishableKey, ...(body && {'Content-Type':'application/json'}) },
        ...(body && {body:JSON.stringify(body)}), signal:AbortSignal.timeout(25000)
      });
      data=await response.json();
    } catch {
      throw new APIError(path==='feedback'?'FEEDBACK_UNCERTAIN':body?'CHECKOUT_UNCERTAIN':'CATALOG_UNAVAILABLE',
        path==='feedback'?'Unable to confirm feedback. Retry to recover your saved submission.':body?'Unable to confirm payment. Retry this payment to recover its receipt.':'Products could not be loaded. Please retry.',!!body);
    }
    if (!response.ok) {
      throw new APIError(data?.error?.code || 'BACKEND_ERROR', data?.error?.message || 'The backend could not complete this request.',
        !!body && (response.status>=500 || data?.error?.code==='CHECKOUT_UNCERTAIN'));
    }
    return data;
  }
  function validReceipt(r,payload) {
    if (!r || typeof r.number!=='string' || !r.number || !Number.isFinite(Date.parse(r.date)) ||
        r.method!==payload.method || r.total!==payload.expectedTotal ||
        !Number.isSafeInteger(r.paid) || r.paid<r.total || r.change!==r.paid-r.total ||
        (r.method!=='Cash' && (r.paid!==r.total || r.change!==0)) ||
        !Array.isArray(r.items) || r.items.length!==payload.items.length) return false;
    if (r.method==='Cash' && r.paid!==Math.round(Number(payload.cash)*100)) return false;
    let sum=0;
    const expected=new Map(payload.items.map(i=>[i.id,i.qty]));
    for (const i of r.items) {
      if (!i || !expected.has(i.id) || expected.get(i.id)!==i.qty || typeof i.name!=='string' ||
          !Number.isSafeInteger(i.price) || i.price<=0 || !Number.isSafeInteger(i.subtotal) || i.subtotal!==i.price*i.qty) return false;
      expected.delete(i.id); sum+=i.subtotal;
    }
    return expected.size===0 && sum===r.total;
  }
  globalThis.KioskAPI = {
    async products() {
      const data=await request('products');
      if (!Array.isArray(data?.products) || !data.products.length ||
          new Set(data.products.map(p=>p.id)).size!==data.products.length ||
          data.products.some(p=>!p || !/^[a-z0-9_-]{1,80}$/.test(p.id) ||
            !Number.isSafeInteger(p.price) || p.price<=0 || typeof p.name!=='string' || typeof p.description!=='string')) {
        throw new APIError('CATALOG_UNAVAILABLE','The product catalog is invalid. Please retry.');
      }
      return data.products;
    },
    async feedback(payload) {
      const data=await request('feedback',payload);
      const f=data?.feedback;
      if (!f || f.transactionNumber!==payload.transactionNumber || f.rating!==payload.rating ||
          f.comment!==payload.comment || !Number.isFinite(Date.parse(f.date))) {
        throw new APIError('FEEDBACK_UNCERTAIN','Unable to verify saved feedback. Retry to recover your submission.',true);
      }
      return f;
    },
    async checkout(payload) {
      const data=await request('checkout',payload);
      if (!validReceipt(data?.receipt,payload)) throw new APIError('CHECKOUT_UNCERTAIN','Unable to verify the saved receipt. Retry this payment to recover it.',true);
      return data.receipt;
    }
  };
})();
