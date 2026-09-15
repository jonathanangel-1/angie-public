// Offline adversarial checks: intentionally overconfident model scores must
// never erase observed conflicts. These are fixtures, not visual acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), modules = new Map();
function load(name) {
  if (!name.startsWith('@/')) return require(name);
  if (modules.has(name)) return modules.get(name).exports;
  const file = new URL('../' + name.slice(2) + (name.endsWith('.json') ? '' : '.ts'), import.meta.url);
  if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(file));
  const loadedModule = {exports:{}}; modules.set(name,loadedModule);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
    {module:loadedModule,exports:loadedModule.exports,require:load,Error,URL,TextEncoder,crypto,Response,console,fetch:()=>{throw new Error('Offline test attempted network');}}, {filename:file.pathname});
  return loadedModule.exports;
}
const evidence = load('@/lib/garment-evidence');
const engine = load('@/lib/inspiration-engine');
const {SearchBudget} = load('@/lib/search-budget');
const memory={mode:'test',feedbackCount:0,signalCount:0,likes:[],avoidances:[],recentNotes:[]};
const features = values => evidence.cleanEvidence(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{value:v,confidence:'high'}])));
const expected=features({silhouette:'fitted',sleeve:'three-quarter',neckline:'v',colorFamily:'white',surface:'plain'});
const target={slot:'top',category:'top',subtype:'tee',colorFamily:'white',silhouette:'fitted',length:'unknown',rise:null,neckline:'v',sleeve:'three-quarter',material:null,details:[],importance:5,evidence:expected};
const intent={scope:'single-item',requestedCategory:'top',requestedSubtype:'tee',occasion:'casual',palette:['white'],silhouettes:['fitted'],avoid:[],keywords:[],garments:[target]};
const brief={title:'Fixture',observed:'',preserve:[],adapt:[]};
const product={id:'test',retailerProductId:'test',retailer:'Massimo Dutti',canonicalUrl:'https://www.massimodutti.com/us/test-l01234567',verifiedAt:new Date().toISOString(),status:'active',name:'Test tee',category:'top',subtype:'tee',imageUrl:'',price:null,color:'white',attributes:{}};
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const sources = load('@/lib/retailer-sources');
check('expanded sources preserve exact US routes and strip tracking', () => {
  assert.equal(sources.canonicalProductUrl('https://www.llbean.com/llb/shop/51558?attrValue_0=White&page=beans-tee&utm_source=test'), 'https://www.llbean.com/llb/shop/51558?attrValue_0=White');
  assert.equal(sources.canonicalProductUrl('https://cottonon.com/US/demo-v-neck-3%2F4-sleeve/9000001-01.html?utm_source=test'), 'https://cottonon.com/US/demo-v-neck-3%2F4-sleeve/9000001-01.html');
  assert.equal(sources.canonicalProductUrl('https://cottoncitizen.com/products/demo-v-neck-shirt-white?variant=123&utm_source=test'), 'https://cottoncitizen.com/products/demo-v-neck-shirt-white?variant=123');
});
check('expanded discovery rejects wrong countries, category pages and untrusted hosts', () => {
  for (const url of ['https://cottonon.com/AU/demo-top/9000001-01.html', 'https://cottoncitizen.com/collections/tops', 'https://cottoncitizen.com.evil.test/products/top', 'https://localhost/products/top', 'https://user:contact-d74ff0ee@company-b2757dcf.example/products/top']) assert.equal(sources.canonicalProductUrl(url), null);
});
check('contradictory retailer colour selectors cannot become a different product', () => {
  const base = 'https://cottonon.com/US/demo-v-neck/9000002-02.html';
  assert.equal(sources.canonicalProductUrl(base + '?dwvar_9000002-02_color=2062142-07'), null);
  assert.equal(sources.canonicalProductUrl(base + '?dwvar_9000002-02_color=9000002-02'), base);
});
check('product image evidence stays within the merchant CDN boundary', () => {
  const p = 'https://cottoncitizen.com/products/test';
  assert.equal(sources.trustedProductImage('https://cdn.shopify.com/image.jpg', p), 'https://cdn.shopify.com/image.jpg');
  assert.equal(sources.trustedProductImage('https://localhost/image.jpg', p), '');
  assert.equal(sources.trustedProductImage('https://cottonon.com/image.jpg', p), '');
});
check('preferred search remains two stores until expanded mode is requested', () => {
  assert.equal(sources.discoveryDomains('preferred').length, 2);
  assert.equal(sources.discoveryDomains('expanded').length, 8);
});
check('a new retailer never inherits an Aritzia or Massimo size anchor', () => {
  const { productFit } = load('@/lib/product-fit');
  const result = productFit({...product,retailer:'Cotton On'}, memory);
  assert.equal(result.size, 'Check size chart'); assert.equal(result.confidence, 'Low');
});
function recommend(actual,score=99,overrides={}) {
  return engine.buildCatalogRecommendations(intent,brief,memory,[{candidateId:'test',targetSlot:'top',score,reason:'Deliberately inflated fixture score',hardConflict:false,majorProportionMismatch:false,evidence:actual}], [{...product,...overrides}]);
}
for (const [field,value] of [['sleeve','short'],['sleeve','sleeveless'],['silhouette','relaxed'],['silhouette','bodycon'],['neckline','crew'],['colorFamily','camel'],['surface','lace'],['surface','floral']]) {
  check(`99 score cannot rescue conflicting ${field}=${value}`,()=>assert.throws(()=>recommend({...expected,[field]:{value,confidence:'high'}}),/No verified/));
}
check('near sleeve length and ivory shade remain usable',()=>assert.equal(recommend({...expected,sleeve:{value:'long',confidence:'high'},colorFamily:{value:'pale-neutral',confidence:'high'}}).edits[0].items.length,1));
check('uncertain product evidence is labelled Alternative, never silently close',()=>assert.equal(recommend({...expected,sleeve:{value:'unknown',confidence:'unknown'}}).edits[0].items[0].matchQuality,'alternative'));
check('three missing defining properties cannot earn a close match',()=>assert.throws(()=>recommend(features({colorFamily:'white',surface:'plain'})),/No verified/));
check('unknown inspiration length cannot penalize a visible product hem',()=>assert.equal(recommend({...expected,length:{value:'longline',confidence:'high'}}).edits[0].items.length,1));
check('hidden hem and waist erase invented pooling, full length and rise',()=>{
  const g=evidence.groundedGarment({...target,category:'bottom',length:'full length',rise:'high',details:['subtle pooling at hem','front fly implied','plain fabric'],evidence:features({length:'full'}),visibility:{hem:'hidden',waist:'hidden',neckline:'hidden',sleeveEnds:'hidden'}});
  assert.equal(g.length,'unknown');assert.equal(g.rise,null);assert.deepEqual(JSON.parse(JSON.stringify(g.details)),['plain fabric']);
});
check('confirmed taste cannot rescue a visibly wrong garment',()=>{
  const bad={...expected,sleeve:{value:'short',confidence:'high'}};
  assert.throws(()=>engine.buildCatalogRecommendations(intent,brief,{...memory,likes:[{type:'product',value:'test',weight:100}]},[{candidateId:'test',targetSlot:'top',score:100,reason:'',evidence:bad}],[product]),/No verified/);
});
check('images remain absent from the customer result',()=>assert.equal(recommend(expected).edits[0].items[0].imageUrl,''));
check('retailer relaxed-fit description cannot be labelled a close fitted match', () => {
  const result = recommend(expected, 99, {attributes:{publicDescription:'Cut for a flattering, relaxed fit.'}}).edits[0].items[0];
  assert.equal(result.matchQuality, 'alternative');
  assert.ok(result.matchDifferences.some(text => text.includes('looser fit')));
});
check('API score below close range is explicitly an alternative',()=>assert.equal(recommend(expected,61).edits[0].items[0].matchQuality,'alternative'));
check('medium-confidence product cut is an alternative even at score 99',()=>assert.equal(recommend({...expected,silhouette:{value:'fitted',confidence:'medium'}}).edits[0].items[0].matchQuality,'alternative'));
check('an uncertain adjacent cut is not treated as a definite contradiction',()=>assert.equal(recommend({...expected,silhouette:{value:'relaxed',confidence:'medium'}},68).edits[0].items[0].matchQuality,'alternative'));
check('uncertain ease never overrides a visible major proportion mismatch',()=>assert.throws(()=>engine.buildCatalogRecommendations(intent,brief,memory,[{candidateId:'test',targetSlot:'top',score:90,reason:'',hardConflict:false,majorProportionMismatch:true,evidence:{...expected,silhouette:{value:'relaxed',confidence:'medium'}}}],[product]),/No verified/));
check('uncertain inspiration shape stays uncertain in search and result',()=>{
  const g=evidence.groundedGarment({...target,evidence:{...expected,silhouette:{value:'wide',confidence:'medium'}},visibility:{hem:'clear',waist:'clear',sleeveEnds:'clear',neckline:'clear'},details:['high rise implied','plain fabric']});
  assert.equal(g.silhouette,'unknown');assert.deepEqual(JSON.parse(JSON.stringify(g.details)),['plain fabric']);
  const r=engine.buildCatalogRecommendations({...intent,garments:[g]},brief,memory,[{candidateId:'test',targetSlot:'top',score:99,reason:'',evidence:expected}],[product]);
  assert.equal(r.edits[0].items[0].matchQuality,'alternative');
});
check('explicit text sleeves and length survive without image visibility',()=>{
  const g=evidence.groundedGarment({...target,evidence:{...expected,length:{value:'hip',confidence:'high'}},visibility:{hem:'hidden',waist:'hidden',sleeveEnds:'hidden',neckline:'hidden'}},false);
  assert.equal(g.sleeve,'three-quarter');assert.equal(g.neckline,'v');assert.equal(g.length,'hip');
});
check('cross-taxonomy feature matches enter the first shortlist',()=>{
  const wrong=Array.from({length:30},(_,i)=>({...product,id:'wrong-'+i,imageSourceUrl:'https://static.massimodutti.net/'+i+'.jpg',attributes:{silhouette:'relaxed',sleeve:'short',neckline:'v',colorFamily:'white'}}));
  const knit={...product,id:'fine-knit',name:'Fine knit sweater',subtype:'knit',imageSourceUrl:'https://static.massimodutti.net/knit.jpg',attributes:{silhouette:'fitted',sleeve:'long',neckline:'v',colorFamily:'cream'}};
  const scores=new Map(wrong.map(p=>['top:'+p.id,1]));scores.set('top:fine-knit',0);
  assert.ok(engine.prepareVisualCandidates(intent,memory,[...wrong,knit],scores,10).some(c=>c.id==='fine-knit'));
});
const failure=load('@/lib/inspiration-failure').classifyInspirationFailure;
check('budget and visual-provider failures never masquerade as inventory misses',()=>{
  assert.equal(failure('Search budget: limit reached').code,'search-budget-limit');
  assert.equal(failure('OpenAI visual match 429: no credits remaining').code,'service-credits-exhausted');
  assert.equal(failure('OpenAI visual match 401: unauthorized').code,'service-configuration');
});
const request={method:'POST',body:JSON.stringify({model:'gpt-5.4-2026-03-05',max_output_tokens:1000,input:'test'})};
let network=0;
const transport=async()=>{network++;return Response.json({status:'completed',output:[],usage:{input_tokens:100,cached_tokens:0,output_tokens:10}});};
const tiny=new SearchBudget({maxUsd:0.001,transport});
await assert.rejects(()=>tiny.fetch('test')('https://api.openai.com/v1/responses',request),/Search budget/);
check('spend guard blocks before sending the paid request',()=>assert.equal(network,0));
let release;
const concurrent=new SearchBudget({maxUsd:0.02,transport:()=>new Promise(resolve=>{release=()=>resolve(Response.json({usage:{input_tokens:100,output_tokens:10}}));})});
const first=concurrent.fetch('first')('https://api.openai.com/v1/responses',request);
await assert.rejects(()=>concurrent.fetch('second')('https://api.openai.com/v1/responses',request),/Search budget/);release();await first;
check('parallel calls reserve the same shared allowance safely',()=>assert.equal(concurrent.snapshot().calls,1));
const cacheMap=new Map(), cache={get:async k=>cacheMap.get(k)||null,put:async(k,v)=>cacheMap.set(k,v)};
const cached=new SearchBudget({cache,transport});await cached.fetch('test')('https://api.openai.com/v1/responses',request);await cached.fetch('test')('https://api.openai.com/v1/responses',request);
check('identical requests reuse evidence without paying again',()=>{assert.equal(cached.snapshot().calls,1);assert.equal(cached.snapshot().cacheHits,1);});
await cached.fetch('test')('https://api.openai.com/v1/responses',{...request,body:request.body.replace('input":"test','input":"different')});
check('changed inspiration or prompt misses the cache',()=>assert.equal(cached.snapshot().calls,2));
const webRequest={method:'POST',body:JSON.stringify({model:'gpt-5.4-mini-2026-03-17',max_output_tokens:1000,max_tool_calls:1,tools:[{type:'web_search'}],input:'white tee'})};
const webCache=new Map(),webBudget=new SearchBudget({cache:{get:async k=>webCache.get(k)||null,put:async(k,v)=>webCache.set(k,v)},transport});
await webBudget.fetch('discovery')('https://api.openai.com/v1/responses',webRequest);
await webBudget.fetch('discovery')('https://api.openai.com/v1/responses',webRequest);
check('repeated discovery reuses its recent sources without a second paid search',()=>assert.equal(webBudget.snapshot().calls,1));
for(const value of webCache.values())value.createdAt=Date.now()-61*60*1000;
await webBudget.fetch('discovery')('https://api.openai.com/v1/responses',webRequest);
check('discovery cache expires after one hour',()=>assert.equal(webBudget.snapshot().calls,2));
const failed=new SearchBudget({maxUsd:0.02,transport:async()=>{throw new Error('timeout');}});
await assert.rejects(()=>failed.fetch('test')('https://api.openai.com/v1/responses',request),/timeout/);
await assert.rejects(()=>failed.fetch('retry')('https://api.openai.com/v1/responses',request),/Search budget/);
check('uncertain failures retain their cost reservation',()=>assert.equal(failed.snapshot().rows[0].uncertain,true));
console.log(`${checks} evidence and spending checks passed.`);
