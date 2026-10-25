import { describe, expect, it } from 'vitest';
import { inviteTarget } from './invite';

describe('join with an invite', () => {
  it('a pasted link goes where the link says, whatever the chosen kind', () => {
    expect(inviteTarget('https://lobe.example/join/C7RR-63PY-FT94-D6AK', 'playground')).toBe('/join/C7RR-63PY-FT94-D6AK');
    expect(inviteTarget('http://localhost:5173/play/join/CZM3-0XKP-FMNX-1WAS', 'session')).toBe('/play/join/CZM3-0XKP-FMNX-1WAS');
    expect(inviteTarget('  https://x.dev/play/join/czm3-0xkp-fmnx-1was/  ', 'session')).toBe('/play/join/CZM3-0XKP-FMNX-1WAS');
  });

  it('a bare code goes to the chosen kind, in any case or spacing', () => {
    expect(inviteTarget('c7rr63pyft94d6ak', 'session')).toBe('/join/C7RR-63PY-FT94-D6AK');
    expect(inviteTarget('C7RR 63PY FT94 D6AK', 'playground')).toBe('/play/join/C7RR-63PY-FT94-D6AK');
  });

  it('rejects anything that is not a code', () => {
    for (const bad of ['', 'hello', 'C7RR-63PY', 'https://lobe.example/explore', 'https://x/join/../../etc']) {
      expect(inviteTarget(bad, 'session')).toBeNull();
    }
  });
});
