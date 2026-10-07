import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {config} from '../assets/js/config.js';
import {backend} from '../assets/js/backend.js';

const products=await backend.loadProducts();
assert.equal(products.length,8);
const items=[{id:'coffee',qty:1,price:4500},{id:'sandwich',qty:1,price:5000},{id:'notebook',qty:1,price:6500},{id:'pen',qty:1,price:1500}];
const base={items,total:17500,method:'cash',cash:'175.00'};
const evidence={createdAt:new Date().toISOString(),rejected:[],saved:[]};
async function post(body){
  const response=await fetch(config.url+'/functions/v1/checkout',{
    method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify(body),
    signal:AbortSignal.timeout(20000)
  });
  return {status:response.status,body:await response.json()};
}
for(const cash of ['', ' ', 'abc', '-1', '174.99', '175.001','1e5','999999999.01']){
  const payload={...base,requestId:crypto.randomUUID(),cash};
  const response=await post(payload);
  assert.equal(response.status,400,JSON.stringify(response));
  assert.equal(response.body.error.definitive,true);
  assert.equal(response.body.error.canRestart,false);
  evidence.rejected.push(payload.requestId);
}
for(const change of [
  {items:[]},{items:[{id:'coffee',qty:0,price:4500}]},{items:[{id:'coffee',qty:1000,price:4500}]},
  {items:[{id:'missing',qty:1,price:4500}]},{total:17499},{items:[{id:'coffee',qty:1,price:1}]},{method:'bank'}
]){
  const payload={...base,...change,requestId:crypto.randomUUID()};
  const response=await post(payload);
  assert.ok([400,409].includes(response.status),JSON.stringify(response));
  assert.equal(response.body.error.canRestart,['catalog_changed','invalid_product'].includes(response.body.error.code));
  evidence.rejected.push(payload.requestId);
}
for(const [method,cash,paid,change] of [['cash','175.00',17500,0],['cash','200.00',20000,2500],['qr',undefined,17500,0],['card',undefined,17500,0]]){
  const payload={...base,requestId:crypto.randomUUID(),method,cash};
  const receipt=await backend.saveCheckout(payload);
  assert.equal(receipt.total,17500);assert.equal(receipt.paid,paid);assert.equal(receipt.change,change);
  const retry=await backend.saveCheckout(payload);
  assert.deepEqual(retry,receipt);
  evidence.saved.push({requestId:payload.requestId,receipt});
  const conflict=await post({...payload,method:method==='cash'?'qr':'cash',cash:'175.00'});
  assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'request_conflict');
}
const payload={...base,requestId:crypto.randomUUID()};
const simultaneous=await Promise.all([backend.saveCheckout(payload),backend.saveCheckout(payload)]);
assert.deepEqual(simultaneous[0],simultaneous[1]);
evidence.saved.push({requestId:payload.requestId,receipt:simultaneous[0]});
for(const table of ['orders','order_items','payments']){
  const response=await fetch(config.url+'/rest/v1/'+table+'?select=*',{headers:{apikey:config.publishableKey}});
  assert.equal(response.ok,false,'Private table exposed: '+table);
}
const rpc=await fetch(config.url+'/rest/v1/rpc/complete_checkout',{
  method:'POST',headers:{apikey:config.publishableKey,'content-type':'application/json'},body:JSON.stringify({p_request:{}})
});
assert.equal(rpc.ok,false,'Public checkout RPC exposed');
await mkdir('test-results',{recursive:true});
await writeFile('test-results/live-checkouts.json',JSON.stringify(evidence,null,2));
console.log('PASS: 8 products; 15 rejected requests; exact/overpaid cash, QR, card, retries, concurrent checkout and private-data access.');
console.log('Saved 5 simulated test orders; evidence: test-results/live-checkouts.json');
