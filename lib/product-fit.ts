import { angieProfile } from '@/data/angie-profile';
import evidence from '@/data/purchase-evidence.json';
import { inferTaxonomy } from '@/lib/catalog-taxonomy';
import type { CatalogProduct } from '@/lib/inspiration-engine';
import type { InspirationMemory, SizeConfidence } from '@/lib/inspiration-types';

const clean = (value: string) => value.toLowerCase().replace(/^(the|wilfred|babaton|sunday best|denim forum)\s+/g, '').replace(/[^a-z0-9]/g, '');
const history = evidence.records;
const bustInches = Number.parseFloat(angieProfile.measurements.bust);
const bustCm = bustInches * 2.54;
const waist = angieProfile.measurements.waist;
const hips = angieProfile.measurements.hips;
function sameStyle(product: CatalogProduct, record: typeof history[number]) {
  if (record.retailer !== product.retailer) return false;
  if(record.retailer==='Massimo Dutti' && record.productCode && product.masterProductId){
    const code=record.productCode.replace(/\D/g,'');
    if(code.length===7 && product.masterProductId.endsWith(code))return true;
  }
  if (record.productUrl && product.masterProductId) {
    const master = record.productUrl.match(/\/([0-9]+)\.html/)?.[1];
    if (master && master === product.masterProductId) return true;
  }
  return clean(record.name) === clean(product.name);
}

export function productFit(product: CatalogProduct, memory?: InspirationMemory): { size: string; confidence: SizeConfidence; watch: string } {
  const bySize = new Map<string,NonNullable<InspirationMemory['fitOutcomes']>[number]>();
  for(const row of memory?.fitOutcomes||[])if(row.catalogId===product.id&&row.size&&row.fit!=='unknown')bySize.set(row.size.toUpperCase(),row);
  const confirmed=[...bySize.values()].filter(row=>row.fit==='fits');
  if(confirmed.length)return {size:confirmed.map(row=>row.size).join(' / '),confidence:'High',watch:'You confirmed this size fitted this item. Recheck today’s stock.'};
  const exact = history.filter(row => sameStyle(product, row));
  const successes = exact.filter(row => row.fit === 'fits' && row.outcome === 'Kept' && !bySize.has(row.size.toUpperCase()));
  const failures = exact.filter(row => !['unknown', 'fits'].includes(row.fit));
  const successfulSizes = [...new Set(successes.map(row => row.size))];
  if (successfulSizes.length) {
    const uncertain = failures.some(row => successfulSizes.includes(row.size));
    return { size: successfulSizes.join(' / '), confidence: uncertain ? 'Low' : 'Moderate',
      watch: uncertain ? 'Your fit reports for this style disagree. Compare this version’s measurements.'
        : `You reported a good fit in ${successes[0].name}, size ${successfulSizes.join(' / ')}. This season’s cut and stock still need checking.` };
  }
  if(bySize.size){const outcome=[...bySize.values()].at(-1)!;return {size:'Check another size',confidence:'Low',watch:`You tried ${outcome.size}: ${outcome.fit.replaceAll('-',' ')}. Check the product measurements before reordering.`};}
  if (failures.length) return { size: 'Check another size', confidence: 'Low',
    watch: `Previously tried ${failures[0].size}: ${failures[0].fit.replaceAll('-', ' ')}. A new size is not established.` };
  const subtype = product.subtype || inferTaxonomy(product.name, product.sourcePage).subtype;
  if (product.category === 'top' && product.bodySizeChart?.unit === 'cm' && product.bodySizeChart.sourceUrl === product.canonicalUrl) {
    // Body-chart guidance is not a garment measurement or a confirmed try-on.
    // Read measurements from the active synthetic profile.
    const nearest = [...product.bodySizeChart.rows].filter(row=>Number.isFinite(row.bust)).sort((a,b)=>Math.abs(a.bust-bustCm)-Math.abs(b.bust-bustCm))[0];
    if(nearest && Math.abs(nearest.bust-bustCm)<=2.54) return {size:nearest.size,confidence:'Low',watch:`Retailer body chart: ${nearest.size} lists a ${nearest.bust} cm bust; your recorded bust is ${bustInches} in (${bustCm.toFixed(1)} cm). This does not verify garment ease or stock.`};
  }
  const related = history.filter(row => row.retailer === product.retailer && row.outcome === 'Kept'
    && (row.fit==='fits' || row.fit==='unknown' && !/uncomfortable|tight|tide|small|short|loose|big/i.test(row.note))
    && inferTaxonomy(row.name).subtype === subtype);
  const sizes = [...new Set(related.map(row => row.size))].filter(Boolean);
  if (sizes.length && sizes.length <= 2) return { size: sizes.join(' / '), confidence: 'Low',
    watch: `Starting point from your kept ${related[0].name}${related[0].fit==='fits'?' with confirmed good fit':''}. Check this item’s measurements${product.category === 'bottom' ? ', hip ease and inseam' : ' and cut'}; stock is unconfirmed.` };
  if(product.category==='top'){
    const anchors=history.filter(row=>row.retailer===product.retailer&&row.outcome==='Kept'&&/^(XXS|XS|S|M|L)$/i.test(row.size)
      && ['tee','shirt','knit','cami'].includes(inferTaxonomy(row.name).subtype)
      && row.fit==='fits');
    const counts=new Map<string,number>();for(const row of anchors)counts.set(row.size,(counts.get(row.size)||0)+1);
    const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
    if(ranked[0]?.[1]>=2 && ranked[0][1]>(ranked[1]?.[1]||0))return {size:ranked[0][0],confidence:'Low',watch:`Tentative starting size from your confirmed ${product.retailer} top fits, not this exact cut. Compare the chart with your ${bustInches}-inch bust and check how closely the fabric clings.`};
  }
  return { size: 'Check size chart', confidence: 'Low',
    watch: subtype === 'jean' ? `Compare the chart with your ${waist} waist and ${hips} hips; check inseam and stretch.`
      : product.category === 'shoes' ? 'No confirmed shoe-size anchor yet. Use the retailer’s chart.'
      : `No reliable size anchor for this cut. Compare the chart with your ${product.category === 'bottom' ? `${waist} waist and ${hips} hips` : `${bustInches}-inch bust`}.` };
}

export function purchasePreference(product: CatalogProduct) {
  const rows = history.filter(row => sameStyle(product, row));
  // A return alone never means dislike; color comments never become size evidence.
  const values = rows.map(row => /don.t like|dislike/i.test(row.taste) ? -6 : /love/i.test(row.taste) ? 5 : /like/i.test(row.taste) ? 2 : 0);
  return values.length ? values.reduce<number>((a,b)=>a+b,0)/values.length : 0;
}
