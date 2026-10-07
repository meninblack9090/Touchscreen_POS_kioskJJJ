import test from 'node:test';
import assert from 'node:assert/strict';

// Removing strict decimal parsing would accept invalid cash or round payments.
test('cash accepts exact decimal amounts and rejects invalid input', async () => {
  const { parseCash } = await import('../assets/js/validation.js');
  for (const [raw, want] of [['175',17500],['175.00',17500],['200.01',20001],[' 0.00 ',0],['1.2',120]]) {
    assert.equal(parseCash(raw), want);
  }
  for (const raw of ['', ' ', '-1', '+1', '1e2', 'NaN', 'Infinity', '1.234', '175abc', '0x10', '999999999.01', null, 175]) {
    assert.equal(parseCash(raw), null, String(raw));
  }
});

test('checkout normalizes cash and sorts items for identical retries', async () => {
  const { normalizeCheckout } = await import('../assets/js/validation.js');
  const input = {
    requestId:'d756d72a-9816-49e3-bf29-dc115c161017',
    items:[{id:'sandwich',qty:2,price:5000},{id:'coffee',qty:1,price:4500}],
    total:14500,method:'cash',cash:'200.00'
  };
  const result=normalizeCheckout(input);
  assert.equal(result.paid,20000);
  assert.equal(result.items[0].id,'coffee');
  assert.deepEqual(result,normalizeCheckout({...input,cash:'200',items:[...input.items].reverse()}));
  for (const changed of [
    {cash:''},{cash:'-1'},{cash:'1e5'},{method:'bank'}, {total:-1}, {total:1.5},
    {requestId:'guess'}, {items:[]}, {items:[{id:'coffee',qty:0,price:4500}]},
    {items:[{id:'coffee',qty:1000,price:4500}]},
    {items:[{id:'coffee',qty:1.5,price:4500}]},
    {items:[{id:'coffee',qty:1,price:4500},{id:'coffee',qty:1,price:4500}]}
  ]) assert.throws(()=>normalizeCheckout({...input,...changed}));
});

test('simulated QR and card do not trust a submitted amount paid', async () => {
  const { normalizeCheckout } = await import('../assets/js/validation.js');
  const input={requestId:'d756d72a-9816-49e3-bf29-dc115c161017',items:[{id:'coffee',qty:1,price:4500}],total:4500};
  for (const method of ['qr','card']) {
    const result=normalizeCheckout({...input,method,paid:1,cash:'1'});
    assert.equal(result.paid,null);
    assert.equal(result.method,method);
  }
});
