'use client';

import { useEffect, useRef, useState } from 'react';
import OutcomeForm from '@/components/OutcomeForm';
import { api, CATEGORY_LABEL, describeFile, type OutcomeResponse, type SearchResponse } from '@/lib/client/api';
import { CATEGORIES, type Category } from '@/lib/fit/types';
import type { ImageFeatures } from '@/lib/match/embedding';
import type { RankedResult } from '@/lib/match/rank';

const SAMPLES = [
  { file: '/demo/inspiration/inspiration-01-navy-wide-leg.png', label: 'Navy wide-leg trousers' },
  { file: '/demo/inspiration/inspiration-02-camel-wrap-dress.png', label: 'Camel wrap dress' },
  { file: '/demo/inspiration/inspiration-03-white-tee.png', label: 'White tee' },
  { file: '/demo/inspiration/inspiration-04-black-blazer.png', label: 'Black blazer' },
];
const CONFIDENCE_LABEL = { high: 'High fit confidence', medium: 'Medium fit confidence', low: 'Low fit confidence' } as const;

function ResultCard({ result, rank, searchId, changedSize, onLogged }: { result: RankedResult; rank: number; searchId: string; changedSize?: string; onLogged: (response: OutcomeResponse) => void }) {
  const [logging, setLogging] = useState(false);
  const [saved, setSaved] = useState<OutcomeResponse | null>(null);
  const { product, similarity, fit } = result;
  return (
    <article className="result-card" data-product={product.id}>
      <div className="result-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.image} alt={`${product.brand} ${product.name}`} />
        <span className="rank">#{rank}</span>
      </div>
      <div className="result-body">
        <p className="brand">{product.brand}</p>
        <h3>{product.name}</h3>
        <p className="price">{product.price != null ? `$${product.price}` : 'Price at retailer'}</p>
        <div className="similarity" title={similarity.explanation}>
          <div className="bar"><span style={{ width: `${Math.round(similarity.total * 100)}%` }} /></div>
          <p><strong>{Math.round(similarity.total * 100)}% look-alike{similarity.total < 0.55 ? ' · less similar' : ''}.</strong> {similarity.explanation}</p>
        </div>
        <div className={`fit fit-${fit.confidence}`}>
          <div className="fit-head">
            <span className="size-label">Your size</span>
            <strong className="size">{fit.size ?? '—'}</strong>
            {changedSize ? <span className="updated">was {changedSize}</span> : null}
            <span className="pill">{CONFIDENCE_LABEL[fit.confidence]}</span>
          </div>
          <p className="fit-note">{fit.note}</p>
        </div>
        <div className="card-actions">
          <a className="buy" href={product.url} target="_blank" rel="noopener noreferrer">Buy at {product.brand} ↗</a>
          {!logging ? <button type="button" className="ghost" onClick={() => { setLogging(true); setSaved(null); }}>Log keep / return</button> : null}
        </div>
        {logging ? <OutcomeForm product={product} defaultSize={fit.size} searchId={searchId} onCancel={() => setLogging(false)}
          onSaved={response => { setSaved(response); setLogging(false); onLogged(response); }} /> : null}
        {saved ? <div className="learned" role="status">
          <strong>Saved: {saved.outcome.result} {saved.outcome.size}.</strong>
          {saved.changed.length ? <ul>{saved.changed.map(c => <li key={c.text}>Learned — {c.text}</li>)}</ul> : <p>Fit profile confirmed; no size change needed.</p>}
          {saved.recommendation && saved.recommendation.before.size !== saved.recommendation.after.size
            ? <p>Next time for this item: <b>{saved.recommendation.before.size ?? '—'} → {saved.recommendation.after.size ?? '—'}</b></p> : null}
        </div> : null}
      </div>
    </article>
  );
}

export default function FindView({ demo, onProfileChanged }: { demo: boolean; onProfileChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [features, setFeatures] = useState<ImageFeatures | null>(null);
  const [category, setCategory] = useState<Category | 'auto'>('auto');
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [previousSizes, setPreviousSizes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (preview.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: Blob) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) { setError('Use a JPG, PNG or WebP under 12 MB.'); return; }
    setError(''); setSearch(null); setPreviousSizes({});
    setPreview(URL.createObjectURL(file));
    try { setFeatures(await describeFile(file)); }
    catch { setError('That image could not be read.'); setFeatures(null); }
  }

  async function run(options: { keepSearch?: boolean } = {}) {
    if (!features) return;
    setBusy(true); setError('');
    try {
      const next = await api<SearchResponse>('/api/search', { method: 'POST', json: { features, category, searchId: options.keepSearch ? search?.searchId : undefined } });
      if (options.keepSearch && search) {
        const before = Object.fromEntries(search.results.map(r => [r.product.id, r.fit.size ?? '—']));
        setPreviousSizes(Object.fromEntries(next.results.filter(r => before[r.product.id] && before[r.product.id] !== (r.fit.size ?? '—')).map(r => [r.product.id, before[r.product.id]])));
      } else setPreviousSizes({});
      setSearch(next);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Search failed.'); }
    finally { setBusy(false); }
  }

  return (
    <section className="find">
      <div className="find-input">
        <div className={`drop ${preview ? 'has-image' : ''}`}
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void choose(file); }}>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Upload an inspiration image"
            onChange={event => { const file = event.target.files?.[0]; if (file) void choose(file); event.target.value = ''; }} />
          {preview
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={preview} alt="Your inspiration" />
            : <button type="button" className="drop-button" onClick={() => input.current?.click()}><span>＋</span><strong>Upload an inspiration</strong><small>Screenshot, product photo or flat-lay. It never leaves your browser.</small></button>}
          {preview ? <button type="button" className="change" onClick={() => input.current?.click()}>Change</button> : null}
        </div>
        {demo ? <div className="samples"><p>Or try a fictional inspiration:</p>
          <div>{SAMPLES.map(sample => <button key={sample.file} type="button" title={sample.label} onClick={async () => void choose(await (await fetch(sample.file)).blob())}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sample.file} alt={sample.label} /></button>)}</div></div> : null}
        <fieldset className="category-picker">
          <legend>What are you looking for?</legend>
          {(['auto', ...CATEGORIES] as const).map(value => <button key={value} type="button" aria-pressed={category === value} className={category === value ? 'on' : ''} onClick={() => setCategory(value)}>
            {value === 'auto' ? `Auto${search?.query.guessedCategory && category === 'auto' ? ` · ${CATEGORY_LABEL[search.query.guessedCategory]}` : ''}` : CATEGORY_LABEL[value]}</button>)}
        </fieldset>
        <button type="button" className="primary find-button" disabled={!features || busy} onClick={() => void run()}>{busy ? 'Matching…' : 'Find matches that fit'}</button>
        {features ? <p className="query-note">Reading: <b>{features.colorName}</b> garment, silhouette captured.</p> : null}
        {error ? <p className="error" role="alert">{error}</p> : null}
      </div>

      <div className="results">
        {!search ? <div className="empty">
          <h2>Looks like the picture. Fits like your clothes.</h2>
          <p>Upload an inspiration and get the closest items, each with the size to order and how sure we are. Tell me what you kept or sent back and the next size gets better.</p>
        </div> : <>
          <header className="results-head">
            <h2>{search.results.length} matches · {search.query.colorName} {search.query.category ? CATEGORY_LABEL[search.query.category].toLowerCase() : 'items'}</h2>
            <p>Ranked by look-alike score first, then fit confidence.</p>
          </header>
          <div className="result-grid">
            {search.results.map((result, index) => <ResultCard key={`${search.searchId}:${result.product.id}`} result={result} rank={index + 1} searchId={search.searchId}
              changedSize={previousSizes[result.product.id]} onLogged={() => { onProfileChanged(); void run({ keepSearch: true }); }} />)}
          </div>
        </>}
      </div>
    </section>
  );
}
