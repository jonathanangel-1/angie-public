// Private QA only: product images never enter Angie's public interface.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const dir=path.resolve(process.argv[2]||path.join(root,'../outputs/live-image-suite/prototype-acceptance-v2'));
const index=JSON.parse(fs.readFileSync(path.join(root,'data/catalog-index.json'))).products;
const byId=new Map(index.map(p=>[p.id,p]));
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const rows=fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort().map(n=>JSON.parse(fs.readFileSync(path.join(dir,n)))).filter(x=>x.image);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1650,height:730},deviceScaleFactor:1});
try{
for(const [i,row] of rows.entries()){
  const source=fs.readFileSync(path.join('/workspace/demo/Downloads',row.image));
  const cards=(row.edits?.[0]?.items||[]).map(item=>{
    const product=byId.get(item.catalogId)||index.find(p=>p.canonicalUrl===item.officialUrl);
    const img=product?.imageDataUrl;
    return `<section>${img?`<img src="${img}">`:'<div class="missing">No cached product image</div>'}<h2>${esc(item.slot)} · ${esc(item.name)}</h2><p>${esc(item.recommendedSize)} · ${esc(item.sizeConfidence)}</p><p>${esc(item.sourceStatus)}</p></section>`;
  }).join('');
  await page.setContent(`<html><head><style>body{margin:0;background:#f4f2eb;font:15px Arial;color:#1b2520}header{padding:12px 18px;height:55px}h1{font-size:19px;margin:0 0 6px}main{display:flex;gap:12px;padding:0 12px}section{width:260px;background:white;padding:10px}section:first-child{width:295px}img,.missing{height:495px;width:100%;object-fit:contain}.missing{background:#ddd;display:grid;place-items:center}h2{font-size:16px;line-height:1.2}p{font-size:12px}</style></head><body><header><h1>${i+1}. ${esc(row.image)}</h1>${esc(row.status)} · Missing: ${esc(row.edits?.[0]?.missingSlots?.join(', ')||'none')} · Private QA, not approved</header><main><section><img src="data:image/jpeg;base64,${source.toString('base64')}"><h2>Original inspiration</h2></section>${cards}</main></body></html>`);
  await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))));
  await page.screenshot({path:path.join(dir,`private-review-${String(i+1).padStart(2,'0')}.png`),fullPage:true});
}
console.log(JSON.stringify({rendered:rows.length,directory:dir,privateOnly:true}));
}finally{await browser.close();}
