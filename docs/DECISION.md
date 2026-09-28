# Angie v2: decision record

**Short version.** Keep the premise (upload an inspiration, get look-alikes that fit) but flip where the effort goes. Most of the money and complexity in v1 went into "looks like". But she returns clothes because they don't fit, and v1 handled fit with a lookup table. v2 makes fit the core: her measurements, each brand's size chart or garment measurements, and a per-brand correction learned from every keep and return. Matching becomes a cheap retrieval step over a catalog you control, with a clear upgrade path to a CLIP-class model. No model training, no try-on, no paid APIs.

## 1. Why v1 failed (references are to commit `b4f4e36`)

1. **Fit never generalised.** `lib/product-fit.ts:26-69` gives a size only if she already tried that exact item (L28-30), bought the same style before (L31-40), the item is from the one retailer whose bust chart was parsed and is within 1 in (L45-50), or she kept something similar from that retailer (L51-63). Anything else gets "Check size chart" (L65-68). Tried-size outcomes are keyed to one `catalogId` (L28), so a "too small in the hips" return on one Northfield trouser teaches nothing about the next one. Waist and hips only ever appear in text (L11-12, L66-68). The thing that causes returns was never modelled.
2. **Matching was an expensive LLM chain per request.** A GPT vision interpretation (`lib/inspiration-interpreter.ts:9,92-106`), web-search discovery (`lib/product-search.ts:273-325`), and a two-tier visual judge over batches of up to 30 images (`lib/visual-matcher.ts:83-131,155-205`), all under a $2 / 12-call budget per search (`lib/search-budget.ts:17`) with 45 s timeouts. Scores come from a prompt rubric (`visual-matcher.ts:104`) and are then cut at hard thresholds (`lib/inspiration-engine.ts:26`). The "embedding" index held text embeddings of captions (`lib/catalog-retrieval.ts:31-38`), and it shipped empty (`data/catalog-index.json`).
3. **Product sources were scraped and kept breaking.** It used hand-written URL regexes per retailer (`lib/retailer-sources.ts:4-18`), HTML parsing (`lib/product-search.ts:78-135`), and a local headless browser to get past bot walls (`product-search.ts:167-181`, `scripts/catalog-sources/aritzia.mjs`). Only five Shopify feeds were used (`lib/merchant-feeds.ts:7-13`). Products that failed verification were dropped, with up to three re-verification rounds (`lib/inspiration-pipeline.ts:167-179`).
4. **The ranking was built to say no.** About 20 veto rules each set the score to −1000 and remove the item (`inspiration-engine.ts:71-87,125-157,188,215`). One of them vetoes any item with three unverifiable features (L134). The result was frequent "No verified item…" failures (`inspiration-pipeline.ts:164`, `lib/inspiration-failure.ts:4`).
5. **Personal data was compiled into the code, for one user only.** The profile and purchase history are build-time imports (`product-fit.ts:1-2`, `inspiration-interpreter.ts:2`), and there is a single hard-coded session, `SESSION_ID = 'angie-v1'` (`lib/persistence.ts:3`). Updating her sizes meant a redeploy.
6. **The demo couldn't show the idea.** The demo adapter ignores the uploaded image and picks a category from keywords in the note (`lib/demo-adapters.ts:17-36`), and its "visual scores" are `85 - index` (L40-43). An image with no text always returned a tee.
7. **The feedback captured the wrong signal.** Love/Almost/No is the main interaction (`components/InspirationExperience.tsx:434-448`). Size and fit sit in a collapsed `<details>` (L67-81), and it never asks where something didn't fit (L74). There was also a lot of dead weight: the questionnaire and blind-rating experiment, and a rule-based stylist that no page imports (`lib/stylist.ts`, `lib/ranking.ts`, `app/api/{answers,candidates,freeze,ratings,results,stylist}`, `components/StylistExperience.tsx`).

## 2. Options

| Option | Accuracy for her problem | Cost | Effort | Scales? |
| --- | --- | --- | --- | --- |
| A. Train or fine-tune a model on her | Poor. She has dozens of labels, not thousands, so it would overfit. Pretrained fashion CLIP models already handle "looks like". | GPU time plus upkeep | High | Only once there are many users |
| B. Virtual try-on | Shows appearance, not fit. Try-on models warp the garment onto a photo and don't know that size M is 1 in tight at the hips. | Paid per render; needs photos of her | High | Expensive, and a privacy burden |
| C. Sizes, then buy links with a size per item | Right target. Only as good as how the size is derived. | ~0 | Medium | Yes |
| **D. C done properly (chosen):** measurements + brand size charts or garment measurements + a per-brand correction learned from keeps and returns | Best available with one user. It explains itself and improves with each order. | ~0 per search | Medium | Yes: per-user profiles, shared catalog, and pooled brand priors later |
| E. Collaborative size model ("people who kept M in X keep S in Y") | Strong at scale | Low | Medium | Needs many users. It is the natural v3 layer on top of D. |

A is overkill right now, as Jonathan suspected. B solves the wrong problem. D is shipped.

## 3. How we know her size

Inputs, most valuable first:
1. **Garments she already owns and likes, measured flat and doubled.** A garment-to-garment comparison is the most accurate signal. It gives her preferred ease directly (garment minus body), which is then used for brands that publish garment measurements.
2. **Keep/return history with the reason and where it failed** (too small in the hips, too long). This is the correction signal for vanity sizing and personal preference.
3. **Body measurements**: bust, waist, hips, plus inseam for trousers. On their own they are only as good as each brand's chart.
4. **Per-brand size charts**: body charts are common, garment measurements are better. Items without either can still use her kept size at that brand.
5. **Photo-based measurement**: not used. It is error-prone at the ±1 in that matters, and it needs body photos.

**Day-one minimum:** bust, waist, hips (five minutes with a tape). That's enough for a size and a confidence level on any item with a chart. Also worth adding on day one: 3–5 recent orders with kept/returned and the reason, and one trouser she loves.

**How it improves** (`lib/fit/model.ts`). For each brand, category and dimension there is an offset: "treat her hips as +1 in at Northfield". Each outcome is replayed in order:
- "Too small in the hips at size 8" moves her effective hips 0.5 in past size 8's upper limit, so 8 is never suggested again for that brand.
- "Kept, fits" pulls any offset back inside the size she kept.
- "A bit tight" or "a bit loose" moves her to the size edge.
- If she doesn't say where, the dimension that was nearest its limit gets the blame.
- An offset carries over at 75% to the same brand's other categories, and at 50% to brands she has never ordered from.

The state is a pure replay of the outcome log, so undo is exact and the algorithm can change without a data migration. Confidence is **high** after she kept that brand's size or the brand is learned with margin to spare. It is **medium** when all measurements fall inside one size. It is **low** when she's between sizes, no size fits cleanly, or data is missing. Each item carries a plain note explaining why.

## 4. Looking like the inspiration

Done well, this means:
- crop the garment (a detector trained on DeepFashion2 or Fashionpedia, or SAM or Grounding-DINO prompted by category),
- embed the crop with a fashion CLIP-class model (for example the open-weight Marqo-FashionSigLIP or FashionCLIP),
- search an index of catalog embeddings computed offline,
- re-rank with attributes (category as a hard filter; colour, silhouette, length, fabric), where the same CLIP model can extract attributes zero-shot.

**Shipped in v2:** the same pipeline shape with a local, dependency-free descriptor: garment mask, 12×12 silhouette grid and Lab colour histogram (`lib/match/embedding.ts`). It runs in the browser, so the photo never leaves her device. It costs nothing, is deterministic and is tested. It works on product shots and flat-lays. **It will not handle busy street photos with several garments**, which is the top open risk. Swapping in FashionSigLIP is the first follow-up. Vectors carry a version, so embedders are never mixed.

**Product sources, honestly:**
- Big retailers block scraping, and their terms forbid it. That was v1's trap.
- Shopify stores' public `/products.json` is free but unofficial. Terms vary, and it has no size charts.
- Affiliate networks (Rakuten Advertising, CJ, Impact, AWIN) give product feeds free, but only to approved publishers with a site.
- Shopping search APIs such as SerpApi's Google Shopping, and v1's OpenAI web search, are **paid**. None was bought or needed.
- **Recommendation:** a curated catalog of the 10–20 brands she already buys, imported with `npm run catalog:import`, with each brand's size chart entered once. That is also where most of her fit history will be.

## 5. From one user to many

- **Per-user fit profiles:** already there. Every personal row is keyed by `user_id`, and adding a person is config (`EXTRA_ACCESS_CODES`). Real sign-in replaces access codes.
- **Catalog and indexing:** already shared. Move vectors to Cloudflare Vectorize or pgvector past about 50k products, and refresh feeds nightly.
- **Cost per search:** zero today, since everything is computed on the device. With a hosted CLIP query it's a fraction of a cent, and catalog embedding is a one-off batch job.
- **Brand offsets pooled across users** become priors ("Northfield runs small in hips"), with each user's residual kept personal. That is option E, and it slots in as a prior in `offsetFor`.
- **Privacy:** measurements are sensitive personal data. Get explicit consent, allow export and delete, keep photos on the device, and store descriptors only.

## 6. Open risks

1. The local descriptor is weak on real photos (see section 4).
2. Size charts must be entered per brand, and body charts hide garment ease. Add garment measurements where brands publish them.
3. "Blame the tightest dimension" can pick wrong. Asking where it failed fixes it, and a later "fits" corrects it.
4. Stock and current price are not checked. Links go to the product page.
5. Tape-measure error of about 0.5 in is the same size as the size gaps, so confidence is deliberately conservative.
6. A real deployment would put her measurements in Cloudflare D1. Local use keeps them in the gitignored `.wrangler/` directory.
