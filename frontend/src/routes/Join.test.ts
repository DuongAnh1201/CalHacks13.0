import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Join from './Join';

const html = () => renderToStaticMarkup(
  createElement(MemoryRouter, { initialEntries: ['/join/ABC123'] }, createElement(Routes, null, createElement(Route, { path: '/join/:code', element: createElement(Join) }))),
);

describe('Join', () => {
  it('asks for a display name capped at 64', () => {
    const h = html();
    expect(h).toMatch(/<input[^>]*maxLength="64"/i);
    expect(h).toContain('Join');
  });
  it('says when sharing is not configured', () => expect(html()).toContain('Sharing is not configured'));
  it('requires an email and explains the report', () => {
    const h = html();
    expect(h).toMatch(/<input[^>]*type="email"[^>]*required/i);
    expect(h).toMatch(/<input[^>]*type="email"[^>]*maxLength="254"/i);
    expect(h).toContain('email the session report, including the transcript');
    expect(h).toContain('Educational, not clinically validated.');
  });
});
