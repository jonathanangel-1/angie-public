import { buildCatalogRecommendations, prepareVisualCandidates, selectionDiagnostics } from '@/lib/inspiration-engine';
import { interpretInspiration, combineProducts, rankVisualCandidates, discoverProducts, verifySelection, retrieveCatalog, discoverMerchantFeeds } from '@/lib/demo-adapters';
import type { InspirationMemory } from '@/lib/inspiration-types';
import { preparedCatalog } from '@/lib/catalog-retrieval';
import { SearchBudget } from '@/lib/search-budget';
import type { DiscoveryScope } from '@/lib/retailer-sources';

// One implementation for the HTTP app and live-image regression runner.
// The runner replaces storage, not interpretation, search, ranking or link checks.
export async function generateInspiration(imageType: string, imageBytes: ArrayBuffer | null, note: string, memory: InspirationMemory,
  progress: (stage: string, details: Record<string, unknown>) => void = () => {},
  budget = new SearchBudget({ onUsage: row => progress('search-usage', row) }),
  options: { discovery?: DiscoveryScope } = {}) {
  progress('interpretation', {});
  const interpreted = await interpretInspiration(imageType, imageBytes, note, memory, budget);
  const discovery = { products: [] as ReturnType<typeof combineProducts>, status: 'catalog-first' };
  if (options.discovery === 'expanded') {
    const feedProducts = await discoverMerchantFeeds();
    discovery.products.push(...feedProducts);
    progress('merchant-feeds', { products: feedProducts.length, merchants: [...new Set(feedProducts.map(p => p.retailer))] });
  }
  let searchIncomplete = false;
  // Discover every garment before ranking, so a catalog rich in trousers
  // cannot leave the top without candidates. The runner uses this same path.
  if (options.discovery === 'expanded') {
    for (const garment of interpreted.intent.garments) {
      let found;
      try {
        found = await discoverProducts({ ...interpreted.intent, garments: [garment] }, budget, 'expanded');
      } catch (error) {
        // An optional discovery failure must not erase usable catalog matches.
        if (!/Search budget/.test(String(error))) throw error;
        searchIncomplete = true;
        progress('expanded-discovery-unavailable', { slot: garment.slot });
        break;
      }
      discovery.products.push(...found.products);
      if (found.status === 'discovery-unavailable') searchIncomplete = true;
      progress('expanded-discovery', { slot: garment.slot, status: found.status, products: found.products.map(p => ({ id: p.id, name: p.name, url: p.canonicalUrl, image: p.imageSourceUrl })) });
    }
    discovery.status = 'expanded-discovery';
  }
  let productPool = preparedCatalog(combineProducts(discovery.products));
  const attempted = new Set<string>();
  const verifyCandidates = async (candidates: ReturnType<typeof prepareVisualCandidates>) => {
    for (const candidate of candidates) attempted.add(candidate.id);
    const ids = new Set(candidates.map(c => c.id));
    const verification = await verifySelection(productPool.filter(p => ids.has(p.id)));
    const rejected = new Set(verification.rejected);
    const accepted = new Map(verification.accepted.map(p => [p.id, p]));
    productPool = productPool.filter(p => !rejected.has(p.id)).map(p => accepted.get(p.id) || p);
    progress('candidate-link-check', { checked: ids.size, rejected: rejected.size,
      candidates: candidates.map(c => ({ id: c.id, slot: c.targetSlot, name: c.name, accepted: accepted.has(c.id) })) });
    return candidates.filter(c => accepted.has(c.id)).map(c => ({ ...c, imageSourceUrl: accepted.get(c.id)!.imageSourceUrl || c.imageSourceUrl,
      imageDataUrl: accepted.get(c.id)!.privateImageEvidence?.sourceUrl === accepted.get(c.id)!.imageSourceUrl ? accepted.get(c.id)!.privateImageEvidence?.dataUrl : accepted.get(c.id)!.imageSourceUrl === c.imageSourceUrl ? c.imageDataUrl : undefined }));
  };
  progress('retrieval', { intent: interpreted.intent, catalog: productPool.length });
  const retrieval = await retrieveCatalog(interpreted.intent, productPool, budget);
  progress('visual-comparison', { catalog: productPool.length, retrieval: retrieval.mode });
  let shortlist = prepareVisualCandidates(interpreted.intent, memory, productPool, retrieval.scores, 10);
  if (options.discovery === 'expanded') {
    // Include retained discoveries as well as this request's new finds. Their
    // images have not yet entered the precomputed base-catalog embedding index.
    const discovered = prepareVisualCandidates(interpreted.intent, memory, productPool.filter(p => p.id.startsWith('live-')), undefined, 5);
    shortlist = interpreted.intent.garments.flatMap(garment => {
      const unique = new Map([...discovered, ...shortlist].filter(c => c.targetSlot === garment.slot).map(c => [c.id, c]));
      return [...unique.values()].slice(0, 10);
    });
  }
  progress('candidate-shortlist', { candidates: shortlist.map(c => ({ id: c.id, slot: c.targetSlot, retailer: c.retailer, name: c.name })) });
  shortlist = await verifyCandidates(shortlist);
  const visual = imageBytes
    ? await rankVisualCandidates(imageType, imageBytes, interpreted.intent, shortlist, budget)
    : { matches: [], model: '' };
  progress('initial-selection', { ...selectionDiagnostics(interpreted.intent, memory, visual.matches, productPool), matches: visual.matches, discoveryStatus: discovery.status });
  let initial: ReturnType<typeof buildCatalogRecommendations> | undefined;
  try { initial = buildCatalogRecommendations(interpreted.intent, interpreted.brief, memory, visual.matches, productPool); }
  catch (error) { if (!(error instanceof Error) || !/^No verified/.test(error.message)) throw error; }
  const missingGarments = () => {
  const coveredSlots = new Set((initial?.edits[0]?.items || []).map(item => {
    if(imageBytes) return visual.matches.find(match => match.candidateId === item.catalogId)?.targetSlot;
    const product=productPool.find(p=>p.id===item.catalogId);
    return interpreted.intent.garments.find(g=>product?.category===g.category&&(g.subtype==='unknown'||g.subtype===product?.subtype))?.slot;
  }));
  return interpreted.intent.garments.filter(garment => !coveredSlots.has(garment.slot));
  };
  let missing = missingGarments();
  // A shortlist miss is not an inventory miss. Examine a second, disjoint
  // evidence-ready page before paying for web discovery of the same products.
  const weakSlots = new Set((initial?.edits[0]?.items || []).flatMap(item => {
    const match = visual.matches.find(m => m.candidateId === item.catalogId);
    return match && (match.score < 75 || item.matchDifferences?.some(difference => /Retailer describes a looser fit/.test(difference))) ? [match.targetSlot] : [];
  }));
  const recallTargets = interpreted.intent.garments.filter(g => missing.some(m => m.slot === g.slot) || weakSlots.has(g.slot));
  if (imageBytes && productPool.length && recallTargets.length) {
    // Exclude all attempted candidates, not only scored ones: an inaccessible
    // image must not consume the second page again.
    const secondPage = await verifyCandidates(prepareVisualCandidates({ ...interpreted.intent, garments: recallTargets }, memory, productPool.filter(p => !attempted.has(p.id)), retrieval.scores, 10));
    if (secondPage.length) {
      progress('expanded-catalog-recall', { slots: recallTargets.map(g => g.slot), candidates: secondPage.map(c => ({ id: c.id, slot: c.targetSlot, name: c.name })) });
      try {
        const retry = await rankVisualCandidates(imageType, imageBytes, { ...interpreted.intent, garments: recallTargets }, secondPage, budget);
        visual.matches.push(...retry.matches);
      } catch (error) {
        if (!initial?.edits[0]?.items.length) throw error;
        searchIncomplete = true;
        progress('expanded-recall-unavailable', { slots: recallTargets.map(g => g.slot), error: error instanceof Error ? error.message : 'Comparison unavailable' });
      }
      try { initial = buildCatalogRecommendations(interpreted.intent, interpreted.brief, memory, visual.matches, productPool); }
      catch (error) { if (!(error instanceof Error) || !/^No verified/.test(error.message)) throw error; }
      missing = missingGarments();
    }
  }
  // Search specifically for missing pieces; the first outfit-wide search often
  // spends its entire result budget on trousers and leaves other slots empty.
  // A barely acceptable fallback is not a reason to stop searching that slot.
  const remainingWeakSlots = new Set((initial?.edits[0]?.items || []).flatMap(item => {
    const match = visual.matches.find(m => m.candidateId === item.catalogId);
    return match && match.score < 75 ? [match.targetSlot] : [];
  }));
  missing = interpreted.intent.garments.filter(g => missing.some(m => m.slot === g.slot) || remainingWeakSlots.has(g.slot));
  if (missing.length) {
    progress('missing-piece-search', { slots: missing.map(garment => garment.slot) });
    const recovered = [];
    // Settle one expensive search reservation before reserving the next. This
    // preserves the spending ceiling without starving a sibling garment.
    for (let index = 0; index < missing.length; index += 1) {
      const attempts = await Promise.allSettled(missing.slice(index, index + 1).map(async garment => {
        try {
          const found = await discoverProducts({ ...interpreted.intent, scope: 'single-item', requestedCategory: garment.category, requestedSubtype: garment.subtype, garments: [garment] }, budget, options.discovery, true);
          if (found.status === 'discovery-unavailable') searchIncomplete = true;
          return found;
        }
        catch(error){ if (!initial?.edits[0]?.items.length) throw error; searchIncomplete = true; progress('missing-piece-unavailable',{slot:garment.slot,error:error instanceof Error?error.message:'Search unavailable'}); return {products:[]}; }
      }));
      const failed = attempts.find(result => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      const found = attempts.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      recovered.push(...found.flatMap(result => result.products));
    }
    if (recovered.length) {
      const previous = new Map(productPool.map(product => [product.canonicalUrl, product.imageSourceUrl]));
      productPool = preparedCatalog(combineProducts([...discovery.products, ...recovered]));
      const newEvidence = productPool.filter(product => !previous.has(product.canonicalUrl) || previous.get(product.canonicalUrl) !== product.imageSourceUrl);
      const candidates = await verifyCandidates(prepareVisualCandidates({ ...interpreted.intent, garments: missing }, memory, newEvidence, undefined, 10));
      if (candidates.length && imageBytes) {
        try {
          const retry = await rankVisualCandidates(imageType, imageBytes, { ...interpreted.intent, garments: missing }, candidates, budget);
          const merged = new Map(visual.matches.map(match => [match.candidateId, match]));
          for (const match of retry.matches) merged.set(match.candidateId, match);
          visual.matches = [...merged.values()];
        } catch (error) {
          // A blocked image for an extra garment must not erase the already
          // qualified pieces. They still pass link verification below.
          if (!initial?.edits[0]?.items.length) throw error;
          searchIncomplete = true;
          progress('missing-piece-unavailable', { slots: missing.map(garment => garment.slot), error: error instanceof Error ? error.message : 'Comparison unavailable' });
        }
      }
      discovery.products.push(...recovered);
      discovery.status += '+targeted-recovery';
    }
  }
  if (imageBytes && !visual.matches.length) throw new Error('No verified close visual match among the products checked.');
  let generated = buildCatalogRecommendations(interpreted.intent, interpreted.brief, memory, visual.matches, productPool);
  const checked = new Set<string>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const selectedIds = new Set(generated.edits.flatMap((edit) => edit.items.map((item) => item.catalogId)));
    const selected = productPool.filter((product) => selectedIds.has(product.id) && !checked.has(product.id));
    if (!selected.length) break;
    const verification = await verifySelection(selected);
    const rejected = new Set(verification.rejected);
    const accepted = new Map(verification.accepted.map((product) => [product.id, product]));
    for (const id of accepted.keys()) checked.add(id);
    productPool = productPool.filter((product) => !rejected.has(product.id)).map((product) => accepted.get(product.id) || product);
    if (attempt === 2) productPool = productPool.filter((product) => checked.has(product.id));
    progress('link-verification', { ...selectionDiagnostics(interpreted.intent, memory, visual.matches, productPool), acceptedLinks: checked.size, rejectedLinks: rejected.size });
    generated = buildCatalogRecommendations(interpreted.intent, interpreted.brief, memory, visual.matches, productPool);
  }
  generated.searchMode += `+${retrieval.mode}+${discovery.status}`;
  if (searchIncomplete) {
    generated.searchMode += '+search-incomplete';
    generated.edits = generated.edits.map(edit => edit.missingSlots?.length ? { ...edit, searchIncomplete: true, finish: 'Search could not finish every piece.' } : edit);
  }
  return { interpreted, discovery, productPool, visual, generated, usage: budget.snapshot() };
}
