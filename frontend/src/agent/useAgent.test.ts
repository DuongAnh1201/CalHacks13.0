import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { describe, expect, it, vi } from 'vitest';
import type { Action, DispatchResult } from '../actions/types';
import { planStep } from './applyStep';
import { agentClientId, createAgentController, type AgentClient, type AgentDeps } from './useAgent';

type Ref = Parameters<typeof getFunctionName>[0];
type Row = { status: string; reply: string; agent: string; steps: unknown[]; error: string | null };
const step = (id: string, tool: string, args: unknown, kind: 'viewer' | 'mcp', over: Record<string, unknown> = {}) => ({ id, tool, args, ok: true, message: kind === 'viewer' ? 'sent to viewer' : 'MCP tool completed.', ms: 12, kind, ...over });

function fake(opts: { askError?: unknown; chat?: unknown[] } = {}) {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; push: (row: Row | null) => void; fail: (e: Error) => void; closed: boolean }[] = [];
  const client: AgentClient = {
    async query(ref: unknown, args: unknown) { calls.push([getFunctionName(ref as Ref), args]); return opts.chat ?? []; },
    async mutation(ref: unknown, args: unknown) {
      calls.push([getFunctionName(ref as Ref), args]);
      if (opts.askError) throw opts.askError;
      return `run-${calls.length}`;
    },
    onUpdate(ref: unknown, args: unknown, onData: (v: never) => void, onError?: (e: Error) => void) {
      const sub = { name: getFunctionName(ref as Ref), args, push: (row: Row | null) => onData(row as never), fail: (e: Error) => onError?.(e), closed: false };
      subs.push(sub);
      return () => { sub.closed = true; };
    },
  };
  return { client, calls, subs };
}
function make(f: ReturnType<typeof fake> | null, over: Partial<AgentDeps> = {}) {
  const applied: Action[] = [];
  const deps: AgentDeps = {
    client: f ? f.client : null, page: '3d', jobId: 'sample', clientId: 'client-1',
    session: () => null, snapshot: () => ({ mode: 'whole' }), formatTime: () => '10:00', now: () => 1000,
    apply: (a): DispatchResult => { applied.push(a); return { ok: true, message: `did ${a.type}` }; },
    ...over,
  };
  return { ctl: createAgentController(deps), applied };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const done = (reply: string, steps: unknown[] = [], agent = 'Router'): Row => ({ status: 'done', reply, agent, steps, error: null });

describe('agent controller', () => {
  it('asks on page 3d with the job, a viewer snapshot and the tools this page can apply; no token outside a session', async () => {
    const f = fake(); const { ctl } = make(f);
    const p = ctl.send('  Summarize tumor ');
    await flush();
    expect(f.calls[0][0]).toBe('agent:ask');
    expect(f.calls[0][1]).toMatchObject({ clientId: 'client-1', text: 'Summarize tumor', source: 'chat', page: '3d', jobId: 'sample', snapshot: { mode: 'whole' } });
    const sent = f.calls[0][1] as { availableTools: string[]; participantToken?: string; sessionId?: string };
    expect(sent.availableTools).toEqual(expect.arrayContaining(['summarize_tumor', 'focus_region', 'set_mode']));
    expect(sent.availableTools).not.toContain('zoom_view'); // the viewer cannot apply it yet
    expect(sent.participantToken).toBeUndefined();
    expect(sent.sessionId).toBeUndefined();
    expect(f.subs[0]).toMatchObject({ name: 'agent:getRun', args: { runId: expect.any(String), clientId: 'client-1' } });
    f.subs[0].push(done('x'));
    await p;
  });

  it('sends the participant token and session id when the tab is in an active session', async () => {
    const f = fake(); const { ctl } = make(f, { session: () => ({ sessionId: 's1', participantToken: 'tok' }) });
    const p = ctl.send('hello'); await flush();
    expect(f.calls[0][1]).toMatchObject({ sessionId: 's1', participantToken: 'tok' });
    f.subs[0].push(done('hi')); await p;
  });

  it('maps steps to Tool Call rows and shows the final reply under the agent name', async () => {
    const f = fake(); const { ctl } = make(f);
    const p = ctl.send('Summarize tumor'); await flush();
    f.subs[0].push({ status: 'running', reply: '', agent: 'Router', steps: [step('r:summarize', 'summarize_tumor', {}, 'mcp')], error: null });
    let msgs = ctl.getState().messages;
    expect(msgs.map((m) => m.kind)).toEqual(['user', 'agent']);
    expect(msgs[1]).toMatchObject({ text: 'Working…', calls: [{ call: 'summarize_tumor()', ms: 12, ok: true }] });
    f.subs[0].push(done('Tumor summary\nSide: right', [step('r:summarize', 'summarize_tumor', {}, 'mcp')]));
    await p;
    msgs = ctl.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({ kind: 'user', text: 'Summarize tumor', via: 'text', at: '10:00' });
    expect(msgs[1]).toMatchObject({ kind: 'agent', agent: 'Router', text: 'Tumor summary\nSide: right', at: '10:00' });
    expect(f.subs[0].closed).toBe(true);
  });

  it('applies each viewer step once by id through dispatch, however often the run row updates', async () => {
    const f = fake(); const { ctl, applied } = make(f);
    const p = ctl.send('hide the edema and focus the tumor'); await flush();
    const steps = [
      step('a', 'toggle_visibility', { targets: ['edema'], visible: false }, 'viewer'),
      step('b', 'focus_region', { region: 'tumor' }, 'viewer'),
    ];
    f.subs[0].push({ status: 'running', reply: '', agent: 'Navigator', steps: [steps[0]], error: null });
    f.subs[0].push({ status: 'running', reply: '', agent: 'Navigator', steps: [steps[0]], error: null });
    f.subs[0].push(done('Sent.', steps, 'Navigator'));
    await p;
    expect(applied).toEqual([{ type: 'setLayerVisible', layer: 'edema', visible: false }, { type: 'focusTumor' }]);
    const agent = ctl.getState().messages.at(-1);
    expect(agent).toMatchObject({ kind: 'agent', calls: [{ ok: true, message: 'did setLayerVisible' }, { ok: true, message: 'did focusTumor' }] });
  });

  it('reports a viewer tool the 3D viewer cannot apply instead of pretending, and never applies failed steps', async () => {
    const f = fake(); const { ctl, applied } = make(f);
    const p = ctl.send('zoom in'); await flush();
    f.subs[0].push(done('Sent.', [
      step('z', 'zoom_view', { action: 'in' }, 'viewer'),
      step('f', 'focus_region', { region: 'tumor' }, 'viewer', { ok: false, message: 'Invalid viewer tool arguments.' }),
    ], 'Navigator'));
    await p;
    expect(applied).toEqual([]);
    const calls = (ctl.getState().messages.at(-1) as { calls: { ok: boolean; message?: string }[] }).calls;
    expect(calls[0]).toMatchObject({ ok: false, message: 'Not available in this viewer yet.' });
    expect(calls[1]).toMatchObject({ ok: false, message: 'Invalid viewer tool arguments.' });
  });

  it('loads listChat history oldest first, with past tool rows shown but never re-applied', async () => {
    const chat = [
      { role: 'assistant', authorName: 'Navigator', text: 'Done.', createdAt: 2, toolSteps: [{ tool: 'set_mode', args: { mode: 'xray' }, ok: true, message: 'sent to viewer', ms: 5 }] },
      { role: 'user', authorName: 'You', text: 'x-ray', createdAt: 1, toolSteps: [] },
    ];
    const f = fake({ chat }); const { ctl, applied } = make(f);
    await ctl.load();
    expect(f.calls[0]).toEqual(['agent:listChat', { clientId: 'client-1', jobId: 'sample', limit: 30 }]);
    const msgs = ctl.getState().messages;
    expect(msgs.map((m) => m.kind)).toEqual(['user', 'agent']);
    expect(msgs[1]).toMatchObject({ agent: 'Navigator', text: 'Done.', calls: [{ call: 'set_mode({"mode":"xray"})', ms: 5, ok: true }] });
    expect(applied).toEqual([]);
    expect(ctl.getState().status).toBe('ready');
  });

  it('is offline without a Convex client or when history cannot load', async () => {
    const none = make(null);
    expect(none.ctl.getState().status).toBe('offline');
    await none.ctl.send('hi');
    expect(none.ctl.getState().messages).toEqual([]);
    const f = fake(); f.client.query = async () => { throw new Error('down'); };
    const broken = make(f);
    await broken.ctl.load();
    expect(broken.ctl.getState().status).toBe('offline');
  });

  it('turns a server refusal into a system message and stays ready; a network failure goes offline', async () => {
    const rate = make(fake({ askError: new ConvexError({ code: 'RATE_LIMIT', message: 'Wait before starting another assistant run.' }) }));
    await rate.ctl.send('again');
    expect(rate.ctl.getState().status).toBe('ready');
    expect(rate.ctl.getState().messages.at(-1)).toMatchObject({ kind: 'system', text: 'Wait before starting another assistant run.' });
    const net = make(fake({ askError: new Error('Failed to fetch') }));
    await net.ctl.send('hello');
    expect(net.ctl.getState().status).toBe('offline');
    expect(net.ctl.getState().messages.at(-1)).toMatchObject({ kind: 'system' });
  });

  it('runs script lines one after another, waiting for each run', async () => {
    const f = fake(); const { ctl } = make(f);
    const p = ctl.run(['Summarize tumor', 'reset the view']); await flush();
    expect(f.calls.filter(([n]) => n === 'agent:ask')).toHaveLength(1);
    f.subs[0].push(done('one')); await flush();
    expect(f.calls.filter(([n]) => n === 'agent:ask')).toHaveLength(2);
    f.subs[1].push(done('two', [], 'Navigator'));
    await p;
    expect(ctl.getState().messages.filter((m) => m.kind === 'agent').map((m) => (m as { text: string }).text)).toEqual(['one', 'two']);
  });

  it('notifies subscribers, and dispose closes open subscriptions', async () => {
    const f = fake(); const { ctl } = make(f);
    const seen = vi.fn(); ctl.subscribe(seen);
    void ctl.send('hi'); await flush();
    expect(seen).toHaveBeenCalled();
    ctl.dispose();
    expect(f.subs[0].closed).toBe(true);
  });
});

describe('planStep', () => {
  it('maps what the viewer can apply, and says so for the rest', () => {
    expect(planStep('set_mode', { mode: 'solid' })).toEqual({ actions: [{ type: 'setMode', mode: 'whole' }] });
    expect(planStep('set_opacity', { target: 'brain', percent: 40 })).toEqual({ actions: [{ type: 'setOpacity', value: 0.4 }] });
    expect(planStep('set_explode', { percent: 50 })).toEqual({ actions: [{ type: 'setExplosion', value: 0.5 }] });
    expect(planStep('toggle_visibility', { targets: ['left', 'core'], visible: true })).toEqual({ actions: [{ type: 'setHemisphereVisible', side: 'left', visible: true }, { type: 'setLayerVisible', layer: 'core', visible: true }] });
    expect(planStep('reset_view', {})).toEqual({ actions: [{ type: 'resetView' }] });
    for (const [tool, args] of [['focus_region', { region: 'hippocampus' }], ['set_opacity', { target: 'cortex', percent: 30 }], ['toggle_visibility', { targets: ['cortex'], visible: false }], ['rotate_view', { preset: 'left' }]] as const)
      expect(planStep(tool, args), tool).toHaveProperty('unsupported');
  });
});

describe('agentClientId', () => {
  it('is created once per browser and bounded', () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const a = agentClientId(store);
    expect(a).toMatch(/^[a-z0-9]{16,128}$/);
    expect(agentClientId(store)).toBe(a);
  });
});
