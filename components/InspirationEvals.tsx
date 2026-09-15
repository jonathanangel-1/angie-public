'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { InspirationMemory } from '@/lib/inspiration-types';

type EvalData = {
  recommendationCount: number;
  feedbackCount: number;
  feedbackCoverage: number;
  reactionRates: { love: number; close: number; no: number };
  averageUtility: number;
  memory: InspirationMemory;
  models: Array<{ model: string; search_mode: string; runs: number }>;
  catalog: { version: string; generatedAt: string; productCount: number; retailer: string; exactProductPages: boolean; localImages: boolean; fresh: boolean; categories: Record<string, number> };
  candidates: { considered: number; shown: number; vetoed: number };
  outcomes: Record<string, number>;
};

export default function InspirationEvals() {
  const [data, setData] = useState<EvalData | null>(null);
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/inspiration/evals');
    if (response.status === 401) {
      setLocked(true);
      return;
    }
    setData(await response.json() as EvalData);
    setLocked(false);
  }

  useEffect(() => {
    fetch('/api/inspiration/evals').then(async (response) => {
      if (response.status === 401) {
        setLocked(true);
        return;
      }
      setData(await response.json() as EvalData);
    }).catch(() => setLocked(true));
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const result = await response.json() as { role?: string };
    if (!response.ok || result.role !== 'admin') {
      setError('Wrong code.');
      return;
    }
    await load();
  }

  if (locked) {
    return (
      <main className="eval-shell eval-lock">
        <h1>Evals</h1>
        <form onSubmit={unlock}>
          <input aria-label="Admin code" autoComplete="off" onChange={(event) => setCode(event.target.value)} placeholder="Admin code" value={code} />
          <button disabled={!code} type="submit">Open</button>
        </form>
        {error ? <p>{error}</p> : null}
      </main>
    );
  }

  if (!data) return <main className="eval-shell"><div className="loader" /></main>;
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <main className="eval-shell">
      <header><div><p className="eyebrow">ANGIE / TESTS EXCLUDED</p><h1>Evals</h1></div><button className="nav-link-button" onClick={() => window.location.assign('/')} type="button">Stylist</button></header>
      <section className="eval-grid">
        <article><span>Recommendations</span><strong>{data.recommendationCount}</strong></article>
        <article><span>Rated</span><strong>{data.feedbackCoverage}%</strong></article>
        <article><span>Utility</span><strong>{data.averageUtility.toFixed(2)}</strong></article>
        <article><span>Signals</span><strong>{data.memory.signalCount}</strong></article>
      </section>
      <section className="eval-panel">
        <h2>Catalog</h2>
        <div className="eval-rate"><span>Verified products</span><strong>{data.catalog.productCount}</strong></div>
        <div className="eval-rate"><span>Exact links</span><strong>{data.catalog.exactProductPages ? 'Pass' : 'Fail'}</strong></div>
        <div className="eval-rate"><span>Link-only catalog</span><strong>{data.catalog.localImages ? 'Pass' : 'Fail'}</strong></div>
        <div className="eval-rate"><span>Fresh</span><strong>{data.catalog.fresh ? 'Pass' : 'Fail'}</strong></div>
        <p>{Object.entries(data.catalog.categories).map(([category, count]) => `${category} ${count}`).join(' · ')}</p>
      </section>
      <section className="eval-panel">
        <h2>Decision audit</h2>
        <div className="eval-rate"><span>Considered</span><strong>{data.candidates.considered}</strong></div>
        <div className="eval-rate"><span>Vetoed</span><strong>{data.candidates.vetoed}</strong></div>
        <div className="eval-rate"><span>Shown</span><strong>{data.candidates.shown}</strong></div>
      </section>
      <section className="eval-panel">
        <h2>Reactions</h2>
        <div className="eval-rate"><span>Love</span><strong>{percent(data.reactionRates.love)}</strong></div>
        <div className="eval-rate"><span>Almost</span><strong>{percent(data.reactionRates.close)}</strong></div>
        <div className="eval-rate"><span>No</span><strong>{percent(data.reactionRates.no)}</strong></div>
      </section>
      <section className="eval-preferences">
        <article><h2>Learning up</h2>{data.memory.likes.map((item) => <p key={`${item.type}-${item.value}`}><span>{item.type}</span>{item.value}<b>+{item.weight}</b></p>)}</article>
        <article><h2>Learning down</h2>{data.memory.avoidances.map((item) => <p key={`${item.type}-${item.value}`}><span>{item.type}</span>{item.value}<b>{item.weight}</b></p>)}</article>
      </section>
      {data.memory.recentNotes.length ? <section className="eval-panel"><h2>Notes</h2>{data.memory.recentNotes.map((item, index) => <p key={`${item.reaction}-${index}`}>{item.reaction} · {item.note}</p>)}</section> : null}
      <section className="eval-panel"><h2>Real outcomes</h2><p>{Object.entries(data.outcomes).map(([event, count]) => `${event} ${count}`).join(' · ') || 'No order or try-on outcomes yet.'}</p></section>
      <p className="eval-model">{data.models.map((item) => `${item.model} · ${item.search_mode} · ${item.runs}`).join(' | ') || 'No model runs yet.'}</p>
    </main>
  );
}
