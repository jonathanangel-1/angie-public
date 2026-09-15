'use client';

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  InspirationMemory,
  InspirationReaction,
  InspirationRecommendation,
  RecommendationItem,
  InspirationEdit,
} from '@/lib/inspiration-types';

type Role = 'participant' | 'admin';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const EMPTY_MEMORY: InspirationMemory = { feedbackCount: 0, signalCount: 0, likes: [], avoidances: [], recentNotes: [] };
const EDIT_LABELS = { 'BEST MATCH': 'Closest', 'LOW-RISK': 'Alternative', 'CONTROLLED STRETCH': 'Alternative' } as const;

type Purchase = { item: RecommendationItem; recommendationId: string; editId: string; eventType: string; size: string; fit: string; reason: string };
function ProductItem({ item, recommendationId, editId, purchase, alternatives = [], onSwap, swapping = false }: { item: RecommendationItem; recommendationId: string; editId: string; purchase?: Purchase; alternatives?: RecommendationItem[]; onSwap?: (replacement: RecommendationItem) => void; swapping?: boolean }) {
  const [guidance,setGuidance]=useState({recommendedSize:item.recommendedSize,sizeConfidence:item.sizeConfidence,fitWatch:item.fitWatch});
  const [outcome, setOutcome] = useState(purchase?.eventType || 'ordered');
  const [size, setSize] = useState(purchase?.size || '');
  const [fit, setFit] = useState(purchase?.fit || 'unknown');
  const [reason, setReason] = useState(purchase?.reason || '');
  const [showSwaps, setShowSwaps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [savedOutcome, setSavedOutcome] = useState(purchase?.eventType || '');
  const outcomeLock = useRef(false);
  async function saveOutcome() {
    if (outcomeLock.current) return;
    outcomeLock.current = true; setSaving(true); setMessage('');
    try {
      const response = await fetch('/api/inspiration/outcomes', {method:'POST',headers:{'Content-Type':'application/json'},
        body: JSON.stringify({recommendationId, editId, catalogId:item.catalogId, eventType:outcome, size, fit:outcome==='ordered'?'unknown':fit, reason})});
      const data = await response.json() as {error?:string;guidance?:typeof guidance};
      if (!response.ok) throw new Error(data.error || 'Could not save. Try again.');
      if(data.guidance)setGuidance(data.guidance);
      setSavedOutcome(outcome);
      setMessage('Saved.');
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Could not save.'); }
    finally { outcomeLock.current = false; setSaving(false); }
  }
  return (
    <article className="recommendation-item">
      <div className="recommendation-item-copy">
        <p>{item.slot} · {item.brand}{item.matchQuality === 'alternative' ? ' · Alternative' : ''}</p>
        <h3>{item.name}</h3>
        <div className="product-decision-row">
          <strong>{/^(Not established|Check)/.test(guidance.recommendedSize) ? 'Check size' : `${guidance.sizeConfidence === 'High' ? 'Size' : 'Try'} ${guidance.recommendedSize}`}</strong>
          {item.price ? <span>{item.price}</span> : null}
          <span>{item.sourceStatus === 'page-verified' ? 'Page checked' : item.sourceStatus === 'catalog-verified' ? 'Catalog match' : 'Availability unconfirmed'}</span>
        </div>
        <details className="product-watch"><summary>Size guidance</summary><p>{guidance.fitWatch}</p></details>
        <a href={item.officialUrl} rel="noreferrer" target="_blank">Open at {item.brand} ↗</a>
        {onSwap ? <button className="item-swap-button" type="button" disabled={swapping} aria-expanded={showSwaps} onClick={() => setShowSwaps(v => !v)}>Swap</button> : null}
        {showSwaps ? <div className="swap-options">
          {!alternatives.length ? <p>No other checked match for this piece yet.</p> : alternatives.map(candidate => <button key={candidate.catalogId} type="button" disabled={swapping} onClick={() => onSwap?.(candidate)}>
            <strong>{candidate.name}</strong><span>{candidate.brand}{candidate.price ? ` · ${candidate.price}` : ''}</span>
          </button>)}
        </div> : null}
        {item.catalogId ? <details className="purchase-outcome">
          <summary>{savedOutcome ? `Update · ${savedOutcome}` : 'Ordered or tried it?'}</summary>
          <label>Update<select aria-label="Update" value={outcome} onChange={event=>setOutcome(event.target.value)} disabled={saving}>
            <option value="ordered">Ordered</option><option value="tried">Tried on</option><option value="kept">Kept</option><option value="returned">Returned</option><option value="worn">Wore it</option>
          </select></label>
          <label>Size<input value={size} onChange={event=>setSize(event.target.value)} maxLength={20} placeholder="e.g. XS or 4" disabled={saving}/></label>
          {outcome !== 'ordered' ? <label>Fit<select aria-label="Fit" value={fit} onChange={event=>setFit(event.target.value)} disabled={saving}>
            <option value="unknown">Not sure</option><option value="fits">Fits well</option><option value="too-small">Too small</option><option value="too-large">Too large</option><option value="too-short">Too short</option><option value="too-long">Too long</option>
          </select></label> : null}
          {outcome !== 'ordered' ? <label>Reason <span>(optional)</span><select aria-label="Reason" value={reason} onChange={event=>setReason(event.target.value)} disabled={saving}>
            <option value="">Choose</option><option value="Loved the style">Loved the style</option><option value="Not my style">Not my style</option><option value="Fabric or quality">Fabric or quality</option><option value="Fit problem">Fit problem</option><option value="Price">Price</option><option value="Different from the photo">Different from the photo</option>
          </select></label> : null}
          <button type="button" disabled={saving || (outcome !== 'ordered' && fit !== 'unknown' && !size.trim())} onClick={saveOutcome}>{saving?'Saving…':'Save update'}</button>
          {message ? <p role="status">{message}</p> : null}
        </details> : null}
      </div>
    </article>
  );
}

export default function InspirationExperience({ role }: { role: Role }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const generationLock = useRef(false);
  const pointerStart = useRef<number | null>(null);
  const previewRef = useRef('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [note, setNote] = useState('');
  const [memory, setMemory] = useState<InspirationMemory>(EMPTY_MEMORY);
  const [recommendation, setRecommendation] = useState<InspirationRecommendation | null>(null);
  const [activeEdit, setActiveEdit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragX, setDragX] = useState(0);
  const [reactionBusy, setReactionBusy] = useState(false);
  const [pendingReaction, setPendingReaction] = useState<InspirationReaction | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [reactionNote, setReactionNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<InspirationRecommendation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyCursor,setHistoryCursor]=useState<string|null>(null);
  const [showPurchases, setShowPurchases] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const swapLock = useRef(false);

  async function openPurchases() {
    resetUpload(); setShowHistory(false); setShowPurchases(true); setPurchaseBusy(true);
    try {
      const response = await fetch('/api/inspiration/outcomes');
      const data = await response.json() as { error?: string; purchases?: Purchase[] };
      if (!response.ok) throw new Error(data.error || 'Could not load purchases.');
      setPurchases(data.purchases || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load purchases.'); }
    finally { setPurchaseBusy(false); }
  }

  async function swapItem(item: RecommendationItem, replacement: RecommendationItem) {
    if (!recommendation || swapLock.current || reactionBusy) return;
    swapLock.current = true; setSwapping(true); setError('');
    try {
      const response = await fetch('/api/inspiration/swap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recommendationId: recommendation.id, editId: recommendation.edits[activeEdit].id, itemId: item.id, replacementId: replacement.id }) });
      const data = await response.json() as { edit?: InspirationEdit; error?: string };
      if (!response.ok || !data.edit) throw new Error(data.error || 'Could not swap.');
      const edits = [...recommendation.edits.filter(e => e.id !== data.edit!.id), data.edit];
      const updated = { ...recommendation, edits };
      setRecommendation(updated); setHistory(rows => rows.map(row => row.id === updated.id ? updated : row));
      setActiveEdit(edits.length - 1); clearReaction();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not swap.'); }
    finally { swapLock.current = false; setSwapping(false); }
  }

  async function openHistory(cursor?:string) {
    setShowHistory(true); setHistoryBusy(true); setError('');
    try {
      const response = await fetch('/api/inspiration/history'+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''));
      if (!response.ok) throw new Error('Could not load saved looks.');
      const data = await response.json() as {recommendations?:InspirationRecommendation[];nextCursor?:string|null};
      setHistoryCursor(data.nextCursor||null);
      const fetched = data.recommendations;
      if (Array.isArray(fetched)) setHistory(current => [...new Map([...current, ...fetched].map(row=>[row.id,row])).values()].sort((a,b)=>b.createdAt-a.createdAt));
    } catch(reason) { setError(reason instanceof Error ? reason.message : 'Could not load saved looks.'); }
    finally { setHistoryBusy(false); }
  }

  useEffect(() => {
    fetch('/api/inspiration/memory')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Memory unavailable')))
      .then((value) => setMemory(value as InspirationMemory))
      .catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);


  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    if (!next) return;
    setError('');
    setSaved(false);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || next.size > MAX_IMAGE_BYTES || next.size === 0) {
      event.target.value = '';
      setError('Use a JPG, PNG or WebP smaller than 8 MB.');
      return;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : '';
    setPreview(previewRef.current);
    setFile(next);
  }

  function resetUpload() {
    setShowPurchases(false);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = '';
    setPreview('');
    setFile(null);
    setNote('');
    setRecommendation(null);
    setActiveEdit(0);
    clearReaction();
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function findVersion() {
    if ((!file && !note.trim()) || generationLock.current) return;
    generationLock.current = true;
    setBusy(true);
    setError('');
    setRecommendation(null);
    setSaved(false);
    const form = new FormData();
    if (file) form.set('image', file);
    form.set('note', note.trim());
    try {
      const response = await fetch('/api/inspiration', { method: 'POST', body: form });
      const data = await response.json() as InspirationRecommendation & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not build the edit.');
      setRecommendation(data);
      setHistory(current=>[data,...current.filter(row=>row.id!==data.id)]);
      setShowHistory(false);
      setMemory(data.memory);
      setActiveEdit(0);
      clearReaction();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not build the edit.');
    } finally {
      generationLock.current = false;
      setBusy(false);
    }
  }

  function toggleTarget(id: string) {
    setSelectedTargets((current) => current.includes(id)
      ? current.filter((target) => target !== id)
      : id === 'whole-look' ? [id] : [...current.filter((target) => target !== 'whole-look'), id]);
  }

  function clearReaction() {
    setPendingReaction(null);
    setSelectedTargets([]);
    setReactionNote('');
    setDragX(0);
    pointerStart.current = null;
  }

  function selectReaction(reaction: InspirationReaction) {
    if (submitLock.current || recommendation?.confirmedFeedback?.[recommendation.edits[activeEdit].id]) return;
    setPendingReaction(reaction);
    setError('');
    setDragX(0);
  }

  function advanceEdit() {
    if (!recommendation) return;
    resetUpload();
    setShowHistory(false);
    setSaved(true);
    window.scrollTo({ top: 0 });
  }

  async function confirmReaction() {
    if (!recommendation || !pendingReaction || submitLock.current) return;
    if (pendingReaction === 'close' && selectedTargets.length === 0) return;
    const edit = recommendation.edits[activeEdit];
    const targets = pendingReaction === 'close' ? selectedTargets : pendingReaction === 'no' ? selectedTargets.length ? selectedTargets : ['whole-look'] : [];
    submitLock.current = true;
    setReactionBusy(true);
    setError('');
    try {
      const response = await fetch('/api/inspiration/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: recommendation.id,
          editId: edit.id,
          reaction: pendingReaction,
          confirmed: true,
          targetItemIds: targets,
          note: reactionNote,
        }),
      });
      const data = await response.json() as { error?: string; memory?: InspirationMemory };
      if (!response.ok) throw new Error(data.error || 'Could not save that reaction.');
      if (data.memory) setMemory(data.memory);
      const confirmed={reaction:pendingReaction,note:reactionNote,targetItemIds:targets};
      setHistory(rows=>rows.map(row=>row.id===recommendation.id?{...row,confirmedFeedback:{...row.confirmedFeedback,[edit.id]:confirmed}}:row));
      advanceEdit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save that reaction.');
      setDragX(0);
    } finally {
      submitLock.current = false;
      setReactionBusy(false);
    }
  }

  function beginSwipe(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a, button, input, textarea, label, select, summary, details') || submitLock.current || event.button !== 0 || !event.isPrimary) return;
    pointerStart.current = event.clientX;
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { cancelSwipe(); }
  }

  function moveSwipe(event: ReactPointerEvent<HTMLElement>) {
    if (pointerStart.current === null) return;
    setDragX(Math.max(-140, Math.min(140, event.clientX - pointerStart.current)));
  }

  function cancelSwipe() {
    pointerStart.current = null;
    setDragX(0);
  }

  function endSwipe(event: ReactPointerEvent<HTMLElement>) {
    const distance = pointerStart.current === null ? 0 : event.clientX - pointerStart.current;
    cancelSwipe();
    if (distance > 80) selectReaction('love');
    else if (distance < -80) selectReaction('no');
  }

  const currentEdit = recommendation?.edits[activeEdit];
  const confirmedReaction=currentEdit?recommendation?.confirmedFeedback?.[currentEdit.id]:undefined;
  return (
    <main className="inspo-shell">
      <header className="inspo-header">
        <div className="stylist-brand">
          <div className="brand-mark">A</div>
          <div><p className="eyebrow">ANGIE</p><p className="presence"><span /> {role === 'admin' || memory.mode === 'test' ? 'Test mode' : 'Ready'}</p></div>
        </div>
        <div className="inspo-navigation">
          <button className="nav-link-button" disabled={busy || reactionBusy || swapping} onClick={()=>{resetUpload();setShowHistory(false);}} type="button">New look</button>
          <button className="nav-link-button" disabled={busy || reactionBusy || swapping} onClick={()=>{resetUpload();void openHistory();}} type="button">Saved looks</button>
          <button className="nav-link-button" disabled={busy || reactionBusy || swapping} onClick={()=>void openPurchases()} type="button">Purchases</button>
          {role === 'admin' ? <button className="nav-link-button" onClick={() => window.location.assign('/evals')} type="button">Evals</button> : null}
        </div>
      </header>

      {showPurchases ? <section className="inspo-workspace purchase-list">
        <h1>Purchases</h1>
        {purchaseBusy ? <p role="status">Loading…</p> : !purchases.length ? <p>Mark a piece Ordered to keep it here.</p> : purchases.map(purchase => <ProductItem key={`${purchase.recommendationId}:${purchase.item.catalogId}`} {...purchase} purchase={purchase} />)}
        {error ? <p role="alert">{error}</p> : null}
      </section> : null}

      {showHistory && !recommendation ? <section className="inspo-workspace saved-looks">
        <h1>Saved looks</h1>
        {historyBusy ? <p role="status">Loading…</p> : null}
        {!historyBusy && !history.length ? <p>Your looks will appear here.</p> : null}
        {history.map((row,index)=><button key={row.id} aria-label={`Open saved look ${index+1}`} type="button" onClick={()=>{setRecommendation(row);setActiveEdit(0);setShowHistory(false);clearReaction();}}>
          <strong>{row.brief.title}</strong><span>{row.edits[0]?.items.length || 0} items · {new Date(row.createdAt).toLocaleDateString()}</span>
        </button>)}
        {historyCursor ? <button disabled={historyBusy} onClick={()=>void openHistory(historyCursor)} type="button">Load older looks</button>:null}
        {error ? <p role="alert">{error}</p> : null}
      </section> : null}

      {!recommendation && !busy && !showHistory && !showPurchases ? (
        <section className="inspo-workspace compact-inspo-workspace">
          <div className="inspo-copy">
            <h1>Find your<br/>next look.</h1>
          </div>
          <div className={`inspo-drop-card ${preview ? 'has-image' : ''}`}>
            <input accept="image/jpeg,image/png,image/webp" aria-label="Upload an inspiration image" hidden onChange={chooseFile} ref={inputRef} type="file" />
            {preview ? (
              <div className="inspo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Selected style inspiration" src={preview} />
                <button onClick={() => inputRef.current?.click()} type="button">Change</button>
              </div>
            ) : (
              <button className="inspo-drop-zone" onClick={() => inputRef.current?.click()} type="button">
                <span className="upload-orbit">＋</span>
                <strong>Choose image</strong>
              </button>
            )}
            <label className="inspo-note">
              <span>{file ? 'Add a detail' : 'Or describe it'}{file ? <em>Optional</em> : null}</span>
              <textarea maxLength={600} onChange={(event) => { setNote(event.target.value); setSaved(false); }} placeholder={file ? 'Just the trousers, in black…' : 'A relaxed white T-shirt…'} rows={1} value={note} />
            </label>
            <button className="inspo-find-button" disabled={!file && !note.trim()} onClick={findVersion} type="button">Find items</button>
            {saved ? <p className="inspo-saved" role="status">{memory.mode === 'test' ? 'Test saved. Angie’s profile unchanged.' : 'Feedback saved. Your look is in Saved looks.'}</p> : null}
            {error ? <p className="inspo-error" role="alert">{error}</p> : null}
          </div>
        </section>
      ) : null}

      {busy ? (
        <section className="inspo-loading" aria-live="polite">
          <div className="loader" />
          <h1>Finding your look…</h1>
        </section>
      ) : null}

      {recommendation && currentEdit ? (
        <section className="recommendation-shell">
          <div className={`recommendation-context ${recommendation.imageUrl ? '' : 'text-request-context'}`} ref={resultRef}>
            {recommendation.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Inspiration" src={recommendation.imageUrl} />
            ) : null}
            <div>
              <h1>{recommendation.brief.title}</h1>
            </div>
          </div>

          <article
            className={`edit-deck-card ${dragX !== 0 ? 'is-dragging' : ''}`}
            onPointerCancel={cancelSwipe}
            onPointerDown={beginSwipe}
            onPointerMove={moveSwipe}
            onPointerUp={endSwipe}
            style={{ transform: `translateX(${dragX}px) rotate(${dragX / 35}deg)` }}
          >
            <div className="swipe-verdict swipe-no" style={{ opacity: Math.max(0, -dragX / 90) }}>NO</div>
            <div className="swipe-verdict swipe-love" style={{ opacity: Math.max(0, dragX / 90) }}>LOVE</div>
            <header className="edit-card-header">
              <div><p className="eyebrow">{EDIT_LABELS[currentEdit.label]} · {activeEdit + 1}/{recommendation.edits.length}</p><h2>{currentEdit.title}</h2></div>
              {recommendation.edits.length > 1 ? <button className="nav-link-button" disabled={reactionBusy || swapping} onClick={()=>{setActiveEdit(index=>(index+1)%recommendation.edits.length);clearReaction();}} type="button">Next option</button> : null}
            </header>
            <div className="recommendation-items">
              {currentEdit.items.map((item) => <ProductItem item={item} key={`${recommendation.id}:${currentEdit.id}:${item.id}`} recommendationId={recommendation.id} editId={currentEdit.id} swapping={swapping || reactionBusy}
                alternatives={[...new Map(recommendation.edits.flatMap(e => e.items).filter(candidate => candidate.slot === item.slot && candidate.catalogId !== item.catalogId).map(candidate => [candidate.catalogId, candidate])).values()]}
                onSwap={replacement => void swapItem(item, replacement)} />)}
            </div>
            {Boolean(currentEdit.missingSlots?.length) && <p className="edit-finish">{currentEdit.searchIncomplete ? 'Search unfinished' : 'Not found'}: {currentEdit.missingSlots!.join(', ')}</p>}
            <div className="swipe-hint">← No · Love →</div>
          </article>

          {pendingReaction === 'close' || pendingReaction === 'no' ? (
            <div className="close-panel">
              <p>What missed?</p>
              <div>
                {currentEdit.items.map((item) => (
                  <button aria-pressed={selectedTargets.includes(item.id)} className={selectedTargets.includes(item.id) ? 'active' : ''} disabled={reactionBusy} key={item.id} onClick={() => toggleTarget(item.id)} type="button">{item.slot}</button>
                ))}
                {currentEdit.items.length > 1 ? <button aria-pressed={selectedTargets.includes('whole-look')} className={selectedTargets.includes('whole-look') ? 'active' : ''} disabled={reactionBusy} onClick={() => toggleTarget('whole-look')} type="button">Whole look</button> : null}
              </div>
              <textarea aria-label="What missed? Optional note" disabled={reactionBusy} maxLength={800} onChange={(event) => setReactionNote(event.target.value)} placeholder="Optional note" rows={2} value={reactionNote} />
            </div>
          ) : null}
          {swapping ? <p role="status">Saving your edit…</p> : confirmedReaction ? <p role="status">Saved: {confirmedReaction.reaction==='close'?'Almost':confirmedReaction.reaction==='love'?'Love':'No'}{confirmedReaction.note?` · ${confirmedReaction.note}`:''}</p> : <div className="feedback-controls">
            <div aria-label="Your reaction" className="reaction-bar" role="group">
              <button aria-pressed={pendingReaction === 'no'} disabled={reactionBusy} onClick={() => selectReaction('no')} type="button">No</button>
              <button aria-pressed={pendingReaction === 'close'} disabled={reactionBusy} onClick={() => selectReaction('close')} type="button">Almost</button>
              <button aria-pressed={pendingReaction === 'love'} disabled={reactionBusy} onClick={() => selectReaction('love')} type="button">Love</button>
            </div>
            {pendingReaction ? (
              <div className="confirm-reaction">
                <button disabled={reactionBusy} onClick={clearReaction} type="button">Cancel</button>
                <button disabled={reactionBusy || (pendingReaction === 'close' && selectedTargets.length === 0)} onClick={confirmReaction} type="button">
                  {reactionBusy ? 'Saving…' : `Confirm ${pendingReaction === 'close' ? 'Almost' : pendingReaction === 'love' ? 'Love' : 'No'}`}
                </button>
              </div>
            ) : null}
          </div>}
          {error ? <p className="inspo-error result-error" role="alert">{error}</p> : null}
        </section>
      ) : null}

    </main>
  );
}
