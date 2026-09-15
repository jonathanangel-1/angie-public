import { productFit } from '@/lib/product-fit';
import { inferTaxonomy } from '@/lib/catalog-taxonomy';
import type { CatalogProduct } from '@/lib/inspiration-engine';
import type { InspirationEdit, InspirationMemory, RecommendationItem } from '@/lib/inspiration-types';

export function refreshedFit(item:RecommendationItem,memory:InspirationMemory){
  const product:CatalogProduct={id:item.catalogId||item.id,retailerProductId:item.variantId||'',
    masterProductId:item.fitEvidence?.masterProductId || item.officialUrl.match(/(?:\/|l)(\d+)(?:\.html)?(?:\?|$)/)?.[1],bodySizeChart:item.fitEvidence?.bodySizeChart,retailer:item.brand,
    name:item.name,...inferTaxonomy(item.name),canonicalUrl:item.officialUrl,verifiedAt:item.checkedAt||'',status:'active',
    color:item.color||'unknown',price:null,imageUrl:'',attributes:Object.fromEntries(item.attributes.map(a=>[a.type,a.value]))};
  const fit=productFit(product,memory);
  return {recommendedSize:fit.size,sizeConfidence:fit.confidence,fitWatch:fit.watch};
}
export const refreshSavedEdits=(edits:InspirationEdit[],memory:InspirationMemory)=>edits.map(edit=>({...edit,items:edit.items.map(item=>({...item,...refreshedFit(item,memory)}))}));
