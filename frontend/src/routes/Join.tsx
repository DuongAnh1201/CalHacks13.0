import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { NOT_CONFIGURED } from '../share/copy';
import { joinShare, shareConfigured, useShare } from '../share/store';
import css from './Join.module.css';

export default function Join() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const stored = useShare((s) => s.stored);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A reload of the invite page re-uses this tab's token: a second join would add a duplicate participant.
  if (stored?.role === 'viewer' && stored.inviteCode === code) return <Navigate to="/jobs/sample/mri" replace />;

  const ready = shareConfigured();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await joinShare(code, name);
    setBusy(false);
    if (err) setError(err); else navigate('/jobs/sample/mri');
  };

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.column}>
        <h1>Join a shared session</h1>
        <p>You follow the host's view of the sample case. You can stop following at any time.</p>
        <form className={css.form} onSubmit={(e) => void submit(e)}>
          <label className={css.label}>Your name
            <input className={css.input} value={name} maxLength={64} required onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="submit" className={css.btn} disabled={!ready || busy || !name.trim()}>{busy ? 'Joining…' : 'Join'}</button>
        </form>
        {!ready && <p role="status">{NOT_CONFIGURED}</p>}
        {error && <p role="alert">{error}</p>}
      </main>
      <Footer />
    </div>
  );
}
