# Review Angie

[Overview](../README.md) · [Engineering guide](ENGINEERING.md)

## Start here

Read [the shared pipeline](../lib/inspiration-pipeline.ts), [fit guidance](../lib/product-fit.ts), and [server-side session scope](../lib/inspiration-scope.ts). They show three different problems: recovering a suitable product, deciding what fit evidence supports, and keeping QA feedback out of personal learning.

Use Node.js 24 and a fresh checkout:

```sh
git clone https://github.com/jonathanangel-1/angie-public.git
cd angie-public
npm ci --ignore-scripts
npm run demo
```

Open **http://127.0.0.1:4175**, then enter **`demo-participant`**. **`demo-admin`** selects the administrator role. Local D1/R2 emulation stores runtime data under the ignored `.wrangler/` directory. Restarting retains that local data. Use a fresh checkout for an empty review environment.

## Follow a recommendation and its learning

1. Enter **“White tee for a polished everyday outfit.”** The result identifies itself as a synthetic service demonstration and contains fictional catalog products.
2. Select **Love**. Selection alone must not save feedback. Explicitly confirm it.
3. Open **Saved looks**, reopen the result, and inspect the saved reaction.
4. Record that a shown product was **tried**, enter its size, and report how it fitted. Inspect the updated fit guidance and **Purchases**.
5. Return to the request screen. This is a QA profile: its feedback can affect its own future results without changing the synthetic personal baseline.

A product's photo may be absent by design; the app separates private comparison imagery from displayed recommendations. The public catalog also has fictional garment illustrations. The synthetic interpreter uses simple text rules and does not perform real image recognition. Product links are examples, not shopping destinations.

## Reproduce the automated checks

Stop the demo before `test:demo`: Vinext permits one development server per checkout. The HTTP check uses port **4185** and writes fictional QA records to local D1.

```sh
npm run test:public
npx --no-install tsc --noEmit
npm run build
npm run test:demo
```

| Check | What it exercises | Limit |
| --- | --- | --- |
| [Offline regression](../scripts/inspiration-flow-check.mjs) | Input/gesture confirmation, role/session separation, candidate evidence, garment constraints, partial recovery, feedback semantics, saved history, fit outcomes, and migration behavior | Service responses and storage are controlled fixtures; these are behavioral checks, not a measured model-quality score. |
| [HTTP demo check](../scripts/public-demo-check.mjs) | Actual access and recommendation routes, local D1, explicit confirmation, duplicate feedback retry, shown-item validation, tried-size guidance, saved history, and unchanged personal baseline | Tests the text-driven synthetic provider path, not real retailer or model services. |
| TypeScript and build | Compile-time checks and production bundle generation | A successful build is not a verified hosted deployment. |

The HTTP check intentionally launches with an inherited `INSPIRATION_MODE=live`. Public-demo configuration must force it back to QA. The test also supplies a client session ID that must not select the personal session.

[GitHub Actions](https://github.com/jonathanangel-1/angie-public/actions/workflows/public-checks.yml) runs all four commands on Node.js 24/Linux. Check the run for the commit you inspect; passing synthetic tests is not evidence that a model understands every garment or that every recommendation will fit.

## Evaluation still needed for a live product

The public edition does not provide a representative live-image benchmark, validated retailer-wide stock checks, general sizing accuracy, or evidence that preference learning improves outcomes over time. A useful live evaluation would compare pipeline versions on a fixed reference set, inspect item-level errors and missing garments, and follow confirmed try-on/keep/return outcomes.

Source code for live interpretation, visual matching, discovery, and verification remains available. `PUBLIC_DEMO=0` requires independently configured credentials, access codes, and appropriate catalog data. The demo codes are not production authentication. See [the data boundary](PUBLIC_DATA.md).
