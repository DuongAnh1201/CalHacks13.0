import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CaptionLine, LiveTranscript, MeetingOverlay, MeetingPanel, NotesView, TranscriptView } from './MeetingNotes';
import { CONSENT_BANNER, type NoteTakerBinding, type NoteTakerState } from './useNoteTaker';
const time = new Date('2026-10-24T12:00:00Z').getTime();
const m: NoteTakerState = {
  status: 'listening', messages: [], enabled: true, muted: false, callActive: true, ended: false, left: false, host: true, promptDismissed: true, selfId: 'me',
  segments: [
    { segmentId: 'a', participantId: 'me', speakerName: 'Host', text: 'Final words.', final: true, startedAt: time, endedAt: time + 100 },
    { segmentId: 'b', participantId: 'me', speakerName: 'Host', text: 'Interim words', final: false, startedAt: time + 200, endedAt: time + 300 },
    { segmentId: 'c', participantId: 'guest', speakerName: 'Guest', text: 'Guest words.', final: true, startedAt: time + 500, endedAt: time + 600 },
  ],
  events: [{ at: time - 100, participantId: 'me', speakerName: 'Host', kind: 'on' }, { at: time + 400, participantId: 'me', speakerName: 'Host', kind: 'mute' }],
  note: { text: 'The group compared views.', version: 1, isFinal: false,
    screenshots: [{ caption: 'Tumor focused', takenAt: time + 700, url: 'https://example.com/shot.jpg' }],
    export: { exportId: 'e', version: 1, status: 'ready', trigger: 'manual', url: 'https://example.com/summary.md' } },
};
const binding = (over: Partial<NoteTakerState> = {}): NoteTakerBinding => ({ hidden: false, status: 'listening', messages: [], meeting: { ...m, ...over } });
describe('live meeting views', () => {
  it('hides the Assistant and meeting controls outside a live session', () => {
    const b = { ...binding(), hidden: true };
    expect(renderToStaticMarkup(createElement(MeetingPanel, { binding: b }))).toBe('');
    expect(renderToStaticMarkup(createElement(MeetingOverlay, { binding: b }))).toBe('');
  });
  it('renders Transcript/Notes tabs and groups consecutive lines by speaker, with You and clock times', () => {
    const h = renderToStaticMarkup(createElement(MeetingPanel, { binding: binding() }));
    expect(h).toContain('>Transcript</button>'); expect(h).toContain('>Notes</button>');
    expect(h).toContain('aria-label="Transcript"'); expect(h).toContain('Final words.'); expect(h).toContain('Interim words');
    expect(h.match(/<b>You<\/b>/g)).toHaveLength(1);
    expect(h).toContain('<b>Guest</b>'); expect(h).toContain('<time>');
    expect(h).toContain('AI notes on by You (host)'); expect(h).toContain('You muted transcription'); expect(h).toContain('Screenshot: Tumor focused');
  });
  it('distinguishes interim grey text and finalized text in the live caption bar', () => {
    const h = renderToStaticMarkup(createElement(CaptionLine, { segments: m.segments.slice(0, 2), selfId: 'me' }));
    expect(h).toContain('You'); expect(h).toContain('data-final="true"'); expect(h).toContain('data-final="false"'); expect(h).toContain('hsl(');
  });
  it('shows host opt-in once, a separate toggle, truthful consent, captions control and member mute', () => {
    const prompt = renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding({ enabled: false, promptDismissed: false }) }));
    expect(prompt).toContain('Turn on AI notes for this meeting?'); expect(prompt).toContain('aria-checked="false"');
    const on = renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding() }));
    expect(on).toContain('AI notes on'); expect(on).toContain('Mute my microphone'); expect(on).toContain('Captions on');
    expect(on).toContain(CONSENT_BANNER.replaceAll("'", '&#x27;')); expect(on).not.toContain('audio stays');
    expect(on).not.toContain('Turn on AI notes for this meeting?');
    const guest = renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding({ host: false, enabled: false, promptDismissed: false }) }));
    expect(guest).not.toContain('role="switch"');
    expect(renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding({ callActive: false, promptDismissed: false }) }))).toBe(''); expect(guest).not.toContain('Turn on AI notes for this meeting?');
  });
  it('renders notes, screenshots, Export summary and Download .md as the Notes tab content', () => {
    const h = renderToStaticMarkup(createElement(NotesView, { binding: binding() }));
    for (const text of ['Live notes', 'The group compared views.', 'Tumor focused', 'Export summary', 'Download .md', 'summary.md']) expect(h).toContain(text);
    expect(h).not.toContain('Interim words');
  });
  it('renders an empty transcript before the host opts in', () => {
    const h = renderToStaticMarkup(createElement(TranscriptView, { meeting: { ...m, enabled: false, segments: [], events: [], note: null } }));
    expect(h).toContain('AI notes are off. The host can turn them on.');
  });
});

describe('live transcript panel', () => {
  const seg = (i: number) => ({ segmentId: `s${i}`, participantId: i % 2 ? 'guest' : 'me', speakerName: i % 2 ? 'Guest' : 'Host', text: `Line ${i}.`, final: true, startedAt: time + i * 1000, endedAt: time + i * 1000 + 500 });
  const live = (over: Partial<NoteTakerState> = {}) => renderToStaticMarkup(createElement(LiveTranscript, { meeting: { ...m, ...over } }));

  it('shows Listening, a live clock and real speaker names, never You', () => {
    const h = live();
    expect(h).toContain('Listening'); expect(h).toContain('aria-label="Live transcript"'); expect(h).toContain('· Live');
    expect(h.match(/>Host<\/p>/g)).toHaveLength(1); expect(h).toContain('>Guest</p>');
    expect(h).not.toContain('>You<');
  });
  it('keeps only the last 4 lines, oldest first', () => {
    const h = live({ segments: [5, 0, 1, 2, 3, 4].map(seg) });
    expect(h).not.toContain('Line 0.'); expect(h).not.toContain('Line 1.');
    expect(h.indexOf('Line 2.')).toBeLessThan(h.indexOf('Line 5.'));
  });
  it('marks interim text separately from final text', () => {
    const h = live();
    expect(h).toContain('data-final="false"'); expect(h).toContain('data-final="true"');
  });
  it('shows muted and empty states', () => {
    expect(live({ muted: true })).toContain('you&#x27;re muted');
    expect(live({ segments: [] })).toContain('Waiting for speech…');
  });
});
