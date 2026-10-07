import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/kiosk/handler.js';
const key = 'sb_publishable_test';
const receipt = { number: 'TXN-test', date: '2026-10-07T12:00:00Z', total: 17500, paid: 17500, change: 0, method: 'Cash', items: [] };
const payload = { requestId: '8a488b4c-7ca6-4e17-8824-ab3c91226fba', items: [{ id: 'coffee', qty: 1 }], method: 'Cash', cash: '175.00', expectedTotal: 17500 };
function setup(result = { ok: true, receipt }) {
  const calls = [];
  const handler = createHandler({ publishableKeys: [key], allowedOrigins: ['http://localhost:4173'], database: async (path, options) => { calls.push({path, options}); return result; } });
  return { handler, calls };
}
function request(path = 'checkout', body = payload, headers = {}) {
  return new Request(`https://example.com/functions/v1/kiosk/${path}`, { method: path === 'products' ? 'GET' : 'POST', headers: { apikey: key, Origin: 'http://localhost:4173', 'Content-Type': 'application/json', ...headers }, ...(path !== 'products' && { body: JSON.stringify(body) }) });
}
test('catalog requires a configured publishable key', async () => {
  const {handler, calls} = setup([]);
  assert.equal((await handler(request('products', null, {apikey: 'wrong'}))).status, 401);
  assert.equal(calls.length, 0);
});
test('preflight allows supported origins and rejects other origins', async () => {
  const {handler} = setup();
  const response = await handler(new Request('https://example.com/functions/v1/kiosk/checkout', {method:'OPTIONS', headers: {Origin:'http://localhost:4173'}}));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4173');
  assert.equal((await handler(request('checkout', payload, {Origin:'https://untrusted.example'}))).status, 403);
});
test('GET catalog returns database products', async () => {
  const {handler} = setup([{id:'coffee',price:4500}]);
  assert.deepEqual(await (await handler(request('products'))).json(), {products:[{id:'coffee',price:4500}]});
});
test('checkout returns saved receipt and strips client price fields', async () => {
  const {handler, calls} = setup();
  const response = await handler(request('checkout', {...payload, items:[{id:'coffee',qty:1,price:1}]}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {receipt});
  assert.deepEqual(calls[0].options.body.p_items, [{id:'coffee',qty:1}]);
});
for (const [name, body] of [['empty cart',{...payload,items:[]}], ['negative quantity',{...payload,items:[{id:'coffee',qty:-1}]}], ['fractional quantity',{...payload,items:[{id:'coffee',qty:1.5}]}], ['invalid total',{...payload,expectedTotal:'17500'}], ['invalid UUID',{...payload,requestId:'no'}], ['unknown method',{...payload,method:'Bitcoin'}], ['duplicate products',{...payload,items:[{id:'coffee',qty:1},{id:'coffee',qty:2}]}]]) {
  test(`rejects ${name} without database writes`, async () => { const {handler,calls} = setup(); assert.equal((await handler(request('checkout',body))).status,400); assert.equal(calls.length,0); });
}
for (const [code,status] of [['INSUFFICIENT_PAYMENT',422],['TOTAL_CHANGED',409],['REQUEST_CONFLICT',409],['INVALID_PAYMENT',422],['INVALID_CART',400]]) {
  test(`maps ${code} to actionable client error`, async () => {const {handler}=setup({ok:false,code,message:'Test error'});const response=await handler(request());assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);});
}
test('database failure is uncertain and does not manufacture success', async () => {
  const handler=createHandler({publishableKeys:[key],allowedOrigins:[],database:async()=>{throw Error('private database detail');}});
  const response=await handler(request('checkout',payload,{Origin:''}));
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'CHECKOUT_UNCERTAIN');
});
test('malformed JSON is rejected', async () => {
  const {handler}=setup();
  const response=await handler(new Request('https://example.com/functions/v1/kiosk/checkout',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:'{'}));
  assert.equal(response.status,400);
});

const feedbackPayload={transactionNumber:'TXN-8A488B4C-7CA6-4E17-8824-AB3C91226FBA',rating:5,comment:' Helpful kiosk! '};
const savedFeedback={transactionNumber:feedbackPayload.transactionNumber,rating:5,comment:'Helpful kiosk!',date:'2026-10-07T12:00:00Z'};
test('feedback saves a rating and trimmed comment through the private RPC',async()=>{
 const {handler,calls}=setup({ok:true,feedback:savedFeedback});const r=await handler(request('feedback',feedbackPayload));assert.equal(r.status,200);assert.deepEqual(await r.json(),{feedback:savedFeedback});assert.deepEqual(calls[0],{path:'rpc/kiosk_feedback',options:{method:'POST',body:{p_transaction_number:feedbackPayload.transactionNumber,p_rating:5,p_comment:'Helpful kiosk!'}}});
});
for(const [name,extra] of [['missing rating',{rating:null}],['string rating',{rating:'5'}],['low rating',{rating:0}],['high rating',{rating:6}],['fractional rating',{rating:2.5}],['long comment',{comment:'a'.repeat(501)}],['non-text comment',{comment:7}],['invalid receipt',{transactionNumber:'TXN-made-up'}]]) test('feedback rejects '+name+' before writing',async()=>{const {handler,calls}=setup();assert.equal((await handler(request('feedback',{...feedbackPayload,...extra}))).status,400);assert.equal(calls.length,0);});
for(const [code,status] of [['ORDER_NOT_FOUND',404],['FEEDBACK_CONFLICT',409]])test('feedback maps '+code,async()=>{const {handler}=setup({ok:false,code,message:'Feedback error'});const r=await handler(request('feedback',feedbackPayload));assert.equal(r.status,status);assert.equal((await r.json()).error.code,code);});
test('feedback failure never reports success or leaks database details',async()=>{const handler=createHandler({publishableKeys:[key],allowedOrigins:[],database:async()=>{throw Error('secret');}});const r=await handler(request('feedback',feedbackPayload,{Origin:''}));assert.equal(r.status,503);const data=await r.json();assert.equal(data.error.code,'FEEDBACK_UNCERTAIN');assert.ok(!data.error.message.includes('secret'));});
