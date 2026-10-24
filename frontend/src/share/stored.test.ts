import { describe, expect, it } from 'vitest';
import { clearStored, loadStored, saveStored, type Stored } from './stored';

const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const S: Stored = { sessionId: 's1', participantToken: 't1', role: 'viewer', inviteCode: 'ABC123' };

describe('stored', () => {
  it('round-trips and clears', () => {
    const s = fake();
    saveStored(S, s);
    expect(loadStored(s)).toEqual(S);
    clearStored(s);
    expect(loadStored(s)).toBeNull();
  });
  it('blocked, empty or corrupt storage → null, never throws', () => {
    expect(loadStored(null)).toBeNull();
    expect(() => saveStored(S, null)).not.toThrow();
    const s = fake(); s.setItem('nv.share', '{"sessionId":3}');
    expect(loadStored(s)).toBeNull();
    s.setItem('nv.share', 'not json');
    expect(loadStored(s)).toBeNull();
  });
});
