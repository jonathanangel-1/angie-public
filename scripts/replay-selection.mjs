// Replay saved real provider evidence through current selection without another
// model call. This verifies ranking changes, not fresh stock or new retrieval.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'), require=createRequire(import.meta.url), modules=new Map();
function load(name){
  if(!name.startsWith('@/'))return require(name);
  const file=path.join(root,name.slice(2)+(path.extname(name)?'':'.ts'));
  if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file));
  if(modules.has(file))return modules.get(file).exports;
  const mod={exports:{}};modules.set(file,mod);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:mod,exports:mod.exports,require:load,Error,URL,TextEncoder,Response,console,crypto,fetch(){throw Error('Replay must stay offline');}});
  return mod.exports;
}
const input=path.resolve(process.argv[2]);
const run=JSON.parse(fs.readFileSync(input));
if(!run.productPool?.length)throw Error('Saved candidate product evidence is required');
const result=load('@/lib/inspiration-engine').buildCatalogRecommendations(run.intent,run.brief,run.memory,run.matches,run.productPool);
const report={mode:'offline-selection-replay',input,paidCalls:0,edits:result.edits};
fs.writeFileSync(input.replace(/\.json$/,'.replay.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({mode:report.mode,paidCalls:0,items:result.edits[0].items.map(p=>({name:p.name,url:p.officialUrl,quality:p.matchQuality})),missing:result.edits[0].missingSlots}));
