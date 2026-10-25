import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallControls } from './CallControls';

const call = { status: 'idle', muted: false, error: null as string | null };
let active = true;

vi.mock('../share/store', () => ({
  useShare: (sel: (s: { session: { status: string } | null }) => unknown) => sel({ session: active ? { status: 'active' } : null }),
}));
vi.mock('./store', () => ({
  useCall: (sel: (s: typeof call) => unknown) => sel(call),
  join: vi.fn(), leave: vi.fn(), toggleMute: vi.fn(),
}));

const at = (path: string) => renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(CallControls)));

beforeEach(() => { Object.assign(call, { status: 'idle', muted: false, error: null }); active = true; });

describe('CallControls', () => {
  it('shows only on case pages of an active session', () => {
    expect(at('/jobs/sample/3d')).toContain('Join call');
    expect(at('/jobs/sample/mri')).toContain('Join call');
    expect(at('/')).toBe('');
    expect(at('/jobs/sample/processing')).toBe('');
    active = false;
    expect(at('/jobs/sample/3d')).toBe('');
  });

  it('swaps Join for Mute and Leave while live', () => {
    call.status = 'live';
    const html = at('/jobs/sample/3d');
    expect(html).toContain('Mute');
    expect(html).toContain('Leave');
    expect(html).not.toContain('Join call');
    call.muted = true;
    expect(at('/jobs/sample/3d')).toContain('Unmute');
  });

  it('disables Join while connecting and shows errors', () => {
    call.status = 'connecting';
    expect(at('/jobs/sample/3d')).toMatch(/disabled=""[^>]*>Joining…/);
    Object.assign(call, { status: 'error', error: 'Microphone blocked' });
    expect(at('/jobs/sample/3d')).toContain('Microphone blocked');
  });
});
