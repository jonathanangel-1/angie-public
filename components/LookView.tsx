'use client';

import { useRef, useState } from 'react';
import { api, DEMO_LOOKS, SLOT_LABEL, type LookResponse, type RankResponse, type TasteSummary } from '@/lib/client/api';
import type { Piece } from '@/lib/look/pipeline';
import type { RankedCandidate } from '@/lib/taste/model';

const RISK = (r: number) => (r < 0.2 ? ['low', 'Low return risk'] : r < 0.35 ? ['medium', 'Some return risk'] : ['high', 'High return risk']);
const NO_REASONS = [['style', 'Not my style'], ['color', 'Colour'], ['price', 'Price'], ['fabric', 'Fabric'], ['fit', 'Fit / cut']] as const;
const RETURN_REASONS = [['too-small', 'Too small'], ['too-large', 'Too big'], ['too-long', 'Too long'], ['too-short', 'Too short'], ['quality', 'Quality'], ['style', 'Style'], ['color', 'Colour']] as const;

function ResultCard({ item, summary, onFeedback }: { item: RankedCandidate; summary: TasteSummary; onFeedback: (action: string, extra?: Record<string, string>) => Promise<void> }) {
  const [asking, setAsking] = useState<'no' | 'bought' | 'returned' | null>(null);
  const [size, setSize] = useState(item.size.size || item.sizes[0] || '');
  const [busy, setBusy] = useState(false);
  const purchase = summary.purchases.find(p => p.id === `fb-${item.id}`.slice(0, 100));
  const reacted = summary.reactions.find(r => r.brand === item.brand && r.title === item.title);
  const [riskLevel, riskLabel] = RISK(item.risk);
  const send = async (action: string, extra?: Record<string, string>) => { setBusy(true); try { await onFeedback(action, extra); setAsking(null); } finally { setBusy(false); } };
  return (
    <article className="match" data-product={item.id}>
      <a className="match-image" href={item.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image} alt={item.title} loading="lazy" />
      </a>
      <div className="match-body">
        <p className="brand">{item.brand}</p>
        <h4>{item.title}</h4>
        <p className="price">${item.price.toFixed(0)}{item.rating ? <span> · ★ {item.rating.toFixed(1)} ({item.reviews})</span> : null}</p>
        <ul className="why">{item.why.map(w => <li key={w}>{w}</li>)}</ul>
        <div className={`size size-${item.size.confidence}`} title={item.size.note}>
          <span>Suggested size</span><b>{item.size.size ?? '—'}</b><em>{item.size.confidence}</em>
          <p>{item.size.note}</p>
        </div>
        <p className={`risk risk-${riskLevel}`} title={item.riskReasons.join('; ')}>{riskLabel}{item.riskReasons.length ? ` · ${item.riskReasons.slice(0, 2).join('; ')}` : ''}</p>
        <div className="actions">
          <a className="buy" href={item.url} target="_blank" rel="noopener noreferrer">Buy at {item.brand} ↗</a>
          {purchase ? <span className={`tag ${purchase.status}`}>{purchase.status === 'ordered' ? `Ordered ${purchase.size}` : `${purchase.status} ${purchase.size}${purchase.returnReason ? ` · ${purchase.returnReason.replace('-', ' ')}` : ''}`}</span>
            : reacted ? <span className={`tag ${reacted.reaction}`}>{reacted.reaction === 'love' ? '♥ Loved' : `Not for me${reacted.reason ? ` · ${reacted.reason}` : ''}`}</span> : null}
        </div>
        <div className="feedback">
          {!purchase ? <>
            <button type="button" disabled={busy} onClick={() => send('love')}>♥ Love</button>
            <button type="button" disabled={busy} onClick={() => setAsking(asking === 'no' ? null : 'no')}>Not for me</button>
            <button type="button" disabled={busy} onClick={() => setAsking(asking === 'bought' ? null : 'bought')}>I bought it</button>
          </> : purchase.status === 'ordered' ? <>
            <button type="button" disabled={busy} onClick={() => send('kept', { size: purchase.size })}>Kept it</button>
            <button type="button" disabled={busy} onClick={() => setAsking('returned')}>Returned it</button>
          </> : null}
        </div>
        {asking === 'no' ? <div className="ask">What&apos;s wrong? {NO_REASONS.map(([v, l]) => <button key={v} type="button" disabled={busy} onClick={() => send('no', { reason: v })}>{l}</button>)}</div> : null}
        {asking === 'bought' ? <div className="ask">Size ordered <select aria-label="Size ordered" value={size} onChange={e => setSize(e.target.value)}>{(item.sizes.length ? item.sizes : [size]).map(s => <option key={s}>{s}</option>)}</select>
          <button type="button" className="primary" disabled={busy || !size} onClick={() => send('bought', { size })}>Save</button></div> : null}
        {asking === 'returned' && purchase ? <div className="ask">Why? {RETURN_REASONS.map(([v, l]) => <button key={v} type="button" disabled={busy} onClick={() => send('returned', { size: purchase.size, reason: v })}>{l}</button>)}</div> : null}
      </div>
    </article>
  );
}

export default function LookView({ summary, onSummary }: { summary: TasteSummary; onSummary: (s: TasteSummary) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [look, setLook] = useState<LookResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function analyse(file: Blob) {
    setError(''); setLook(null); setBusy(true);
    setPreview(URL.createObjectURL(file));
    const form = new FormData(); form.set('image', new File([file], 'look', { type: file.type || 'image/png' }));
    try { setLook(await api<LookResponse>('/api/look', { method: 'POST', body: form })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not read that look.'); }
    finally { setBusy(false); }
  }

  async function feedback(piece: Piece, item: RankedCandidate, action: string, extra: Record<string, string> = {}) {
    const next = await api<TasteSummary>('/api/feedback', { method: 'POST', json: { garment: piece.garment, candidate: item, action, ...extra } });
    onSummary(next);
    if (!look) return;
    const ranked = await api<RankResponse>('/api/rank', { method: 'POST', json: { pieces: look.pieces.map(p => ({ garment: p.garment, candidates: p.candidates })) } });
    setLook({ ...look, pieces: look.pieces.map(p => { const r = ranked.pieces.find(x => x.garmentId === p.garment.id); return r ? { ...p, results: r.ranked, excluded: r.excluded } : p; }) });
  }

  return (
    <section className="look-view">
      <aside className="look-input">
        <div className="drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void analyse(f); }}>
          <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Upload a look photo" onChange={e => { const f = e.target.files?.[0]; if (f) void analyse(f); e.target.value = ''; }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Your look" /> : <button type="button" className="drop-button" onClick={() => input.current?.click()}><span>＋</span><strong>Upload a look</strong><small>A photo of an outfit, street-style or Instagram screenshot.</small></button>}
          {preview ? <button type="button" className="change" onClick={() => input.current?.click()}>Change</button> : null}
        </div>
        {summary.demo ? <div className="samples"><p>Fictional demo looks:</p><div>{DEMO_LOOKS.map(l => <button key={l.file} type="button" title={l.label} onClick={async () => void analyse(await (await fetch(l.file)).blob())}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.file} alt={l.label} /></button>)}</div></div> : null}
        {look ? <p className="meta">Read by <b>{look.provider}</b> in {(look.timings.understandMs / 1000).toFixed(1)} s · searched {look.pieces[0]?.searched.join(', ')} · {(look.timings.totalMs / 1000).toFixed(1)} s total</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </aside>
      <div className="pieces">
        {busy ? <div className="empty"><div className="spinner" /><p>Finding the pieces and searching the web…</p></div> : null}
        {!busy && !look ? <div className="empty"><h2>Upload a look. Get the pieces, shoppable.</h2><p>Each garment is picked out of the photo, searched across real stores, and ranked by what you&apos;ll actually keep, with a suggested size.</p></div> : null}
        {look?.pieces.map(piece => <section className="piece" key={piece.garment.id} data-slot={piece.garment.slot}>
          <header>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="crop" src={piece.garment.crop} alt={`${piece.garment.slot} from your look`} />
            <div>
              <h3>{SLOT_LABEL[piece.garment.slot]}: {piece.garment.attributes.type}</h3>
              <p className="chips">{[piece.garment.attributes.color, piece.garment.attributes.length, piece.garment.attributes.pattern !== 'solid' ? piece.garment.attributes.pattern : '', piece.garment.attributes.fabric, piece.garment.attributes.vibe].filter(Boolean).map(c => <span key={c}>{c}</span>)}</p>
              <p className="meta">Searched for “{piece.garment.query}” + the cropped image{piece.excluded.length ? ` · hid ${piece.excluded.length}: ${[...new Set(piece.excluded.map(e => e.reason))].join(', ')}` : ''}</p>
              {piece.errors.length ? <p className="error">{piece.errors.join('; ')}</p> : null}
            </div>
          </header>
          {piece.results.length ? <div className="matches">{piece.results.map(item => <ResultCard key={item.id} item={item} summary={summary} onFeedback={(a, x) => feedback(piece, item, a, x)} />)}</div> : <p className="muted">No buyable match passed your filters.</p>}
        </section>)}
      </div>
    </section>
  );
}
