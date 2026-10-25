import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraSender, samePose, type CameraPose } from './cameraSync';

const pose = (x: number): CameraPose => ({ position: [x, 80, -200], target: [0, 0, 0] });

afterEach(() => vi.useRealTimers());

describe('camera sync', () => {
  it('throttles a drag to one send per window and always sends the final pose', () => {
    vi.useFakeTimers();
    const sent: CameraPose[] = [];
    const s = cameraSender((p) => sent.push(p), 200);
    for (let x = 0; x < 30; x++) { s.push(pose(x)); vi.advanceTimersByTime(20); } // 600 ms of 50 Hz updates
    vi.advanceTimersByTime(200);
    expect(sent.length).toBeLessThanOrEqual(4);
    expect(sent.at(-1)).toEqual(pose(29));
  });

  it('sends nothing when the camera did not move, ignoring sub-0.1 mm jitter', () => {
    vi.useFakeTimers();
    const sent: CameraPose[] = [];
    const s = cameraSender((p) => sent.push(p), 200);
    s.push(pose(10)); vi.advanceTimersByTime(200);
    s.push({ position: [10.01, 80, -200], target: [0, 0, 0.02] }); vi.advanceTimersByTime(200);
    expect(sent).toHaveLength(1);
  });

  it('flush sends the pending pose immediately', () => {
    const sent: CameraPose[] = [];
    const s = cameraSender((p) => sent.push(p), 200);
    s.push(pose(5));
    s.flush();
    expect(sent).toEqual([pose(5)]);
  });

  it('samePose compares position and target', () => {
    expect(samePose(pose(1), pose(1))).toBe(true);
    expect(samePose(pose(1), pose(2))).toBe(false);
    expect(samePose(null, pose(1))).toBe(false);
  });
});
