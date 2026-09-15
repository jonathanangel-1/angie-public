export function inferTaxonomy(name, sourcePage = '') {
  const text = `${name} ${sourcePage}`.toLowerCase();
  if (/\bblazer\b/.test(text)) return { category: 'layer', subtype: 'blazer' };
  if (/\b(coat|trench)\b/.test(text)) return { category: 'layer', subtype: 'coat' };
  if (/\b(jacket|blouson)\b/.test(text)) return { category: 'layer', subtype: 'jacket' };
  if (/\b(dress|gown)\b/.test(text)) return { category: 'dress', subtype: 'dress' };
  if (/\b(boots?|booties?)\b/.test(text)) return { category: 'shoes', subtype: 'boot' };
  if (/\b(loafers?|moccasins?)\b/.test(text)) return { category: 'shoes', subtype: 'loafer' };
  if (/\b(sneakers?|trainers?)\b/.test(text)) return { category: 'shoes', subtype: 'sneaker' };
  if (/\b(heels?|heeled|high-heels?|mid-heels?|slingbacks?)\b/.test(text)) return { category: 'shoes', subtype: 'heel' };
  if (/\b(sandals?|flip-flops?)\b/.test(text)) return { category: 'shoes', subtype: 'sandal' };
  if (/\b(flats?|ballet|ballerinas?)\b/.test(text)) return { category: 'shoes', subtype: 'flat' };
  if (/\b(skirt|skort)\b/.test(text)) return { category: 'bottom', subtype: 'skirt' };
  if (/\bshorts\b/.test(text)) return { category: 'bottom', subtype: 'short' };
  if (/\b(jeans?|denim pant)\b/.test(text)) return { category: 'bottom', subtype: 'jean' };
  if (/\b(trousers?|pants?|capris?|leggings?)\b/.test(text)) return { category: 'bottom', subtype: 'trouser' };
  if (/\bbodysuit\b/.test(text)) return { category: 'top', subtype: 'bodysuit' };
  if (/\b(cami|camisole|tank|halter)\b/.test(text)) return { category: 'top', subtype: 'cami' };
  if (/\b(t-?shirt|tee)\b/.test(text)) return { category: 'top', subtype: 'tee' };
  if (/\b(shirt|blouse)\b/.test(text)) return { category: 'top', subtype: 'shirt' };
  if (/\b(sweater|jumper|cardigan|knit|polo)\b/.test(text)) return { category: 'top', subtype: 'knit' };
  if (/\/shoes/.test(text)) return { category: 'shoes', subtype: 'unknown' };
  if (/\/dresses/.test(text)) return { category: 'dress', subtype: 'dress' };
  if (/\/blazers/.test(text)) return { category: 'layer', subtype: 'blazer' };
  if (/\/(jackets|coats-jackets)/.test(text)) return { category: 'layer', subtype: 'jacket' };
  if (/\/(trousers|pants)/.test(text)) return { category: 'bottom', subtype: 'trouser' };
  if (/\/jeans/.test(text)) return { category: 'bottom', subtype: 'jean' };
  if (/\/skirts/.test(text)) return { category: 'bottom', subtype: 'skirt' };
  if (/\/t-shirts/.test(text)) return { category: 'top', subtype: 'tee' };
  if (/\/(shirts|tops)/.test(text)) return { category: 'top', subtype: 'shirt' };
  if (/\/jumpers/.test(text)) return { category: 'top', subtype: 'knit' };
  return { category: 'top', subtype: 'unknown' };
}

export function inferAttributes(product) {
  const sentences = (product.attributes?.publicDescription || '').split(/(?<=[.!?])\s+/);
  const index = sentences.findIndex((sentence) => /\bfront view\b/i.test(sentence));
  const description = index >= 0 ? sentences.slice(index, index + 2).filter((sentence) => !/\b(outfit|set|paired with)\b/i.test(sentence)).join(' ') : '';
  const text = `${product.name} ${description}`.toLowerCase();
  // Outfit alt text often describes the trousers under a shirt. Do not let
  // those trousers turn the shirt into a baggy, cropped or sporty product.
  const derived = new Set(['drawstring', 'tie-waist', 'oversized', 'baggy', 'sporty', 'cropped', 'low-rise', 'barrel', 'shoulder-volume']);
  const details = new Set((product.attributes?.details || []).filter((detail) => !derived.has(detail)));
  if (/drawstring|drawcord/.test(text)) details.add('drawstring');
  if (/tie.?waist|tied waist|waist tie/.test(text)) details.add('tie-waist');
  if (/oversize|oversized|boyfriend/.test(text)) details.add('oversized');
  if (/baggy|palazzo/.test(text)) details.add('baggy');
  if (/technical|jogger|sweat|legging/.test(text)) details.add('sporty');
  if (/puff(?:ed)?\s+(?:shoulder|sleeve)|shoulder pads/.test(text)) details.add('shoulder-volume');
  const silhouette = /\bstraight\b/.test(text) ? 'straight'
    : /\b(kick.?flare|flare|flared)\b/.test(text) ? 'flare'
      : /\b(skinny)\b/.test(text) ? 'skinny'
        : /\b(barrel)\b/.test(text) ? 'barrel'
          : /\b(balloon)\b/.test(text) ? 'balloon'
            : /\b(wide|palazzo|relaxed|oversize|baggy)\b/.test(text) ? 'relaxed'
              : /\b(fitted|slim|body-hugging|snatched|contour)\b/.test(text) ? 'fitted'
                : product.visualEnrichment ? product.attributes?.silhouette || 'unknown' : 'unknown';
  const rise = /low.?rise|low waist/.test(text) ? 'low' : /mid.?rise|mid waist/.test(text) ? 'mid' : /high.?rise|high waist/.test(text) ? 'high' : product.visualEnrichment ? product.attributes?.rise || 'unknown' : 'unknown';
  const length = /\bmini\b/.test(text) ? 'mini' : /\bmaxi\b/.test(text) ? 'maxi' : /\bmidi\b/.test(text) ? 'midi' : /capri|crop|ankle/.test(text) ? 'cropped' : /full.?length|long trousers|long pants/.test(text) ? 'full' : product.visualEnrichment ? product.attributes?.length || 'unknown' : 'unknown';
  return { ...product.attributes, silhouette, ...(product.category === 'bottom' ? { rise } : {}), length, details: [...details] };
}
