import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ApiError, flairUrl, getLibrary, segUrl } from '../api/client';
import type { LibraryCase } from '../api/types';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { BeatTheAi } from '../games/BeatTheAi';
import { Bigger } from '../games/Bigger';
import { FindTheSlice } from '../games/FindTheSlice';
import { BEAT_AI_CASES, beatAiRound, biggerRound, findSliceRound, score, whichSideRound, type NewRound } from '../games/rounds';
import type { GameAnswer, GameKind, GameResult, GameState } from '../games/types';
import type { RoundProps } from '../games/view';
import { expertUrl, loadVolume } from '../games/volume';
import { WhichSide } from '../games/WhichSide';
import { answerRound, revealRound, startRound, useShare, watchGame } from '../share/store';
import { FALLBACK } from './library';
import css from './Play.module.css';

const GAMES: { kind: GameKind; title: string; blurb: string }[] = [
  { kind: 'findSlice', title: 'Find the slice', blurb: 'A spot glows in the 3D brain. Put the slice crosshair on it.' },
  { kind: 'beatAi', title: 'Beat the AI', blurb: 'Outline the tumor. Scored against the expert, next to the AI.' },
  { kind: 'whichSide', title: 'Which side?', blurb: 'Read a radiological slice: left or right hemisphere?' },
  { kind: 'bigger', title: 'Bigger or smaller', blurb: 'Two tumors, one slice each. Which is bigger in 3D?' },
];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A fresh round of `kind`. findSlice plays on `caseId` when given (the session's case), else a library case. */
async function makeRound(kind: GameKind, library: LibraryCase[], last: string | null, caseId: string | null): Promise<NewRound | null> {
  switch (kind) {
    case 'whichSide': return whichSideRound(library, last);
    case 'bigger': return biggerRound(library);
    case 'beatAi': {
      const jobId = pick(BEAT_AI_CASES);
      return beatAiRound(jobId, await loadVolume(expertUrl(jobId)));
    }
    case 'findSlice': {
      const jobId = caseId ?? pick(library.filter((c) => c.tumorDetected)).jobId;
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

/** Study games, solo or with the session: the host runs rounds, everyone else answers. */
export default function Play() {
  const { stored, live, me } = useShare(useShallow((s) => ({
    stored: s.stored, live: s.session?.status === 'active', me: s.session?.me.participantId ?? null,
  })));
  const session = live && stored ? stored : null;
  const host = session?.role === 'host';

  const [library, setLibrary] = useState<LibraryCase[] | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    getLibrary(ac.signal).then(setLibrary).catch((e: unknown) => {
      if (!ac.signal.aborted) setLibrary(e instanceof ApiError && e.status === 404 ? FALLBACK : []);
    });
    return () => ac.abort();
  }, []);

  // Session: the live round from Convex. Solo: a local round, scored here.
  const [game, setGame] = useState<GameState | null>(null);
  const sessionId = session?.sessionId ?? null;
  useEffect(() => (sessionId ? watchGame(setGame) : undefined), [sessionId]);

  const [solo, setSolo] = useState<{ n: number; round: NewRound; mine: { answer: GameAnswer; result: GameResult } | null } | null>(null);
  const [total, setTotal] = useState({ points: 0, rounds: 0 });
  const [kind, setKind] = useState<GameKind>('findSlice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const round = session ? game?.round ?? null : null;
  const activeKind = session && !host ? round?.prompt.kind ?? null : kind;

  const next = async (k = kind) => {
    setKind(k);
    if (!library) return;
    setBusy(true);
    setError(null);
    try {
      const r = await makeRound(k, library, lastCase(solo?.round ?? null), session?.jobId ?? null);
      if (!r) setError(k === 'bigger' || k === 'whichSide' ? 'This game needs the study library, which the backend has not loaded yet.' : 'Could not make a round from this case.');
      else if (session) setError(await startRound(r.prompt, r.secret));
      else setSolo((s) => ({ n: (s?.n ?? 0) + 1, round: r, mine: null }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the case for this round.');
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = async (answer: GameAnswer) => {
    if (session && round) { setError(await answerRound(round.roundId, answer)); return; }
    if (!solo || solo.mine) return;
    const result = score(solo.round.prompt, solo.round.secret, answer);
    setSolo({ ...solo, mine: { answer, result } });
    setTotal((t) => ({ points: t.points + result.points, rounds: t.rounds + 1 }));
  };

  const view: (RoundProps & { key: string }) | null = session
    ? round && {
      key: round.roundId,
      prompt: round.prompt,
      revealed: round.status === 'revealed',
      secret: round.secret,
      mine: round.mine,
      others: round.answers?.filter((a) => a.participantId !== me) ?? null,
      canAnswer: !host && round.status === 'open',
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

  const canPick = !session || host;
  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.main}>
        <header className={css.head}>
          <div>
            <h1 className={css.title}>Play</h1>
            <p className={css.lede}>
              {session
                ? host ? 'You are running games for your session. Start a round, let everyone answer, then reveal.' : 'Your host runs the rounds. Answer when one starts; the leaderboard updates live.'
                : <>Quick games that train the 2D-to-3D thinking scans need. Playing solo; <Link to="/explore">share a case</Link> to play with your study group.</>}
            </p>
          </div>
        </header>

        <ul className={css.games}>
          {GAMES.map((g) => (
            <li key={g.kind}>
              <button type="button" className={css.game} aria-pressed={activeKind === g.kind} disabled={!canPick || busy || !library}
                onClick={() => void next(g.kind)}>
                <b>{g.title}</b><span>{g.blurb}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className={css.body}>
          <section className={css.round} aria-label="Round">
            {error && <p className={css.error} role="alert">{error}</p>}
            {busy && <p className={css.note}>Setting up the round…</p>}
            {view ? <RoundView {...view} /> : !busy && (
              <p className={css.empty}>{canPick ? 'Pick a game above to start a round.' : 'Waiting for the host to start a round…'}</p>
            )}
          </section>

          <aside className={css.side}>
            <section className={css.card}>
              <h2 className={css.cardTitle}>{session ? 'Leaderboard' : 'Your score'}</h2>
              {session
                ? (game?.leaderboard.length
                  ? <ol className={css.board}>{game.leaderboard.map((r, i) => (
                    <li key={r.participantId} className={r.participantId === me ? css.meRow : undefined}>
                      <span className={css.rank}>{i + 1}</span><span className={css.name}>{r.displayName}</span><b>{r.points}</b>
                    </li>
                  ))}</ol>
                  : <p className={css.note}>No answers yet.</p>)
                : <p className={css.big}>{total.points}<small> pts · {total.rounds} round{total.rounds === 1 ? '' : 's'}</small></p>}
            </section>
            {session && round && (
              <section className={css.card}>
                <h2 className={css.cardTitle}>This round</h2>
                <p className={css.note}>{round.status === 'open' ? `${round.answered.length} answered${round.answered.length ? `: ${round.answered.map((a) => a.displayName).join(', ')}` : ''}` : 'Revealed.'}</p>
                {host && round.status === 'open' && <button type="button" className={css.primary} onClick={() => void revealRound(round.roundId).then(setError)}>Reveal answers</button>}
              </section>
            )}
            {canPick && view?.revealed && <button type="button" className={css.primary} disabled={busy} onClick={() => void next()}>Next round</button>}
          </aside>
        </div>
      </main>
      <Footer />
    </div>
  );
}
