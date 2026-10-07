import test from 'node:test';
import assert from 'node:assert/strict';
const memory=()=>{const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const payload={requestId:'7541b9f1-3fd4-4fe0-b963-89c6cf175bc8',items:[{id:'coffee',qty:1,price:4500}],total:4500,method:'cash',cash:'45.00'};
const confirmed={items:[{id:'coffee',name:'Coffee',qty:1,price:4500,subtotal:4500}],total:4500};
test('pending checkout survives reload with the original request and confirmed order',async()=>{
  const {createSession}=await import('../assets/js/checkout-session.js');
  const storage=memory();
  createSession(storage).savePending(payload,confirmed);
  payload.cash='99.00';
  const restored=createSession(storage).load();
  assert.equal(restored.pending.cash,'45.00');
  assert.equal(restored.pending.requestId,'7541b9f1-3fd4-4fe0-b963-89c6cf175bc8');
  assert.equal(restored.confirmed.total,4500);
  payload.cash='45.00';
});
test('saved receipt replaces pending payment and new transaction clears recovery',async()=>{
  const {createSession}=await import('../assets/js/checkout-session.js');
  const storage=memory(),session=createSession(storage);
  session.savePending(payload,confirmed);
  const receipt={...confirmed,number:'TXN-SAVED',date:'2026-10-07T11:00:00Z',method:'Cash',paid:4500,change:0};
  session.saveReceipt(receipt);
  const restored=createSession(storage).load();
  assert.equal(restored.pending,null);
  assert.deepEqual(restored.receipt,receipt);
  session.clear();
  assert.equal(session.load(),null);
});
test('unavailable storage fails before a pending payment can be submitted',async()=>{
  const {createSession}=await import('../assets/js/checkout-session.js');
  const session=createSession({getItem:()=>null,setItem:()=>{throw Error('storage blocked');},removeItem:()=>{}});
  assert.throws(()=>session.savePending(payload,confirmed),/storage/i);
});
