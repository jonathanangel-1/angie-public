'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Role = 'participant' | 'admin';
type Reaction = 'love' | 'close' | 'no';

type Profile = {
  version: string;
  identity: string;
  becoming: string;
  measurements: Record<string, string>;
  evidence: Record<string, number>;
  rules: Array<{ id: string; title: string; rule: string; confidence: string; evidence: string }>;
  sizeMap: Array<{ store: string; category: string; size: string; confidence: string }>;
  boundaries: readonly string[];
};

type LookItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  source: 'closet' | 'shop';
  image?: string;
  url?: string;
  price?: number;
  color: string;
  size: string;
  sizeConfidence: string;
  evidence: string;
  fitRisk: string;
  itemScore: number;
  reasons: string[];
};

type Look = {
  id: string;
  rank: number;
  mode: string;
  eyebrow: string;
  title: string;
  score: number;
  confidence: string;
  story: string;
  explanation: string[];
  evidence: string[];
  fitWatch: string;
  finish: string;
  totals: { taste: number; fit: number; coherence: number; quality: number; novelty: number; newSpend: number };
  items: LookItem[];
};

type StylistResponse = {
  request: string;
  intent: { occasion: string; summary: string };
  generatedAt: string;
  catalogStatus: string;
  profile: Profile;
  looks: Look[];
  rejected: Array<{ id: string; name: string; image?: string; reason?: string; evidence: string }>;
};

const quickPrompts = [
  'Polished daytime, but not corporate',
  'Easy casual look with jeans and a small heel',
  'Evening look: feminine, black and very clean',
  'Tailored look around trousers I already own',
  'Push me slightly beyond my usual style',
];

const initialPrompt = 'Build me a polished daytime look I can actually repeat.';

const reactionLabels: Record<Reaction, string> = {
  love: 'Love it',
  close: 'Close',
  no: 'Not me',
};

function ProductVisual({ item }: { item: LookItem }) {
  if (item.image) return <Image alt={item.name} height={960} sizes="(max-width: 760px) 100vw, 42vw" src={item.image} width={720} />;
  return (
    <div className={`closet-visual closet-${item.category}`}>
      <span>Already yours</span>
      <strong>{item.color}</strong>
      <small>{item.name}</small>
    </div>
  );
}

async function requestStylist(nextPrompt: string) {
  const response = await fetch('/api/stylist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: nextPrompt }),
  });
  const result = await response.json() as StylistResponse & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'The stylist could not answer.');
  return result as StylistResponse;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-line">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="score-track"><span style={{ width: `${Math.max(4, Math.min(100, value))}%` }} /></div>
    </div>
  );
}

export default function StylistExperience({ role }: { role: Role }) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [data, setData] = useState<StylistResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [activeLook, setActiveLook] = useState(0);
  const [brainOpen, setBrainOpen] = useState(false);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [feedbackState, setFeedbackState] = useState<Record<string, string>>({});
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  async function askStylist(nextPrompt = prompt) {
    setBusy(true);
    setError('');
    setReaction(null);
    setTargets([]);
    setNote('');
    try {
      const result = await requestStylist(nextPrompt);
      setData(result);
      setPrompt(nextPrompt);
      setActiveLook(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The stylist could not answer.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void requestStylist(initialPrompt)
      .then((result) => {
        if (!active) return;
        setData(result);
        setActiveLook(0);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The stylist could not answer.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, []);

  const look = data?.looks[activeLook] ?? null;
  const feedbackMessage = look ? feedbackState[look.id] : '';

  const targetOptions = useMemo(() => {
    if (!look) return [];
    return [...look.items.map((item) => ({ id: item.id, label: item.name })), { id: 'whole-look', label: 'The whole idea' }];
  }, [look]);

  function submitPrompt(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim()) void askStylist(prompt);
  }

  function beginReaction(nextReaction: Reaction) {
    setReaction(nextReaction);
    setTargets(nextReaction === 'love' && look ? look.items.map((item) => item.id) : []);
    setNote('');
    if (nextReaction === 'love') void saveFeedback(nextReaction, look?.items.map((item) => item.id) ?? []);
  }

  async function saveFeedback(nextReaction = reaction, nextTargets = targets) {
    if (!data || !look || !nextReaction || nextTargets.length === 0) return;
    setFeedbackBusy(true);
    setError('');
    try {
      const response = await fetch('/api/stylist/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: data.request,
          lookId: look.id,
          reaction: nextReaction,
          itemIds: look.items.map((item) => item.id),
          targetItemIds: nextTargets,
          note,
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'That reaction was not saved.');
      setFeedbackState((current) => ({ ...current, [look.id]: nextReaction === 'love' ? 'Saved. This direction moves up.' : 'Saved. The next ranking will account for it.' }));
      setReaction(null);
      setTargets([]);
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That reaction was not saved.');
    } finally {
      setFeedbackBusy(false);
    }
  }

  function toggleTarget(id: string) {
    setTargets((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="stylist-shell">
      <header className="stylist-header">
        <div className="stylist-brand">
          <div className="brand-mark">A</div>
          <div><p className="eyebrow">ANGIE / PRIVATE STYLIST</p><p className="presence"><span /> 119 evidence points active</p></div>
        </div>
        <div className="stylist-header-actions">
          {role === 'admin' && <Link href="/results">Experiment</Link>}
          <button onClick={() => setBrainOpen((open) => !open)} type="button">{brainOpen ? 'Close brain' : 'Style brain'}</button>
        </div>
      </header>

      <section className="stylist-command">
        <div className="command-copy">
          <p className="eyebrow">WHAT ARE WE DRESSING FOR?</p>
          <h1>Tell me the life. I&apos;ll build the look.</h1>
          <p>I use what you kept, returned, never wore, saved and corrected—not generic body-shape advice.</p>
        </div>
        <form className="stylist-composer" onSubmit={submitPrompt}>
          <textarea aria-label="Ask your stylist" rows={2} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Dinner, office, a skirt you cannot style…" />
          <button disabled={busy || !prompt.trim()} type="submit">{busy ? 'Thinking…' : 'Build my edit →'}</button>
        </form>
        <div className="prompt-chips" aria-label="Prompt suggestions">
          {quickPrompts.map((item) => <button disabled={busy} key={item} onClick={() => void askStylist(item)} type="button">{item}</button>)}
        </div>
        {error && <p className="stylist-error" role="alert">{error}</p>}
      </section>

      {brainOpen && data && (
        <section className="brain-panel">
          <div className="brain-intro">
            <p className="eyebrow">CURRENT WORKING MEMORY</p>
            <h2>{data.profile.identity}</h2>
            <p>{data.profile.becoming}</p>
          </div>
          <div className="brain-stats">
            <div><strong>{data.profile.evidence.reviewedPurchases}</strong><span>purchases reviewed</span></div>
            <div><strong>{data.profile.evidence.inspirationImages}</strong><span>saved inspirations</span></div>
            <div><strong>{data.profile.evidence.fullLookReviews}</strong><span>complete looks corrected</span></div>
            <div><strong>{data.profile.evidence.keptButNeverWears}</strong><span>closet ghosts identified</span></div>
          </div>
          <div className="measurement-row">
            {Object.entries(data.profile.measurements).map(([label, value]) => <span key={label}><small>{label}</small>{value}</span>)}
          </div>
          <div className="rule-grid">
            {data.profile.rules.map((rule) => (
              <article key={rule.id}><span>{rule.id} · {rule.confidence}</span><h3>{rule.title}</h3><p>{rule.rule}</p><small>{rule.evidence}</small></article>
            ))}
          </div>
        </section>
      )}

      {!data && busy && <section className="stylist-loading"><div className="loader" /><p>Cross-checking history, fit rules and outfit coherence…</p></section>}

      {data && look && (
        <section className="stylist-result">
          <div className="result-heading">
            <div><p className="eyebrow">YOUR EDIT · {data.intent.occasion.toUpperCase()}</p><h2>{data.intent.summary}</h2></div>
            <span>{new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} catalog</span>
          </div>

          <div className="look-tabs" role="tablist" aria-label="Ranked looks">
            {data.looks.map((item, index) => (
              <button aria-selected={activeLook === index} className={activeLook === index ? 'active' : ''} key={item.id} onClick={() => { setActiveLook(index); setReaction(null); setTargets([]); }} role="tab" type="button">
                <span>0{index + 1}</span><strong>{item.eyebrow}</strong><small>{item.score}/100</small>
              </button>
            ))}
          </div>

          <article className="look-card">
            <div className="look-lead">
              <div><p className="eyebrow">{look.eyebrow} · {look.confidence.toUpperCase()} CONFIDENCE</p><h2>{look.title}</h2><p>{look.story}</p></div>
              <div className="look-score"><strong>{look.score}</strong><span>personal match</span></div>
            </div>

            <div className={`look-collage look-collage-${Math.min(4, look.items.length)}`}>
              {look.items.map((item) => (
                <div className="look-visual" key={item.id}>
                  <ProductVisual item={item} />
                  <span>{item.source === 'closet' ? 'IN YOUR CLOSET' : item.brand}</span>
                </div>
              ))}
            </div>

            <div className="look-score-grid">
              <ScoreBar label="Taste" value={look.totals.taste} />
              <ScoreBar label="Likely fit" value={look.totals.fit} />
              <ScoreBar label="Coherence" value={look.totals.coherence} />
            </div>

            <div className="look-items">
              {look.items.map((item) => (
                <article key={item.id}>
                  <div className="item-index">{String(look.items.indexOf(item) + 1).padStart(2, '0')}</div>
                  <div className="item-main">
                    <span>{item.brand} · {item.color}</span>
                    <h3>{item.name}</h3>
                    <p>{item.evidence}</p>
                    <div className="item-tags"><b>Start {item.size}</b><b>{item.sizeConfidence} size confidence</b><b>{item.source === 'closet' ? 'Use yours' : `$${item.price}`}</b></div>
                  </div>
                  <div className="item-action">
                    <strong>{item.itemScore}</strong><span>item match</span>
                    {item.url ? <a href={item.url} rel="noreferrer" target="_blank">Open at {item.brand} ↗</a> : <em>Already owned</em>}
                  </div>
                </article>
              ))}
            </div>

            <div className="reasoning-grid">
              <article className="reasoning-primary"><p className="eyebrow">WHY THIS RANKED HERE</p>{look.explanation.map((item) => <p key={item}>{item}</p>)}</article>
              <article className="risk-card"><p className="eyebrow">FIT WATCH</p><p>{look.fitWatch}</p></article>
              <article><p className="eyebrow">THE RECEIPTS</p><ul>{look.evidence.map((item) => <li key={item}>{item}</li>)}</ul></article>
              <article><p className="eyebrow">HAIR + FINISH</p><p>{look.finish}</p></article>
            </div>

            <div className="look-total"><span>New spend if every suggested gap is purchased</span><strong>${look.totals.newSpend}</strong><small>Closet pieces cost $0 · verify stock and price at the retailer</small></div>

            <section className="reaction-box">
              <div><p className="eyebrow">TEACH THE NEXT ANSWER</p><h3>Is this Angie?</h3><p>React to the whole look. If it misses, point to what broke it.</p></div>
              <div className="reaction-buttons">
                {(Object.keys(reactionLabels) as Reaction[]).map((item) => <button className={reaction === item ? `active ${item}` : ''} disabled={feedbackBusy} key={item} onClick={() => beginReaction(item)} type="button">{reactionLabels[item]}</button>)}
              </div>
              {reaction && reaction !== 'love' && (
                <div className="reaction-detail">
                  <p>What changed your answer?</p>
                  <div>{targetOptions.map((item) => <button className={targets.includes(item.id) ? 'active' : ''} key={item.id} onClick={() => toggleTarget(item.id)} type="button">{item.label}</button>)}</div>
                  <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional: say it in your own words…" />
                  <button className="save-reaction" disabled={targets.length === 0 || feedbackBusy} onClick={() => void saveFeedback()} type="button">{feedbackBusy ? 'Saving…' : 'Save what I learned'}</button>
                </div>
              )}
              {feedbackMessage && <p className="learned-message">{feedbackMessage} <button onClick={() => void askStylist(data.request)} type="button">Re-rank now →</button></p>}
            </section>
          </article>

          {data.rejected.length > 0 && (
            <details className="filtered-panel">
              <summary>I rejected {data.rejected.length} tempting products before showing this</summary>
              <div>{data.rejected.map((item) => <article key={item.id}>{item.image && <Image alt="" height={200} sizes="88px" src={item.image} width={160} />}<div><h3>{item.name}</h3><p>{item.reason}</p><small>{item.evidence}</small></div></article>)}</div>
            </details>
          )}
          <p className="catalog-note">{data.catalogStatus}</p>
        </section>
      )}
    </main>
  );
}
