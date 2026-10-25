import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentPanel, ScriptBlock, ToolCall } from './AgentPanel';
import type { AgentMessage, AgentPanelProps } from './types';

const MSGS: AgentMessage[] = [
  { kind: 'system', agent: 'Vision agent', text: 'Segmentation done: 12.0 cm³, Right hemisphere' },
  { kind: 'user', text: 'show the tumor', via: 'voice', at: '10:02' },
  { kind: 'agent', agent: 'Spatial UI', text: 'Focused on the tumor', at: '10:02', calls: [{ call: 'focusTumor()', ms: 41, ok: true }] },
  { kind: 'confirm', agent: 'Spatial UI', text: 'Place the 12.0 cm³ tumor on the 3D brain?', confirmLabel: 'Place in 3D', dismissLabel: 'Not now' },
];
const html = (p: Partial<AgentPanelProps>) => renderToStaticMarkup(createElement(AgentPanel, { messages: MSGS, status: 'offline', ...p }));
/** The opening tag of the element with this aria-label. */
const tag = (h: string, label: string) => h.match(new RegExp(`<[a-z]+[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';
const noop = () => {};

describe('AgentPanel', () => {
  it('renders nothing when hidden outside a live session', () => expect(html({ hidden: true })).toBe(''));
  it('supports meeting labels and tab content without the command composer', () => {
    const h = html({ tabLabels: ['Transcript', 'Notes'], tabContent: ['Live transcript content', 'Live notes content'] });
    expect(h).toContain('>Transcript</button>'); expect(h).toContain('>Notes</button>');
    expect(h).toContain('Live transcript content'); expect(h).not.toContain('Live notes content');
    expect(h).not.toContain('Message the agent'); expect(h).not.toContain('Talk to the agent');
  });
  it('renders every message kind', () => {
    const h = html({});
    for (const s of ['Pons Assistant', 'Segmentation done', 'show the tumor', 'Focused on the tumor', 'focusTumor()', '41 ms', 'Place in 3D', 'Not now']) expect(h).toContain(s);
  });
  it('disables input, mic and confirm buttons when their handler is absent', () => {
    const h = html({});
    expect(tag(h, 'Message the agent')).toContain('disabled');
    expect(h).toContain('Agent not connected yet');
    expect(tag(h, 'Toggle microphone')).toContain('disabled');
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Place in 3D</);
  });
  it('enables them when handlers are passed', () => {
    const h = html({ onSend: noop, onMic: noop, onConfirm: noop, onDismiss: noop });
    expect(tag(h, 'Message the agent')).not.toContain('disabled');
    expect(tag(h, 'Toggle microphone')).not.toContain('disabled');
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>Place in 3D</);
  });
  it('never names a keyboard key', () => expect(html({})).not.toMatch(/\b(space|esc|enter|ctrl|cmd)\b/i));
});

describe('ScriptBlock', () => {
  const sb = (onRun?: (l: string[]) => void) => renderToStaticMarkup(createElement(ScriptBlock, { lines: ['focus tumor', 'opacity 40'], onRun }));
  it('Run is disabled without onRun', () => expect(tag(sb(), 'Run script')).toContain('disabled'));
  it('Run is enabled with onRun', () => expect(tag(sb(noop), 'Run script')).not.toContain('disabled'));
  it('shows the lines', () => expect(sb()).toContain('focus tumor\nopacity 40'));
});

describe('ToolCall', () => {
  it('failed call shows ✗ and its message', () => {
    const h = renderToStaticMarkup(createElement(ToolCall, { row: { call: 'setOpacity(2)', ms: 3, ok: false, message: 'Invalid opacity' } }));
    expect(h).toContain('✗');
    expect(h).toContain('Invalid opacity');
  });
});
