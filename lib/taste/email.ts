import type { Slot } from '@/lib/look/types';
import type { Purchase, ReturnReason } from '@/lib/taste/types';

// Order/return emails -> purchase history. Deliberately conservative: retailer
// emails vary wildly, so every record carries a confidence and anything
// uncertain is flagged for her to confirm before import. Input is raw RFC 822
// text (an .eml export). There is no mailbox access in this repository.
export type ParsedEmail = { from: string; subject: string; date: number; kind: 'order' | 'shipped' | 'return' | 'other'; orderId: string | null; items: Array<{ title: string; size: string; price: number | null; reason: ReturnReason | null }> };
export type ImportCandidate = Purchase & { needsReview: boolean; evidence: string };

function decodeQuotedPrintable(text: string) {
  return text.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function htmlToText(html: string) {
  return html.replace(/<(br|\/p|\/tr|\/li|\/div|\/h\d)[^>]*>/gi, '\n').replace(/<\/t[dh]>/gi, '  ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$').replace(/&mdash;/g, '—').replace(/[ \t]+/g, ' ');
}

function splitMessage(raw: string) {
  const index = raw.search(/\r?\n\r?\n/);
  const head = raw.slice(0, index).replace(/\r?\n[ \t]+/g, ' ');
  const body = raw.slice(index).replace(/^\r?\n\r?\n/, '');
  const headers = new Map<string, string>();
  for (const line of head.split(/\r?\n/)) { const i = line.indexOf(':'); if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim()); }
  return { headers, body };
}

function bodyText(headers: Map<string, string>, body: string): string {
  const type = headers.get('content-type') || 'text/plain';
  const boundary = type.match(/boundary="?([^";]+)"?/i)?.[1];
  if (boundary) {
    const parts = body.split(`--${boundary}`).map(p => p.trim()).filter(p => p && p !== '--').map(p => splitMessage(p));
    const plain = parts.find(p => /text\/plain/i.test(p.headers.get('content-type') || ''));
    const html = parts.find(p => /text\/html/i.test(p.headers.get('content-type') || ''));
    const chosen = plain || html;
    return chosen ? bodyText(chosen.headers, chosen.body) : '';
  }
  const encoding = (headers.get('content-transfer-encoding') || '').toLowerCase();
  let text = encoding === 'quoted-printable' ? decodeQuotedPrintable(body) : encoding === 'base64' ? atob(body.replace(/\s+/g, '')) : body;
  if (/text\/html/i.test(type)) text = htmlToText(text);
  return text;
}

const REASONS: Array<[RegExp, ReturnReason]> = [
  [/too small|too tight|size up|runs small/i, 'too-small'], [/too (big|large|loose)|size down|runs large/i, 'too-large'],
  [/too long/i, 'too-long'], [/too short/i, 'too-short'], [/quality|fabric|defect|damaged|pilling|see[- ]through/i, 'quality'],
  [/colou?r/i, 'color'], [/style|didn.t suit|not for me|didn.t like|changed my mind/i, 'style'],
];
const reasonFrom = (text: string): ReturnReason | null => REASONS.find(([re]) => re.test(text))?.[1] ?? (text.trim() ? 'other' : null);

export function parseEmail(raw: string): ParsedEmail {
  const { headers, body } = splitMessage(raw);
  const from = (headers.get('from') || '').replace(/<[^>]+>/, '').replace(/"/g, '').trim();
  const subject = headers.get('subject') || '';
  const text = bodyText(headers, body);
  const all = `${subject}\n${text}`;
  const kind: ParsedEmail['kind'] = /\breturn(ed)?\b|refund/i.test(subject) ? 'return'
    : /shipped|on its way|out for delivery/i.test(subject) ? 'shipped'
    : /order|purchase|receipt/i.test(subject) && /confirm|thank|receipt|received/i.test(all) ? 'order' : 'other';
  const orderId = all.match(/order\s*(?:number|no\.?)?\s*#?\s*:?\s*([A-Z]{0,4}\d{3,})/i)?.[1] ?? null;
  const reasonLine = text.match(/reason(?: for return)?\s*:\s*(.+)/i)?.[1] || '';
  const items: ParsedEmail['items'] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // "Harbor Wide-Leg Trouser — Navy / 8   $118.00"
    const dashed = line.match(/^(.+?)\s+[—–-]\s+([^/$]+?)\s*\/\s*([A-Z0-9]{1,4}(?:\s?(?:Petite|Tall))?)\b(?:.*?\$\s?(\d+(?:\.\d{2})?))?/);
    if (dashed && !/^(order|total|subtotal|shipping)/i.test(dashed[1])) { items.push({ title: `${dashed[1]} ${dashed[2]}`.trim(), size: dashed[3], price: dashed[4] ? Number(dashed[4]) : null, reason: null }); continue; }
    // "Item: Crepe Wrap Dress" followed by "Size: M" and optionally "Price: $170.00"
    const labelled = line.match(/^(?:item|product)\s*:\s*(.+)$/i);
    if (labelled) {
      const next = lines.slice(i + 1, i + 5).join('\n');
      const size = next.match(/size\s*:\s*([A-Z0-9]{1,4})\b/i)?.[1];
      if (size) items.push({ title: labelled[1], size: size.toUpperCase(), price: Number(next.match(/\$\s?(\d+(?:\.\d{2})?)/)?.[1]) || null, reason: null });
      continue;
    }
    // "Crepe Wrap Dress (M)"
    const bracketed = line.match(/^([A-Z][^()$]{3,60}?)\s*\((?:size\s*)?([A-Z0-9]{1,4})\)\s*(?:\$\s?(\d+(?:\.\d{2})?))?$/i);
    if (bracketed) items.push({ title: bracketed[1], size: bracketed[2].toUpperCase(), price: bracketed[3] ? Number(bracketed[3]) : null, reason: null });
  }
  if (kind === 'return') for (const item of items) item.reason = reasonFrom(reasonLine);
  return { from, subject, date: Date.parse(headers.get('date') || '') || 0, kind, orderId, items };
}

export function slotFromTitle(title: string): Slot | null {
  const t = title.toLowerCase();
  return /dress|gown/.test(t) ? 'dress' : /jacket|blazer|coat|trench/.test(t) ? 'outerwear' : /skirt/.test(t) ? 'skirt'
    : /trouser|pant|jean|legging|short/.test(t) ? 'pants' : /tee|top|shirt|blouse|cami|sweater|knit|cardigan|tank/.test(t) ? 'top' : null;
}

const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '').includes(b.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 14));

// Orders without a matching return after this long are presumed kept.
const KEPT_AFTER_DAYS = 45;

export function importCandidates(raws: string[], now: number): { candidates: ImportCandidate[]; skipped: Array<{ subject: string; why: string }> } {
  const parsed = raws.map(parseEmail);
  const skipped = parsed.filter(p => p.kind === 'other' || !p.items.length).map(p => ({ subject: p.subject, why: p.kind === 'other' ? 'not an order or return' : 'no items found' }));
  const orders = parsed.filter(p => p.kind === 'order' && p.items.length);
  const returns = parsed.filter(p => p.kind === 'return' && p.items.length);
  const candidates: ImportCandidate[] = [];
  for (const order of orders) for (const item of order.items) {
    const ret = returns.find(r => r.from === order.from && (!r.orderId || !order.orderId || r.orderId === order.orderId) && r.items.some(i => same(i.title, item.title) || same(item.title, i.title)));
    const returnedItem = ret?.items.find(i => same(i.title, item.title) || same(item.title, i.title));
    const age = (now - order.date) / 86400000;
    const status: Purchase['status'] = returnedItem ? 'returned' : age > KEPT_AFTER_DAYS ? 'kept' : 'ordered';
    const confidence = returnedItem ? 0.9 : status === 'kept' ? 0.6 : 0.8;
    const slot = slotFromTitle(item.title);
    candidates.push({
      id: `email-${order.orderId || order.date}-${candidates.length}`, brand: order.from, title: item.title, slot, size: item.size, status,
      returnReason: returnedItem?.reason ?? null, price: item.price, source: 'email', confidence, createdAt: order.date || now,
      needsReview: !slot || status === 'kept' || returnedItem?.reason === 'other',
      evidence: `${order.subject}${ret ? ` + ${ret.subject}` : ''}${status === 'kept' ? ` (no return email after ${KEPT_AFTER_DAYS} days, so presumed kept)` : ''}`,
    });
  }
  // A return whose order email is missing still tells us something.
  for (const ret of returns) for (const item of ret.items) {
    if (candidates.some(c => c.brand === ret.from && same(c.title, item.title))) continue;
    candidates.push({ id: `email-return-${ret.orderId || ret.date}-${candidates.length}`, brand: ret.from, title: item.title, slot: slotFromTitle(item.title), size: item.size,
      status: 'returned', returnReason: item.reason, price: item.price, source: 'email', confidence: 0.7, createdAt: ret.date || now, needsReview: true, evidence: `${ret.subject} (order email not found)` });
  }
  return { candidates, skipped };
}
