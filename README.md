# Angie

[![Checks](https://github.com/jonathanangel-1/angie-public/actions/workflows/public-checks.yml/badge.svg)](https://github.com/jonathanangel-1/angie-public/actions/workflows/public-checks.yml)

Upload an inspiration image. Angie shows the closest-looking items from your catalog. Each one comes with a buy link, the size to order, and a note on how sure it is. Tell it what you kept or sent back, and why ("too small in the hips"), and the next size gets better.

Why it is built this way, what was wrong with v1, and what comes next: **[docs/DECISION.md](docs/DECISION.md)**.

![Demo flow on fictional data](docs/images/flow.png)

## Try the demo (fictional data, no keys)

Requires Node.js 24 (22.9+ works).

```sh
npm ci --ignore-scripts
npm run demo
```

Open http://127.0.0.1:4175 and enter `demo-participant`.

1. **Find:** pick one of the fictional inspirations (or upload any product photo or flat-lay), then click **Find matches that fit**.
2. Each result shows a look-alike score, **Your size** with a fit-confidence level and a note, and a **Buy at …** link. Links go to `shop.example.com` and nothing can be bought.
3. Click **Log keep / return** on the top trouser: *Returned it · 8 · Too small · Hips*. The card shows what was learned ("Northfield Studio bottoms: treat your hips as +1 in"), and the sizes on every Northfield bottom update from 8 to 10.
4. **My fit** shows measurements, garments you love, and everything learned so far. **Orders** lists every keep and return, with undo. **Reset demo** restores the fictional baseline.

Every person, brand, product, size chart and link in the demo is invented.

## Use it for real (private, local)

Your data stays on your machine: the local database lives in `.wrangler/`, which is gitignored. Photos never leave the browser; only a small image descriptor is sent to the server. **Never commit real measurements, orders or photos.** Keep your own catalog files in `private/`, which is also gitignored.

```sh
cp .env.example .env.local        # set ANGIE_ACCESS_CODE to a long random string
npm run dev                       # http://127.0.0.1:3000, demo access is off
```

1. Sign in with your code. Open **My fit** and enter bust, waist and hips (the day-one minimum). Add inseam and one garment you love if you can: lay it flat, measure across, double it.
2. Open **Orders** and add your last 3–5 orders with kept/returned and the reason.
3. Import the products you want to search (next section), then use **Find**.

### Add real products

The catalog is a JSON file of public product data plus each brand's size chart. See [`examples/catalog.example.json`](examples/catalog.example.json):

- `products[]`: `id`, `brand`, `name`, `category` (`top`, `dress`, `bottom`, `layer`), `color`, `price`, `url` (the https buy link), `image` (the https image URL to display), `sizes`, `fitIntent` (`fitted`, `regular`, `relaxed`), and optionally `inseam`.
  - Give either `sizeChartId` (points at a brand body chart) or `garmentSizes` (per-size garment measurements, which are more accurate).
  - Optionally `imageFile`, a local image used for matching instead of downloading `image`.
- `sizeCharts[]`: `{ id, brand, category, sizes: [{ size, body: { bust: [lo, hi], waist: [lo, hi], hips: [lo, hi] } }] }`, in inches.

```sh
# with `npm run dev` running and ANGIE_IMPORT_CODE set in .env.local
npm run catalog:import -- private/my-catalog.json
```

Image descriptors are computed locally by the import script. Where products come from, and which sources are free, gated or paid, is covered in [DECISION.md §4](docs/DECISION.md#4-looking-like-the-inspiration). In short: start with the brands she already buys from, and don't scrape retailers.

### API keys

None required. Nothing in v2 calls a paid service. Every variable is listed in [`.env.example`](.env.example):

| Variable | Purpose |
| --- | --- |
| `ANGIE_ACCESS_CODE` | Your private sign-in code (user `angie`). |
| `EXTRA_ACCESS_CODES` | More people later: `userId:code,userId:code`. |
| `ANGIE_URL`, `ANGIE_IMPORT_CODE` | Used by the catalog import script. |
| `PUBLIC_DEMO` | Set by `npm run demo` and `npm run dev`. Never enable it with real data. |
| `ANGIE_STATE_DIR` | Tests only: a throwaway database directory. |

Possible paid upgrades (not used, nothing purchased): a shopping search API such as SerpApi's Google Shopping for discovery, or hosted inference for a fashion CLIP model. Affiliate product feeds (Rakuten Advertising, CJ, Impact, AWIN) are free but need publisher approval.

## Tests

```sh
npm test                 # fit model + image matching (23 checks)
npx --no-install tsc --noEmit
npm run lint
npm run build
npm run test:e2e         # real routes + local D1 in a temp dir: demo flow, then private mode with a catalog import
```

`test:e2e` starts its own server on port 4185 and never touches your local data.

## Layout

| Path | What |
| --- | --- |
| `lib/fit/` | Size recommendation and the keep/return learner. Pure and fully tested. |
| `lib/match/` | Image descriptor (runs in the browser and in Node) and ranking. |
| `lib/server/` | Access codes, D1 storage keyed by user, validation. |
| `app/api/` | `access`, `profile`, `search`, `outcomes`, `catalog`, `demo/reset`. |
| `components/` | Find, My fit, Orders. |
| `data/demo/` | Fictional catalog and profile. Regenerate with `npm run demo:assets`. |
| `drizzle/0007_v2_fit_first.sql` | Additive migration for a deployed D1. v1 tables are left untouched. |

To deploy on Cloudflare Workers, apply the migrations to your D1 database, set `ANGIE_ACCESS_CODE` as a secret, and keep `PUBLIC_DEMO` unset.
