'use client';

import { useState } from 'react';
import { api, CATEGORY_LABEL, type OutcomeResponse } from '@/lib/client/api';
import { CATEGORIES, DIMENSIONS_BY_CATEGORY, type Category, type OutcomeFit } from '@/lib/fit/types';
import type { PublicProduct } from '@/lib/match/rank';

const KEPT: Array<[OutcomeFit, string]> = [['fits', 'Fits well'], ['tight', 'A bit tight'], ['loose', 'A bit loose']];
const RETURNED: Array<[OutcomeFit, string]> = [['too-small', 'Too small'], ['too-large', 'Too big'], ['too-long', 'Too long'], ['too-short', 'Too short'], ['not-fit', 'Not a fit problem']];

export default function OutcomeForm({ product, defaultSize, brands = [], searchId, onSaved, onCancel }: {
  product?: PublicProduct; defaultSize?: string | null; brands?: string[]; searchId?: string;
  onSaved: (response: OutcomeResponse) => void; onCancel?: () => void;
}) {
  const [result, setResult] = useState<'kept' | 'returned'>('returned');
  const [fit, setFit] = useState<OutcomeFit>('too-small');
  const [area, setArea] = useState('');
  const [reason, setReason] = useState('style');
  const [size, setSize] = useState(defaultSize || product?.sizes[0] || '');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<Category>(product?.category || 'bottom');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = result === 'kept' ? KEPT : RETURNED;
  const areas = DIMENSIONS_BY_CATEGORY[product?.category || category];
  const asksArea = ['tight', 'loose', 'too-small', 'too-large'].includes(fit);

  function chooseResult(next: 'kept' | 'returned') {
    setResult(next); setFit(next === 'kept' ? 'fits' : 'too-small'); setArea('');
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const response = await api<OutcomeResponse>('/api/outcomes', { method: 'POST', json: {
        productId: product?.id, brand: product?.brand || brand, category: product?.category || category, size, result, fit,
        area: asksArea && area ? area : null, reason: fit === 'not-fit' ? reason : null, searchId,
      } });
      onSaved(response);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save.'); }
    finally { setBusy(false); }
  }

  return (
    <form className="outcome-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      {!product ? <div className="form-row">
        <label>Brand<input list="known-brands" value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Demo Atelier" required maxLength={60} />
          <datalist id="known-brands">{brands.map(b => <option key={b} value={b} />)}</datalist></label>
        <label>Category<select value={category} onChange={e => setCategory(e.target.value as Category)}>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></label>
      </div> : null}
      <div className="segmented" role="radiogroup" aria-label="Kept or returned">
        {(['kept', 'returned'] as const).map(value => <button key={value} type="button" role="radio" aria-checked={result === value} className={result === value ? 'on' : ''} onClick={() => chooseResult(value)}>{value === 'kept' ? 'Kept it' : 'Returned it'}</button>)}
      </div>
      <div className="form-row">
        <label>Size you ordered{product ? <select value={size} onChange={e => setSize(e.target.value)}>{product.sizes.map(s => <option key={s}>{s}</option>)}</select>
          : <input value={size} onChange={e => setSize(e.target.value)} placeholder="M or 8" required maxLength={12} />}</label>
        <label>How did it fit?<select value={fit} onChange={e => { setFit(e.target.value as OutcomeFit); setArea(''); }}>
          {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {asksArea ? <label>Where?<select value={area} onChange={e => setArea(e.target.value)}>
        <option value="">Not sure</option>{areas.map(a => <option key={a} value={a}>{a[0].toUpperCase() + a.slice(1)}</option>)}</select></label> : null}
      {fit === 'not-fit' ? <label>Why did it go back?<select value={reason} onChange={e => setReason(e.target.value)}>
        <option value="style">Didn&apos;t like the style</option><option value="quality">Quality or fabric</option><option value="other">Other</option></select></label> : null}
      <div className="form-actions">
        {onCancel ? <button type="button" className="ghost" onClick={onCancel}>Cancel</button> : null}
        <button type="submit" className="primary" disabled={busy || !size || (!product && !brand.trim())}>{busy ? 'Saving…' : 'Save to my fit profile'}</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}
