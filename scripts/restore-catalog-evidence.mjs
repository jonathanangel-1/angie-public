import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const file = new URL('../data/verified-catalog.json', import.meta.url);
const current = JSON.parse(fs.readFileSync(file));
const prior = JSON.parse(execFileSync('git', ['show', '591b56b:data/verified-catalog.json'], {maxBuffer: 30*1024*1024}));
let restored = 0;
for(const p of current.products){
  const old = prior.products.find(o=>o.id===p.id&&o.canonicalUrl===p.canonicalUrl&&o.imageSourceUrl===p.imageSourceUrl);
  if(!p.privateImageEvidence&&old?.privateImageEvidence?.sourceUrl===p.imageSourceUrl){
    p.privateImageEvidence=old.privateImageEvidence;
    if(old.visualEvidenceColorId) p.visualEvidenceColorId=old.visualEvidenceColorId;
    restored++;
  }
}
fs.writeFileSync(file, JSON.stringify(current, null, 2)+'\n');
console.log(JSON.stringify({restored}));
