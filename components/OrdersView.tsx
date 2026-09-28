'use client';

import { api, type TasteSummary } from '@/lib/client/api';

export default function OrdersView({ summary, onSummary }: { summary: TasteSummary; onSummary: (s: TasteSummary) => void }) {
  const undo = async (type: 'purchase' | 'reaction', id: string) => onSummary(await api<TasteSummary>(`/api/records?type=${type}&id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
  return (
    <section className="taste-view">
      <div className="panel">
        <header className="panel-head"><div><h2>Orders</h2><p>From email imports and from “I bought it” on a match. These drive suggested sizes and return risk.</p></div></header>
        {summary.purchases.length ? <table className="orders"><thead><tr><th>Brand</th><th>Item</th><th>Size</th><th>Result</th><th>Source</th><th /></tr></thead><tbody>
          {summary.purchases.map(p => <tr key={p.id}><td>{p.brand}</td><td>{p.title}</td><td>{p.size}</td>
            <td><span className={`tag ${p.status}`}>{p.status}</span>{p.returnReason ? ` · ${p.returnReason.replace('-', ' ')}` : ''}</td>
            <td>{p.source}{p.confidence < 1 ? ` (${Math.round(p.confidence * 100)}%)` : ''}</td>
            <td><button type="button" className="ghost" onClick={() => undo('purchase', p.id)}>Undo</button></td></tr>)}
        </tbody></table> : <p className="muted">No orders yet.</p>}
      </div>
      <div className="panel">
        <header className="panel-head"><div><h2>Reactions</h2><p>Love / not-for-me on matches.</p></div></header>
        {summary.reactions.length ? <table className="orders"><tbody>{summary.reactions.map(r => <tr key={r.id}><td>{r.brand}</td><td>{r.title}</td>
          <td><span className={`tag ${r.reaction}`}>{r.reaction === 'love' ? '♥ love' : 'no'}</span>{r.reason ? ` · ${r.reason}` : ''}</td>
          <td><button type="button" className="ghost" onClick={() => undo('reaction', r.id)}>Undo</button></td></tr>)}</tbody></table> : <p className="muted">No reactions yet.</p>}
      </div>
    </section>
  );
}
