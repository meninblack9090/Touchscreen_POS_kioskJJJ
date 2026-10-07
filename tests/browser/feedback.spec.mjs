import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const products=JSON.parse(readFileSync(new URL('../fixtures/catalog.json',import.meta.url),'utf8'));
const transactionNumber='TXN-8A488B4C-7CA6-4E17-8824-AB3C91226FBA';
async function form(page,options={}) {
 const requests=[];
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/functions/v1/kiosk/**',async route=>{
  const req=route.request();if(req.url().endsWith('/products'))return route.fulfill({json:{products}});
  const b=req.postDataJSON();
  if(req.url().endsWith('/feedback')) {
   requests.push(b);if(options.delay)await new Promise(r=>setTimeout(r,options.delay));
   if(options.lost&&requests.length===1)return route.abort('failed');
   if(options.invalidResponse)return route.fulfill({json:{feedback:{}}});
   return route.fulfill({json:{feedback:{...b,date:'2026-10-07T12:00:00Z'}}});
  }
  const p=products.find(p=>p.id==='coffee');return route.fulfill({json:{receipt:{number:transactionNumber,date:'2026-10-07T12:00:00Z',method:'Cash',items:[{...p,qty:1,subtotal:4500}],total:4500,paid:4500,change:0}}});
 });
 await page.goto('/');await page.locator('button[data-action="add"][data-id="coffee"]').first().click();await page.getByRole('button',{name:/Proceed to Order Summary/}).click();await page.getByRole('button',{name:/Continue to Payment/}).click();await page.locator('[data-method="0"]').click();await page.getByLabel('Amount Paid',{exact:true}).fill('45');await page.getByRole('button',{name:/Pay Now/}).click();await page.getByRole('button',{name:/View Receipt/}).click();await page.getByRole('button',{name:/Leave Feedback/}).click();return requests;
}
async function fill(page) {await page.locator('input[name="rating"][value="5"]').check({force:true});await page.getByLabel(/Anything else to share/).fill(' Helpful kiosk! ');}
test('feedback requires a rating and skip writes nothing',async({page})=>{const calls=await form(page);await page.getByRole('button',{name:/Submit Feedback/}).click();await expect(page.locator('#feedback-error')).toContainText('Choose a rating');expect(calls).toHaveLength(0);await page.getByRole('button',{name:/Skip Feedback/}).click();await expect(page.getByRole('heading',{name:'Thanks for stopping by!'})).toBeVisible();expect(calls).toHaveLength(0);});
test('feedback waits for saved response and prevents repeated submissions',async({page})=>{const calls=await form(page,{delay:800});await fill(page);await page.getByRole('button',{name:/Submit Feedback/}).click();await expect(page.getByRole('button',{name:/Saving feedback/})).toBeDisabled();await expect(page.getByRole('heading',{name:'Thanks for your feedback!'})).not.toBeVisible();await expect(page.getByRole('button',{name:/Skip Feedback/})).toBeDisabled();await expect(page.getByRole('heading',{name:'Thanks for your feedback!'})).toBeVisible();expect(calls).toEqual([{transactionNumber,rating:5,comment:'Helpful kiosk!'}]);expect(await page.evaluate(()=>localStorage.getItem('triple-j-customer-feedback'))).toBeNull();await page.getByRole('button',{name:/New Transaction/}).click();await expect(page.locator('#cart-total')).toContainText('₱0.00');});
test('feedback keeps its original submission on a lost response and retries safely',async({page})=>{const calls=await form(page,{lost:true});await fill(page);await page.getByRole('button',{name:/Submit Feedback/}).click();await expect(page.getByRole('button',{name:/Retry Feedback/})).toBeVisible();await expect(page.getByLabel(/Anything else to share/)).toHaveValue(' Helpful kiosk! ');await expect(page.getByLabel(/Anything else to share/)).toBeDisabled();await page.getByRole('button',{name:/Retry Feedback/}).click();await expect(page.getByRole('heading',{name:'Thanks for your feedback!'})).toBeVisible();expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);});
test('feedback rejects an invalid saved response',async({page})=>{await form(page,{invalidResponse:true});await fill(page);await page.getByRole('button',{name:/Submit Feedback/}).click();await expect(page.getByRole('button',{name:/Retry Feedback/})).toBeVisible();await expect(page.locator('#feedback-error')).toContainText('Unable to verify');await expect(page.getByRole('heading',{name:'Thanks for your feedback!'})).not.toBeVisible();});
