import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import type { Action, DispatchResult } from '../actions/types';
import type { AgentMessage, AgentPanelProps, ToolCallRow } from '../components/agent/types';
import { api, convex } from '../share/client';
import { useShare } from '../share/store';
import { AVAILABLE_TOOLS_3D, planStep } from './applyStep';

/** Exactly what AgentPanel needs from the agent; `onMic` is left out until voice (#66). */
export type AgentPanelBinding = Pick<AgentPanelProps, 'messages' | 'status' | 'onSend' | 'onRun'>;

export interface AgentClient {
  query(ref: unknown, args: unknown): Promise<unknown>;
  mutation(ref: unknown, args: unknown): Promise<unknown>;
  onUpdate(ref: unknown, args: unknown, onData: (v: never) => void, onError?: (e: Error) => void): () => void;
}
interface Step { id: string; tool: string; args: unknown; ok: boolean; message: string; ms: number; kind: 'viewer' | 'mcp' }
interface RunRow { status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'; reply: string; agent: string; steps: Step[]; error: string | null }
interface ChatRow { role: 'user' | 'assistant'; authorName: string; text: string; createdAt: number; toolSteps: { tool: string; args: unknown; ok: boolean; message: string; ms: number }[] }

export interface AgentDeps {
  client: AgentClient | null;
  page: '3d';
  jobId: string;
  /** Per-browser capability for Agent Panel history; never shared with other tabs' sessions. */
  clientId: string;
  session(): { sessionId: string; participantToken: string } | null;
  snapshot(): unknown;
  apply(action: Action): DispatchResult;
  availableTools?: string[];
  formatTime?(ms: number): string;
  now?(): number;
}
export interface AgentState { messages: AgentMessage[]; status: 'ready' | 'offline' }

const HISTORY = 30;
const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const short = (args: unknown) => { const s = JSON.stringify(args ?? {}); return s === '{}' ? '' : s.length > 60 ? `${s.slice(0, 57)}…` : s; };
const terminal = (s: RunRow['status']) => s === 'done' || s === 'failed' || s === 'cancelled';
const errorOf = (e: unknown): { code: string; message: string } | null => {
  const d = (e as { data?: unknown } | null)?.data;
  const o = d && typeof d === 'object' ? (d as Record<string, unknown>) : null;
  return o && typeof o.message === 'string' ? { code: String(o.code ?? ''), message: o.message } : null;
};

/** The panel's brain: no React inside, so it can be tested with a fake Convex client. */
export function createAgentController(deps: AgentDeps) {
  const time = deps.formatTime ?? fmt;
  const now = deps.now ?? Date.now;
  const tools = deps.availableTools ?? AVAILABLE_TOOLS_3D;
  let history: AgentMessage[] = [];
  const live: { runId: string; user: AgentMessage; agent?: AgentMessage; notice?: AgentMessage }[] = [];
  const results = new Map<string, DispatchResult>(); // step id -> what dispatch said; also the "applied once" set
  const stops = new Set<() => void>();
  let state: AgentState = { messages: [], status: deps.client ? 'ready' : 'offline' };
  let disposed = false;
  const listeners = new Set<() => void>();

  const publish = (status: AgentState['status'] = state.status) => {
    state = { status, messages: [...history, ...live.flatMap((l) => [l.user, ...(l.agent ? [l.agent] : []), ...(l.notice ? [l.notice] : [])])] };
    listeners.forEach((l) => l());
  };
  const rows = (steps: Step[]): ToolCallRow[] => steps.map((s) => {
    const applied = s.kind === 'viewer' ? results.get(s.id) : undefined;
    return { call: `${s.tool}(${short(s.args)})`, ms: s.ms, ok: applied ? applied.ok : s.ok, message: applied ? applied.message : s.message };
  });
  const system = (text: string): AgentMessage => ({ kind: 'system', agent: 'Neuro Agent', text });

  function applyOnce(steps: Step[]) {
    for (const s of steps) {
      if (s.kind !== 'viewer' || results.has(s.id) || !s.ok) continue;
      const plan = planStep(s.tool, s.args);
      if ('unsupported' in plan) { results.set(s.id, { ok: false, message: plan.unsupported }); continue; }
      let last: DispatchResult = { ok: true, message: 'Applied' };
      for (const action of plan.actions) { last = deps.apply(action); if (!last.ok) break; }
      results.set(s.id, last);
    }
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!deps.client || !trimmed || disposed) return;
    const client = deps.client;
    const session = deps.session();
    let runId: string;
    try {
      runId = (await client.mutation(api.agent.ask, {
        clientId: deps.clientId, text: trimmed, source: 'chat', page: deps.page, jobId: deps.jobId,
        snapshot: deps.snapshot(), availableTools: tools,
        ...(session ? { sessionId: session.sessionId, participantToken: session.participantToken } : {}),
      })) as string;
    } catch (e) {
      const known = errorOf(e);
      live.push({ runId: `err-${now()}`, user: { kind: 'user', text: trimmed, via: 'text', at: time(now()) }, notice: system(known?.message ?? 'The assistant could not be reached.') });
      publish(known ? 'ready' : 'offline');
      return;
    }
    const entry = { runId, user: { kind: 'user', text: trimmed, via: 'text', at: time(now()) } as AgentMessage } as (typeof live)[number];
    live.push(entry);
    publish('ready');
    await new Promise<void>((resolve) => {
      const stop = client.onUpdate(api.agent.getRun, { runId, clientId: deps.clientId }, ((row: RunRow | null) => {
        if (!row || disposed) return;
        applyOnce(row.steps);
        const done = terminal(row.status);
        if (row.steps.length || done) {
          entry.agent = { kind: 'agent', agent: row.agent || 'Router', text: done ? row.reply : 'Working…', at: time(now()), calls: rows(row.steps) };
          publish();
        }
        if (done) { stop(); stops.delete(stop); resolve(); }
      }) as (v: never) => void, () => { entry.notice = system('Lost connection to the assistant.'); publish('offline'); stop(); stops.delete(stop); resolve(); });
      stops.add(stop);
    });
  }

  return {
    getState: () => state,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** Loads this client's Agent Panel history for the case. Past tool steps are shown, never re-applied. */
    async load() {
      disposed = false; // StrictMode runs effect cleanup and setup again on the same controller
      if (!deps.client) return;
      try {
        const list = (await deps.client.query(api.agent.listChat, { clientId: deps.clientId, jobId: deps.jobId, limit: HISTORY })) as ChatRow[];
        if (disposed) return;
        history = [...list].reverse().map((m): AgentMessage => m.role === 'user'
          ? { kind: 'user', text: m.text, via: 'text', at: time(m.createdAt) }
          : { kind: 'agent', agent: m.authorName, text: m.text, at: time(m.createdAt), calls: m.toolSteps.map((s) => ({ call: `${s.tool}(${short(s.args)})`, ms: s.ms, ok: s.ok, message: s.message })) });
        publish('ready');
      } catch {
        publish('offline');
      }
    },
    send,
    /** Script lines run one after another; each waits for the previous run. */
    async run(lines: string[]) { for (const line of lines) await send(line); },
    dispose() { disposed = true; stops.forEach((s) => s()); stops.clear(); listeners.clear(); },
  };
}

const CLIENT_KEY = 'neuro.agent.clientId';
export function agentClientId(store: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  try {
    let id = store.getItem(CLIENT_KEY);
    if (!id) { id = crypto.randomUUID().replace(/-/g, ''); store.setItem(CLIENT_KEY, id); }
    return id;
  } catch { return `tab-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
}

const GREETING: AgentMessage = { kind: 'system', agent: 'Neuro Agent', text: 'Ask about this case, or run "Summarize tumor" from the Script tab.' };

/**
 * Binds AgentPanel to the Convex agent for one case page. Returns exactly the
 * panel's props (messages, status, onSend, onRun); onMic waits for voice (#66).
 */
export function useAgent(page: '3d', jobId: string): AgentPanelBinding {
  const controller = useMemo(() => createAgentController({
    client: convex as unknown as AgentClient | null, page, jobId, clientId: agentClientId(),
    session: () => { const s = useShare.getState(); return s.stored && s.stored.jobId === jobId && s.session?.status === 'active' ? { sessionId: s.stored.sessionId, participantToken: s.stored.participantToken } : null; },
    snapshot: () => { const v = useViewer.getState(); return { jobId: v.jobId, mode: v.mode, brainOpacity: v.brainOpacity, explodeAmount: v.explodeAmount, hidden: v.hidden, layers: v.layers, cameraTarget: v.cameraTarget, isolate: v.isolate, tumorRevealed: v.tumorRevealed }; },
    apply: (a) => dispatch(a, 'voice'),
  }), [page, jobId]);
  useEffect(() => { void controller.load(); return () => controller.dispose(); }, [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const online = state.status !== 'offline';
  return {
    messages: state.messages.length ? state.messages : [GREETING],
    status: state.status,
    onSend: online ? (text) => { void controller.send(text); } : undefined,
    onRun: online ? (lines) => { void controller.run(lines); } : undefined,
  };
}
