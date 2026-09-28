// Generates the fictional v3 demo: illustrated looks worn by a drawn figure,
// a crop per piece, fictional products per piece and quiz swatches. Every
// brand, product, price and link is invented. Run: npm run demo:assets
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

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


const png = (source: string) => new Resvg(source).render().asPng();
const C: Record<string, string> = {
  black: '#232325', white: '#f7f6f2', navy: '#26324f', grey: '#8c8c8a', cream: '#efe5cf', camel: '#b8895a', rust: '#a8522e', green: '#3f6b4a',
  olive: '#6b6b3a', blue: '#6d93c4', red: '#b3262e', pink: '#e3a3b4', sage: '#a2b08c', brown: '#6b4a2f', charcoal: '#3c3c3e', denim: '#4f6f9a',
};

// A drawn figure wearing the pieces; background is a plain street scene.
function lookSvg(pieces: Array<{ shape: Shape; color: string; layer: 'dress' | 'top' | 'outer' | 'bottom' }>) {
  const skin = '#d9a88a';
  const place = { dress: 'translate(97 118) scale(0.6)', top: 'translate(120 118) scale(0.5)', outer: 'translate(108 108) scale(0.55)', bottom: 'translate(122 320) scale(0.5)' };
  const order = ['bottom', 'dress', 'top', 'outer'] as const;
  const g = order.flatMap(layer => pieces.filter(p => p.layer === layer)).map(p => `<g transform="${place[p.layer]}">${garment(p.shape, C[p.color])}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="720" viewBox="0 0 480 720">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2d8"/><stop offset="1" stop-color="#d7cdbf"/></linearGradient></defs>
<rect width="480" height="720" fill="url(#sky)"/><rect x="0" y="600" width="480" height="120" fill="#b9ad9d"/>
<rect x="30" y="60" width="90" height="540" fill="#cfc4b4"/><rect x="360" y="90" width="100" height="510" fill="#c9bdac"/>
<path d="M208 620 L214 470 L232 470 L230 620 Z M250 620 L248 470 L266 470 L272 620 Z" fill="${skin}"/>
<ellipse cx="220" cy="628" rx="18" ry="8" fill="#2a2a2a"/><ellipse cx="262" cy="628" rx="18" ry="8" fill="#2a2a2a"/>
<path d="M150 180 L118 360 L132 364 L166 196 Z M330 180 L362 360 L348 364 L314 196 Z" fill="${skin}"/>
<path d="M202 80 Q202 28 240 28 Q278 28 278 80 L280 150 L200 150 Z" fill="#4a3426"/>
<rect x="228" y="100" width="24" height="30" fill="${skin}"/><ellipse cx="240" cy="84" rx="27" ry="32" fill="${skin}"/>
<path d="M212 66 Q226 44 262 52 Q270 60 268 70 Q244 58 212 66 Z" fill="#4a3426"/>
${g}
<text x="240" y="706" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#5b5146">FICTIONAL DEMO LOOK</text></svg>`;
}

const product = (shape: Shape, color: string, stripes?: string) => svg(shape, C[color], { stripes: stripes ? C[stripes] : undefined });

type Spec = { id: string; slot: 'dress' | 'outerwear' | 'top' | 'skirt' | 'pants'; shape: Shape; color: string; layer: 'dress' | 'top' | 'outer' | 'bottom';
  attributes: Record<string, string>; query: string;
  candidates: Array<{ n: string; brand: string; title: string; shape: Shape; color: string; stripes?: string; price: number; fabric: string; sizes: string[]; rating?: [number, number]; visual: number }> };

const LETTERS = ['XS', 'S', 'M', 'L', 'XL'];
const NUMBERS = ['2', '4', '6', '8', '10', '12'];
const looks: Array<{ id: string; title: string; file: string; pieces: Spec[] }> = [
  { id: 'look-city', title: 'Weekend city look', file: 'look-01-city.png', pieces: [
    { id: 'look-city-outer', slot: 'outerwear', shape: 'jacket', color: 'black', layer: 'outer', attributes: { type: 'leather biker jacket', color: 'black', pattern: 'solid', fabric: 'leather', vibe: 'edgy' }, query: 'black leather biker jacket women', candidates: [
      { n: '1', brand: 'Northfield Studio', title: 'Moto Leather Jacket', shape: 'jacket', color: 'black', price: 298, fabric: 'Fabric: 100% lamb leather', sizes: LETTERS, rating: [4.7, 212], visual: 0.93 },
      { n: '2', brand: 'Coastline Supply', title: 'Faux Leather Biker Jacket', shape: 'jacket', color: 'black', price: 89, fabric: 'Fabric: 100% polyester, PU coating', sizes: LETTERS, rating: [3.6, 140], visual: 0.9 },
      { n: '3', brand: 'Juniper & Vale', title: 'Cropped Leather Jacket', shape: 'jacket', color: 'brown', price: 340, fabric: 'Fabric: 100% leather', sizes: ['S', 'M', 'L'], rating: [4.5, 60], visual: 0.78 },
      { n: '4', brand: 'Rue Minuit', title: 'Vegan Leather Moto Jacket', shape: 'jacket', color: 'black', price: 120, fabric: 'Fabric: polyurethane', sizes: LETTERS, visual: 0.88 },
      { n: '5', brand: 'Demo Atelier', title: 'Boxy Wool Jacket', shape: 'jacket', color: 'charcoal', price: 150, fabric: 'Fabric: 80% wool', sizes: LETTERS, rating: [4.4, 35], visual: 0.66 },
      { n: '6', brand: 'Marlow Basics', title: 'Soft Blazer', shape: 'blazer', color: 'black', price: 140, fabric: 'Fabric: cotton blend', sizes: LETTERS, rating: [4.2, 88], visual: 0.62 },
    ] },
    { id: 'look-city-top', slot: 'top', shape: 'tee', color: 'white', layer: 'top', attributes: { type: 't-shirt', color: 'white', pattern: 'solid', fabric: 'jersey', vibe: 'casual' }, query: 'white t-shirt women', candidates: [
      { n: '1', brand: 'Marlow Basics', title: 'Everyday Crew Tee', shape: 'tee', color: 'white', price: 24, fabric: 'Fabric: 100% cotton', sizes: LETTERS, rating: [4.6, 900], visual: 0.94 },
      { n: '2', brand: 'Demo Atelier', title: 'Heavyweight Cotton Tee', shape: 'tee', color: 'white', price: 42, fabric: 'Fabric: 100% organic cotton', sizes: LETTERS, rating: [4.8, 150], visual: 0.92 },
      { n: '3', brand: 'Coastline Supply', title: 'Cropped Baby Tee', shape: 'tee', color: 'white', price: 18, fabric: 'Fabric: cotton, elastane', sizes: LETTERS, visual: 0.88 },
      { n: '4', brand: 'Juniper & Vale', title: 'Breton Stripe Tee', shape: 'tee', color: 'white', stripes: 'navy', price: 48, fabric: 'Fabric: 100% cotton', sizes: ['S', 'M', 'L'], rating: [4.5, 70], visual: 0.7 },
      { n: '5', brand: 'Northfield Studio', title: 'Fitted Rib Tee', shape: 'tee', color: 'cream', price: 42, fabric: 'Fabric: modal, elastane', sizes: LETTERS, rating: [4.3, 44], visual: 0.84 },
    ] },
    { id: 'look-city-pants', slot: 'pants', shape: 'wide', color: 'navy', layer: 'bottom', attributes: { type: 'wide-leg trousers', color: 'navy', pattern: 'solid', fabric: 'wool', vibe: 'minimalist' }, query: 'navy wide-leg trousers women', candidates: [
      { n: '1', brand: 'Northfield Studio', title: 'Harbor Wide-Leg Trouser Navy', shape: 'wide', color: 'navy', price: 118, fabric: 'Fabric: 70% wool, 30% polyamide', sizes: NUMBERS, rating: [4.6, 310], visual: 0.95 },
      { n: '2', brand: 'Juniper & Vale', title: 'Pleated Wide-Leg Trouser', shape: 'wide', color: 'navy', price: 135, fabric: 'Fabric: 100% wool', sizes: ['S', 'M', 'L'], rating: [4.7, 95], visual: 0.93 },
      { n: '3', brand: 'Demo Atelier', title: 'Linen Wide-Leg Trouser', shape: 'wide', color: 'cream', price: 105, fabric: 'Fabric: 100% linen', sizes: LETTERS, rating: [4.4, 60], visual: 0.72 },
      { n: '4', brand: 'Coastline Supply', title: 'Low Rise Wide-Leg Pant', shape: 'wide', color: 'navy', price: 59, fabric: 'Fabric: polyester', sizes: LETTERS, visual: 0.9 },
      { n: '5', brand: 'Demo Atelier', title: 'Straight Tailored Trouser', shape: 'straight', color: 'navy', price: 98, fabric: 'Fabric: wool blend', sizes: LETTERS, rating: [4.5, 120], visual: 0.8 },
      { n: '6', brand: 'Rue Minuit', title: 'Wide-Leg Sailor Pant', shape: 'wide', color: 'navy', price: 390, fabric: 'Fabric: 100% wool', sizes: LETTERS, visual: 0.91 },
    ] },
  ] },
  { id: 'look-dinner', title: 'Dinner look', file: 'look-02-dinner.png', pieces: [
    { id: 'look-dinner-dress', slot: 'dress', shape: 'slip', color: 'rust', layer: 'dress', attributes: { type: 'slip dress', color: 'rust', pattern: 'solid', fabric: 'satin', vibe: 'elegant', length: 'midi' }, query: 'rust satin midi slip dress women', candidates: [
      { n: '1', brand: 'Juniper & Vale', title: 'Bias Slip Midi Dress Rust', shape: 'slip', color: 'rust', price: 160, fabric: 'Fabric: 100% silk', sizes: ['S', 'M', 'L'], rating: [4.6, 80], visual: 0.95 },
      { n: '2', brand: 'Coastline Supply', title: 'Satin Slip Dress', shape: 'slip', color: 'rust', price: 65, fabric: 'Fabric: 100% polyester satin', sizes: LETTERS, rating: [3.9, 400], visual: 0.93 },
      { n: '3', brand: 'Demo Atelier', title: 'Cowl Neck Midi Dress', shape: 'slip', color: 'brown', price: 128, fabric: 'Fabric: viscose', sizes: LETTERS, rating: [4.5, 52], visual: 0.83 },
      { n: '4', brand: 'Northfield Studio', title: 'Wrap Midi Dress Camel', shape: 'wrap', color: 'camel', price: 148, fabric: 'Fabric: viscose crepe', sizes: LETTERS, rating: [4.4, 130], visual: 0.7 },
      { n: '5', brand: 'Rue Minuit', title: 'Bodycon Midi Dress', shape: 'column', color: 'rust', price: 110, fabric: 'Fabric: rayon, spandex', sizes: LETTERS, visual: 0.8 },
    ] },
  ] },
  { id: 'look-office', title: 'Office to drinks', file: 'look-03-office.png', pieces: [
    { id: 'look-office-outer', slot: 'outerwear', shape: 'blazer', color: 'camel', layer: 'outer', attributes: { type: 'blazer', color: 'camel', pattern: 'solid', fabric: 'wool', vibe: 'minimalist' }, query: 'camel blazer women', candidates: [
      { n: '1', brand: 'Demo Atelier', title: 'Relaxed Wool Blazer Camel', shape: 'blazer', color: 'camel', price: 210, fabric: 'Fabric: 100% wool', sizes: LETTERS, rating: [4.7, 64], visual: 0.94 },
      { n: '2', brand: 'Marlow Basics', title: 'Soft Blazer Camel', shape: 'blazer', color: 'camel', price: 140, fabric: 'Fabric: cotton blend', sizes: LETTERS, rating: [4.2, 88], visual: 0.9 },
      { n: '3', brand: 'Coastline Supply', title: 'Oversized Blazer', shape: 'blazer', color: 'camel', price: 75, fabric: 'Fabric: 100% polyester', sizes: LETTERS, rating: [3.8, 210], visual: 0.89 },
      { n: '4', brand: 'Juniper & Vale', title: 'Wool Wrap Coat', shape: 'coat', color: 'camel', price: 260, fabric: 'Fabric: 90% wool', sizes: ['S', 'M', 'L'], visual: 0.7 },
    ] },
    { id: 'look-office-skirt', slot: 'skirt', shape: 'skirt', color: 'green', layer: 'bottom', attributes: { type: 'midi skirt', color: 'green', pattern: 'solid', fabric: 'satin', vibe: 'elegant', length: 'midi' }, query: 'green midi skirt women', candidates: [
      { n: '1', brand: 'Coastline Supply', title: 'Satin Midi Slip Skirt Green', shape: 'skirt', color: 'green', price: 55, fabric: 'Fabric: 100% polyester satin', sizes: LETTERS, rating: [4.0, 300], visual: 0.94 },
      { n: '2', brand: 'Demo Atelier', title: 'Pleated Midi Skirt', shape: 'skirt', color: 'green', price: 95, fabric: 'Fabric: recycled polyamide', sizes: LETTERS, rating: [4.6, 70], visual: 0.9 },
      { n: '3', brand: 'Marlow Basics', title: 'A-Line Midi Skirt', shape: 'skirt', color: 'olive', price: 68, fabric: 'Fabric: cotton twill', sizes: LETTERS, rating: [4.3, 40], visual: 0.83 },
      { n: '4', brand: 'Juniper & Vale', title: 'Bias Silk Midi Skirt', shape: 'skirt', color: 'green', price: 180, fabric: 'Fabric: 100% silk', sizes: ['S', 'M', 'L'], rating: [4.8, 22], visual: 0.92 },
    ] },
  ] },
];

const swatches: Array<[string, Shape, string]> = [['q-wide-navy', 'wide', 'navy'], ['q-bodycon-red', 'column', 'red'], ['q-slip-rust', 'slip', 'rust'], ['q-leather-black', 'jacket', 'black'], ['q-crop-pink', 'cami', 'pink'], ['q-knit-cream', 'knit', 'cream']];

for (const dir of ['public/demo/looks', 'public/demo/products', 'public/demo/crops', 'public/demo/quiz']) rmSync(dir, { recursive: true, force: true });
for (const dir of ['public/demo/looks', 'public/demo/products', 'public/demo/crops', 'public/demo/quiz', 'data/demo']) mkdirSync(dir, { recursive: true });
const fixtures = looks.map(look => {
  const bytes = png(lookSvg(look.pieces.map(p => ({ shape: p.shape, color: p.color, layer: p.layer }))));
  writeFileSync(`public/demo/looks/${look.file}`, bytes);
  return {
    id: look.id, title: look.title, image: `/demo/looks/${look.file}`, hash: createHash('sha256').update(bytes).digest('hex'),
    garments: look.pieces.map(p => {
      writeFileSync(`public/demo/crops/${p.id}.svg`, product(p.shape, p.color));
      return {
        id: p.id, slot: p.slot, attributes: p.attributes, query: p.query, crop: `/demo/crops/${p.id}.svg`,
        candidates: p.candidates.map(c => {
          const id = `${p.id}-${c.n}`;
          writeFileSync(`public/demo/products/${id}.svg`, product(c.shape, c.color, c.stripes));
          return { id, title: c.title, brand: c.brand, url: `https://shop.example.com/${c.brand.toLowerCase().replace(/[^a-z]+/g, '-')}/${id}`, image: `/demo/products/${id}.svg`,
            price: c.price, currency: 'USD', sizes: c.sizes, fabric: c.fabric, rating: c.rating?.[0] ?? null, reviews: c.rating?.[1] ?? null, sources: ['demo-fixtures'], visual: c.visual };
        }),
      };
    }),
  };
});
for (const [id, shape, color] of swatches) writeFileSync(`public/demo/quiz/${id}.svg`, product(shape, color));
writeFileSync('data/demo/looks.json', JSON.stringify({ notice: 'Fictional demo looks and products. Brands, prices, links and scores are invented; detection and search are mocked in demo mode.', looks: fixtures }, null, 1) + '\n');
console.log(`Wrote ${fixtures.length} fictional looks, ${fixtures.flatMap(f => f.garments).length} pieces, ${fixtures.flatMap(f => f.garments.flatMap(g => g.candidates)).length} products.`);
