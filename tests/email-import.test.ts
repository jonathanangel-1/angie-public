import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { importCandidates, parseEmail } from '@/lib/taste/email';

const dir = new URL('../public/demo/emails/', import.meta.url);
const emails = readdirSync(dir).sort().map(f => readFileSync(new URL(f, dir), 'utf8'));
const now = Date.parse('2026-09-28T12:00:00Z');

test('classifies order, return and non-order emails', () => {
  assert.deepEqual(emails.map(e => parseEmail(e).kind), ['order', 'order', 'order', 'return', 'return', 'return', 'other']);
});

test('reads items from plain-text, quoted-printable HTML and bracketed layouts', () => {
  assert.deepEqual(parseEmail(emails[0]).items.map(i => [i.title, i.size, i.price]), [['Harbor Wide-Leg Trouser Navy', '8', 118], ['Wrap Midi Dress Camel', 'M', 148]]);
  const juniper = parseEmail(emails[1]);
  assert.equal(juniper.orderId, 'JV5531');
  assert.deepEqual(juniper.items.map(i => [i.title, i.size, i.price]), [['Crepe Wrap Dress', 'M', 170], ['Poplin Button-Down', 'S', 95]]);
  assert.deepEqual(parseEmail(emails[2]).items.map(i => [i.title, i.size]), [['Everyday V-neck Tee', 'S'], ['Soft Blazer', 'M']]);
});

test('joins returns to their orders and keeps the reason', () => {
  const { candidates, skipped } = importCandidates(emails, now);
  const trouser = candidates.find(c => c.title.startsWith('Harbor'))!;
  assert.equal(trouser.status, 'returned');
  assert.equal(trouser.returnReason, 'too-small');
  assert.equal(trouser.slot, 'pants');
  const wrap = candidates.find(c => c.title === 'Crepe Wrap Dress')!;
  assert.equal(wrap.status, 'returned');
  assert.equal(wrap.returnReason, 'style');
  assert.deepEqual(skipped.map(s => s.why), ['not an order or return']);
});

test('noise is flagged, not trusted: presumed keeps and orphan returns need review', () => {
  const { candidates } = importCandidates(emails, now);
  const tee = candidates.find(c => c.title === 'Everyday V-neck Tee')!;
  assert.equal(tee.status, 'kept', 'no return email after 45 days');
  assert.ok(tee.needsReview && tee.confidence < 0.7);
  const slip = candidates.find(c => c.title === 'Satin Slip Skirt')!;
  assert.equal(slip.status, 'returned');
  assert.equal(slip.returnReason, 'quality');
  assert.ok(slip.needsReview);
  assert.equal(candidates.find(c => c.title === 'Poplin Button-Down')!.slot, 'top');
  const dress = candidates.find(c => c.title === 'Wrap Midi Dress Camel')!;
  assert.equal(dress.status, 'kept');
});
