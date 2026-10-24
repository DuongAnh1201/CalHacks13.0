import { describe, expect, it } from 'vitest';
import { stageRows } from './stages';

const states = (j: Parameters<typeof stageRows>[0]) => stageRows(j).map((r) => r.state);

describe('stageRows', () => {
  it('queued: all pending', () => expect(states({ status: 'queued', stage: null })).toEqual(['pending', 'pending', 'pending']));
  it('running inferring: validating done, inferring active', () =>
    expect(states({ status: 'running', stage: 'inferring' })).toEqual(['done', 'active', 'pending']));
  it('done: all done', () => expect(states({ status: 'done', stage: null })).toEqual(['done', 'done', 'done']));
  it('failed while meshing: earlier done, meshing failed', () =>
    expect(states({ status: 'failed', stage: 'meshing' })).toEqual(['done', 'done', 'failed']));
  it('failed with no stage: nothing marked done', () =>
    expect(states({ status: 'failed', stage: null })).toEqual(['pending', 'pending', 'pending']));
  it('labels are real backend stages, no percentages', () =>
    expect(stageRows({ status: 'queued', stage: null }).map((r) => r.label).join(' ')).not.toMatch(/%/));
});
