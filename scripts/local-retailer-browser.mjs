// Local-only public-retailer evidence. No inspiration image, email or profile
// is accepted. Keep the random access token in process memory, never a file.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { chromium } from 'playwright';

const sourceModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/retailer-sources.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: sourceModule, exports: sourceModule.exports, URL });
const { canonicalProductUrl, trustedProductImage } = sourceModule.exports;

export async function startRetailerBrowser(token) {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let active = 0;
  const cache = new Map();
  const server = http.createServer(async (request, response) => {
    const send = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); };
    if (request.method !== 'POST' || request.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'Unauthorized' });
    let raw = '';
    for await (const chunk of request) { raw += chunk; if (raw.length > 4096) return send(413, { error: 'Too large' }); }
    let body; try { body = JSON.parse(raw); } catch { return send(400, {error:'Invalid request'}); }
    // Public inventory collection runs locally, as requested. Fixed merchants
    // only: this is not an arbitrary URL proxy and accepts no shopper data.
    if (body?.kind === 'merchant-feed') {
      if (!['leset.com','cottoncitizen.com','www.threedots.com','www.dolcevita.com','www.rails.com'].includes(body.host)) return send(400,{error:'Unsupported merchant'});
      const key=`feed:${body.host}`; const existing=cache.get(key);
      if(existing && existing.expires>Date.now()) return send(200,existing.value);
      try {
        const upstream=await fetch(`https://${body.host}/products.json?limit=250`,{redirect:'manual',signal:AbortSignal.timeout(10000)});
        if(!upstream.ok) return send(502,{error:`Merchant status ${upstream.status}`});
        let text='';let size=0;const decoder=new TextDecoder();
        for await(const bytes of upstream.body){size+=bytes.byteLength;if(size>5_000_000)return send(413,{error:'Feed too large'});text+=decoder.decode(bytes,{stream:true});}
        const data=JSON.parse(text);if(!Array.isArray(data.products))return send(502,{error:'Invalid feed'});
        const value={products:data.products.slice(0,250)};
        cache.set(key,{value,expires:Date.now()+10*60000});return send(200,value);
      }catch{return send(502,{error:'Public inventory unavailable'});}
    }
    let url; try { url = canonicalProductUrl(body.url); } catch { /* Invalid input. */ }
    if (!url) return send(400, { error: 'Unsupported product URL' });
    const prior = cache.get(url);
    if (prior && prior.expires > Date.now()) return send(200, prior.value);
    if (active >= 4) return send(429, { error: 'Busy' });
    active++;
    let context;
    try {
      context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
      const page = await context.newPage();
      // Never follow a retailer redirect into a local/private network.
      await page.route('**/*', route => {
        const target = new URL(route.request().url());
        if (['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(target.hostname) || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(target.hostname)) return route.abort();
        if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() && !canonicalProductUrl(target.href)) return route.abort();
        if (target.origin !== new URL(url).origin && !trustedProductImage(target.href, url)) return route.abort();
        return route.continue();
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 });
      if (!canonicalProductUrl(page.url())) throw new Error('Not a product page');
      const title = await page.title();
      if (/access denied|just a moment|captcha|verify you|page not found/i.test(title)) throw new Error('Retailer unavailable');
      // Wait for the page's own product image, without clicking challenges.
      const image = await page.locator('meta[property="og:image:secure_url"],meta[property="og:image"]').evaluateAll(tags => tags.map(tag => tag.content)).then(values => values.map(v => trustedProductImage(v, url)).find(Boolean));
      let capture;
      if (image) {
        const selector = await page.locator('img').evaluateAll((images, source) => {
          const path = new URL(source).pathname;
          return images.findIndex(img => { try { return new URL(img.currentSrc || img.src).pathname === path && img.naturalWidth > 100; } catch { return false; } });
        }, image);
        if (selector >= 0) {
          const element = page.locator('img').nth(selector);
          await element.scrollIntoViewIfNeeded({ timeout: 3000 });
          const bytes = await element.screenshot({ type: 'jpeg', quality: 45, timeout: 5000 });
          if (bytes.length < 110000) capture = { sourceUrl: image, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}` };
        }
      }
      const html = await page.content();
      if (html.length > 4_000_000) throw new Error('Page too large');
      const value = { url: page.url(), html, capture };
      cache.set(url, { value, expires: Date.now() + 15 * 60000 });
      if (cache.size > 80) cache.delete(cache.keys().next().value);
      send(200, value);
    } catch { send(502, { error: 'Retailer browser evidence unavailable' }); }
    finally { active--; await context?.close(); }
  });
  await new Promise(resolve => server.listen(4319, '127.0.0.1', resolve));
  return async () => { server.close(); await browser.close(); };
}
