import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, flairUrl, getLibrary, segUrl } from '../api/client';
import type { LibraryCase } from '../api/types';
import { TopNavBar } from '../components/TopNavBar';
import { BeatTheAi } from '../games/BeatTheAi';
import { Bigger } from '../games/Bigger';
import { FindTheSlice } from '../games/FindTheSlice';
import { BEAT_AI_CASES, beatAiRound, biggerRound, findSliceRound, score, whichSideRound, type NewRound } from '../games/rounds';
import type { GameAnswer, GameKind, GameResult } from '../games/types';
import type { RoundProps } from '../games/view';
import { expertUrl, loadVolume } from '../games/volume';
import { WhichSide } from '../games/WhichSide';
import { PlaygroundBar } from '../play/PlaygroundBar';
import { answerRound, leavePlayground, playConfigured, resumePlay, revealRound, startPlayground, startRound, usePlay } from '../play/store';
import { FALLBACK } from './library';
import css from './Play.module.css';

const GAMES: { kind: GameKind; title: string; blurb: string }[] = [
  { kind: 'findSlice', title: 'Find the slice', blurb: 'A spot glows in the 3D brain. Put the slice crosshair on it.' },
  { kind: 'beatAi', title: 'Beat the AI', blurb: 'Outline the tumor. Scored against the expert, next to the AI.' },
  { kind: 'whichSide', title: 'Which side?', blurb: 'Read a radiological slice: left or right hemisphere?' },
  { kind: 'bigger', title: 'Bigger or smaller', blurb: 'Two tumors, one slice each. Which is bigger in 3D?' },
];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A fresh round of `kind`, always on a library or sample case. */
async function makeRound(kind: GameKind, library: LibraryCase[], last: string | null): Promise<NewRound | null> {
  switch (kind) {
    case 'whichSide': return whichSideRound(library, last);
    case 'bigger': return biggerRound(library);
    case 'beatAi': {
      const jobId = pick(BEAT_AI_CASES);
      return beatAiRound(jobId, await loadVolume(expertUrl(jobId)));
    }
    case 'findSlice': {
      const jobId = pick(library.filter((c) => c.tumorDetected)).jobId;
      const [flair, seg] = await Promise.all([loadVolume(flairUrl(jobId)), loadVolume(segUrl(jobId))]);
      return findSliceRound(jobId, flair, seg);
    }
  }
}

const lastCase = (r: NewRound | null) => (r && 'jobId' in r.prompt ? r.prompt.jobId : null);

function RoundView(p: RoundProps) {
  switch (p.prompt.kind) {
    case 'whichSide': return <WhichSide {...p} prompt={p.prompt} />;
    case 'bigger': return <Bigger {...p} prompt={p.prompt} />;
    case 'beatAi': return <BeatTheAi {...p} prompt={p.prompt} />;
    case 'findSlice': return <FindTheSlice {...p} prompt={p.prompt} />;
  }
}

/**
 * Study games. Solo by default; a PLAYGROUND (a Convex session of kind "play", separate from any
 * case workspace) lets a group play together: the host picks each game and reveals it, everyone
 * (host included) answers, and the leaderboard lists every member.
 */
export default function Play() {
  const stored = usePlay((s) => s.stored);
  const live = usePlay((s) => s.session?.status === 'active');
  const me = usePlay((s) => s.session?.me.participantId ?? null);
  const game = usePlay((s) => s.game);
  const notice = usePlay((s) => s.notice);
  useEffect(() => { resumePlay(); }, []);
  const playground = stored && live ? stored : null;
  const host = playground?.role === 'host';

  const [library, setLibrary] = useState<LibraryCase[] | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    getLibrary(ac.signal).then(setLibrary).catch((e: unknown) => {
      if (!ac.signal.aborted) setLibrary(e instanceof ApiError && e.status === 404 ? FALLBACK : []);
    });
    return () => ac.abort();
  }, []);

  const [solo, setSolo] = useState<{ n: number; round: NewRound; mine: { answer: GameAnswer; result: GameResult } | null } | null>(null);
  const [total, setTotal] = useState({ points: 0, rounds: 0 });
  const [kind, setKind] = useState<GameKind>('findSlice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [lastJob, setLastJob] = useState<string | null>(null);

  const round = playground ? game?.round ?? null : null;
  const roundOpen = round?.status === 'open';
  const activeKind = playground ? round?.prompt.kind ?? null : kind;

  const next = async (k = kind) => {
    setKind(k);
    if (!library) return;
    setBusy(true);
    setError(null);
    try {
      const r = await makeRound(k, library, lastJob);
      setLastJob(lastCase(r));
      if (!r) setError(k === 'bigger' || k === 'whichSide' ? 'This game needs the study library, which the backend has not loaded yet.' : 'Could not make a round from this case.');
      else if (playground) setError(await startRound(r.prompt, r.secret));
      else setSolo((s) => ({ n: (s?.n ?? 0) + 1, round: r, mine: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the case for this round.');
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = async (answer: GameAnswer) => {
    if (playground && round) { setError(await answerRound(round.roundId, answer)); return; }
    if (!solo || solo.mine) return;
    const result = score(solo.round.prompt, solo.round.secret, answer);
    setSolo({ ...solo, mine: { answer, result } });
    setTotal((t) => ({ points: t.points + result.points, rounds: t.rounds + 1 }));
  };

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(await startPlayground(name.trim()));
    setBusy(false);
  };

  const view: (RoundProps & { key: string }) | null = playground
    ? round && {
      key: round.roundId,
      prompt: round.prompt,
      revealed: round.status === 'revealed',
      secret: round.secret,
      mine: round.mine,
      others: round.answers?.filter((a) => a.participantId !== me) ?? null,
      canAnswer: round.status === 'open',
      onAnswer: (a) => void onAnswer(a),
    }
    : solo && {
      key: String(solo.n),
      prompt: solo.round.prompt,
      revealed: !!solo.mine,
      secret: solo.round.secret,
      mine: solo.mine,
      others: null,
      canAnswer: true,
      onAnswer: (a) => void onAnswer(a),
    };

  // A click on a game card starts a round, so it is locked while one is open: it used to replace the
  // open round silently, which closed it under people still answering.
  const canPick = (!playground || host) && !roundOpen;
  const pickHint = playground && !host ? 'The host picks the game' : roundOpen ? 'Reveal this round first' : undefined;
  const players = game?.leaderboard.length ?? 0;

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.main}>
        <header className={css.head}>
          <div>
            <h1 className={css.title}>Play</h1>
            <p className={css.lede}>
              {playground
                ? host ? 'You run this playground: pick a game, everyone answers (you too), then reveal.' : 'The host picks each game. Answer when a round starts; the leaderboard updates live.'
                : 'Quick games that train the 2D-to-3D thinking scans need. Play solo, or start a playground and invite your study group.'}
            </p>
          </div>
        </header>

        {playground
          ? <PlaygroundBar />
          : (
            <form className={css.startBar} onSubmit={(e) => void start(e)}>
              <b>Play with friends</b>
              <span>Start a playground: a separate session just for games, with its own invite link.</span>
              <input className={css.nameInput} placeholder="Your name" aria-label="Your name" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} />
              <button type="submit" className={css.primary} disabled={!playConfigured() || busy || !name.trim()}>Start a playground</button>
            </form>
          )}
        {notice && <p className={css.note} role="status">{notice}</p>}

        <ul className={css.games}>
          {GAMES.map((g) => (
            <li key={g.kind}>
              <button type="button" className={css.game} aria-pressed={activeKind === g.kind} disabled={!canPick || busy || !library}
                title={pickHint} onClick={() => void next(g.kind)}>
                <b>{g.title}</b><span>{g.blurb}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className={css.body}>
          <section className={css.round} aria-label="Round">
            {busy && <p className={css.note}>Setting up…</p>}
            {view ? <RoundView {...view} /> : !busy && (
              <p className={css.empty}>{!playground || host ? 'Pick a game above to start a round.' : 'Waiting for the host to start a round…'}</p>
            )}
          </section>

          <aside className={css.side}>
            <section className={css.card}>
              <h2 className={css.cardTitle}>{playground ? 'Leaderboard' : 'Your score'}</h2>
              {playground
                ? (
                  <ol className={css.board}>{(game?.leaderboard ?? []).map((r, i) => (
                    <li key={r.participantId} className={r.participantId === me ? css.meRow : undefined}>
                      <span className={css.rank}>{i + 1}</span>
                      <span className={css.name}>{r.displayName}{r.participantId === me ? ' (you)' : ''}</span>
                      <b>{r.points}</b>
                    </li>
                  ))}</ol>
                )
                : <p className={css.big}>{total.points}<small> pts · {total.rounds} round{total.rounds === 1 ? '' : 's'}</small></p>}
            </section>
            {playground && round && (
              <section className={css.card}>
                <h2 className={css.cardTitle}>This round</h2>
                <p className={css.note}>
                  {round.status === 'open'
                    ? `${round.answered.length} of ${players} answered${round.answered.length ? `: ${round.answered.map((a) => a.displayName).join(', ')}` : ''}`
                    : 'Revealed.'}
                </p>
                {host && round.status === 'open' && <button type="button" className={css.primary} onClick={() => void revealRound(round.roundId).then(setError)}>Reveal answers</button>}
              </section>
            )}
            {(!playground || host) && view?.revealed && <button type="button" className={css.primary} disabled={busy} onClick={() => void next()}>Next round</button>}
            {playground && <button type="button" className={css.leave} onClick={() => void leavePlayground()}>{host ? 'End playground' : 'Leave playground'}</button>}
          </aside>
        </div>
      </main>
      {/* Fixed, so a failed answer is never scrolled out of sight. */}
      {error && (
        <div className={css.toast} role="alert">
          {error}
          <button type="button" aria-label="Dismiss" onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
}
