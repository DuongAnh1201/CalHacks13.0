import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FacePile } from './FacePile';
import type { SessionState } from './types';

vi.mock('./store', () => ({
  useShare: (sel: (s: { online: Set<string> }) => unknown) => sel({ online: new Set(['p1']) }),
}));

vi.mock('../call/store', () => ({
  useCall: (sel: (s: { speaking: Set<string> }) => unknown) => sel({ speaking: new Set(['p1']) }),
}));

const session = {
  participants: [{ participantId: 'p1', displayName: 'Ada Lovelace', role: 'host', following: false, joinedAt: 0 }],
} as SessionState;

const at = (path: string) => renderToStaticMarkup(
  createElement(MemoryRouter, { initialEntries: [path] }, createElement(FacePile, { session })),
);

describe('FacePile', () => {
  it('shows online initials only on case pages', () => {
    expect(at('/jobs/sample/mri')).toContain('AL');
    expect(at('/jobs/sample/3d')).toContain('AL');
    expect(at('/')).toBe('');
    expect(at('/upload')).toBe('');
    expect(at('/join/ABC123')).toBe('');
    expect(at('/jobs/sample/processing')).toBe('');
  });

  it('rings whoever is speaking in the call', () => {
    expect(at('/jobs/sample/3d')).toMatch(/class="[^"]*speaking[^"]*"[^>]*title="Ada Lovelace · speaking"/);
  });
});
