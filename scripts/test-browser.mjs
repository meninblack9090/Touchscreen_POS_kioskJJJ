import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:process.env.KIOSK_BROWSER_CHANNEL||'chrome'}:{})});
const context=await browser.newContext({viewport:{width:1280,height:900}});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const evidence=[];
async function select(){
  await page.goto('http://127.0.0.1:8080');
  for(const id of ['coffee','sandwich','notebook','pen']) await page.locator('[data-action="add"][data-id="'+id+'"]').click();
  await page.locator('[data-action="summary"]').click();
  assert.ok(await page.locator('main').innerText().then(t=>t.includes('₱175.00')));
  await page.locator('[data-action="methods"]').click();
}
async function receipt(){
  await page.getByRole('heading',{name:'Payment successful!'}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('campus-corner.checkout.v1')).receipt);
  assert.equal(saved.total,17500);assert.equal(saved.paid-saved.change,17500);evidence.push(saved);
  await page.locator('[data-action="receipt"]').click();
  await page.getByRole('heading',{name:'Your digital receipt'}).waitFor();
  assert.ok((await page.locator('.receipt').innerText()).includes(saved.number));
  return saved;
}
async function next(){
  await page.locator('[data-action="reset"]').click();
  await page.locator('[data-action="add"][data-id="coffee"]').waitFor();
}
try{
  await select();await page.locator('[data-method="0"]').click();
  await page.locator('#cash').fill('174.99');await page.getByRole('button',{name:'Pay Now'}).click();
  assert.equal(await page.locator('#cash-error').innerText(),'Insufficient payment. Please enter at least ₱175.00.');
  await page.screenshot({path:'test-results/cash-insufficient.png',fullPage:true,animations:'disabled'});
  await page.locator('#cash').fill('175.00');await page.getByRole('button',{name:'Pay Now'}).click();
  const exact=await receipt();assert.equal(exact.change,0);
  await page.reload();await page.getByRole('heading',{name:'Your digital receipt'}).waitFor();await next();

  await select();await page.locator('[data-method="1"]').click();
  assert.ok(await page.getByAltText('QR code placeholder for simulated payment').isVisible());
  assert.ok((await page.locator('main').innerText()).includes('Scan the QR code using your supported payment application.'));
  await page.screenshot({path:'test-results/qr-payment.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Confirm Payment'}).click();
  const qr=await receipt();assert.equal(qr.paid,17500);assert.equal(qr.change,0);await next();

  await select();await page.locator('[data-method="2"]').click();
  await page.getByRole('button',{name:'Process Payment'}).click();
  assert.ok(await page.locator('#processing').isVisible());
  const card=await receipt();assert.equal(card.paid,17500);assert.equal(card.change,0);await next();

  let interrupted=true;const submitted=[];
  await page.route('**/functions/v1/checkout',async route=>{
    submitted.push(route.request().postDataJSON());
    const response=await route.fetch();
    if(interrupted){
      interrupted=false;
      await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'save_failed',message:'Connection interrupted. Please retry this payment.',definitive:false}})});
    }else await route.fulfill({response});
  });
  await select();await page.locator('[data-method="0"]').click();
  await page.locator('#cash').fill('200.00');await page.getByRole('button',{name:'Pay Now'}).click();
  await page.getByRole('button',{name:'Retry Payment'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[data-action="retry-payment"]').disabled);
  assert.ok(await page.locator('#cash').isDisabled());assert.ok(await page.locator('[data-action="change-method"]').isDisabled());
  await page.reload();await page.getByRole('button',{name:'Retry Payment'}).click();
  const recovered=await receipt();assert.equal(recovered.change,2500);
  assert.equal(submitted.length,2);assert.deepEqual(submitted[0],submitted[1]);
  await page.unroute('**/functions/v1/checkout');
  await page.screenshot({path:'test-results/saved-receipt.png',fullPage:true,animations:'disabled'});await next();

  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/mobile-catalog.png',fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await writeFile('test-results/browser-checkouts.json',JSON.stringify(evidence,null,2));
  console.log('PASS: browser cash rejection/exact payment, QR/card, saved receipt reload, interrupted-save recovery, and mobile layout. Saved 4 simulated orders.');
}finally{await context.close();await browser.close();}
