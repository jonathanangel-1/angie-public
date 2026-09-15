// Controlled local QA feedback, never participant data and never production.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const origin='http://localhost:3000';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
try {
  assert.equal((await context.request.post(origin+'/api/access',{data:{code:'demo-admin'}})).status(),200);
  const before=await (await context.request.get(origin+'/api/inspiration/memory')).json();assert.equal(before.mode,'test');
  await page.goto(origin);await page.getByRole('button',{name:'Saved looks',exact:true}).click();
  await page.getByRole('button',{name:'Open saved look 1',exact:true}).click();
  await page.getByRole('button',{name:'Love',exact:true}).click();
  await page.getByRole('button',{name:'Confirm Love',exact:true}).click();
  await page.getByRole('button',{name:'Find items',exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Saved looks',exact:true}).click();
  await page.getByRole('button',{name:'Open saved look 1',exact:true}).click();
  await page.getByText('Saved: Love',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Love',exact:true}).count(),0);
  const item=page.locator('.recommendation-item').first();
  await item.getByText('Ordered or tried it?',{exact:true}).click();
  await item.getByLabel('Update',{exact:true}).selectOption('tried');
  await item.getByLabel('Size',{exact:true}).fill('XS');
  await item.getByLabel('Fit',{exact:true}).selectOption('fits');
  await item.getByRole('button',{name:'Save update',exact:true}).click();
  await item.getByText('Saved.',{exact:true}).waitFor();
  await item.getByText('Size XS',{exact:true}).waitFor();
  await page.reload();await page.getByRole('button',{name:'Saved looks',exact:true}).click();
  await page.getByRole('button',{name:'Open saved look 1',exact:true}).click();
  await page.locator('.recommendation-item').first().getByText('Size XS',{exact:true}).waitFor();
  const after=await (await context.request.get(origin+'/api/inspiration/memory')).json();
  assert.equal(after.mode,'test');assert.equal(after.feedbackCount,before.feedbackCount+1);
  assert.ok(after.fitOutcomes.some(outcome=>outcome.size==='XS'&&outcome.fit==='fits'));
  const report={passed:true,qaOnly:true,realDatabase:true,confirmedReactionSurvivesReload:true,fitUpdatesGuidanceImmediatelyAndAfterReload:true};
  fs.writeFileSync(new URL('../../outputs/live-image-suite/browser-learning.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
