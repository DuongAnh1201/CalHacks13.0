import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharePopover } from './SharePopover';

describe('SharePopover', () => {
  it('offers the host an email field for the report', () => {
    const h = renderToStaticMarkup(createElement(SharePopover, { session: { participants: [], me: { displayName: 'Host' } } as never, inviteCode: 'ABC123' }));
    expect(h).toContain('Email me the report');
    expect(h).toMatch(/<input[^>]*type="email"/i);
    expect(h).toContain('Your name');
    expect(h).toContain('value="Host"');
    expect(h).toContain('Earlier messages keep the name they were sent with.');
  });
});
