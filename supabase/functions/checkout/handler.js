import { CheckoutError, normalizeCheckout } from '../../../assets/js/validation.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store'
};
const json = (body, status) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' }
});

export async function handleCheckout(req, { publishableKey, complete }) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({error:{code:'method_not_allowed',message:'Use POST for checkout.',definitive:true,canRestart:false}},405);
  // Guests use the project's public API key; no customer account is required.
  if (!publishableKey || req.headers.get('apikey') !== publishableKey) {
    return json({error:{code:'unauthorized',message:'The kiosk configuration is invalid.',definitive:true,canRestart:false}},401);
  }
  try {
    const raw = await req.text();
    if (raw.length > 32768) throw new CheckoutError('invalid_order','Checkout request is too large.',413);
    let body;
    try { body = JSON.parse(raw); }
    catch { throw new CheckoutError('invalid_order','Invalid checkout request.'); }
    const request = normalizeCheckout(body);
    const receipt = await complete(request);
    return json({receipt},200);
  } catch (error) {
    if (error instanceof CheckoutError) {
      return json({error:{code:error.code,message:error.message,definitive:true,canRestart:error.canRestart===true}},error.status);
    }
    // A dropped connection may have occurred after commit. Retry the same request.
    console.error('checkout save failed', error instanceof Error ? error.name : 'Unknown error');
    return json({error:{code:'save_failed',message:'Unable to confirm the saved payment. Please retry this payment.',definitive:false,canRestart:false}},503);
  }
}
