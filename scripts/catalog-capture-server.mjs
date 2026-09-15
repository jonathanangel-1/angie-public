// Local-only handoff for ordinary browser DOM captures. Never used by Angie.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const directory=path.resolve(import.meta.dirname,'../../outputs/live-image-suite/catalog-captures');
fs.mkdirSync(directory,{recursive:true});
const page=`<!doctype html><title>Local catalog capture</title><h1>Local catalog capture</h1><form><textarea aria-label="Retailer snapshot" style="width:90%;height:200px"></textarea><button>Save snapshot</button></form><p role="status"></p><script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const r=await fetch('/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:document.querySelector('textarea').value});document.querySelector('[role=status]').textContent=await r.text();};</script>`;
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html');return res.end(page);}
  if(req.method!=='POST'||req.url!=='/capture'||req.headers.origin!=='http://127.0.0.1:4318'){res.statusCode=403;return res.end('Denied');}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000)throw new Error('Capture too large');}
    const data=JSON.parse(body);
    const source=new URL(data.sourcePage);
    if(source.origin!=='https://www.massimodutti.com'||!source.pathname.startsWith('/us/')||!Array.isArray(data.records))throw new Error('Invalid source');
    for(const row of data.records){const u=new URL(row.href);if(u.origin!==source.origin||!/-l\d+/.test(u.pathname))throw new Error('Invalid product');}
    const id=crypto.createHash('sha256').update(source.href).digest('hex').slice(0,16);
    fs.writeFileSync(path.join(directory,id+'.json'),JSON.stringify({...data,capturedAt:new Date().toISOString()},null,2));
    res.end('Saved '+data.records.length+' observed products.');
  }catch(e){res.statusCode=400;res.end(e.message);}
});
server.listen(4318,'127.0.0.1',()=>console.log('Local catalog capture ready at http://127.0.0.1:4318'));
