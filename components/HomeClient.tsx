'use client';

import { FormEvent, useEffect, useState } from 'react';
import LookView from '@/components/LookView';
import OrdersView from '@/components/OrdersView';
import TasteView from '@/components/TasteView';
import { api, type TasteSummary } from '@/lib/client/api';

type Tab = 'look' | 'taste' | 'orders';

function Login({ onLogin }: { onLogin: (s: TasteSummary) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/access', { method: 'POST', json: { code } }); onLogin(await api<TasteSummary>('/api/taste')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Wrong code.'); }
    finally { setBusy(false); }
  }
  return (
    <main className="login">
      <div className="logo">A</div>
      <h1>Angie</h1>
      <p>Upload a look. Get the pieces from real stores, in your size, ranked by what you&apos;ll keep.</p>
      <form onSubmit={submit}>
        <label htmlFor="code">Access code</label>
        <div className="login-row">
          <input id="code" value={code} onChange={e => setCode(e.target.value)} autoComplete="off" placeholder="demo-participant" />
          <button className="primary" disabled={!code.trim() || busy}>{busy ? 'Opening…' : 'Open'}</button>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
      </form>
    </main>
  );
}

export default function HomeClient() {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [summary, setSummary] = useState<TasteSummary | null>(null);
  const [tab, setTab] = useState<Tab>('look');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    api<TasteSummary>('/api/taste').then(s => { if (active) { setSummary(s); setState('open'); setTab(s.hasQuiz ? 'look' : 'taste'); } }, () => { if (active) setState('locked'); });
    return () => { active = false; };
  }, []);

  if (state === 'checking') return <main className="login"><div className="spinner" aria-label="Loading" /></main>;
  if (state === 'locked' || !summary) return <Login onLogin={s => { setSummary(s); setState('open'); setTab(s.hasQuiz ? 'look' : 'taste'); }} />;

  return (
    <div className="app">
      {summary.demo ? <div className="demo-banner">Demo · fictional looks, brands, products, prices and emails. Garment detection and search are mocked in demo mode. Nothing can be bought.</div> : null}
      <header className="topbar">
        <div className="wordmark"><span className="logo small">A</span><b>Angie</b></div>
        <nav aria-label="Sections">{([['look', 'Look'], ['taste', 'My taste'], ['orders', 'Orders & feedback']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}</nav>
        <div className="topbar-meta">
          <span>{summary.purchases.length} orders · {summary.reactions.length} reactions</span>
          {summary.demo ? <button type="button" className="ghost" onClick={async () => { setSummary(await api<TasteSummary>('/api/demo/reset', { method: 'POST' })); setVersion(v => v + 1); }}>Reset demo</button> : null}
          <button type="button" className="ghost" onClick={async () => { await api('/api/access', { method: 'DELETE' }); setState('locked'); }}>Sign out</button>
        </div>
      </header>
      <main className="content">
        {tab === 'look' ? <LookView key={`look-${version}`} summary={summary} onSummary={setSummary} /> : null}
        {tab === 'taste' ? <TasteView key={`taste-${version}`} summary={summary} onSummary={setSummary} /> : null}
        {tab === 'orders' ? <OrdersView summary={summary} onSummary={setSummary} /> : null}
      </main>
    </div>
  );
}
