import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colorOf, cursorOf, cursorSender } from './cursorSync';

afterEach(() => vi.useRealTimers());
const A = { node: 'n', localMm: [1, 2, 3] as [number, number, number] };

describe('cursorSender', () => {
  it('sends the latest point once per window, only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push({ ...A, localMm: [0, 0, 0] });
    s.push(A);
    vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A]]);
    s.push({ ...A });
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends a single null after the pointer leaves, none before anything was sent', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send).not.toHaveBeenCalled();
    s.push(A); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A], [null]]);
  });
});

describe('colorOf', () => {
  it('is stable per id', () => {
    expect(colorOf('p1')).toBe(colorOf('p1'));
    expect(colorOf('p1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('cursorOf', () => {
  it('stores the hit in the mesh frame, so the receiver can re-project after explode', () => {
    const parent = new THREE.Group(); parent.position.set(10, 0, 0);
    const mesh = new THREE.Mesh(); mesh.name = 'lh_cortex'; mesh.position.set(0, 5, 0);
    parent.add(mesh); parent.updateMatrixWorld(true);
    const c = cursorOf(mesh, new THREE.Vector3(11, 5, 0));
    expect(c?.node).toBe('lh_cortex');
    expect(c?.localMm.map((v) => Math.round(v))).toEqual([1, 0, 0]);
    mesh.position.set(0, 50, 0); parent.updateMatrixWorld(true); // receiver exploded further
    expect(mesh.localToWorld(new THREE.Vector3(...c!.localMm)).toArray()).toEqual([11, 50, 0]);
  });
  it('ignores unnamed and hidden objects', () => {
    const g = new THREE.Group(); const m = new THREE.Mesh(); g.add(m);
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
    m.name = 'x'; g.visible = false;
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
  });
});
