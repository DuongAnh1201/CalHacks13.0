import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useClientForTest, useShare } from '../share/store';
import { TopNavBar } from './TopNavBar';

const at = (path: string, pattern = '/jobs/:id/mri') => renderToStaticMarkup(
  createElement(MemoryRouter, { initialEntries: [path] }, createElement(Routes, null, createElement(Route, { path: pattern, element: createElement(TopNavBar) }))),
);
const shareTag = (h: string) => h.match(/<button[^>]*>(Share|Starting…)<\/button>/)?.[0] ?? '';
const fake = { query: async () => null, mutation: async () => null, onUpdate: () => Object.assign(() => {}, { unsubscribe() {}, getCurrentValue: () => undefined }) };

afterEach(() => { useClientForTest(null); useShare.setState({ stored: null, session: null, notice: null, syncNote: null }); });

describe('TopNavBar Share', () => {
  it('is disabled with no Convex client', () => {
    expect(shareTag(at('/jobs/sample/mri'))).toMatch(/disabled=""[^>]*title="Sharing is not configured"|title="Sharing is not configured"[^>]*disabled=""/);
  });
  it('is enabled on an uploaded case too', () => {
    useClientForTest(fake as never);
    expect(shareTag(at('/jobs/job-ab12/mri'))).not.toContain('disabled');
  });
  it('is enabled on the sample case', () => {
    useClientForTest(fake as never);
    expect(shareTag(at('/jobs/sample/mri'))).not.toContain('disabled');
  });
  it('shows the ended notice', () => {
    useShare.setState({ notice: 'The host ended the session' });
    expect(at('/jobs/sample/mri')).toContain('The host ended the session');
  });
  it('never names a keyboard key', () => expect(at('/jobs/sample/mri')).not.toMatch(/\b(space|esc|enter|ctrl|cmd)\b/i));
});
