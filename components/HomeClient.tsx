'use client';

import { FormEvent, useEffect, useState } from 'react';
import InspirationExperience from '@/components/InspirationExperience';

type Role = 'participant' | 'admin' | null;

export default function HomeClient() {
  const [role, setRole] = useState<Role>(null);
  const [checked, setChecked] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/access').then((response) => response.json() as Promise<{ role: Role }>).then((data) => {
      setRole(data.role);
      setChecked(true);
    }).catch(() => setChecked(true));
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const response = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await response.json() as { error?: string; role?: 'participant' | 'admin' };
    setBusy(false);
    if (!response.ok) {
      setError('Wrong code.');
      return;
    }
    setRole(data.role === 'admin' ? 'admin' : 'participant');
  }

  if (!checked) {
    return <main className="shell center-shell"><div className="loader" aria-label="Loading" /></main>;
  }

  if (!role) {
    return (
      <main className="shell lock-shell">
        <header className="topbar borderless-topbar">
          <div className="brand-mark">A</div>
          <p className="eyebrow">PRIVATE</p>
        </header>
        <section className="lock-content">
          <div className="lock-orbit" aria-hidden="true"><b>A</b></div>
          <h1>Angie’s stylist.</h1>
          <p>Enter the access code.</p>
          <form className="unlock-form" onSubmit={unlock}>
            <label htmlFor="access-code">Code</label>
            <div className="unlock-row">
              <input id="access-code" autoCapitalize="characters" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} placeholder="••••••" />
              <button className="primary-button" disabled={!code.trim() || busy} type="submit">{busy ? 'Opening…' : 'Open'}</button>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
        </section>
      </main>
    );
  }

  return <InspirationExperience role={role} />;
}
