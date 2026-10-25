import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { TopNavBar } from '../components/TopNavBar';
import { joinPlayground, playConfigured, usePlay } from '../play/store';
import { NOT_CONFIGURED } from '../share/copy';
import css from './Join.module.css';

/** /play/join/:code: joins a games playground. Case-workspace invites use /join/:code. */
export default function PlayJoin() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const stored = usePlay((s) => s.stored);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A reload of the invite page re-uses this tab's token: a second join would add a duplicate player.
  if (stored?.inviteCode === code) return <Navigate to="/play" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await joinPlayground(code, name);
    setBusy(false);
    if (err) setError(err); else navigate('/play');
  };

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.column}>
        <h1>Join a playground</h1>
        <p>Play the study games with your group. Your name shows on the leaderboard.</p>
        <form className={css.form} onSubmit={(e) => void submit(e)}>
          <label className={css.label}>Your name
            <input className={css.input} value={name} maxLength={64} required onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className={css.btn} disabled={!playConfigured() || busy || !name.trim()}>{busy ? 'Joining…' : 'Join'}</button>
        </form>
        {!playConfigured() && <p role="alert">{NOT_CONFIGURED}</p>}
        {error && <p role="alert">{error}</p>}
      </main>
    </div>
  );
}
