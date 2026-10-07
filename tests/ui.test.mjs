import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const catalog=[
  {id:'coffee',name:'Coffee',price:4500,color:'#eee5d7',description:'Coffee',category:'Drink'},
  {id:'sandwich',name:'Sandwich',price:5000,color:'#edf0dc',description:'Sandwich',category:'Food'},
  {id:'notebook',name:'Campus Notebook',price:6500,color:'#e4e8f0',description:'Notebook',category:'Merchandise'},
  {id:'pen',name:'Ballpoint Pen',price:1500,color:'#eee6ed',description:'Pen',category:'Merchandise'}
];
const saved=new Map(); let submissions=[]; let failAfterSave=false; let catalogChanged=false; let rejectAuth=false;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
  if(String(url).includes('/rest/v1/products')) return new Response(JSON.stringify(catalog));
  const body=JSON.parse(options.body); submissions.push(body);
  if(rejectAuth)return new Response(JSON.stringify({error:{code:'unauthorized',message:'Kiosk configuration is invalid.',definitive:true,canRestart:false}}),{status:401});
  if(catalogChanged){
    catalogChanged=false;
    return new Response(JSON.stringify({error:{code:'catalog_changed',message:'Catalog changed. Review your order.',definitive:true,canRestart:true}}),{status:409});
  }
  let receipt=saved.get(body.requestId);
  if(!receipt){
    const items=body.items.map(i=>({...i,name:catalog.find(p=>p.id===i.id).name,subtotal:i.price*i.qty}));
    const paid=body.method==='cash'?Math.round(Number(body.cash)*100):body.total;
    receipt={number:'TXN-'+body.requestId,date:new Date().toISOString(),items,total:body.total,paid,change:paid-body.total,
      method:({cash:'Cash',qr:'QR Payment',card:'Credit/Debit Card'})[body.method]};
    saved.set(body.requestId,receipt);
  }
  if(failAfterSave){
    failAfterSave=false;
    return new Response(JSON.stringify({error:{code:'save_failed',message:'Please retry this payment.',definitive:false}}),{status:503});
  }
  return new Response(JSON.stringify({receipt}));
};
test.after(()=>{globalThis.fetch=originalFetch;});
let dom;
async function open(restored=null){
  dom?.window.close();
  dom=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8'),{url:'http://localhost:8080/'});
  globalThis.document=dom.window.document; globalThis.window=dom.window;
  dom.window.scrollTo=()=>{};
  if(restored)dom.window.sessionStorage.setItem('campus-corner.checkout.v1',restored);
  await import('../assets/js/app.js?run='+crypto.randomUUID());
  await wait(()=>document.querySelector('button[data-action="add"]')||document.querySelector('#cash'));
}
const wait=async(fn)=>{for(let n=0;n<200;n++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not reach expected state: '+document.body.textContent.slice(-900));};
const click=(action,id)=>{const el=document.querySelector('button[data-action="'+action+'"]'+(id?'[data-id="'+id+'"]':''));assert.ok(el,action);el.click();};
function review(){
  for(const p of catalog)click('add',p.id);
  click('summary');
  assert.ok(document.body.textContent.includes('₱175.00'));
  click('methods');
}
function method(index){document.querySelector('[data-method="'+index+'"]').click();}
function pay(cash){const el=document.querySelector('#cash');el.value=cash;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));document.querySelector('#cash-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));}

test('cash rejects invalid/insufficient values and exact payment uses the saved receipt',async()=>{
  submissions=[]; saved.clear();
  await open(); review(); method(0);
  for(const value of ['','-1','174.99','175.001']){
    pay(value);
    assert.ok(document.querySelector('#cash'));
    assert.ok(document.querySelector('#cash-error').textContent.length);
    assert.equal(submissions.length,0);
  }
  pay('175.00');
  // A second submit while the first is in flight must not create another request.
  document.querySelector('#cash-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>document.body.textContent.includes('Payment successful!'));
  assert.equal(submissions.length,1);
  click('receipt');
  assert.ok(document.body.textContent.includes('₱0.00'));
  assert.ok(document.body.textContent.includes([...saved.values()][0].number));
  click('reset');
  await wait(()=>document.querySelector('[data-action="add"]'));
  assert.equal(dom.window.sessionStorage.getItem('campus-corner.checkout.v1'),null);
});
test('QR requires confirmation and card shows processing before success',async()=>{
  submissions=[];saved.clear();
  await open();review();method(1);
  assert.ok(document.body.textContent.includes('Scan the QR code using your supported payment application.'));
  assert.ok(document.querySelector('img[alt*="placeholder"]'));
  assert.equal(submissions.length,0);
  click('confirm'); await wait(()=>document.body.textContent.includes('Payment successful!'));
  assert.equal([...saved.values()][0].paid,17500);
  assert.equal([...saved.values()][0].change,0);
  await open();review();method(2);
  click('process');
  assert.ok(document.body.textContent.includes('Processing payment...'));
  assert.equal(submissions.length,1);
  await wait(()=>document.body.textContent.includes('Payment successful!'));
  assert.equal(submissions.length,2);
  assert.equal(submissions[1].method,'card');
});
test('uncertain saved payment survives reload and retries the identical request',async()=>{
  submissions=[];saved.clear();failAfterSave=true;
  await open();review();method(0);pay('200.00');
  await wait(()=>document.querySelector('[data-action="retry-payment"]')&&!document.querySelector('[data-action="retry-payment"]').disabled);
  assert.ok(document.querySelector('[data-action="change-method"]').disabled);
  assert.ok(document.querySelector('#cash').disabled);
  const pending=dom.window.sessionStorage.getItem('campus-corner.checkout.v1');
  await open(pending);
  click('retry-payment');
  await wait(()=>document.body.textContent.includes('Payment successful!'));
  assert.equal(saved.size,1);
  assert.deepEqual(submissions[0],submissions[1]);
  click('receipt');
  assert.ok(document.body.textContent.includes('₱25.00'));
});
test('changed catalog returns to review without successful payment',async()=>{
  submissions=[];saved.clear();catalogChanged=true;
  await open();review();method(1);click('confirm');
  await wait(()=>document.querySelector('[data-action="methods"]'));
  assert.equal(saved.size,0);
  assert.ok(document.body.textContent.includes('Catalog changed'));
  assert.equal(dom.window.sessionStorage.getItem('campus-corner.checkout.v1'),null);
});

test('configuration rejection cannot discard an earlier uncertain saved payment',async()=>{
  submissions=[];saved.clear();failAfterSave=true;rejectAuth=false;
  await open();review();method(0);pay('175.00');
  await wait(()=>document.querySelector('[data-action=\"retry-payment\"]')&&!document.querySelector('[data-action=\"retry-payment\"]').disabled);
  const pending=dom.window.sessionStorage.getItem('campus-corner.checkout.v1');
  rejectAuth=true;click('retry-payment');
  await wait(()=>document.body.textContent.includes('Kiosk configuration is invalid.'));
  assert.equal(dom.window.sessionStorage.getItem('campus-corner.checkout.v1'),pending);
  assert.ok(document.querySelector('[data-action=\"change-method\"]').disabled);
  assert.ok(document.querySelector('#cash').disabled);
  rejectAuth=false;click('retry-payment');
  await wait(()=>document.body.textContent.includes('Payment successful!'));
  assert.equal(saved.size,1);
  assert.equal(new Set(submissions.map(p=>p.requestId)).size,1);
});
