import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Candidate } from '@/lib/look/types';
import { features, violatesNever } from '@/lib/taste/features';
import { learnWeights, rankCandidates, returnRisk } from '@/lib/taste/model';
import { nearestListed, suggestSize } from '@/lib/taste/size';
import { emptyQuiz, type Purchase, type TasteState } from '@/lib/taste/types';

const item = (fields: Partial<Candidate>): Candidate => ({ id: fields.title || 'x', title: 'Wide-leg trouser', brand: 'Demo Atelier', url: 'https://shop.example.com/x', image: '', price: 100, currency: 'USD', sizes: ['XS', 'S', 'M', 'L'], fabric: '', rating: null, reviews: null, sources: ['mock'], visual: 0.8, ...fields });
const purchase = (fields: Partial<Purchase>): Purchase => ({ id: Math.random().toString(), brand: 'Northfield Studio', title: 'Harbor wide-leg trouser', slot: 'pants', size: '8', status: 'kept', source: 'manual', confidence: 1, createdAt: 1, ...fields });
const state = (fields: Partial<TasteState> = {}): TasteState => ({ quiz: { ...emptyQuiz(), sizes: { top: 'M', bottom: '8', dress: 'M', jeans: '28' } }, purchases: [], reactions: [], ...fields });

test('features read colour, fabric, style and price from product text', () => {
  const fs = features({ title: 'Black Faux Leather Cropped Biker Jacket', brand: 'Coastline', fabric: 'Fabric: 100% polyester', price: 89 });
  for (const f of ['color:black', 'fabric:faux leather', 'fabric:polyester', 'style:cropped', 'price:50-120', 'brand:coastline']) assert.ok(fs.includes(f), f);
  assert.ok(!fs.includes('fabric:leather'), 'faux leather is not leather');
});

test('never-wear items and avoided brands are excluded, with the reason kept', () => {
  const s = state(); s.quiz.neverWear = ['bodycon', 'polyester']; s.quiz.brandsAvoid = ['Rue Minuit'];
  const { ranked, excluded } = rankCandidates([item({ title: 'Red Bodycon Mini Dress' }), item({ title: 'Slip dress', fabric: '100% polyester' }), item({ title: 'Wrap dress', brand: 'Rue Minuit' }), item({ title: 'Linen wrap dress' })], 'dress', s);
  assert.deepEqual(ranked.map(r => r.title), ['Linen wrap dress']);
  assert.deepEqual(excluded.map(e => e.reason), ['never wear: bodycon', 'never wear: polyester', 'brand you avoid']);
});

test('a kept item outweighs a quiz reaction; a fit return teaches size, not taste', () => {
  const s = state({ purchases: [purchase({ title: 'Navy wide-leg trouser', status: 'returned', returnReason: 'too-small' })] });
  assert.equal(learnWeights(s).get('style:wide-leg') ?? 0, 0);
  s.quiz.imageReactions = { 'q-wide-navy': 'no' };
  s.purchases.push(purchase({ title: 'Navy wide-leg trouser', size: '10', status: 'kept', createdAt: 2 }));
  assert.ok(learnWeights(s).get('style:wide-leg')! > 0);
});

test('"no, wrong colour" only lowers that colour, not the cut or the brand', () => {
  const s = state({ reactions: [{ id: 'r1', brand: 'Juniper & Vale', title: 'Red wrap dress', features: ['brand:juniper & vale', 'color:red', 'style:wrap'], reaction: 'no', reason: 'color', createdAt: 1 }] });
  const w = learnWeights(s);
  assert.equal(w.get('color:red'), -1);
  assert.equal(w.get('style:wrap') ?? 0, 0);
  assert.equal(w.get('brand:juniper & vale') ?? 0, 0);
});

test('ranking prefers what she keeps over a slightly closer look-alike she tends to return', () => {
  const s = state({ purchases: [
    purchase({ brand: 'Coastline Supply', title: 'Satin slip skirt', slot: 'skirt', status: 'returned', returnReason: 'quality' }),
    purchase({ brand: 'Coastline Supply', title: 'Satin midi skirt', slot: 'skirt', status: 'returned', returnReason: 'quality' }),
    purchase({ brand: 'Demo Atelier', title: 'Pleated midi skirt', slot: 'skirt', size: 'S', status: 'kept' }),
  ] });
  const { ranked } = rankCandidates([
    item({ title: 'Satin midi skirt', brand: 'Coastline Supply', visual: 0.86, sizes: ['S', 'M'] }),
    item({ title: 'Pleated midi skirt', brand: 'Demo Atelier', visual: 0.8, sizes: ['S', 'M'] }),
  ], 'skirt', s);
  assert.equal(ranked[0].brand, 'Demo Atelier');
  assert.ok(ranked[1].risk > ranked[0].risk);
  assert.ok(ranked[1].riskReasons.some(r => /satin for quality/.test(r)));
});

test('size: a "too small" return at a brand moves that brand up one size', () => {
  const s = suggestSize({ brand: 'Northfield Studio', title: 'Harbor trouser', sizes: ['6', '8', '10', '12'] }, 'pants', state().quiz, [purchase({ status: 'returned', returnReason: 'too-small' })]);
  assert.deepEqual([s.size, s.confidence], ['10', 'medium']);
  assert.match(s.note, /returned 8 .* too small/);
});

test('size: kept history beats the stated size; unknown brands use the stated size', () => {
  const kept = suggestSize({ brand: 'Northfield Studio', title: 'Straight jean', sizes: ['6', '8', '10'] }, 'pants', state().quiz, [purchase({ size: '10' })]);
  assert.deepEqual([kept.size, kept.confidence], ['10', 'high']);
  const fresh = suggestSize({ brand: 'New Brand', title: 'Linen trouser', sizes: ['XS', 'S', 'M'] }, 'pants', state().quiz, []);
  assert.deepEqual([fresh.size, fresh.confidence], ['M', 'low'], 'numeric 8 maps to M across systems');
});

test('size labels normalise across systems', () => {
  assert.deepEqual(nearestListed('M', ['X-Small', 'Small', 'Medium']), { label: 'Medium', exact: true });
  assert.deepEqual(nearestListed('28', ['4', '6', '8']), { label: '6', exact: false });
  assert.equal(nearestListed('M', ['One Size']), null);
});

test('return risk uses her brand history and product ratings', () => {
  const size = { size: 'M', confidence: 'medium' as const, note: '' };
  const good = returnRisk(item({ brand: 'Demo Atelier', rating: 4.8, reviews: 300 }), [], [purchase({ brand: 'Demo Atelier' }), purchase({ brand: 'Demo Atelier' })], size);
  const bad = returnRisk(item({ brand: 'Coastline', rating: 3.4, reviews: 80 }), [], [purchase({ brand: 'Coastline', status: 'returned', returnReason: 'style' })], size);
  assert.ok(good.risk < 0.2 && bad.risk > 0.4, `${good.risk} ${bad.risk}`);
});

test('never-wear matching is word-based', () => {
  assert.equal(violatesNever({ title: 'Cropped cardigan', fabric: '' }, ['crop tops']), 'crop tops');
  assert.equal(violatesNever({ title: 'Minimalist midi dress', fabric: '' }, ['mini length']), null);
});
