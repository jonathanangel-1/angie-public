import fs from 'node:fs';
import path from 'node:path';
import { normalizeMassimoRows } from './catalog-sources/massimo-dutti.mjs';
const root=path.resolve(import.meta.dirname,'..');
const directory=path.resolve(root,'../outputs/live-image-suite/catalog-captures');
const target=path.join(root,'data/verified-catalog.json');
const catalog=JSON.parse(fs.readFileSync(target,'utf8'));
const products=new Map(catalog.products.map(p=>[p.id,p]));
let added=0,refreshed=0;
const captures=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
for(const capture of captures){
  if(!capture.sourcePage.startsWith('https://www.massimodutti.com/us/')||!Number.isFinite(Date.parse(capture.capturedAt)))throw new Error('Invalid capture');
  const rows=capture.records.map(row=>({...row,category:capture.category,sourcePage:capture.sourcePage}));
  const normalized=normalizeMassimoRows(rows,capture.capturedAt);
  for(const fresh of normalized){
    const old=products.get(fresh.id);
    const same=old?.canonicalUrl===fresh.canonicalUrl&&old?.imageSourceUrl===fresh.imageSourceUrl;
    const product={...fresh,...(same&&old.privateImageEvidence?{privateImageEvidence:old.privateImageEvidence}:{})};
    // Category visibility does not prove availability of any particular size.
    if(old?.availableSizes?.length&&same){product.availableSizes=old.availableSizes;product.sizeEvidence=old.sizeEvidence;}
    products.set(product.id,product);if(old)refreshed++;else added++;
  }
  console.log(JSON.stringify({source:capture.sourcePage,observed:rows.length,normalized:normalized.length}));
}
const result={...catalog,version:'angie-browser-catalog-v4',generatedAt:new Date().toISOString(),productCount:products.size,products:[...products.values()]};
fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({added,refreshed,total:products.size,byCategory:Object.fromEntries([...new Set(result.products.map(p=>p.category))].map(c=>[c,result.products.filter(p=>p.category===c).length]))}));
