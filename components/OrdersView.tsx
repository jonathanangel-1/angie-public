'use client';

import { useState } from 'react';
import OutcomeForm from '@/components/OutcomeForm';
import { api, CATEGORY_LABEL, type ProfileSummary } from '@/lib/client/api';

const FIT_LABEL: Record<string, string> = { fits: 'fits well', tight: 'a bit tight', loose: 'a bit loose', 'too-small': 'too small', 'too-large': 'too big', 'too-long': 'too long', 'too-short': 'too short', 'not-fit': 'not a fit issue' };

export default function OrdersView({ profile, onChange }: { profile: ProfileSummary; onChange: (next: ProfileSummary) => void }) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  async function remove(id: string) {
    setError('');
    try { onChange((await api<{ profile: ProfileSummary }>(`/api/outcomes?id=${encodeURIComponent(id)}`, { method: 'DELETE' })).profile); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove.'); }
  }
  return (
    <section className="orders-view">
      <div className="panel">
        <header className="panel-head">
          <div><h2>Orders you kept or sent back</h2><p>Past orders count too: add the last few things you bought, with the size and how they fitted.</p></div>
          {!adding ? <button type="button" className="primary" onClick={() => setAdding(true)}>Add a past order</button> : null}
        </header>
        {adding ? <OutcomeForm brands={profile.brands} onCancel={() => setAdding(false)} onSaved={response => { setAdding(false); onChange(response.profile); }} /> : null}
        {profile.outcomes.length ? <table className="orders">
          <thead><tr><th>Brand</th><th>Item</th><th>Size</th><th>Result</th><th /></tr></thead>
          <tbody>{profile.outcomes.map(o => <tr key={o.id}>
            <td>{o.brand}</td><td>{o.productName ? `${o.productName} · ` : ''}{CATEGORY_LABEL[o.category]}</td><td>{o.size}</td>
            <td><span className={`tag ${o.result}`}>{o.result}</span> {FIT_LABEL[o.fit]}{o.area ? ` (${o.area})` : ''}{o.reason ? ` · ${o.reason}` : ''}</td>
            <td><button type="button" className="ghost" onClick={() => void remove(o.id)}>Undo</button></td>
          </tr>)}</tbody>
        </table> : <p className="muted">No orders yet.</p>}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
