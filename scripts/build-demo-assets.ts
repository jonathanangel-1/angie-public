// Generates the fictional demo catalog: garment illustrations, inspiration
// images, size charts and image descriptors. Every brand, product and
// measurement here is invented. Run: npm run demo:assets
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { describeImage, EMBEDDER_VERSION } from '../lib/match/embedding';
import type { BodySizeChart, Category, FitIntent, GarmentSizes, Product } from '../lib/fit/types';

type Shape = 'tee' | 'vneck' | 'knit' | 'shirt' | 'cami' | 'wrap' | 'column' | 'slip' | 'shirtdress' | 'wide' | 'straight' | 'jean' | 'skirt' | 'blazer' | 'coat' | 'jacket';

const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 + amount))));
  return `#${[16, 8, 0].map(s => channel(s).toString(16).padStart(2, '0')).join('')}`;
};

function garment(shape: Shape, fill: string, stripes?: string) {
  const stroke = shade(fill, fill === '#f7f6f2' || fill === '#efe5cf' ? -0.35 : -0.3);
  const paint = stripes ? 'url(#stripes)' : fill;
  const detail = `fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"`;
  const body = (d: string) => `<path d="${d}" fill="${paint}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>`;
  switch (shape) {
    case 'tee': return body('M175 120 Q240 160 305 120 L385 150 L420 240 L352 262 L350 470 L130 470 L128 262 L60 240 L95 150 Z');
    case 'vneck': return body('M175 120 L240 205 L305 120 L385 150 L420 240 L352 262 L350 470 L130 470 L128 262 L60 240 L95 150 Z');
    case 'knit': return body('M180 118 Q240 150 300 118 L380 146 L432 440 L382 452 L350 250 L352 470 L128 470 L130 250 L98 452 L48 440 L100 146 Z')
      + `<path d="M130 455 L350 455" ${detail}/>`;
    case 'shirt': return body('M185 112 L240 150 L295 112 L378 142 L428 440 L380 452 L350 250 L352 480 L128 480 L130 250 L100 452 L52 440 L102 142 Z')
      + `<path d="M185 112 L215 170 L240 150 L265 170 L295 112" ${detail}/><path d="M240 150 L240 480" ${detail}/>`;
    case 'cami': return body('M170 190 L190 110 L196 110 L186 190 Q240 215 294 190 L284 110 L290 110 L310 190 L338 470 L142 470 Z');
    case 'wrap': return body('M178 110 L240 250 L302 110 L372 138 L402 230 L346 248 L330 290 L400 560 L80 560 L150 290 L134 248 L78 230 L108 138 Z')
      + `<path d="M150 290 L330 290" ${detail}/><path d="M300 292 L330 380" ${detail}/><path d="M240 250 L275 560" ${detail}/>`;
    case 'column': return body('M180 110 Q240 150 300 110 L360 136 L372 200 L338 214 L336 300 L350 565 L130 565 L144 300 L142 214 L108 200 L120 136 Z');
    case 'slip': return body('M168 190 L186 100 L192 100 L184 188 Q240 214 296 188 L288 100 L294 100 L312 190 L326 300 L370 560 L110 560 L154 300 Z');
    case 'shirtdress': return body('M185 108 L240 146 L295 108 L378 138 L428 430 L380 442 L350 250 L346 300 L372 565 L108 565 L134 300 L130 250 L100 442 L52 430 L102 138 Z')
      + `<path d="M185 108 L215 165 L240 146 L265 165 L295 108" ${detail}/><path d="M240 146 L240 565" ${detail}/><path d="M134 300 L346 300" ${detail}/>`;
    case 'wide': return body('M160 80 L320 80 L330 150 L400 560 L262 560 L240 250 L218 560 L80 560 L150 150 Z')
      + `<path d="M160 104 L320 104" ${detail}/><path d="M200 110 L185 300" ${detail}/><path d="M280 110 L295 300" ${detail}/>`;
    case 'straight': return body('M165 80 L315 80 L326 160 L340 560 L252 560 L240 250 L228 560 L140 560 L154 160 Z')
      + `<path d="M165 104 L315 104" ${detail}/>`;
    case 'jean': return body('M165 80 L315 80 L326 160 L338 560 L254 560 L240 250 L226 560 L142 560 L154 160 Z')
      + `<path d="M165 104 L315 104" ${detail}/><path d="M172 110 Q200 150 228 120" ${detail}/><path d="M308 110 Q280 150 252 120" ${detail}/><path d="M198 250 L190 560" stroke="#e0b060" stroke-width="2" fill="none"/><path d="M282 250 L290 560" stroke="#e0b060" stroke-width="2" fill="none"/>`;
    case 'skirt': return body('M180 120 L300 120 L312 170 L372 520 L108 520 L168 170 Z') + `<path d="M180 144 L300 144" ${detail}/>`;
    case 'blazer': return body('M176 100 L240 150 L304 100 L382 130 L428 440 L380 452 L350 250 L354 430 L126 430 L130 250 L100 452 L52 440 L98 130 Z')
      + `<path d="M176 100 L205 250 L240 330 L275 250 L304 100" ${detail}/><circle cx="240" cy="360" r="6" fill="${stroke}"/>`;
    case 'coat': return body('M176 92 L240 140 L304 92 L382 122 L430 470 L382 482 L352 250 L362 570 L118 570 L128 250 L98 482 L50 470 L98 122 Z')
      + `<path d="M176 92 L208 240 L240 300 L272 240 L304 92" ${detail}/><path d="M240 300 L240 570" ${detail}/>`;
    case 'jacket': return body('M180 110 Q240 140 300 110 L380 138 L420 400 L374 410 L350 250 L352 400 L128 400 L130 250 L106 410 L60 400 L100 138 Z')
      + `<path d="M240 130 L240 400" ${detail}/><path d="M128 380 L352 380" ${detail}/>`;
  }
}

function svg(shape: Shape, fill: string, options: { stripes?: string; background?: [string, string]; rotate?: number; scale?: number } = {}) {
  const [top, bottom] = options.background || ['#f3f1ec', '#f3f1ec'];
  const transform = `translate(240 320) rotate(${options.rotate || 0}) scale(${options.scale || 1}) translate(-240 -320)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<pattern id="stripes" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${fill}"/><rect width="24" height="10" fill="${options.stripes || fill}"/></pattern></defs>
<rect width="480" height="600" fill="url(#bg)"/><g transform="${transform}">${garment(shape, fill, options.stripes)}</g></svg>`;
}

const png = (source: string) => new Resvg(source, { fitTo: { mode: 'width', value: 480 } }).render();

const COLORS: Record<string, string> = {
  white: '#f7f6f2', black: '#232325', navy: '#26324f', grey: '#8c8c8a', cream: '#efe5cf', blue: '#6d93c4', sage: '#a2b08c',
  camel: '#b8895a', green: '#3f6b4a', rust: '#a8522e', denim: '#4f6f9a',
};

// Body-measurement charts, in inches, as a brand would publish them.
const letters = (brand: string, category: Category, rows: Array<[string, Partial<Record<'bust' | 'waist' | 'hips', [number, number]>>]>): BodySizeChart => ({
  id: `${brand.toLowerCase().replace(/[^a-z]+/g, '-')}-${category}`, brand, category, sizes: rows.map(([size, body]) => ({ size, body })),
});
const standard: Array<[string, { bust: [number, number]; waist: [number, number]; hips: [number, number] }]> = [
  ['XS', { bust: [31, 32.5], waist: [24, 25.5], hips: [34, 35.5] }],
  ['S', { bust: [33, 34.5], waist: [26, 27.5], hips: [36, 37.5] }],
  ['M', { bust: [35, 36.5], waist: [28, 29.5], hips: [38, 39.5] }],
  ['L', { bust: [37, 39], waist: [30, 32], hips: [40, 42] }],
  ['XL', { bust: [39.5, 41.5], waist: [32.5, 34.5], hips: [42.5, 44.5] }],
];
const pick = <K extends 'bust' | 'waist' | 'hips'>(keys: K[]) => standard.map(([size, body]) => [size, Object.fromEntries(keys.map(k => [k, body[k]]))] as [string, Partial<Record<K, [number, number]>>]);
const northfieldLetters: Array<[string, { bust: [number, number]; waist: [number, number]; hips: [number, number] }]> = [
  ['XS', { bust: [31, 33], waist: [24, 26], hips: [34, 36.5] }],
  ['S', { bust: [33, 35], waist: [26, 28], hips: [36.5, 38.5] }],
  ['M', { bust: [35, 37], waist: [28, 30], hips: [38.5, 41] }],
  ['L', { bust: [37, 39.5], waist: [30, 32.5], hips: [41, 43.5] }],
  ['XL', { bust: [39.5, 42], waist: [32.5, 35], hips: [43.5, 46] }],
];
const charts: BodySizeChart[] = [
  letters('Demo Atelier', 'top', pick(['bust', 'waist'])),
  letters('Demo Atelier', 'dress', pick(['bust', 'waist', 'hips'])),
  letters('Demo Atelier', 'bottom', pick(['waist', 'hips'])),
  letters('Demo Atelier', 'layer', pick(['bust'])),
  letters('Northfield Studio', 'top', northfieldLetters.map(([s, b]) => [s, { bust: b.bust, waist: b.waist }])),
  letters('Northfield Studio', 'dress', northfieldLetters),
  letters('Northfield Studio', 'layer', northfieldLetters.map(([s, b]) => [s, { bust: b.bust }])),
  letters('Northfield Studio', 'bottom', [
    ['2', { waist: [25, 26], hips: [35, 36.5] }], ['4', { waist: [26, 27], hips: [36.5, 37.5] }],
    ['6', { waist: [27, 28], hips: [37.5, 39] }], ['8', { waist: [28, 29.5], hips: [39, 41] }],
    ['10', { waist: [29.5, 31], hips: [41, 42.5] }], ['12', { waist: [31, 32.5], hips: [42.5, 44] }],
  ]),
];

type Seed = { id: string; brand: string; name: string; category: Category; subtype: string; shape: Shape; color: string; stripes?: string; price: number; fitIntent?: FitIntent; garment?: GarmentSizes; inseam?: number };
const garmentRows = (rows: Array<[string, Partial<Record<'bust' | 'waist' | 'hips', number>>]>): GarmentSizes => rows.map(([size, garment]) => ({ size, garment }));
const seeds: Seed[] = [
  { id: 'da-white-crew-tee', brand: 'Demo Atelier', name: 'Cotton crew tee', category: 'top', subtype: 'tee', shape: 'tee', color: 'white', price: 38 },
  { id: 'mb-white-vneck-tee', brand: 'Marlow Basics', name: 'Everyday V-neck tee', category: 'top', subtype: 'tee', shape: 'vneck', color: 'white', price: 24 },
  { id: 'nf-black-fitted-tee', brand: 'Northfield Studio', name: 'Fitted rib tee', category: 'top', subtype: 'tee', shape: 'tee', color: 'black', price: 42, fitIntent: 'fitted' },
  { id: 'jv-striped-tee', brand: 'Juniper & Vale', name: 'Breton stripe tee', category: 'top', subtype: 'tee', shape: 'tee', color: 'white', stripes: COLORS.navy, price: 48,
    garment: garmentRows([['S', { bust: 36, waist: 35 }], ['M', { bust: 38, waist: 37 }], ['L', { bust: 40, waist: 39 }]]) },
  { id: 'da-grey-knit', brand: 'Demo Atelier', name: 'Fine merino crew', category: 'top', subtype: 'knit', shape: 'knit', color: 'grey', price: 88 },
  { id: 'jv-cream-knit', brand: 'Juniper & Vale', name: 'Relaxed cotton sweater', category: 'top', subtype: 'knit', shape: 'knit', color: 'cream', price: 120, fitIntent: 'relaxed',
    garment: garmentRows([['S', { bust: 40 }], ['M', { bust: 42 }], ['L', { bust: 44 }]]) },
  { id: 'jv-blue-poplin-shirt', brand: 'Juniper & Vale', name: 'Poplin button-down', category: 'top', subtype: 'shirt', shape: 'shirt', color: 'blue', price: 95,
    garment: garmentRows([['S', { bust: 37, waist: 35 }], ['M', { bust: 39, waist: 37 }], ['L', { bust: 41, waist: 39 }]]) },
  { id: 'nf-sage-cami', brand: 'Northfield Studio', name: 'Silky cami', category: 'top', subtype: 'cami', shape: 'cami', color: 'sage', price: 45 },
  { id: 'nf-camel-wrap-dress', brand: 'Northfield Studio', name: 'Wrap midi dress', category: 'dress', subtype: 'wrap', shape: 'wrap', color: 'camel', price: 148 },
  { id: 'da-green-wrap-dress', brand: 'Demo Atelier', name: 'Jersey wrap dress', category: 'dress', subtype: 'wrap', shape: 'wrap', color: 'green', price: 135 },
  { id: 'jv-black-wrap-dress', brand: 'Juniper & Vale', name: 'Crepe wrap dress', category: 'dress', subtype: 'wrap', shape: 'wrap', color: 'black', price: 170,
    garment: garmentRows([['S', { bust: 37, waist: 29, hips: 41 }], ['M', { bust: 39, waist: 31, hips: 43 }], ['L', { bust: 41, waist: 33, hips: 45 }]]) },
  { id: 'da-black-column-dress', brand: 'Demo Atelier', name: 'Column dress', category: 'dress', subtype: 'column', shape: 'column', color: 'black', price: 120 },
  { id: 'jv-rust-slip-dress', brand: 'Juniper & Vale', name: 'Bias slip dress', category: 'dress', subtype: 'slip', shape: 'slip', color: 'rust', price: 160, fitIntent: 'fitted',
    garment: garmentRows([['S', { bust: 35, waist: 29, hips: 39 }], ['M', { bust: 37, waist: 31, hips: 41 }], ['L', { bust: 39, waist: 33, hips: 43 }]]) },
  { id: 'mb-navy-shirt-dress', brand: 'Marlow Basics', name: 'Belted shirt dress', category: 'dress', subtype: 'shirtdress', shape: 'shirtdress', color: 'navy', price: 98 },
  { id: 'nf-navy-wide-leg', brand: 'Northfield Studio', name: 'Harbor wide-leg trouser', category: 'bottom', subtype: 'wide-leg', shape: 'wide', color: 'navy', price: 118, inseam: 31 },
  { id: 'jv-navy-wide-leg', brand: 'Juniper & Vale', name: 'Pleated wide-leg trouser', category: 'bottom', subtype: 'wide-leg', shape: 'wide', color: 'navy', price: 135, inseam: 32,
    garment: garmentRows([['S', { waist: 28.5, hips: 41.5 }], ['M', { waist: 30.5, hips: 43.5 }], ['L', { waist: 32.5, hips: 45.5 }]]) },
  { id: 'nf-camel-wide-leg', brand: 'Northfield Studio', name: 'Harbor wide-leg trouser', category: 'bottom', subtype: 'wide-leg', shape: 'wide', color: 'camel', price: 118, inseam: 31 },
  { id: 'da-cream-wide-leg', brand: 'Demo Atelier', name: 'Linen wide-leg trouser', category: 'bottom', subtype: 'wide-leg', shape: 'wide', color: 'cream', price: 105, inseam: 32 },
  { id: 'da-black-straight-trouser', brand: 'Demo Atelier', name: 'Straight tailored trouser', category: 'bottom', subtype: 'straight', shape: 'straight', color: 'black', price: 98, inseam: 30 },
  { id: 'nf-blue-straight-jean', brand: 'Northfield Studio', name: 'Straight jean', category: 'bottom', subtype: 'jean', shape: 'jean', color: 'denim', price: 110, inseam: 30 },
  { id: 'mb-black-midi-skirt', brand: 'Marlow Basics', name: 'A-line midi skirt', category: 'bottom', subtype: 'skirt', shape: 'skirt', color: 'black', price: 68 },
  { id: 'nf-black-blazer', brand: 'Northfield Studio', name: 'Single-breasted blazer', category: 'layer', subtype: 'blazer', shape: 'blazer', color: 'black', price: 198 },
  { id: 'mb-navy-blazer', brand: 'Marlow Basics', name: 'Soft blazer', category: 'layer', subtype: 'blazer', shape: 'blazer', color: 'navy', price: 140 },
  { id: 'jv-camel-coat', brand: 'Juniper & Vale', name: 'Wool wrap coat', category: 'layer', subtype: 'coat', shape: 'coat', color: 'camel', price: 260, fitIntent: 'relaxed',
    garment: garmentRows([['S', { bust: 41 }], ['M', { bust: 43 }], ['L', { bust: 45 }]]) },
  { id: 'da-grey-jacket', brand: 'Demo Atelier', name: 'Boxy wool jacket', category: 'layer', subtype: 'jacket', shape: 'jacket', color: 'grey', price: 150 },
];

const inspirations: Array<{ file: string; shape: Shape; fill: string; background: [string, string]; rotate: number; scale: number }> = [
  { file: 'inspiration-01-navy-wide-leg.png', shape: 'wide', fill: '#2b3656', background: ['#e8dcd2', '#d8c8bc'], rotate: -3, scale: 0.9 },
  { file: 'inspiration-02-camel-wrap-dress.png', shape: 'wrap', fill: '#bd8f60', background: ['#dfe3e6', '#cdd3d8'], rotate: 2, scale: 0.88 },
  { file: 'inspiration-03-white-tee.png', shape: 'tee', fill: '#fbfaf7', background: ['#d9cbb8', '#cdbda8'], rotate: 4, scale: 0.85 },
  { file: 'inspiration-04-black-blazer.png', shape: 'blazer', fill: '#29292b', background: ['#ece6dc', '#ddd4c6'], rotate: -2, scale: 0.9 },
];

rmSync('public/demo', { recursive: true, force: true });
mkdirSync('public/demo/products', { recursive: true });
mkdirSync('public/demo/inspiration', { recursive: true });
mkdirSync('data/demo', { recursive: true });

const products: Product[] = seeds.map(seed => {
  const source = svg(seed.shape, COLORS[seed.color], { stripes: seed.stripes });
  writeFileSync(`public/demo/products/${seed.id}.svg`, source);
  const image = png(source);
  const features = describeImage({ width: image.width, height: image.height, data: image.pixels });
  const sizes = seed.garment ? seed.garment.map(r => r.size) : seed.brand === 'Northfield Studio' && seed.category === 'bottom' ? ['2', '4', '6', '8', '10', '12'] : ['XS', 'S', 'M', 'L', 'XL'];
  const chart = charts.find(c => c.brand === seed.brand && c.category === seed.category);
  return {
    id: seed.id, brand: seed.brand, name: seed.name, category: seed.category, subtype: seed.subtype, color: seed.stripes ? 'navy stripe' : seed.color,
    price: seed.price, currency: 'USD', url: `https://shop.example.com/${seed.brand.toLowerCase().replace(/[^a-z]+/g, '-')}/${seed.id}`,
    image: `/demo/products/${seed.id}.svg`, sizes, fitIntent: seed.fitIntent || 'regular',
    ...(seed.garment ? { garmentSizes: seed.garment } : chart ? { sizeChartId: chart.id } : {}),
    ...(seed.inseam ? { inseam: seed.inseam } : {}),
    features,
  } as Product & { features: ReturnType<typeof describeImage> };
});

for (const inspiration of inspirations) {
  writeFileSync(`public/demo/inspiration/${inspiration.file}`, png(svg(inspiration.shape, inspiration.fill, inspiration)).asPng());
}

writeFileSync('data/demo/catalog.json', JSON.stringify({
  notice: 'Fictional demo catalog. Brands, products, prices, links and size charts are invented.',
  embedderVersion: EMBEDDER_VERSION,
  sizeCharts: charts,
  products,
}, null, 1) + '\n');
console.log(`Wrote ${products.length} fictional products, ${charts.length} size charts and ${inspirations.length} inspiration images.`);
