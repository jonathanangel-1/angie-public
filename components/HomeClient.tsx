'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import FindView from '@/components/FindView';
import FitView from '@/components/FitView';
import OrdersView from '@/components/OrdersView';
import { api, type ProfileSummary } from '@/lib/client/api';

type Tab = 'find' | 'fit' | 'orders';

function Login({ onLogin }: { onLogin: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/api/access', { method: 'POST', json: { code } }); onLogin(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Wrong code.'); }
    finally { setBusy(false); }
  }
  return (
    <main className="login">
      <div className="logo">A</div>
      <h1>Angie</h1>
      <p>Find clothes that look like your inspiration and actually fit.</p>
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
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [tab, setTab] = useState<Tab>('find');
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try { setProfile(await api<ProfileSummary>('/api/profile')); setState('open'); }
    catch { setState('locked'); }
  }, []);
  useEffect(() => {
    let active = true;
    api<ProfileSummary>('/api/profile').then(
      next => { if (active) { setProfile(next); setState('open'); } },
      () => { if (active) setState('locked'); },
    );
    return () => { active = false; };
  }, []);

  if (state === 'checking') return <main className="login"><div className="spinner" aria-label="Loading" /></main>;
  if (state === 'locked' || !profile) return <Login onLogin={() => void load()} />;

  const measured = ['bust', 'waist', 'hips'].filter(k => profile.body[k as 'bust'] != null).length;
  return (
    <div className="app">
      {profile.demo ? <div className="demo-banner">Demo · every person, brand, product, size chart and link here is fictional. Nothing can be bought.</div> : null}
      <header className="topbar">
        <div className="wordmark"><span className="logo small">A</span><b>Angie</b></div>
        <nav aria-label="Sections">
          {([['find', 'Find'], ['fit', 'My fit'], ['orders', 'Orders']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? 'on' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <div className="topbar-meta">
          <span>{measured}/3 measurements · {profile.outcomes.length} orders · {profile.adjustments.length} learned</span>
          {profile.demo ? <button type="button" className="ghost" onClick={async () => { setProfile(await api<ProfileSummary>('/api/demo/reset', { method: 'POST' })); setVersion(v => v + 1); }}>Reset demo</button> : null}
          <button type="button" className="ghost" onClick={async () => { await api('/api/access', { method: 'DELETE' }); setState('locked'); }}>Sign out</button>
        </div>
      </header>
      <main className="content">
        {tab === 'find' ? <FindView key={`find-${version}`} demo={profile.demo} onProfileChanged={() => void load()} /> : null}
        {tab === 'fit' ? <FitView key={`fit-${version}`} profile={profile} onChange={setProfile} /> : null}
        {tab === 'orders' ? <OrdersView profile={profile} onChange={setProfile} /> : null}
      </main>
    </div>
  );
}
