import { useEffect, useRef, useState } from 'react';
import { AgentPanel } from '../components/agent/AgentPanel';
import { CONSENT_BANNER, type NoteTakerBinding, type NoteTakerState, type Segment } from './useNoteTaker';
import css from './MeetingNotes.module.css';

/** Stable colour shared by the caption bar and transcript, without storing extra identity data. */
function speakerColour(id: string) {
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${n % 360} 65% 42%)`;
}
const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const speaker = (s: { participantId?: string; speakerName: string }, selfId?: string) => s.participantId && s.participantId === selfId ? 'You' : s.speakerName;

const LIVE_LINES = 4;
const elapsed = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/** Glass panel in the top-right: newest few transcript lines, labelled by real speaker name. */
export function LiveTranscript({ meeting: m }: { meeting: NoteTakerState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const since = Math.max(0, ...m.events.filter((e) => e.kind === 'on').map((e) => e.at));
  const lines = [...m.segments].sort((a, b) => a.startedAt - b.startedAt).slice(-LIVE_LINES);
  return <section className={css.live}>
    <header className={css.liveHead}>
      <span className={m.muted ? css.liveMuted : css.liveOn}><span className={css.pulse} />Listening{m.muted && " · you're muted"}</span>
      {since > 0 && <time>{elapsed(now - since)} · Live</time>}
    </header>
    <div role="log" aria-live="polite" aria-label="Live transcript">
      {!lines.length && <p className={css.liveEmpty}>Waiting for speech…</p>}
      {lines.map((s, i) => {
        const id = s.participantId ?? s.speakerName;
        const prev = lines[i - 1];
        return <div key={s.segmentId} className={css.liveLine}>
          {(!prev || (prev.participantId ?? prev.speakerName) !== id) && <p className={css.liveWho} style={{ color: speakerColour(id) }}>{s.speakerName}</p>}
          <p className={s.final === false ? css.interim : undefined} data-final={s.final !== false}>{s.text || '…'}</p>
        </div>;
      })}
    </div>
  </section>;
}

export function CaptionLine({ segments, selfId }: { segments: Segment[]; selfId?: string }) {
  const last = [...segments].sort((a, b) => (b.updatedAt ?? b.endedAt) - (a.updatedAt ?? a.endedAt))[0];
  if (!last) return null;
  const sameSpeaker = segments.filter((s) => s.participantId === last.participantId && s.speakerName === last.speakerName && s.startedAt >= last.startedAt - 12_000).slice(-2);
  return <div className={css.caption} aria-live="polite" aria-atomic="true">
    <b><span className={css.dot} style={{ background: speakerColour(last.participantId ?? last.speakerName) }} />{speaker(last, selfId)}</b>{' '}
    {sameSpeaker.map((s) => <span key={s.segmentId} className={s.final === false ? css.interim : undefined} data-final={s.final !== false}>{s.text}{' '}</span>)}
  </div>;
}

/** Mount once over each case viewer. Its controls remain reachable when the panel is closed. */
export function MeetingOverlay({ binding: b }: { binding: NoteTakerBinding }) {
  const [captions, setCaptions] = useState(() => typeof localStorage === 'undefined' || localStorage.getItem('neuro-captions') !== 'off');
  const m = b.meeting;
  const latest = Math.max(0, ...(m?.segments ?? []).map((s) => s.updatedAt ?? s.endedAt));
  if (b.hidden || !m || m.ended || !m.callActive) return null;
  return <div className={css.overlay}>
    <div className={css.controls}>
      {m.enabled && <span className={css.pill}>AI notes on</span>}
      {m.host && <button type="button" role="switch" aria-checked={m.enabled} onClick={b.toggleEnabled}>AI notes {m.enabled ? 'on' : 'off'}</button>}
      <button type="button" aria-pressed={captions} onClick={() => setCaptions((on) => { localStorage.setItem('neuro-captions', on ? 'off' : 'on'); return !on; })}>Captions {captions ? 'on' : 'off'}</button>
      {m.enabled && <button type="button" aria-pressed={m.muted} onClick={b.muteSelf}>{m.muted ? 'Unmute my microphone' : 'Mute my microphone'}</button>}
    </div>
    {m.messages.filter((msg) => msg.kind === 'system' && /Microphone blocked|can.t transcribe|could not|Could not/.test(msg.text)).map((msg, i) => <p key={i} role="alert" className={css.consent}>{msg.text}</p>)}
    {m.enabled && <p className={css.consent} role="status">{CONSENT_BANNER}</p>}
    {m.host && !m.promptDismissed && !m.enabled && <div className={css.prompt}>
      <p>Turn on AI notes for this meeting?</p><p>{CONSENT_BANNER}</p>
      <button type="button" onClick={b.toggleEnabled}>Turn on AI notes</button>{' '}<button type="button" onClick={b.dismissPrompt}>Not now</button>
    </div>}
    {m.enabled && captions && latest > 0 && <FadingCaption key={latest} meeting={m} latest={latest} />}
  </div>;
}

function FadingCaption({ meeting, latest }: { meeting: NoteTakerState; latest: number }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), Math.max(0, latest + 6500 - Date.now()));
    return () => clearTimeout(timer);
  }, [latest]);
  return visible ? <CaptionLine segments={meeting.segments} selfId={meeting.selfId} /> : null;
}

type TimelineItem = { at: number; key: string; line?: Segment; event?: string };
export function TranscriptView({ meeting: m }: { meeting: NoteTakerState }) {
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [behind, setBehind] = useState(false);
  const items: TimelineItem[] = m.segments.map((line) => ({ at: line.startedAt, key: line.segmentId, line }));
  for (const [i, e] of m.events.entries()) items.push({ at: e.at, key: `event:${i}`, event: e.kind === 'on' || e.kind === 'off' ? `AI notes ${e.kind} by ${speaker(e, m.selfId)} (host)` : `${speaker(e, m.selfId)} ${e.kind === 'mute' ? 'muted' : 'unmuted'} transcription` });
  for (const [i, s] of (m.note?.screenshots ?? []).entries()) items.push({ at: s.takenAt, key: `shot:${i}`, event: `Screenshot: ${s.caption}` });
  items.sort((a, b) => a.at - b.at);
  const revision = JSON.stringify(items);
  useEffect(() => {
    const el = scroller.current;
    if (follow.current && el) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [revision]);
  return <div className={css.transcript}>
    <div ref={scroller} className={css.scroll} role="log" aria-label="Meeting transcript" onScroll={() => {
      const el = scroller.current;
      if (el) { follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; if (follow.current) setBehind(false); }
    }}>
      {!items.length && <p>{m.enabled ? 'Waiting for speech…' : 'AI notes are off. The host can turn them on.'}</p>}
      {items.map((item, index) => {
        const line = item.line;
        if (!line) { return <p className={css.event} key={item.key}><time>{clock(item.at)}</time> · {item.event}</p>; }
        const previous = items[index - 1]?.line;
        const grouped = previous && (previous.participantId ?? previous.speakerName) === (line.participantId ?? line.speakerName) && line.startedAt - previous.endedAt < 60_000;
        return <div className={css.line} key={item.key}>
          {!grouped && <p className={css.speaker}><span className={css.dot} style={{ background: speakerColour(line.participantId ?? line.speakerName) }} /><b>{speaker(line, m.selfId)}</b> <time>{clock(line.startedAt)}</time></p>}
          <p className={line.final === false ? css.interim : undefined} data-final={line.final !== false}>{line.text || '…'}</p>
        </div>;
      })}
    </div>
    {behind && <button type="button" onClick={() => { const el = scroller.current; follow.current = true; setBehind(false); if (el) el.scrollTop = el.scrollHeight; }}>Jump to latest</button>}
  </div>;
}

export function NotesView({ binding: b }: { binding: NoteTakerBinding }) {
  const m = b.meeting!;
  const note = m.note;
  const exp = note?.export;
  return <div className={css.notes}>
    <h3>{note?.isFinal ? 'Meeting summary' : 'Live notes'}</h3>
    <p className={css.noteText}>{note?.text ?? 'Notes appear here as the meeting progresses.'}</p>
    {note?.screenshots.map((s, i) => <figure key={`${s.takenAt}:${i}`}>{s.url && <a href={s.url} target="_blank" rel="noopener noreferrer"><img src={s.url} alt={s.caption} loading="lazy" /></a>}<figcaption>{clock(s.takenAt)} · {s.caption}</figcaption></figure>)}
    <button type="button" onClick={b.exportSummary} disabled={exp?.status === 'pending'}>Export summary</button>
    {exp?.status === 'pending' && <p role="status">Preparing export…</p>}
    {exp?.status === 'failed' && <p role="alert">The export failed. Try Export summary again.</p>}
    {exp?.status === 'ready' && exp.url && <a href={exp.url} download={`meeting-summary-v${exp.version}.md`} target="_blank" rel="noopener noreferrer">Download .md</a>}
  </div>;
}

export function MeetingPanel({ binding }: { binding: NoteTakerBinding }) {
  return <AgentPanel messages={[]} status={binding.status} hidden={binding.hidden} tabLabels={['Transcript', 'Notes']}
    tabContent={binding.meeting ? [<TranscriptView key="transcript" meeting={binding.meeting} />, <NotesView key="notes" binding={binding} />] : undefined} />;
}
