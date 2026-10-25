import { useState } from 'react';
import runIcon from '../../assets/figma/bfdea.svg';
import avatarIcon from '../../assets/figma/3f35e.svg';
import statusDot from '../../assets/figma/c9605.svg';
import chipDot from '../../assets/figma/78c7f.svg';
import voiceTabIcon from '../../assets/figma/8e97a.svg';
import scriptTabIcon from '../../assets/figma/6179e.svg';
import systemIcon from '../../assets/figma/941c5.svg';
import voiceMetaIcon from '../../assets/figma/2623b.svg';
import micIcon from '../../assets/figma/81241.svg';
import checkIcon from '../../assets/figma/f8d34.svg';
import type { AgentMessage, AgentPanelProps, ToolCallRow } from './types';
import css from './AgentPanel.module.css';

const STATUS = { ready: 'Ready', listening: 'Listening', offline: 'Offline' } as const;
const AGENTS = ['Orchestrator', 'Vision', 'Spatial UI', 'Clinical'] as const; // display only in W1

export function ToolCall({ row }: { row: ToolCallRow }) {
  return (
    <div className={row.ok ? css.call : `${css.call} ${css.fail}`} title={row.message}>
      {row.ok ? <img src={checkIcon} alt="ok" width={12} height={12} /> : <span aria-label="failed">✗</span>}
      <code className={css.callText}>{row.call}</code>
      <span className={css.ms}>{row.ms} ms</span>
      {!row.ok && row.message && <span className={css.callMsg}>{row.message}</span>}
    </div>
  );
}

export function ScriptBlock({ lines, onRun }: { lines: string[]; onRun?: (lines: string[]) => void }) {
  // shortcut: initial lines only; remount with a new key when the agent replaces the script
  const [text, setText] = useState(lines.join('\n'));
  const run = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className={css.script}>
      <div className={css.scriptHead}>
        <span>Script</span>
        <button type="button" className={css.run} aria-label="Run script" disabled={!onRun || run.length === 0} onClick={() => onRun?.(run)}>
          <img src={runIcon} alt="" width={12} height={12} />Run
        </button>
      </div>
      <textarea className={css.lines} aria-label="Script commands" spellCheck={false} rows={Math.max(3, lines.length)} value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

function Message({ m, onConfirm, onDismiss }: { m: AgentMessage; onConfirm?: () => void; onDismiss?: () => void }) {
  switch (m.kind) {
    case 'system':
      return <p className={css.system}><img src={systemIcon} alt="" width={14} height={14} /><b>{m.agent}</b> · {m.text}</p>;
    case 'user':
      return (
        <div className={css.user}>
          <p>{m.text}</p>
          <span className={css.meta}>{m.via === 'voice' && <img src={voiceMetaIcon} alt="voice" width={10} height={10} />}{m.at}</span>
        </div>
      );
    case 'agent':
      return (
        <div className={css.agent}>
          <p className={css.meta}><b>{m.agent}</b> · {m.at}</p>
          <p>{m.text}</p>
          {m.calls?.length ? <ul className={css.calls}>{m.calls.map((c, i) => <li key={i}><ToolCall row={c} /></li>)}</ul> : null}
        </div>
      );
    case 'confirm':
      return (
        <div className={css.confirm}>
          <p className={css.meta}><b>{m.agent}</b></p>
          <p>{m.text}</p>
          <div className={css.actions}>
            <button type="button" className={css.primary} disabled={!onConfirm} onClick={onConfirm}>{m.confirmLabel}</button>
            <button type="button" className={css.ghost} disabled={!onDismiss} onClick={onDismiss}>{m.dismissLabel}</button>
          </div>
        </div>
      );
  }
}

export function AgentPanel(p: AgentPanelProps) {
  const [tab, setTab] = useState<'voice' | 'script'>('voice');
  const [draft, setDraft] = useState('');
  if (p.hidden) return null;
  return (
    <section className={css.panel} aria-label="Lobe Assistant">
      <header className={css.head}>
        <span className={css.avatar}><img src={avatarIcon} alt="" width={16} height={16} /></span>
        <div className={css.titles}><h2 className={css.title}>Lobe Assistant</h2><p className={css.sub}>{p.tabContent ? 'Live meeting notes' : 'Voice & script control for the workspace'}</p></div>
        <span className={`${css.status} ${css[p.status]}`} role="status"><img src={statusDot} alt="" width={6} height={6} />{STATUS[p.status]}</span>
      </header>
      {!p.tabContent && <ul className={css.chips} aria-label="Agents">
        {AGENTS.map((a) => <li key={a} className={css.chip}><img src={chipDot} alt="" width={6} height={6} />{a}</li>)}
      </ul>}
      <div className={css.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'voice'} className={css.tab} onClick={() => setTab('voice')}><img src={voiceTabIcon} alt="" width={12} height={12} />{p.tabLabels?.[0] ?? 'Voice'}</button>
        <button type="button" role="tab" aria-selected={tab === 'script'} className={css.tab} onClick={() => setTab('script')}><img src={scriptTabIcon} alt="" width={12} height={12} />{p.tabLabels?.[1] ?? 'Script'}</button>
      </div>
      {p.tabContent ? <div role="tabpanel" aria-label={p.tabLabels?.[tab === 'voice' ? 0 : 1]}>{p.tabContent[tab === 'voice' ? 0 : 1]}</div> : <>
      <ol className={css.log} aria-live="polite">
        {p.messages.map((m, i) => <li key={i}><Message m={m} onConfirm={p.onConfirm} onDismiss={p.onDismiss} /></li>)}
      </ol>
      {tab === 'script' && <ScriptBlock lines={p.script ?? []} onRun={p.onRun} />}
      <form className={css.input} onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (!p.onSend || !t) return; p.onSend(t); setDraft(''); }}>
        {tab === 'voice' && (
          <button type="button" className={css.mic} aria-label={p.micLabel ?? "Toggle microphone"} disabled={!p.onMic} onClick={p.onMic} title={p.micLabel ?? 'Toggle microphone'}>
            <img src={micIcon} alt="" width={18} height={18} />
          </button>
        )}
        <input className={css.text} aria-label="Message the agent" disabled={!p.onSend} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={p.onSend ? 'Type a command' : 'Agent not connected yet'} />
      </form>
      </>}
    </section>
  );
}
