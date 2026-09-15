// Real hosted pipeline replay. No mocked model calls, manual products or feedback.
// User-authorized participant test traffic; reports must exclude it from organic engagement.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const base = 'https://style.example';
const folder = '/workspace/demo/Downloads';
const output = path.resolve(process.env.ANGIE_TEST_OUTPUT || '../outputs/pipeline-replay-2026-09-07');
const limit = Number(process.env.ANGIE_TEST_LIMIT || 5);
const offset = Number(process.env.ANGIE_TEST_OFFSET || 0);
const code = process.env.ANGIE_TEST_CODE;
if (!code) throw new Error('ANGIE_TEST_CODE must be supplied; it is never saved.');
const files = (await readdir(folder)).filter(n => /^synthetic-reference.svg$/.test(n)).sort();
const ordered = [
 'synthetic-reference.svg',
 'synthetic-reference.svg',
 'synthetic-reference.svg',
 'synthetic-reference.svg',
 'synthetic-reference.svg',
 ...files,
].filter((n, i, a) => a.indexOf(n) === i && files.includes(n));
await mkdir(output, {recursive:true, mode:0o700});
const auth = await fetch(`${base}/api/access`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code}),signal:AbortSignal.timeout(20000)});
if (!auth.ok) throw new Error(`App sign-in failed (${auth.status}); no upload performed.`);
const role = (await auth.json()).role;
const cookie = auth.headers.get('set-cookie')?.split(';')[0];
if (!cookie || !['participant','admin'].includes(role)) throw new Error('No recognized authenticated session.');
console.log(JSON.stringify({event:'start',role,totalPhotos:ordered.length,offset,limit,output}));
const results = [];
for (const [i, filename] of ordered.entries()) {
 if (i < offset || i >= offset + limit) continue;
 const target = path.join(output, `case-${String(i+1).padStart(2,'0')}.json`);
 try { await readFile(target); console.log(JSON.stringify({event:'skip-existing',case:i+1})); continue; } catch {}
 const bytes = await readFile(path.join(folder,filename));
 const form = new FormData(); form.append('image',new Blob([bytes],{type:'image/jpeg'}),filename);
 const start = Date.now();
 console.log(JSON.stringify({event:'submitted',case:i+1,filename,at:new Date(start).toISOString()}));
 let status=0, body;
 try {
  const res = await fetch(`${base}/api/inspiration`,{method:'POST',headers:{Cookie:cookie},body:form,signal:AbortSignal.timeout(360000)});
  status=res.status; const content=await res.text();
  try {body=JSON.parse(content);} catch {body={error:'Non-JSON response',excerpt:content.slice(0,400)};}
 } catch (e) {body={error:e.name === 'TimeoutError' ? 'Client timeout after 360 seconds; server outcome unknown' : e.message};}
 const result={case:i+1,filename,imageSha256:crypto.createHash('sha256').update(bytes).digest('hex'),startedAt:new Date(start).toISOString(),elapsedMs:Date.now()-start,status,role,testTraffic:true,feedbackSubmitted:false,response:body};
 await writeFile(target,JSON.stringify(result,null,2),{mode:0o600}); results.push(result);
 console.log(JSON.stringify({event:'completed',case:i+1,status,seconds:Math.round(result.elapsedMs/1000),recommendationId:body.id,model:body.model,items:body.edits?.[0]?.items?.map(x=>({slot:x.slot,name:x.name})),missing:body.edits?.[0]?.missingSlots,error:body.error}));
}
console.log(JSON.stringify({event:'batch-finished',completed:results.length,successes:results.filter(x=>x.status===200).length,output}));
