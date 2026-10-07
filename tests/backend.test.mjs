import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

async function serverFor(handler) {
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
test('backend loads the real HTTP catalog and sends checkout requests',async()=>{
  const {createBackend}=await import('../assets/js/backend.js');
  const receipt={number:'TXN-HTTP',date:'2026-10-07T11:00:00Z',items:[{id:'coffee',name:'Coffee',qty:1,price:4500,subtotal:4500}],total:4500,paid:4500,change:0,method:'QR Payment'};
  const server=await serverFor(async(req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.headers.apikey!=='public-test'){res.writeHead(401);res.end('{}');return;}
    if(req.url.startsWith('/rest/v1/products')) {
      res.end(JSON.stringify([{id:'coffee',name:'Coffee',price:4500,color:'#eee5d7',description:'Coffee',category:'Drink'}]));
    } else {
      let raw=''; for await(const chunk of req) raw+=chunk;
      const body=JSON.parse(raw); assert.equal(body.method,'qr');
      res.end(JSON.stringify({receipt}));
    }
  });
  try {
    const backend=createBackend({url:server.url,publishableKey:'public-test'});
    assert.equal((await backend.loadProducts())[0].price,4500);
    assert.deepEqual(await backend.saveCheckout({method:'qr'}),receipt);
  } finally {await server.close();}
});
test('backend distinguishes definite rejection from an uncertain network outcome',async()=>{
  const {createBackend}=await import('../assets/js/backend.js');
  const server=await serverFor((req,res)=>{
    res.writeHead(409,{'content-type':'application/json'});
    res.end(JSON.stringify({error:{code:'catalog_changed',message:'Review prices',definitive:true}}));
  });
  try {
    const backend=createBackend({url:server.url,publishableKey:'public-test'});
    await assert.rejects(backend.saveCheckout({}),e=>e.code==='catalog_changed'&&e.definitive===true);
  } finally {await server.close();}
  const backend=createBackend({url:server.url,publishableKey:'public-test'},50);
  await assert.rejects(backend.saveCheckout({}),e=>e.code==='save_failed'&&e.definitive===false);
});
test('catalog rejects malformed data rather than displaying unsafe prices',async()=>{
  const {createBackend}=await import('../assets/js/backend.js');
  const server=await serverFor((req,res)=>res.end(JSON.stringify([{id:'coffee',price:-1}])));
  try {
    await assert.rejects(createBackend({url:server.url,publishableKey:'public-test'}).loadProducts());
  } finally {await server.close();}
});
