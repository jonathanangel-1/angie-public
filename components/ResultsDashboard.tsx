'use client';

import { buildQuestionSequence, questionLabel, type AnswerMap } from '@/data/questions';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ResponseRow = { candidate_id: string; rating: 'would' | 'maybe' | 'no'; reason?: string | null; note?: string | null };
type RankedItem = {
  id: string; rank: number; retailer: string; name: string; color: string; price: number; likelySize: string;
  privateScore: number; privateTaste: number; privateFit: number; privateMaterial: number; privateConfidence: string;
  privateWhy: string; privateRisk: string; privateMeasurements: string; response: ResponseRow | null;
  baselineRank: number; rankChange: number; baselineScore: number; adjustedScore: number;
  adjustments: Array<{ questionId: string; delta: number; reason: string }>;
};
type Evaluation = { labeledCount: number; complete: boolean; topWould: number; bottomWould: number; ndcgAt10: number | null; pairwiseAccuracy: number | null; pass: boolean };
type Results = {
  answers: AnswerMap;
  profile: { current: string; becoming: string; taste: string; fit: string; counsel: string; mission: string };
  metrics: { questionsAnswered: number; ratingsAnswered: number; topWould: number; bottomWould: number; complete: boolean; decision: 'WAITING' | 'PASS' | 'ITERATE'; threshold: string };
  freeze: null | { id: string; version: string; createdAt: number; integrityHash: string; blindLabelsSeen: boolean; questionAudit: Array<{ questionId: string; answer: string; status: string; rationale: string }> };
  comparison: { baseline: Evaluation; adjusted: Evaluation; gain: { topWould: number; bottomFalsePositivesReduced: number; ndcgAt10: number | null; pairwiseAccuracy: number | null } };
  ranked: RankedItem[];
};

const ratingText: Record<string, string> = { would: 'Would wear', maybe: 'Maybe', no: 'No', missing: 'Waiting' };

export default function ResultsDashboard() {
  const [data, setData] = useState<Results | null>(null);
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const response = await fetch('/api/results');
    if (response.status === 401) { setLocked(true); setLoading(false); return; }
    setData(await response.json() as Results);
    setLocked(false);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    fetch('/api/results').then(async (response) => {
      if (!active) return;
      if (response.status === 401) {
        setLocked(true);
        setLoading(false);
        return;
      }
      setData(await response.json() as Results);
      setLocked(false);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault(); setError('');
    const response = await fetch('/api/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const result = await response.json() as { role?: string };
    if (!response.ok || result.role !== 'admin') { setError('That is not Demo administrator’s access word.'); return; }
    setLoading(true); await load();
  }

  async function reset() {
    if (!window.confirm('Erase Angie’s saved answers and restart the test from zero?')) return;
    await fetch('/api/results', { method: 'DELETE' });
    await load();
  }

  function exportResults() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'angie-style-test-results.json'; anchor.click();
    URL.revokeObjectURL(url);
  }

  const contradictions = useMemo(() => {
    if (!data) return [];
    return data.ranked.filter((item) => (item.rank <= 10 && item.response?.rating === 'no') || (item.rank >= 21 && item.response?.rating === 'would'));
  }, [data]);

  if (loading) return <main className="admin-shell center-shell"><div className="loader" /><p className="loading-copy">Calculating the honest result…</p></main>;

  if (locked) return (
    <main className="shell lock-shell">
      <header className="topbar borderless-topbar"><div className="brand-mark">J</div><div><p className="eyebrow">HIDDEN GROUND TRUTH</p><p className="presence"><span /> Demo administrator only</p></div></header>
      <section className="lock-content admin-lock">
        <p className="eyebrow">PRIVATE EVALUATOR</p><h1>This side contains the ranking Angie must not see first.</h1>
        <form className="unlock-form" onSubmit={unlock}><label htmlFor="admin-code">Your access word</label><div className="unlock-row"><input id="admin-code" value={code} onChange={(event) => setCode(event.target.value)} autoCapitalize="characters" /><button className="primary-button" type="submit">Open →</button></div>{error && <p className="form-error">{error}</p>}</form>
      </section>
    </main>
  );

  if (!data) return null;
  const decisionCopy = data.metrics.decision === 'PASS'
    ? 'The taste ranking earned a tiny real-world try-on. Review the top three with the strongest fit evidence—nothing more.'
    : data.metrics.decision === 'ITERATE'
      ? 'The ranking did not separate strong from weak options cleanly enough. Study contradictions and change the rules before ordering.'
      : `Both rankings are frozen. Angie’s separate workbook still has ${30 - data.metrics.ratingsAnswered} blind labels to import before we judge either one.`;
  const questionSequence = buildQuestionSequence(data.answers);

  return (
    <main className="admin-shell">
      <header className="admin-topbar"><div><p className="eyebrow">ANGIE STYLE POC / PRIVATE</p><h1>Experiment control room</h1></div><div className="admin-actions"><button onClick={exportResults}>Export JSON</button><button className="danger-link" onClick={reset}>Reset test</button></div></header>

      <section className={`decision-banner ${data.metrics.decision.toLowerCase()}`}>
        <div><span>LIVE DECISION</span><strong>{data.metrics.decision}</strong></div>
        <p>{decisionCopy}</p>
      </section>

      {data.freeze && <section className="freeze-banner"><div><span>IMMUTABLE FREEZE</span><strong>A + B locked before blind labels</strong></div><p>{data.freeze.version} · {new Date(data.freeze.createdAt).toLocaleString()} · hash {data.freeze.integrityHash.slice(0, 12)}…</p></section>}

      <section className="metric-grid">
        <article><span>Calibration</span><strong>{data.metrics.questionsAnswered}<small>/12</small></strong><p>high-information answers</p></article>
        <article><span>Blind workbook</span><strong>{data.metrics.ratingsAnswered}<small>/30</small></strong><p>external labels imported</p></article>
        <article><span>A · Email only</span><strong>{data.comparison.baseline.topWould}<small>/10</small></strong><p>top-ten Would wear</p></article>
        <article><span>B · Questions</span><strong>{data.comparison.adjusted.topWould}<small>/10</small></strong><p>top-ten Would wear</p></article>
      </section>

      <div className="admin-grid">
        <section className="admin-panel profile-panel">
          <div className="panel-heading"><div><p className="eyebrow">WORKING BRAIN</p><h2>What the questions taught us</h2></div><span>{Object.keys(data.answers).length} signals</span></div>
          <div className="brain-list"><article><b>Current</b><p>{data.profile.current}</p></article><article><b>Becoming</b><p>{data.profile.becoming}</p></article><article><b>Fit law</b><p>{data.profile.fit}</p></article><article><b>Counsel</b><p>{data.profile.counsel}</p></article></div>
          <details className="answer-audit"><summary>Open every answer</summary>{questionSequence.map((question) => <div key={question.id}><span>{question.title}</span><strong>{data.answers[question.id] ? questionLabel(question.id, data.answers[question.id].answer, data.answers) : 'Waiting'}</strong>{data.answers[question.id]?.note && <em>{data.answers[question.id].note}</em>}</div>)}</details>
        </section>

        <section className="admin-panel contradiction-panel">
          <div className="panel-heading"><div><p className="eyebrow">FASTEST LEARNING</p><h2>Contradictions</h2></div><span>{contradictions.length}</span></div>
          {!data.metrics.complete && <p className="empty-copy">This list becomes meaningful after all 30 answers.</p>}
          {data.metrics.complete && !contradictions.length && <p className="empty-copy">No top-vs-bottom contradictions. The ranking separated Angie&apos;s instinct cleanly.</p>}
          {contradictions.map((item) => <article className="contradiction" key={item.id}><div><span>MODEL #{item.rank}</span><strong>{item.name}</strong><small>{item.retailer} · {item.color}</small></div><b className={`response-pill ${item.response?.rating}`}>{ratingText[item.response?.rating ?? 'missing']}</b><p>Model thought: {item.privateWhy}</p><p>Angie&apos;s reason: {item.response?.reason ?? 'No reason captured'}</p></article>)}
        </section>
      </div>

      <section className="admin-panel ranking-panel">
        <div className="panel-heading"><div><p className="eyebrow">FROZEN RANKING B</p><h2>Email history plus questionnaire</h2></div><span>{data.metrics.threshold}</span></div>
        <div className="ranking-list">
          {data.ranked.map((item) => <details className="ranking-row" key={item.id}><summary><span className="rank-number">B #{item.rank}</span><div className="rank-name"><strong>{item.name}</strong><small>{item.retailer} · {item.color} · ${item.price} · A #{item.baselineRank} → B #{item.rank}</small></div><div className="score-block"><span>B SCORE</span><strong>{item.adjustedScore.toFixed(2)}</strong></div><b className={`response-pill ${item.response?.rating ?? 'missing'}`}>{ratingText[item.response?.rating ?? 'missing']}</b></summary><div className="rank-evidence"><p><b>Original evidence</b>{item.privateWhy}</p><p><b>Known risk</b>{item.privateRisk}</p><p><b>Fit evidence</b>{item.privateMeasurements} · Suggested {item.likelySize} · {item.privateConfidence} confidence</p>{item.adjustments.map((adjustment) => <p key={`${item.id}-${adjustment.questionId}-${adjustment.reason}`}><b>{adjustment.delta > 0 ? '+' : ''}{adjustment.delta.toFixed(2)} · {adjustment.questionId}</b>{adjustment.reason}</p>)}{item.response?.reason && <p><b>Angie&apos;s reason</b>{item.response.reason}</p>}</div></details>)}
        </div>
      </section>
    </main>
  );
}
