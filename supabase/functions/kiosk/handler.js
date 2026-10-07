
const METHODS = ['Cash', 'QR Payment', 'Credit/Debit Card'];
export function createHandler({ publishableKeys, allowedOrigins, database }) {
  return async function handler(req) {
    const origin = req.headers.get('Origin');
    const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin',
      'Access-Control-Allow-Headers':'apikey, content-type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS' };
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (body, status=200) => new Response(JSON.stringify(body), { status, headers });
    const error = (code, message, status) => respond({ error: { code, message } },status);
    if (origin && !allowedOrigins.includes(origin)) return error('ORIGIN_DENIED','This kiosk address is not allowed.',403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (!publishableKeys.length || !publishableKeys.includes(req.headers.get('apikey'))) return error('UNAUTHORIZED','A valid publishable API key is required.',401);
    const path = new URL(req.url).pathname.split('/').pop();
    if (req.method === 'GET' && path === 'products') {
      try {
        const products = await database('products?select=id,name,description,category,color,price&active=eq.true&order=sort_order.asc', { method:'GET' });
        return respond({ products });
      } catch { return error('CATALOG_UNAVAILABLE','Products could not be loaded. Please retry.',503); }
    }
    if (req.method !== 'POST' || path !== 'checkout') return error('NOT_FOUND','Unknown kiosk endpoint.',404);
    let body;
    try {
      const text = await req.text();
      if (text.length > 20000) return error('INVALID_REQUEST','Checkout request is too large.',413);
      body = JSON.parse(text);
    } catch { return error('INVALID_REQUEST','Invalid checkout JSON.',400); }
    if (!body || typeof body !== 'object' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(body.requestId || '') ||
        !METHODS.includes(body.method) || !Number.isSafeInteger(body.expectedTotal) || body.expectedTotal <= 0 || body.expectedTotal > 99999999900 ||
        !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100 ||
        body.items.some(i => !i || typeof i.id !== 'string' || !i.id.length || i.id.length > 80 || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 999) ||
        new Set(body.items.map(i=>i.id)).size !== body.items.length ||
        (body.method === 'Cash' && typeof body.cash !== 'string')) {
      return error('INVALID_REQUEST','Invalid cart, payment method, or confirmed total.',400);
    }
    try {
      const result = await database('rpc/kiosk_checkout', { method:'POST', body:{
        p_request_id:body.requestId, p_items:body.items.map(i=>({id:i.id,qty:i.qty})),
        p_method:body.method, p_cash:body.method==='Cash'?body.cash:null, p_expected_total:body.expectedTotal
      } });
      if (!result.ok) {
        const status = ['TOTAL_CHANGED','REQUEST_CONFLICT'].includes(result.code) ? 409 :
                       ['INSUFFICIENT_PAYMENT','INVALID_PAYMENT'].includes(result.code) ? 422 : 400;
        return error(result.code,result.message,status);
      }
      return respond({ receipt:result.receipt });
    } catch {
      // A timeout may happen after commit. The client must retry the same request ID.
      return error('CHECKOUT_UNCERTAIN','Unable to confirm payment. Retry this payment to recover its receipt.',503);
    }
  };
}
