'use client';

import { useState } from 'react';
import { api, DEMO_EMAILS, type EmailPreview, type TasteSummary } from '@/lib/client/api';
import { QUIZ_SWATCHES } from '@/lib/taste/model';
import { NEVER_OPTIONS, type Quiz } from '@/lib/taste/types';

function Quiz({ summary, onSummary }: { summary: TasteSummary; onSummary: (s: TasteSummary) => void }) {
  const [quiz, setQuiz] = useState<Quiz>(summary.quiz);
  const [status, setStatus] = useState('');
  const set = <K extends keyof Quiz>(key: K, value: Quiz[K]) => setQuiz(q => ({ ...q, [key]: value }));
  async function save() {
    setStatus('');
    try { const next = await api<TasteSummary>('/api/taste', { method: 'PUT', json: { ...quiz, brandsLove: quiz.brandsLove, brandsAvoid: quiz.brandsAvoid } }); setQuiz(next.quiz); onSummary(next); setStatus('Saved. New looks use this right away.'); }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not save.'); }
  }
  return (
    <div className="panel">
      <header className="panel-head"><div><h2>Day-one quiz</h2><p>Two minutes. Sizes make the suggested size work from your first look; the rest shapes what you see.</p></div></header>
      <div className="grid4">
        {(['top', 'bottom', 'dress', 'jeans'] as const).map(k => <label key={k}>Usual {k} size<input value={quiz.sizes[k] || ''} placeholder={k === 'jeans' ? '28' : k === 'bottom' ? '8 or M' : 'M'} onChange={e => set('sizes', { ...quiz.sizes, [k]: e.target.value })} /></label>)}
        <label>Tops fit<select value={quiz.fit.top || ''} onChange={e => set('fit', { ...quiz.fit, top: (e.target.value || undefined) as Quiz['fit']['top'] })}><option value="">No preference</option><option value="fitted">Fitted</option><option value="relaxed">Relaxed</option><option value="oversized">Oversized</option></select></label>
        <label>Bottoms fit<select value={quiz.fit.bottom || ''} onChange={e => set('fit', { ...quiz.fit, bottom: (e.target.value || undefined) as Quiz['fit']['bottom'] })}><option value="">No preference</option><option value="fitted">Fitted</option><option value="straight">Straight</option><option value="wide">Wide</option></select></label>
        <label>Budget per item ($)<input inputMode="numeric" value={quiz.budgetMax ?? ''} onChange={e => set('budgetMax', e.target.value ? Number(e.target.value) : undefined)} /></label>
      </div>
      <fieldset className="chipset"><legend>I never wear</legend>{NEVER_OPTIONS.map(n => <button key={n} type="button" aria-pressed={quiz.neverWear.includes(n)} className={quiz.neverWear.includes(n) ? 'on' : ''} onClick={() => set('neverWear', quiz.neverWear.includes(n) ? quiz.neverWear.filter(x => x !== n) : [...quiz.neverWear, n])}>{n}</button>)}</fieldset>
      <div className="grid2">
        <label>Brands I love<input value={quiz.brandsLove.join(', ')} onChange={e => set('brandsLove', e.target.value.split(',').map(s => s.trimStart()))} placeholder="comma separated" /></label>
        <label>Brands I avoid<input value={quiz.brandsAvoid.join(', ')} onChange={e => set('brandsAvoid', e.target.value.split(',').map(s => s.trimStart()))} placeholder="comma separated" /></label>
      </div>
      <p className="label">Quick reactions</p>
      <div className="swatches">{QUIZ_SWATCHES.map(s => <figure key={s.id} className={quiz.imageReactions[s.id] || ''}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={s.image} alt={s.label} /><figcaption>{s.label}</figcaption>
        <div>{(['love', 'no'] as const).map(r => <button key={r} type="button" aria-pressed={quiz.imageReactions[s.id] === r} className={quiz.imageReactions[s.id] === r ? 'on' : ''} onClick={() => set('imageReactions', { ...quiz.imageReactions, [s.id]: r })}>{r === 'love' ? '♥' : '✕'}</button>)}</div>
      </figure>)}</div>
      <div className="form-actions">{status ? <p className="status">{status}</p> : null}<button type="button" className="primary" onClick={save}>Save quiz</button></div>
    </div>
  );
}

function EmailImport({ summary, onSummary }: { summary: TasteSummary; onSummary: (s: TasteSummary) => void }) {
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  async function parse(emails: string[]) {
    setStatus('');
    try { const p = await api<EmailPreview>('/api/emails/preview', { method: 'POST', json: { emails } }); setPreview(p); setSelected(new Set(p.candidates.map(c => c.id))); }
    catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not read those emails.'); }
  }
  async function confirm() {
    const chosen = preview!.candidates.filter(c => selected.has(c.id));
    const result = await api<{ imported: number; summary: TasteSummary }>('/api/emails/import', { method: 'POST', json: { purchases: chosen } });
    onSummary(result.summary); setPreview(null); setStatus(`Imported ${result.imported} orders.`);
  }
  return (
    <div className="panel">
      <header className="panel-head"><div><h2>Import orders from email</h2><p>Optional. Order confirmations and return emails tell us sizes that worked and what went back. Emails are messy, so you confirm each record. Export messages as .eml; nothing connects to your mailbox.</p></div></header>
      <div className="form-actions left">
        <label className="ghost file">Choose .eml files<input type="file" hidden multiple accept=".eml,message/rfc822,text/plain" onChange={async e => { const files = [...(e.target.files || [])]; if (files.length) await parse(await Promise.all(files.map(f => f.text()))); e.target.value = ''; }} /></label>
        {summary.demo ? <button type="button" className="ghost" onClick={async () => parse(await Promise.all(DEMO_EMAILS.map(async u => (await fetch(u)).text())))}>Load 7 fictional sample emails</button> : null}
      </div>
      {preview ? <>
        <table className="orders"><thead><tr><th /><th>Brand</th><th>Item</th><th>Size</th><th>Result</th><th>How sure</th></tr></thead><tbody>
          {preview.candidates.map(c => <tr key={c.id} className={c.needsReview ? 'review' : ''}>
            <td><input type="checkbox" aria-label={`Import ${c.title}`} checked={selected.has(c.id)} onChange={() => setSelected(s => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} /></td>
            <td>{c.brand}</td><td>{c.title}</td><td>{c.size}</td>
            <td><span className={`tag ${c.status}`}>{c.status}</span>{c.returnReason ? ` · ${c.returnReason.replace('-', ' ')}` : ''}</td>
            <td title={c.evidence}>{Math.round(c.confidence * 100)}%{c.needsReview ? ' · check' : ''}</td>
          </tr>)}
        </tbody></table>
        {preview.skipped.length ? <p className="muted">Skipped {preview.skipped.length}: {preview.skipped.map(s => `“${s.subject}” (${s.why})`).join(', ')}</p> : null}
        <div className="form-actions"><button type="button" className="ghost" onClick={() => setPreview(null)}>Cancel</button><button type="button" className="primary" onClick={confirm} disabled={!selected.size}>Import {selected.size} orders</button></div>
      </> : null}
      {status ? <p className="status">{status}</p> : null}
    </div>
  );
}

export default function TasteView({ summary, onSummary }: { summary: TasteSummary; onSummary: (s: TasteSummary) => void }) {
  return (
    <section className="taste-view">
      <Quiz summary={summary} onSummary={onSummary} />
      <EmailImport summary={summary} onSummary={onSummary} />
      <div className="panel">
        <header className="panel-head"><div><h2>What I&apos;ve learned</h2><p>Kept items count most, then loves and quiz reactions. Returns for fit change your size, not your taste.</p></div></header>
        <div className="grid2">
          <div><p className="label">More of</p><p className="chips">{summary.likes.map(l => <span key={l.feature} className="like">{l.feature.replace(':', ': ')} +{l.weight}</span>)}</p></div>
          <div><p className="label">Less of</p><p className="chips">{summary.dislikes.map(l => <span key={l.feature} className="dislike">{l.feature.replace(':', ': ')} {l.weight}</span>)}</p></div>
        </div>
        {summary.brands.length ? <p className="muted">Brands: {summary.brands.map(b => `${b.brand} kept ${b.kept}/${b.kept + b.returned}`).join(' · ')}</p> : null}
      </div>
    </section>
  );
}
