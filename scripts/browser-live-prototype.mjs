// Real upload, provider, storage and reload. Never submits reactions or fit outcomes.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const origin=process.env.ANGIE_TEST_ORIGIN||'http://localhost:3000';
const local=['localhost','127.0.0.1'].includes(new URL(origin).hostname);
if(!local && !(origin==='https://style.example' && process.env.ANGIE_TEST_PERSONAL_GENERATION==='1'))throw new Error('Hosted generation requires an explicitly authorized real inspiration; no synthetic feedback.');
const out=path.resolve(import.meta.dirname,`../../outputs/live-image-suite/${process.env.ANGIE_RUN || (local?'browser-prototype':'hosted-prototype')}`);fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  const login=await context.request.post(origin+'/api/access',{data:{code:process.env.ANGIE_TEST_CODE || 'demo-admin'}});assert.equal(login.status(),200);
  const memory=await (await context.request.get(origin+'/api/inspiration/memory')).json();assert.equal(memory.mode,local?'test':'personal');
  await page.goto(origin);await page.getByRole('button',{name:'Find items',exact:true}).waitFor();
  await page.getByLabel('Upload an inspiration image').setInputFiles(process.env.ANGIE_IMAGE_PATH || '/workspace/demo/Downloads/synthetic-reference.svg');
  const responsePromise=page.waitForResponse(r=>r.url()===origin+'/api/inspiration'&&r.request().method()==='POST',{timeout:180000});
  const started=Date.now();await page.getByRole('button',{name:'Find items',exact:true}).click();
  const response=await responsePromise;const result=await response.json();
  fs.writeFileSync(path.join(out,'response.json'),JSON.stringify({status:response.status(),elapsedMs:Date.now()-started,result},null,2));
  assert.equal(response.status(),200,result.error);assert.equal(result.memory.mode,memory.mode);
  assert.ok(result.searchMode.includes('expanded-discovery'), 'App uses broad per-garment discovery');
  if (process.env.ANGIE_MIN_ITEMS) assert.ok(result.edits[0].items.length >= Number(process.env.ANGIE_MIN_ITEMS), 'Expected garment coverage');
  await page.locator('.recommendation-item').first().waitFor();
  assert.equal(await page.locator('.recommendation-item img').count(),0);
  await page.screenshot({path:path.join(out,'mobile-result.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:'Saved looks',exact:true}).click();
  await page.getByRole('button',{name:'Open saved look 1',exact:true}).click();
  await page.locator('.recommendation-item').first().waitFor();
  assert.equal(await page.locator('.recommendation-item').count(),result.edits[0].items.length);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  const after=await (await context.request.get(origin+'/api/inspiration/memory')).json();
  assert.equal(after.feedbackCount,memory.feedbackCount);assert.equal(after.signalCount,memory.signalCount);
  assert.deepEqual(after.fitOutcomes,memory.fitOutcomes);
  console.log(JSON.stringify({passed:true,realProvider:true,realImage:true,qaOnly:local,personalFeedbackUnchanged:true,savedAfterReload:true,items:result.edits[0].items.map(x=>x.name),missing:result.edits[0].missingSlots,report:out}));
}finally{await context.close();await browser.close();}
