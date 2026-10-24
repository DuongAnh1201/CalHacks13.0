import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState } from '../actions/store';
import { DEFAULT_SCENE, sceneActions, sceneCommands, sceneOf, sceneSender } from './sceneSync';

afterEach(() => vi.useRealTimers());

describe('sceneSync', () => {
  it('the default matches the frontend initial state', () => expect(sceneOf(initialState('sample'), 'mri')).toEqual(DEFAULT_SCENE));
  it('diffs only changed fields into commands', () => {
    const next = { ...DEFAULT_SCENE, page: '3d' as const, explodeAmount: 0.5, hidden: { left: true, right: false } };
    expect(sceneCommands(DEFAULT_SCENE, next)).toEqual([
      { type: 'setPage', page: '3d' },
      { type: 'setExplosion', value: 0.5 },
      { type: 'setHemisphereVisible', side: 'left', visible: false },
    ]);
    expect(sceneCommands(DEFAULT_SCENE, { ...DEFAULT_SCENE })).toEqual([]);
  });
  it('a first apply sets everything, focusTumor first; brain camera dispatches nothing', () => {
    const acts = sceneActions(null, { ...DEFAULT_SCENE, cameraTarget: 'tumor' });
    expect(acts[0]).toEqual({ type: 'focusTumor' });
    expect(acts).toContainEqual({ type: 'setMode', mode: 'whole' });
    expect(acts).toContainEqual({ type: 'setLayerVisible', layer: 'core', visible: true });
    expect(sceneActions(DEFAULT_SCENE, { ...DEFAULT_SCENE })).toEqual([]);
  });
  it('coalesces bursts into one trailing send of the latest scene', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = sceneSender(DEFAULT_SCENE, send, 150);
    s.push({ ...DEFAULT_SCENE, explodeAmount: 0.2 });
    s.push({ ...DEFAULT_SCENE, explodeAmount: 0.7 });
    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([{ type: 'setExplosion', value: 0.7 }]);
    s.push({ ...DEFAULT_SCENE, explodeAmount: 0.7 });
    vi.advanceTimersByTime(150);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
