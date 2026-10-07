import {test,expect} from '@playwright/test';
import {appendFile,mkdir} from 'node:fs/promises';
let requestIds=[];
test.beforeEach(async({page})=>{
  requestIds=[];
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());
  await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/kiosk/checkout')) requestIds.push(r.postDataJSON().requestId);});
});
test.afterEach(async()=>{await mkdir('.superpowers',{recursive:true});await appendFile('.superpowers/live-request-ids.txt',requestIds.join('\n')+'\n');});
async function selectPayment(page,method) {
  await page.goto('/');
  for(const id of ['coffee','sandwich','soda','cookies','water']) await page.locator('button[data-action="add"][data-id="'+id+'"]').first().click();
  await page.getByRole('button',{name:/Proceed to Order Summary/}).click();await page.getByRole('button',{name:/Continue to Payment/}).click();await page.locator('button[data-action="method"]').filter({has:page.getByText(method,{exact:true})}).click();
  await expect(page.locator('.amount-box')).toContainText('₱175.00');
}
for(const method of ['Cash','QR Payment','Credit/Debit Card']) test('live browser '+method+' reaches a saved receipt',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await selectPayment(page,method);
  if(method==='Cash') {
    await page.getByLabel('Amount Paid',{exact:true}).fill('174.99');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.locator('#cash-error')).toHaveText('Insufficient payment. Please enter at least ₱175.00.');expect(requestIds).toHaveLength(0);
    await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();
  } else await page.getByRole('button',{name:method==='QR Payment'?/Confirm Payment/:/Process Payment/}).click();
  await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible({timeout:15000});expect(requestIds).toHaveLength(1);
  await page.getByRole('button',{name:/View Receipt/}).click();await expect(page.locator('.detail').filter({has:page.getByText('Change',{exact:true})})).toContainText('₱0.00');await expect(page.locator('.cart-total')).toContainText('₱175.00');
  if(method==='QR Payment') {await page.setViewportSize({width:390,height:844});await page.locator('main > section').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));await page.screenshot({path:'.superpowers/receipt-mobile.png',fullPage:true});}
  expect(errors).toEqual([]);
});
test('live browser recovers a committed payment after lost response and reload',async({page})=>{
  let lost=true;
  await page.route('**/functions/v1/kiosk/checkout',async route=>{
    const upstream=await route.fetch();expect(upstream.status()).toBe(200);
    if(lost){lost=false;await route.abort('failed');}else await route.fulfill({response:upstream});
  });
  await selectPayment(page,'Cash');await page.getByLabel('Amount Paid',{exact:true}).fill('175.00');await page.getByRole('button',{name:/Pay Now/}).click();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible({timeout:15000});
  await page.reload();await expect(page.getByRole('button',{name:/Retry Payment/})).toBeVisible();await expect(page.locator('.amount-box')).toContainText('₱175.00');await page.getByRole('button',{name:/Retry Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible({timeout:15000});expect(requestIds).toHaveLength(2);expect(requestIds[1]).toBe(requestIds[0]);
});

for(const lostResponse of [false,true]) test('live feedback '+(lostResponse?'recovers a saved submission after lost response':'saves to Supabase'),async({page})=>{
 const feedbackRequests=[];let lose=lostResponse;
 page.on('request',r=>{if(r.url().endsWith('/kiosk/feedback'))feedbackRequests.push(r.postDataJSON());});
 if(lostResponse)await page.route('**/functions/v1/kiosk/feedback',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);if(lose){lose=false;await route.abort('failed');}else await route.fulfill({response});});
 await selectPayment(page,'QR Payment');await page.getByRole('button',{name:/Confirm Payment/}).click();await expect(page.getByRole('heading',{name:'Payment successful!'})).toBeVisible({timeout:15000});await page.getByRole('button',{name:/View Receipt/}).click();const number=await page.locator('.receipt .reference').innerText();await page.getByRole('button',{name:/Leave Feedback/}).click();await page.locator('input[name="rating"][value="5"]').check({force:true});await page.getByLabel(/Anything else to share/).fill('Automated live browser feedback test');await page.getByRole('button',{name:/Submit Feedback/}).click();
 if(lostResponse){await expect(page.getByRole('button',{name:/Retry Feedback/})).toBeVisible({timeout:15000});await expect(page.getByLabel(/Anything else to share/)).toBeDisabled();await page.getByRole('button',{name:/Retry Feedback/}).click();}
 await expect(page.getByRole('heading',{name:'Thanks for your feedback!'})).toBeVisible({timeout:15000});expect(feedbackRequests).toHaveLength(lostResponse?2:1);expect(feedbackRequests[0]).toEqual({transactionNumber:number,rating:5,comment:'Automated live browser feedback test'});if(lostResponse)expect(feedbackRequests[1]).toEqual(feedbackRequests[0]);await page.getByRole('button',{name:/New Transaction/}).click();await expect(page.locator('#cart-total')).toContainText('₱0.00');
});
