import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const labelsPath = process.env.ANGIE_EVAL_LABELS || path.resolve(ROOT, '..', 'outputs', 'angie-blind-labels-v1', 'angie-blind-labels.json');
const candidatesPath = path.join(ROOT, 'data', 'candidates.json');
const labelsFile = JSON.parse(await readFile(labelsPath, 'utf8'));
const candidates = JSON.parse(await readFile(candidatesPath, 'utf8'));
const labels = new Map(labelsFile.ratings.map((row) => [row.candidateId, row]));

function hardVeto(candidate) {
  const text = [candidate.name, candidate.cut, candidate.description, candidate.privateRisk, candidate.privateAnchor].join(' ').toLowerCase();
  const rules = [];
  if (/\blow[- ]?(?:rise|waist|slung)\b/.test(text)) rules.push('low-rise');
  if (/\b(barrel|balloon|drop crotch)\b/.test(text)) rules.push('uncontrolled-shape');
  if (/\b(drawstring|drawcord|binding wire|tie-waist|tied hems|side-tie)\b/.test(text)) rules.push('visible-tie');
  if (/\b(baggy|extreme volume)\b/.test(text)) rules.push('baggy');
  return rules;
}

const evaluated = candidates.map((candidate) => ({ candidate, label: labels.get(candidate.id), vetoes: hardVeto(candidate) })).filter((row) => row.label);
const wouldFalseVetoes = evaluated.filter((row) => row.label.rating === 'would' && row.vetoes.length);
const vetoedNo = evaluated.filter((row) => row.label.rating === 'no' && row.vetoes.length);
const allVetoed = evaluated.filter((row) => row.vetoes.length);
const precision = allVetoed.length ? vetoedNo.length / allVetoed.length : 0;
const report = {
  ok: wouldFalseVetoes.length === 0 && precision >= 0.75,
  evaluationType: 'training-regression-only',
  heldOutValidation: false,
  warning: 'These 30 labels shaped the rules. This protects known behavior but does not prove generalization; fresh live reactions are the held-out test.',
  labels: labels.size,
  hardVetoPrecisionAgainstNo: Number(precision.toFixed(3)),
  vetoedKnownNo: vetoedNo.map((row) => ({ id: row.candidate.id, rules: row.vetoes })),
  falseVetoedWould: wouldFalseVetoes.map((row) => ({ id: row.candidate.id, rules: row.vetoes })),
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
