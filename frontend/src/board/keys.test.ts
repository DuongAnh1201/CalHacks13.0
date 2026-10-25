import { describe, expect, it } from 'vitest';
import { keyAction } from './keys';

const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('keyAction', () => {
  it('maps undo and redo on mac and windows', () => {
    expect(keyAction(k('z', { metaKey: true }), false)).toEqual({ type: 'undo' });
    expect(keyAction(k('z', { ctrlKey: true }), false)).toEqual({ type: 'undo' });
    expect(keyAction(k('Z', { metaKey: true, shiftKey: true }), false)).toEqual({ type: 'redo' });
    expect(keyAction(k('y', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
  });
  it('maps tool letters and Escape', () => {
    expect(keyAction(k('s'), false)).toEqual({ type: 'tool', tool: 'sticky' });
    expect(keyAction(k('h'), false)).toEqual({ type: 'tool', tool: 'highlight' });
    expect(keyAction(k('Escape'), false)).toEqual({ type: 'tool', tool: 'select' });
    expect(keyAction(k('Delete'), false)).toEqual({ type: 'delete' });
  });
  it('does nothing while typing, so Cmd+Z in a textarea stays native', () => {
    expect(keyAction(k('z', { metaKey: true }), true)).toBeNull();
    expect(keyAction(k('s'), true)).toBeNull();
    expect(keyAction(k('Backspace'), true)).toBeNull();
  });
  it('ignores letters with modifiers (browser shortcuts)', () => {
    expect(keyAction(k('c', { metaKey: true }), false)).toBeNull();
  });
});
