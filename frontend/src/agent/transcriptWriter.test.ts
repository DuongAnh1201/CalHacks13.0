import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranscriptWriter, WRITE_INTERVAL_MS } from './transcriptWriter';
const speech = (text: string) => ({ text, startedAt: 100, endedAt: 200 });
afterEach(() => vi.useRealTimers());
describe('live transcript writer', () => {
  it('coalesces interim callbacks, updates the same row, and sends the final after the throttle', async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => ({ segmentId: 'line1' }));
    const writer = createTranscriptWriter(write, vi.fn());
    writer.push(speech('h'), false);
    await Promise.resolve();
    for (const text of ['he', 'hel', 'hell', 'hello']) writer.push(speech(text), false);
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS - 1);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenNthCalledWith(2, expect.objectContaining({ segmentId: 'line1', text: 'hello', final: false }));
    writer.push(speech('hello team.'), true);
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(write).toHaveBeenNthCalledWith(3, expect.objectContaining({ segmentId: 'line1', text: 'hello team.', final: true }));
    expect(write).toHaveBeenCalledTimes(3);
    writer.stop();
  });
  it('keeps finals queued while a write is in flight and preserves the next utterance separately', async () => {
    vi.useFakeTimers();
    let resolve!: (r: { segmentId: string }) => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise((r) => { resolve = r; })).mockResolvedValue({ segmentId: 'line2' });
    const writer = createTranscriptWriter(write, vi.fn());
    writer.push(speech('first'), false); writer.push(speech('first final'), true); writer.push(speech('second final'), true);
    resolve({ segmentId: 'line1' }); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(write).toHaveBeenNthCalledWith(2, expect.objectContaining({ segmentId: 'line1', text: 'first final', final: true }));
    await vi.advanceTimersByTimeAsync(WRITE_INTERVAL_MS);
    expect(write.mock.calls[2][0]).toEqual({ text: 'second final', final: true, durationMs: 100 });
    writer.stop();
  });
  it('honours server retry timing and cancels pending words when stopped', async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValueOnce({ retryAfterMs: 200 }).mockResolvedValue({ segmentId: 'line' });
    const writer = createTranscriptWriter(write, vi.fn());
    writer.push(speech('x'), false); await vi.advanceTimersByTimeAsync(199);
    expect(write).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledTimes(2); writer.push(speech('final'), true); writer.stop();
    await vi.runAllTimersAsync(); expect(write).toHaveBeenCalledTimes(2);
  });
});
