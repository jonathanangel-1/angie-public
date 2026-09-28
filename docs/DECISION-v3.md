# Angie v3: look photo → garments → open-web matches she'll keep

**Short version.** No catalog. Each garment is cut out of her look photo with open-weight models, then searched live across real stores. The search runs through **Shopify's Global Catalog**, an official, keyless agent endpoint covering Shopify merchants, by both text and image. Results are ranked by what she keeps, not only by look-alike score. A paid **Google Lens + Google Shopping (via SerpApi)** layer is built behind the same interface for brands that aren't on Shopify. The measured cost per look today is **$0 in API fees** and about **20 CPU-seconds** (roughly $0.0003–0.001 of compute, estimated).

## 1. Why v2 missed

v2 assumed someone would curate brands, import products and type in size charts. For one person shopping the open web, that is a chore nobody will keep up, and it can never cover "the closest thing that exists right now". v2 also only matched clean product shots, not the busy street photos she actually saves. Worth keeping from v2: "a return is size evidence, not taste evidence", and sizing learned per brand from her keeps and returns. v3 keeps both, without any chart.

## 2. Where to look

| Source | Fashion match quality | Coverage | Cost / search | Limits and terms | Price, link, image | Tested here |
| --- | --- | --- | --- | --- | --- | --- |
| **Shopify Global Catalog** (`catalog.shopify.com/api/ucp/mcp`) | Good: image "find similar" plus text, with fabric, sizes and ratings | Shopify merchants only: many DTC and indie brands; most department stores and big chains are absent | **Free**, no key | Rate-limited per IP; no caching of results; raising limits needs a (free) Shopify Partner org | Yes, plus sizes, fabric, rating | **Measured**: 20/20 calls OK, median 240 ms (text) and 571 ms (image) |
| Google Lens via SerpApi | Best visual breadth; includes non-Shopify stores | Whole web | $0.009–0.025 (plans $25–275/mo); free plan 250/mo | Needs a public crop URL. SerpApi scrapes Google, which Google's terms don't allow; SerpApi offers legal cover | Price often, not always | Built; parser tested on a hand-written documented shape. **Not run live: no key** |
| Google Shopping via SerpApi | Text-only, broad | Whole web | same | same | Yes | same |
| Google Cloud Vision web detection | Finds similar images and pages, not products | Web | Paid per 1k after a free tier; needs a GCP billing account | Official API | No price | Not tested (account needed) |
| Bing Visual Search | — | — | — | Retired with the Bing Search APIs (2025) | — | — |
| Affiliate feeds (Rakuten, Awin, CJ, Impact) and Amazon PA-API | Feeds are catalogs you ingest: the v2 trap | Per approved advertiser | Free, but approval and sales thresholds apply | Commission; good for monetising links later | Yes | No |
| ShopStyle Collective / LTK | Creator programs; no self-serve product search API found | — | — | — | — | No |
| Scraping retailers | — | — | — | Breaks terms of service; excluded | — | No |

**Pick:** a hybrid, with each piece searched twice (by its masked crop and by an attribute query), then merged and deduplicated.
- **Default:** Shopify Global Catalog. It's free, official, fast and rich.
- **Add when a key exists:** SerpApi Lens + Shopping, for breadth beyond Shopify (Zara-type chains, department stores).

In the spike, both halves earn their place: of the 30 top-3 results, 18 came from the image search and 12 from the attribute text query.

## 3. Garment pipeline (`spike/garments.py`, served by `spike/server.py`)

1. **Pick the main person:** Grounding-DINO "person" boxes, scored by size × centrality. This handles crowds.
2. **Segment garments:** SegFormer-clothes gives masks for dress, skirt, pants and upper clothes.
3. **Split layers:** an open jacket over a top shows as two colour clusters, and the narrow central one is the top. This is a heuristic. Grounding-DINO-tiny could not separate them.
4. **Describe:** colour is measured from the garment's pixels. Type, length, pattern, fabric and vibe come from FashionCLIP zero-shot. Pattern and fabric only enter the search query when confident.
5. **Re-rank:** FashionCLIP compares the crop with each product photo. A category guard drops accessories and kids' items.

**Spike, 5 real public photos, 10 pieces** (evidence in `spike_0N_*.png` and `spike_results.json`):
- **Good (6):** embroidered leather jacket, cherry-print skirt, fringe skirt, white cami, black leather jacket in a crowd, black trousers.
- **Partial (2):** a long blazer matched as cropped jackets; a floral maxi dress (3 of 5 right).
- **Miss (2):** a coral embroidered dress read as "rust plaid"; a printed top half-hidden by a blazer.

The misses are description and layering errors. The planned upgrade is a small vision-language model for descriptions and layers (an estimated ~$0.001/look), behind the existing `GarmentProvider` interface. It is not built yet.

## 4. Her taste and "won't return" (`lib/taste/`)

**Backbone: her own keep/return outcomes.** They directly measure the thing we optimise, so they carry the most weight (×2). Loves and "no" reactions carry ×1, and quiz reactions seed the start.

**The day-one minimum is the 2-minute quiz:**
- usual sizes (top, bottom, dress, jeans),
- fit preferences,
- "never wear" (hard filters such as bodycon, low rise or polyester),
- a budget per item,
- brands she loves or avoids,
- six image reactions.

**Email import (optional).** Order and return emails are parsed into records, each with a confidence and a needs-review flag, and she confirms each one before import. "No return email after 45 days" is only presumed kept (60% confidence). A return with no matching order email is still used, but flagged. It's built against fictional `.eml` fixtures only.
- For one person, the practical live path is a Gmail filter that forwards order and return emails to an inbound address (for example Cloudflare Email Routing → Worker). That avoids Gmail's restricted `gmail.readonly` scope.
- The Gmail API is fine for her alone in Google's "testing" mode. A public app needs Google's security assessment.

**Ranking:** 0.45 look-alike + 0.25 learned taste + 0.20 × (1 − return risk) + 0.10 budget fit.
- **Return risk** starts from an assumed 25%. It moves with:
  - her keep rate at that brand,
  - fabrics she returned for quality,
  - size certainty,
  - product ratings.
- **Reasons are scoped:**
  - "No, wrong colour" lowers only that colour.
  - A fit return moves the size, not the taste.
  - A quality return penalises that fabric and brand.
- **Suggested size**, with no chart needed:
  - her last kept size at that brand, or one step up or down after a too-small or too-big return,
  - else her stated size,
  - then mapped across size systems (M ↔ 8 ↔ 28) against the sizes actually listed.

Parsing size charts from product pages at search time was considered and dropped: few stores expose them in a structured form, and brand history is a stronger signal.

## 5. Day-one flow

Open → quiz (2 minutes) → optional email import → upload a look → pieces with crops and attributes → matches with price, buy link, suggested size, return-risk note and "why" → Love / Not for me (why) / I bought it → later Kept / Returned (why). Every action re-ranks the current look.

## 6. Cost per look and keys

- **Measured** (4 vCPU CPU-only VM, 5 photos): 19.8 CPU-s and 6.9 s wall per look. That breaks down as about 4.4 s for understanding and 1–4 s for search and re-rank. Model load is 3.8 s once, peak RAM 3 GB. There were 4 catalog calls per look on average and 0 paid calls.
- **Estimated:**
  - Compute: 20 CPU-s at $0.04–0.09 per vCPU-hour ≈ **$0.0002–0.0005 per look**. An always-on 4 vCPU / 4 GB box (~$10–25/month) dominates for a single user.
  - Optional SerpApi, about 4 searches per look (2 pieces × Lens + Shopping): **$0.04 (Production plan) to $0.10 (Starter)**. The free plan's 250 searches/month covers about 60 looks.
- **Keys:**
  - **None needed for the default path.**
  - `SERPAPI_API_KEY` is optional (free plan to start; Developer $75/mo for 5,000 searches). Google Lens also needs crop hosting at a public URL (for example an R2 bucket), which is not built yet. Until then only the Google Shopping half runs.
  - `GARMENT_SERVICE_URL` points the app at the model service.

## 7. Scale (1 → 1,000 users)

- **Per-user data:** quiz, purchases and reactions are keyed by user. Photos and search results are not stored.
- **Cost at 1,000 users × 30 looks/month (30k looks):**
  - Compute: about 165 CPU-hours (≈ $10–20 on autoscaling CPU).
  - Shopify: free, but **the per-IP keyless rate limit breaks first**. It needs Shopify Partner / Dev Dashboard catalog access (a free account).
  - SerpApi on every look would be ~120k searches/month (enterprise pricing), so use it only when Shopify results are weak or for brands she follows that aren't on Shopify.
- **Other breaking points:**
  - one garment-service box (needs autoscaling),
  - Gmail's restricted scope (use forwarding instead),
  - pooled brand sizing across users ("runs small"), which becomes worth adding as a prior.

## 8. Open risks

1. Coverage is limited to Shopify until SerpApi is enabled.
2. The layering heuristic and zero-shot description misread some patterned and embellished pieces.
3. Keyless rate limits are unpublished.
4. Email parsing will miss unusual retailer formats. The confidence flags and her review limit the damage.
5. Outlier prices (a $42,000 top appeared) are handled by the budget filter, not by search.
6. Shopify's terms forbid caching results, so re-ranking only uses results the browser already holds.
