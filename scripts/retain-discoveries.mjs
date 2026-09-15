// Promote all usable discoveries from real pipeline audit files, not manual
// product picks. Recheck exact retailer pages with production parsing; no AI calls.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'), require=createRequire(import.meta.url), modules=new Map();
function load(name) {
  if(name==='cloudflare:workers')return {env:{}};
  if(!name.startsWith('@/'))return require(name);
  const file=path.join(root,name.slice(2)+(path.extname(name)?'':'.ts'));
  if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file));
  if(modules.has(file))return modules.get(file).exports;
  const mod={exports:{}};modules.set(file,mod);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
    {module:mod,exports:mod.exports,require:load,Error,URL,TextEncoder,TextDecoder,Response,AbortSignal,fetch,console,process,setTimeout,clearTimeout,crypto});
  return mod.exports;
}
const {inspectProduct,productUrl}=load('@/lib/product-search');
const folder=path.resolve(root,'../outputs/live-image-suite');
const urls=new Set();
for(const dir of fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.includes('cache'))){
  for(const name of fs.readdirSync(path.join(folder,dir.name)).filter(n=>n.startsWith('WhatsApp Image')&&n.endsWith('.json'))){
    const run=JSON.parse(fs.readFileSync(path.join(folder,dir.name,name)));
    for(const step of run.trace||[])if(step.stage==='expanded-discovery')for(const p of step.details.products||[]){const url=productUrl(p.url);if(url)urls.add(url);}
  }
}
const retained=JSON.parse(fs.readFileSync(path.join(root,'data/discovered-products.json')));
const products=new Map(retained.products.map(p=>[p.canonicalUrl,p]));
for(const url of [...urls].slice(0,60)){
  const {product}=await inspectProduct(url);
  if(product?.imageSourceUrl){products.set(url,product);console.log('Retained',product.retailer,product.name);}
}
fs.writeFileSync(path.join(root,'data/discovered-products.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'Revalidated real pipeline discoveries',products:[...products.values()]},null,2)+'\n');
console.log(JSON.stringify({candidates:urls.size,retained:products.size,paidCalls:0}));
