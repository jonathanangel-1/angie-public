'use client';

import { useState } from 'react';
import { api, CATEGORY_LABEL, CM_PER_INCH, type ProfileSummary } from '@/lib/client/api';
import { CATEGORIES, DIMENSIONS, type BodyMeasurements, type Category, type ReferenceGarment } from '@/lib/fit/types';

const BODY_FIELDS: Array<{ key: keyof BodyMeasurements; label: string; hint: string; required?: boolean }> = [
  { key: 'bust', label: 'Bust', hint: 'Fullest part, tape level, relaxed breath.', required: true },
  { key: 'waist', label: 'Waist', hint: 'Narrowest part, usually above the navel.', required: true },
  { key: 'hips', label: 'Hips', hint: 'Fullest part of hips and seat, feet together.', required: true },
  { key: 'inseam', label: 'Inseam', hint: 'Crotch to floor, barefoot. Or measure trousers you like.' },
  { key: 'height', label: 'Height', hint: 'Optional. Used to sanity-check lengths.' },
];

export default function FitView({ profile, onChange }: { profile: ProfileSummary; onChange: (next: ProfileSummary) => void }) {
  const [unit, setUnit] = useState<'in' | 'cm'>('in');
  const toDisplay = (value?: number) => value == null ? '' : String(Math.round((unit === 'cm' ? value * CM_PER_INCH : value) * 10) / 10);
  const fromDisplay = (value: string) => value.trim() === '' ? undefined : Number(value) / (unit === 'cm' ? CM_PER_INCH : 1);
  const [body, setBody] = useState<Record<string, string>>(() => Object.fromEntries(BODY_FIELDS.map(f => [f.key, toDisplay(profile.body[f.key])])));
  const [refs, setRefs] = useState<ReferenceGarment[]>(profile.references);
  const [draft, setDraft] = useState<{ category: Category; label: string; bust: string; waist: string; hips: string }>({ category: 'bottom', label: '', bust: '', waist: '', hips: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  function switchUnit(next: 'in' | 'cm') {
    if (next === unit) return;
    const factor = next === 'cm' ? CM_PER_INCH : 1 / CM_PER_INCH;
    setBody(current => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v === '' ? '' : String(Math.round(Number(v) * factor * 10) / 10)])));
    setUnit(next);
  }

  async function save(references = refs) {
    setBusy(true); setStatus('');
    try {
      const next = await api<ProfileSummary>('/api/profile', { method: 'PUT', json: {
        body: Object.fromEntries(BODY_FIELDS.map(f => [f.key, fromDisplay(body[f.key] || '')])),
        references,
      } });
      setRefs(next.references); onChange(next); setStatus('Saved.');
    } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  function addReference() {
    const measurements = Object.fromEntries(DIMENSIONS.flatMap(d => draft[d] ? [[d, fromDisplay(draft[d])]] : []));
    if (!Object.keys(measurements).length) { setStatus('Add at least one garment measurement.'); return; }
    const next = [...refs, { id: `ref-${Date.now()}`, category: draft.category, label: draft.label || `${CATEGORY_LABEL[draft.category]} I like`, measurements }];
    setDraft({ category: draft.category, label: '', bust: '', waist: '', hips: '' });
    void save(next);
  }

  const missing = BODY_FIELDS.filter(f => f.required && !body[f.key]);
  return (
    <section className="fit-view">
      <div className="panel">
        <header className="panel-head">
          <div><h2>Your measurements</h2><p>Three numbers are the day-one minimum. Five minutes with a soft tape.</p></div>
          <div className="segmented small">{(['in', 'cm'] as const).map(u => <button key={u} type="button" className={unit === u ? 'on' : ''} aria-pressed={unit === u} onClick={() => switchUnit(u)}>{u}</button>)}</div>
        </header>
        <div className="measure-grid">
          {BODY_FIELDS.map(field => <label key={field.key}>
            <span>{field.label}{field.required ? '' : <em> optional</em>}</span>
            <div className="unit-input"><input inputMode="decimal" value={body[field.key] || ''} onChange={e => setBody(b => ({ ...b, [field.key]: e.target.value }))} aria-label={`${field.label} in ${unit}`} /><b>{unit}</b></div>
            <small>{field.hint}</small>
          </label>)}
        </div>
        <div className="form-actions">
          {missing.length ? <p className="hint">Still needed: {missing.map(m => m.label.toLowerCase()).join(', ')}.</p> : null}
          <button type="button" className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save measurements'}</button>
        </div>
        {status ? <p className="status" role="status">{status}</p> : null}
      </div>

      <div className="panel">
        <header className="panel-head"><div><h2>What I&apos;ve learned from your orders</h2><p>Every keep and return adjusts how your measurements map onto each brand&apos;s sizes.</p></div></header>
        {profile.adjustments.length ? <ul className="learned-list">
          {profile.adjustments.map(a => <li key={`${a.brand}:${a.category}:${a.area}`}><span>{a.text}</span><small>{a.observations} {a.observations === 1 ? 'order' : 'orders'}</small></li>)}
        </ul> : <p className="muted">Nothing yet. Log a keep or return and it shows up here.</p>}
        {profile.lengthNotes.length ? <p className="muted">Length notes: {profile.lengthNotes.map(n => `${n.brand} ${n.category} ${n.fit.replace('-', ' ')}`).join('; ')}.</p> : null}
        <p className="muted small-print">{profile.outcomes.length} keep/return {profile.outcomes.length === 1 ? 'record' : 'records'} so far. Brands you have no history with borrow half of your general pattern.</p>
      </div>

      <div className="panel">
        <header className="panel-head"><div><h2>Garments you already love</h2><p>The most accurate input. Lay it flat, measure straight across, double it. Used when a brand publishes garment measurements.</p></div></header>
        {refs.length ? <ul className="ref-list">{refs.map(r => <li key={r.id}>
          <span><b>{r.label}</b> · {CATEGORY_LABEL[r.category]} · {Object.entries(r.measurements).map(([d, v]) => `${d} ${toDisplay(v)} ${unit}`).join(', ')}</span>
          <button type="button" className="ghost" onClick={() => void save(refs.filter(x => x.id !== r.id))}>Remove</button>
        </li>)}</ul> : null}
        <div className="ref-form">
          <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value as Category }))} aria-label="Garment category">{CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select>
          <input placeholder="Label, e.g. black trousers" value={draft.label} onChange={e => setDraft(d => ({ ...d, label: e.target.value }))} maxLength={80} aria-label="Garment label" />
          {DIMENSIONS.map(d => <input key={d} inputMode="decimal" placeholder={`${d} (${unit})`} value={draft[d]} onChange={e => setDraft(x => ({ ...x, [d]: e.target.value }))} aria-label={`Garment ${d} in ${unit}`} />)}
          <button type="button" className="ghost" onClick={addReference} disabled={busy}>Add garment</button>
        </div>
      </div>
    </section>
  );
}
