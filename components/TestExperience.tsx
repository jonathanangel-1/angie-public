'use client';

import { buildQuestionSequence, QUESTION_TARGET, type AnswerMap, type Question } from '@/data/questions';
import { buildProfile } from '@/lib/profile';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Stage = 'questions' | 'profile' | 'complete';

async function updateStage(stage: Stage) {
  await fetch('/api/session', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
}

function Header({ label, current, total }: { label: string; current: number; total: number }) {
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <header className="topbar">
      <Link className="brand-mark brand-link" href="/">A</Link>
      <div className="progress-wrap">
        <div className="progress-meta"><span>{label}</span><span>{current} of {total}</span></div>
        <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      </div>
    </header>
  );
}

function QuestionView({ question, answered, onSave }: { question: Question; answered: number; onSave: (answer: string, note: string) => Promise<void> }) {
  const [selection, setSelection] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function next() {
    if (!selection) return;
    setBusy(true);
    await onSave(selection, note);
    setBusy(false);
  }

  return (
    <main className="shell test-shell">
      <Header label="Learning you" current={answered} total={QUESTION_TARGET} />
      <section className="conversation question-conversation">
        <div className="date-chip">{question.kicker}</div>
        <article className="bubble partner-bubble">
          <p className="bubble-name">Style partner</p>
          <h1>{question.title}</h1>
          <p>{question.body}</p>
        </article>
        <div className="choice-stack">
          {question.options.map((option) => (
            <button className={selection === option.value ? 'choice selected' : 'choice'} key={option.value} onClick={() => setSelection(option.value)} type="button">
              <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span><span className="choice-dot" />
            </button>
          ))}
        </div>
        {selection && question.notePrompt && (
          <label className="note-field"><span>{question.notePrompt}</span><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Only if useful…" /></label>
        )}
      </section>
      <footer className="composer"><button className="primary-button full-button" disabled={!selection || busy} onClick={next} type="button">{busy ? 'Saving…' : 'That’s my answer'} <span>→</span></button></footer>
    </main>
  );
}

function ProfileReveal({ answers, onFreeze }: { answers: AnswerMap; onFreeze: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const profile = buildProfile(answers);
  async function freeze() {
    setBusy(true);
    setError('');
    try {
      await onFreeze();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The profile could not be frozen.');
      setBusy(false);
    }
  }

  return (
    <main className="shell profile-shell">
      <Header label="First read" current={QUESTION_TARGET} total={QUESTION_TARGET} />
      <section className="conversation profile-conversation">
        <div className="date-chip">My working theory—not a verdict</div>
        <article className="bubble partner-bubble hero-bubble">
          <p className="bubble-name">Style partner</p><h1>Here is the person I think I&apos;m shopping with.</h1>
          <p>I will keep changing this picture when your real behavior contradicts it.</p>
        </article>
        <div className="profile-cards">
          <article><span>01 / CURRENT</span><h2>{profile.current}</h2></article>
          <article><span>02 / BECOMING</span><h2>{profile.becoming}</h2></article>
          <article><span>03 / TASTE</span><h2>{profile.taste}</h2></article>
          <article className="profile-warning"><span>04 / FIT LAW</span><h2>{profile.fit}</h2></article>
        </div>
        <article className="bubble partner-bubble compact-bubble"><p>{profile.counsel}</p></article>
      </section>
      <footer className="composer">{error && <p className="form-error freeze-error" role="alert">{error}</p>}<button className="primary-button full-button" onClick={freeze} disabled={busy} type="button">{busy ? 'Freezing the snapshot…' : 'Freeze this working profile'} <span>→</span></button></footer>
    </main>
  );
}

function Complete({ answers }: { answers: AnswerMap }) {
  const profile = buildProfile(answers);
  return (
    <main className="shell complete-shell">
      <header className="topbar borderless-topbar"><div className="brand-mark">A</div><div><p className="eyebrow">CALIBRATION COMPLETE</p><p className="presence"><span /> Everything is saved</p></div></header>
      <section className="complete-content">
        <div className="completion-mark">12<span>/12</span></div>
        <p className="eyebrow">WORKING PROFILE FROZEN</p>
        <h1>The questions are done. The blind test stays separate.</h1>
        <p>{profile.current} {profile.becoming}</p>
        <div className="do-not-buy"><strong>Now give the computer back to Demo administrator.</strong><span>He will freeze the updated ranking before opening your separate trouser results. You do not need to review any products again here.</span></div>
      </section>
      <footer className="composer"><Link className="secondary-button full-button" href="/">Back to the private room</Link></footer>
    </main>
  );
}

export default function TestExperience() {
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('questions');
  const [answers, setAnswers] = useState<AnswerMap>({});

  useEffect(() => {
    fetch('/api/session').then(async (sessionResponse) => {
      if (sessionResponse.status === 401) { window.location.href = '/'; return; }
      const sessionData = await sessionResponse.json() as { session?: { stage?: string }; answers?: Array<Record<string, unknown>> };
      const savedStage = String(sessionData.session?.stage ?? 'questions');
      setStage(savedStage === 'complete' ? 'complete' : savedStage === 'profile' ? 'profile' : 'questions');
      setAnswers(Object.fromEntries((sessionData.answers ?? []).map((row: Record<string, unknown>) => [String(row.question_id), { answer: String(row.answer), note: row.note ? String(row.note) : null }])));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const questions = useMemo(() => buildQuestionSequence(answers), [answers]);
  const currentQuestion = questions.find((item) => !answers[item.id]);

  async function saveAnswer(answer: string, note: string) {
    if (!currentQuestion) return;
    await fetch('/api/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: currentQuestion.id, answer, note }) });
    const nextAnswers = { ...answers, [currentQuestion.id]: { answer, note } };
    setAnswers(nextAnswers);
    if (!buildQuestionSequence(nextAnswers).find((item) => !nextAnswers[item.id])) {
      await updateStage('profile');
      setStage('profile');
    }
  }

  async function freezeProfile() {
    const freezeResponse = await fetch('/api/freeze', { method: 'POST' });
    const freeze = await freezeResponse.json() as { error?: string };
    if (!freezeResponse.ok) throw new Error(freeze.error ?? 'The ranking could not be frozen.');
    await updateStage('complete');
    setStage('complete');
  }

  if (loading) return <main className="shell center-shell"><div className="loader" /><p className="loading-copy">Opening your style room…</p></main>;
  if (stage === 'complete') return <Complete answers={answers} />;
  if (stage === 'profile' || !currentQuestion) return <ProfileReveal answers={answers} onFreeze={freezeProfile} />;
  return <QuestionView key={currentQuestion.id} question={currentQuestion} answered={Object.keys(answers).length} onSave={saveAnswer} />;
}
