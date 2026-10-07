import test from 'node:test';
import assert from 'node:assert/strict';

const payload={requestId:'7541b9f1-3fd4-4fe0-b963-89c6cf175bc8',items:[{id:'coffee',qty:1,price:4500}],total:4500,method:'cash',cash:'45.00'};
const request = (value=payload, key='test-public') => new Request('https://example.test/checkout',{
  method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify(value)
});

test('checkout requires the project public key and handles browser preflight',async()=>{
  const {handleCheckout}=await import('../supabase/functions/checkout/handler.js');
  const options={publishableKey:'test-public',complete:async()=>({total:4500,paid:4500,change:0})};
  assert.equal((await handleCheckout(request(payload,'wrong'),options)).status,401);
  const preflight=await handleCheckout(new Request('https://example.test/checkout',{method:'OPTIONS'}),options);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
});

test('invalid and insufficient cash cannot become a successful payment',async()=>{
  const {handleCheckout}=await import('../supabase/functions/checkout/handler.js');
  const options={publishableKey:'test-public',complete:async()=>{throw Error('Should not reach the database');}};
  for (const cash of ['', '-1', 'abc', '44.99', '45.001']) {
    const response=await handleCheckout(request({...payload,cash}),options);
    assert.equal(response.status,400);
    assert.ok((await response.json()).error.message);
  }
});

test('successful response is the saved receipt and failures expose no server details',async()=>{
  const {handleCheckout}=await import('../supabase/functions/checkout/handler.js');
  const receipt={number:'TXN-SAVED',total:4500,paid:4500,change:0,method:'Cash'};
  const success=await handleCheckout(request(),{publishableKey:'test-public',complete:async()=>receipt});
  assert.equal(success.status,200);
  assert.deepEqual(await success.json(),{receipt});
  const failed=await handleCheckout(request(),{publishableKey:'test-public',complete:async()=>{throw Error('private database credentials');}});
  assert.equal(failed.status,503);
  const failure=await failed.json(); assert.equal(failure.error.code,'save_failed');
  assert.equal(JSON.stringify(failure).includes('private database credentials'),false);
});

test('catalog changes and conflicting retries return actionable errors',async()=>{
  const {handleCheckout}=await import('../supabase/functions/checkout/handler.js');
  const {CheckoutError}=await import('../assets/js/validation.js');
  for (const code of ['catalog_changed','request_conflict']) {
    const response=await handleCheckout(request(),{publishableKey:'test-public',complete:async()=>{throw new CheckoutError(code,'Review or retry',409);}});
    assert.equal(response.status,409);
    assert.equal((await response.json()).error.code,code);
  }
});
