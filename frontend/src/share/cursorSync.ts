import type * as THREE from 'three';
import type { Cursor } from './types';

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1', '#f032e6', '#7a9a01'];

/** Stable colour per participant: the same id gets the same colour on every screen. */
export function colorOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The hit in the hit mesh's own frame (spec §2.2), or null for an unnamed or hidden object. */
export function cursorOf(object: THREE.Object3D, point: THREE.Vector3): Cursor | null {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return null;
  if (!object.name) return null;
  const [x, y, z] = object.worldToLocal(point.clone()).toArray();
  return { node: object.name, localMm: [x, y, z] };
}

const same = (a: Cursor | null, b: Cursor | null) =>
  a === b || (!!a && !!b && a.node === b.node && a.localMm.every((v, i) => v === b.localMm[i]));

/** Trailing throttle: at most one send per `ms`, only when the point changed; leaving sends one null. */
export function cursorSender(send: (c: Cursor | null) => void, ms = 100) {
  let sent: Cursor | null = null;
  let latest: Cursor | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (same(sent, latest)) return;
    sent = latest;
    send(latest);
  };
  return {
    push(c: Cursor | null) { latest = c; timer ??= setTimeout(flush, ms); },
    flush,
  };
}
