import assert from 'node:assert/strict';
import { test } from 'node:test';
import catalog from '../data/demo/catalog.json';
import { describeAdjustments, emptyLearnedFit, learnFit, recommendSize } from '@/lib/fit/model';
import type { BodySizeChart, FitProfile, Outcome, Product } from '@/lib/fit/types';

const products = catalog.products as unknown as Product[];
const charts = catalog.sizeCharts as unknown as BodySizeChart[];
const product = (id: string) => products.find(p => p.id === id)!;
// Fictional measurements, in inches.
const profile: FitProfile = { body: { bust: 36, waist: 29, hips: 40.5, inseam: 31, height: 67 }, references: [] };
let clock = 1;
const outcome = (fields: Partial<Outcome> & Pick<Outcome, 'brand' | 'category' | 'size' | 'result' | 'fit'>): Outcome => ({ id: `o${clock}`, createdAt: clock++, ...fields });

test('measurements inside one size of a brand chart give that size with medium confidence', () => {
  const fit = recommendSize(product('nf-navy-wide-leg'), profile, emptyLearnedFit(), charts);
  assert.equal(fit.size, '8');
  assert.equal(fit.confidence, 'medium');
  assert.match(fit.note, /First order from Northfield Studio/);
});

test('a "too small in the hips" return moves the brand to the next size and never repeats the failed size', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', productId: 'nf-navy-wide-leg', result: 'returned', fit: 'too-small', area: 'hips' })], charts, products);
  const adjustment = learned.adjustments.find(a => a.brand === 'Northfield Studio' && a.area === 'hips')!;
  assert.equal(adjustment.offset, 1);
  const fit = recommendSize(product('nf-navy-wide-leg'), profile, learned, charts);
  assert.equal(fit.size, '10');
  assert.match(fit.note, /hips \+1 in/);
  assert.equal(recommendSize(product('nf-camel-wide-leg'), profile, learned, charts).size, '10', 'a sibling item from the same brand learns too');
  assert.match(describeAdjustments(learned)[0].text, /Northfield Studio bottoms: treat your hips as \+1 in \(size up\)/);
});

test('a return without a stated area blames the dimension closest to its limit', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', productId: 'nf-navy-wide-leg', result: 'returned', fit: 'too-small' })], charts, products);
  assert.deepEqual(learned.adjustments.map(a => a.area), ['hips']);
});

test('what a brand teaches carries over, damped, to its other categories and to unseen brands', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', result: 'returned', fit: 'too-small', area: 'hips' })], charts, products);
  const dress = recommendSize(product('nf-camel-wrap-dress'), profile, learned, charts);
  assert.equal(dress.checks.find(c => c.dimension === 'hips')!.adjustment, 0.75);
  assert.equal(dress.confidence, 'low');
  assert.match(dress.note, /hips 0.3 in tight\. L gives the hips room but runs loose elsewhere/);
  const otherBrand = recommendSize(product('da-cream-wide-leg'), profile, learned, charts);
  assert.equal(otherBrand.checks.find(c => c.dimension === 'hips')!.adjustment, 0.5);
});

test('keeping a size that fitted makes the next recommendation for that brand high confidence', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', productId: 'nf-navy-wide-leg', result: 'kept', fit: 'fits' })], charts, products);
  const fit = recommendSize(product('nf-camel-wide-leg'), profile, learned, charts);
  assert.equal(fit.size, '8');
  assert.equal(fit.confidence, 'high');
});

test('a later "fits" outcome pulls a mistaken adjustment back inside the size she kept', () => {
  const learned = learnFit(profile, [
    outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', result: 'returned', fit: 'too-small', area: 'hips' }),
    outcome({ brand: 'Northfield Studio', category: 'bottom', size: '8', result: 'kept', fit: 'fits' }),
  ], charts, products);
  const hips = learned.adjustments.find(a => a.area === 'hips')!;
  assert.ok(profile.body.hips! + hips.offset <= 41, 'effective hips must fall back inside size 8');
  assert.equal(recommendSize(product('nf-navy-wide-leg'), profile, learned, charts).size, '8');
});

test('returning for style or quality excludes the product but teaches nothing about size', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Demo Atelier', category: 'dress', size: 'M', productId: 'da-green-wrap-dress', result: 'returned', fit: 'not-fit', reason: 'style' })], charts, products);
  assert.deepEqual(learned.excludedProducts, ['da-green-wrap-dress']);
  assert.equal(learned.adjustments.length, 0);
});

test('garment measurements use the ease of a garment she already likes', () => {
  const jv = product('jv-navy-wide-leg');
  const defaultEase = recommendSize(jv, profile, emptyLearnedFit(), charts);
  assert.equal(defaultEase.size, 'M');
  const roomy: FitProfile = { ...profile, references: [{ id: 'r1', category: 'bottom', label: 'Fictional favourite trousers', measurements: { waist: 30, hips: 45.5 } }] };
  const withReference = recommendSize(jv, roomy, emptyLearnedFit(), charts);
  assert.equal(withReference.size, 'L', 'she likes 5 in of hip ease, so M (43.5 in) is too snug');
  assert.match(withReference.note, /Closest size: hips fits, but waist 1.5 in loose/);
  assert.match(withReference.note, /ease of the garment you like/);
});

test('without a size chart, a kept size at the brand is the answer; without either, no size is invented', () => {
  const tee = product('mb-white-vneck-tee');
  assert.equal(recommendSize(tee, profile, emptyLearnedFit(), charts).size, null);
  const learned = learnFit(profile, [outcome({ brand: 'Marlow Basics', category: 'top', size: 'S', result: 'kept', fit: 'fits' })], charts, products);
  const fit = recommendSize(tee, profile, learned, charts);
  assert.equal(fit.size, 'S');
  assert.equal(fit.confidence, 'medium');
});

test('missing measurements are named instead of guessed', () => {
  const fit = recommendSize(product('da-black-column-dress'), { body: {}, references: [] }, emptyLearnedFit(), charts);
  assert.equal(fit.size, null);
  assert.match(fit.note, /Add your bust, waist, hips/);
});

test('between two sizes, the note says so and confidence drops', () => {
  const fit = recommendSize(product('jv-striped-tee'), profile, emptyLearnedFit(), charts);
  assert.equal(fit.confidence, 'low');
  assert.match(fit.note, /Between (M and L|L and M)/);
});

test('trouser length learns from "too long" returns', () => {
  const learned = learnFit(profile, [outcome({ brand: 'Juniper & Vale', category: 'bottom', size: 'M', productId: 'jv-navy-wide-leg', result: 'returned', fit: 'too-long' })], charts, products);
  const inseam = learned.adjustments.find(a => a.area === 'inseam')!;
  assert.equal(profile.body.inseam! + inseam.offset, 31);
  assert.match(recommendSize(product('jv-navy-wide-leg'), profile, learned, charts).note, /Inseam 32 in is 1 in longer than you like/);
});

test('the learned state is a pure replay of the outcome log', () => {
  const log = [
    outcome({ brand: 'Northfield Studio', category: 'dress', size: 'M', result: 'returned', fit: 'too-small', area: 'bust' }),
    outcome({ brand: 'Demo Atelier', category: 'top', size: 'M', result: 'kept', fit: 'tight' }),
  ];
  assert.deepEqual(learnFit(profile, log, charts, products), learnFit(profile, [...log].reverse(), charts, products));
});
