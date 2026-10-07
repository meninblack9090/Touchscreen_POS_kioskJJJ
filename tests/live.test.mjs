import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {appendFile,mkdir} from 'node:fs/promises';
import '../config.js';
const {url,publishableKey}=globalThis.KIOSK_CONFIG;
const headers={apikey:publishableKey,'Content-Type':'application/json'};
const ids=[];
const basket=[{id:'sandwich',qty:3},{id:'cookies',qty:1}];
const payload=(extra={})=>{const requestId=randomUUID();ids.push(requestId);return {requestId,items:basket,method:'Cash',cash:'175.00',expectedTotal:17500,...extra};};
async function call(body,path='checkout') {
  const response=await fetch(url+'/functions/v1/kiosk/'+path,{method:body?'POST':'GET',headers,...(body&&{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
}
after(async()=>{await mkdir('.superpowers',{recursive:true});await appendFile('.superpowers/live-request-ids.txt',ids.join('\n')+'\n');});
test('live catalog matches the seeded prices',async()=>{const r=await call(null,'products');assert.equal(r.status,200);assert.equal(r.data.products.length,8);assert.equal(r.data.products.find(p=>p.id==='sandwich').price,5000);});
for(const cash of ['','hello','-1','175.001','1e3','NaN','Infinity']) test('live rejects invalid cash '+JSON.stringify(cash),async()=>{const r=await call(payload({cash}));assert.equal(r.status,422);assert.equal(r.data.error.code,'INVALID_PAYMENT');});
test('live underpayment returns the minimum total',async()=>{const r=await call(payload({cash:'174.99'}));assert.equal(r.status,422);assert.equal(r.data.error.message,'Insufficient payment. Please enter at least ₱175.00.');});
for(const [cash,paid,change] of [['175.00',17500,0],['200.00',20000,2500]]) test('live cash '+cash+' saves consistent receipt',async()=>{const r=await call(payload({cash}));assert.equal(r.status,200);assert.equal(r.data.receipt.total,17500);assert.equal(r.data.receipt.paid,paid);assert.equal(r.data.receipt.change,change);assert.equal(r.data.receipt.items.reduce((s,i)=>s+i.subtotal,0),17500);});
for(const method of ['QR Payment','Credit/Debit Card']) test('live '+method+' saves exact payment',async()=>{const r=await call(payload({method,cash:'0',paid:1,change:999}));assert.equal(r.status,200);assert.equal(r.data.receipt.paid,17500);assert.equal(r.data.receipt.change,0);});
for(const [name,extra,code,status] of [['empty cart',{items:[]},'INVALID_REQUEST',400],['unknown product',{items:[{id:'missing',qty:1}]},'INVALID_CART',400],['invalid quantity',{items:[{id:'coffee',qty:1.5}]},'INVALID_REQUEST',400],['negative quantity',{items:[{id:'coffee',qty:-1}]},'INVALID_REQUEST',400],['tampered total',{expectedTotal:1},'TOTAL_CHANGED',409]]) test('live rejects '+name,async()=>{const r=await call(payload(extra));assert.equal(r.status,status);assert.equal(r.data.error.code,code);});
test('live ignores client prices and uses trusted catalog prices',async()=>{const r=await call(payload({items:basket.map(i=>({...i,price:1}))}));assert.equal(r.status,200);assert.equal(r.data.receipt.total,17500);assert.equal(r.data.receipt.items.find(i=>i.id==='sandwich').price,5000);});
test('live concurrent retries return one receipt and reject changed request',async()=>{
  const body=payload();const responses=await Promise.all(Array.from({length:4},()=>call(body)));
  for(const r of responses){assert.equal(r.status,200);assert.deepEqual(r.data.receipt,responses[0].data.receipt);}
  const conflict=await call({...body,cash:'200.00'});assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'REQUEST_CONFLICT');
});
test('public key cannot read or write orders or invoke privileged RPCs',async()=>{
  for(const path of ['orders?select=*','order_items?select=*']) {const r=await fetch(url+'/rest/v1/'+path,{headers});assert.ok([401,403].includes(r.status),'Order reads were allowed');}
  const insert=await fetch(url+'/rest/v1/orders',{method:'POST',headers,body:'{}'});assert.ok([401,403].includes(insert.status));
  const rpc=await fetch(url+'/rest/v1/rpc/kiosk_checkout',{method:'POST',headers,body:JSON.stringify({p_request_id:randomUUID(),p_items:basket,p_method:'Cash',p_cash:'175',p_expected_total:17500})});assert.ok([401,403,404].includes(rpc.status));
  const products=await fetch(url+'/rest/v1/products?select=id',{headers});assert.equal(products.status,200);
});
test('live function requires the publishable key',async()=>{const r=await fetch(url+'/functions/v1/kiosk/products');assert.equal(r.status,401);});

test('live feedback validates, saves once on concurrent retry, and denies public access',async()=>{
 const created=await call(payload());assert.equal(created.status,200);
 const body={transactionNumber:created.data.receipt.number,rating:5,comment:'Automated feedback integration test'};
 for(const extra of [{rating:0},{rating:6},{rating:2.5},{rating:'5'},{rating:null},{comment:'x'.repeat(501)},{comment:null}])assert.equal((await call({...body,...extra},'feedback')).status,400);
 const unknown=await call({...body,transactionNumber:'TXN-'+randomUUID().toUpperCase()},'feedback');assert.equal(unknown.status,404);
 const responses=await Promise.all(Array.from({length:4},()=>call(body,'feedback')));
 for(const r of responses){assert.equal(r.status,200);assert.equal(r.data.feedback.rating,5);assert.equal(r.data.feedback.comment,body.comment);assert.equal(r.data.feedback.transactionNumber,body.transactionNumber);assert.deepEqual(r.data.feedback,responses[0].data.feedback);}
 assert.equal((await call({...body,rating:4},'feedback')).status,409);
 assert.equal((await call({...body,comment:'Changed'},'feedback')).status,409);
 for(const method of ['GET','POST','PATCH','DELETE']) {
  const r=await fetch(url+'/rest/v1/customer_feedback?order_id=eq.'+body.transactionNumber.slice(4),{method,headers,...(method!=='GET'&&method!=='DELETE'&&{body:JSON.stringify({rating:4})})});assert.ok([401,403].includes(r.status),'Public '+method+' feedback access was allowed');
 }
 const rpc=await fetch(url+'/rest/v1/rpc/kiosk_feedback',{method:'POST',headers,body:JSON.stringify({p_transaction_number:body.transactionNumber,p_rating:5,p_comment:body.comment})});assert.ok([401,403,404].includes(rpc.status));
});
