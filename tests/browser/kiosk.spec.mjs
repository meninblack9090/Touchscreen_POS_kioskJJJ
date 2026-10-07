import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const products=JSON.parse(fs.readFileSync(new URL('../fixtures/catalog.json',import.meta.url),'utf8'));
async function setup(page, options={}) {
  const requests=[];
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/functions/v1/kiosk/**',async route=>{
    const req=route.request();
    if(req.url().endsWith('/products')) {
      await route.fulfill({status:options.catalogFailure?503:200,json:options.catalogFailure?{error:{code:'CATALOG_UNAVAILABLE',message:'Products could not be loaded. Please retry.'}}:{products}});return;
    }
    const body=req.postDataJSON();requests.push(body);
    if(options.delay) await new Promise(r=>setTimeout(r,options.delay));
    if(options.lostResponse && requests.length===1) {await route.abort('failed');return;}
    if(options.authOnRetry && requests.length===2) {await route.fulfill({status:401,json:{error:{code:'UNAUTHORIZED',message:'A valid publishable API key is required.'}}});return;}
    if(options.nullReceipt && requests.length===1) {await route.fulfill({json:null});return;}
    if(options.failure) {await route.fulfill({status:422,json:{error:{code:'INVALID_PAYMENT',message:'Payment was rejected.'}}});return;}
    if(options.priceChanged) {await route.fulfill({status:409,json:{error:{code:'TOTAL_CHANGED',message:'Product prices have changed. Please review your order before paying.'}}});return;}
    const items=body.items.map(i=>{const p=products.find(p=>p.id===i.id);return {...p,qty:i.qty,subtotal:p.price*i.qty};});
    const total=items.reduce((sum,p)=>sum+p.subtotal,0),paid=body.method==='Cash'?Math.round(Number(body.cash)*100):total;
    await route.fulfill({json:{receipt:{number:'TXN-SAVED-BY-SUPABASE',date:'2026-10-07T12:00:00Z',items,total,paid,change:paid-total,method:body.method}}});
  });
  await page.goto('/');
  return requests;
}
async function payment(page,method='Cash') {
  for(const id of ['coffee','sandwich','soda','cookies','water']) await page.locator('button[data-action="add"][data-id="'+id+'"]').first().click();
  await page.getByRole('button',{name:/Proceed to Order Summary/}).click();
  await page.getByRole('button',{name:/Continue to Payment/}).click();
  await page.locator('button[data-action="method"]').filter({has:page.getByText(method,{exact:true})}).click();
}
for(const [input,message] of [['','Enter the amount paid.'],['hello','Invalid payment.'],['-1','Invalid payment.'],['175.001','Invalid payment.'],['1e3','Invalid payment.'],['174.99','Insufficient payment. Please enter at least ₱175.00.']]) {
  test('cash rejects '+JSON.stringify(input)+' and stays on payment',async({page})=>{
    const requests=await setup(page);await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill(input);await page.getByRole('button',{name:/Pay Now/}).click();
    await expect(page.getByRole('heading',{name:'Pay with cash'})).toBeVisible();await expect(page.locator('#cash-error')).toContainText(message);expect(requests).toHaveLength(0);
  });
}
for(const [amount,change] of [['175.00','₱0.00'],['200.00','₱25.00']]) {
  test('cash '+amount+' uses saved receipt and change '+change,async({page})=>{
    const requests=await setup(page);await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill(amount);await page.getByRole('button',{name:/Pay Now/}).click();
    await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();await expect(page.getByText('TXN-SAVED-BY-SUPABASE',{exact:true})).toBeVisible();expect(requests).toHaveLength(1);
    await page.getByRole('button',{name:/View Receipt/}).click();await expect(page.locator('.detail').filter({has:page.getByText('Change',{exact:true})})).toContainText(change);
    await page.getByRole('button',{name:/New Transaction/}).click();await expect(page.locator('#cart-total')).toHaveText('₱0.00');await expect(page.getByText('TXN-SAVED-BY-SUPABASE',{exact:true})).toHaveCount(0);
  });
}
test('QR shows instructions and saved exact payment',async({page})=>{
  const requests=await setup(page);await payment(page,'QR Payment');await expect(page.getByAltText('QR code placeholder for simulated payment')).toBeVisible();await expect(page.getByText('Scan the QR code using your supported payment application.')).toBeVisible();await page.getByRole('button',{name:/Confirm Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();expect(requests).toHaveLength(1);await page.getByRole('button',{name:/View Receipt/}).click();await expect(page.locator('.detail').filter({has:page.getByText('Change',{exact:true})})).toContainText('₱0.00');
});
test('card locks actions while processing, then saves',async({page})=>{
  const requests=await setup(page,{delay:300});await payment(page,'Credit/Debit Card');await expect(page.getByText('Please tap, insert, or swipe your card.')).toBeVisible();await page.getByRole('button',{name:/Process Payment/}).click();await expect(page.getByText('Processing payment...',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/Change Payment Method/})).toBeDisabled();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();expect(requests).toHaveLength(1);
});
test('unavailable catalog has retry control',async({page})=>{await setup(page,{catalogFailure:true});await expect(page.getByRole('button',{name:/Retry/})).toBeVisible();await expect(page.getByRole('button',{name:/Proceed to Order Summary/})).toHaveCount(0);});
test('failed save stays on payment and shows rejection',async({page})=>{await setup(page,{failure:true});await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.getByRole('heading',{name:'Pay with cash'})).toBeVisible();await expect(page.getByText('Payment was rejected.')).toBeVisible();});
test('lost response retries identical request and locks order editing',async({page})=>{
  const requests=await setup(page,{lostResponse:true});await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible();await expect(page.getByRole('button',{name:/Change Payment Method/})).toBeDisabled();await expect(page.getByLabel('Amount Paid',{exact:true})).toBeDisabled();await page.getByRole('button',{name:/Retry Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
});
test('changed database total requires another order review',async({page})=>{
  await setup(page,{priceChanged:true});await payment(page,'QR Payment');await page.getByRole('button',{name:/Confirm Payment/}).click();await expect(page.getByRole('heading',{name:'Your order summary'})).toBeVisible();await expect(page.getByRole('alert')).toContainText('Product prices have changed');
});

test('unresolved payment keeps original ID through an authorization failure on retry',async({page})=>{
  const requests=await setup(page,{lostResponse:true,authOnRetry:true});await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible();
  await page.getByRole('button',{name:/Retry Payment/}).click();await expect(page.getByText('A valid publishable API key is required.')).toBeVisible();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible();await expect(page.getByLabel('Amount Paid',{exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/Retry Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();expect(requests).toHaveLength(3);expect(requests[1]).toEqual(requests[0]);expect(requests[2]).toEqual(requests[0]);
});
test('malformed success response remains unresolved and can recover the receipt',async({page})=>{
  const requests=await setup(page,{nullReceipt:true});await payment(page,'QR Payment');await page.getByRole('button',{name:/Confirm Payment/}).click();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible();await page.getByRole('button',{name:/Retry Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible();expect(requests[1]).toEqual(requests[0]);
});
test('checkout is not submitted when recovery storage is unavailable',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage blocked','QuotaExceededError');};});
  const requests=await setup(page);await payment(page);await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.getByRole('heading',{name:'Pay with cash'})).toBeVisible();await expect(page.locator('#cash-error')).toContainText('cannot save payment recovery information');expect(requests).toHaveLength(0);
});
