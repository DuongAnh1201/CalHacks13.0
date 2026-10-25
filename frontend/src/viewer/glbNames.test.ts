/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Mesh node names straight from the GLB JSON chunk (header 12 B, chunk length at byte 12, JSON from byte 20). */
function meshNodeNames(rel: string): string[] {
  const b = readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes?: { name?: string; mesh?: number }[] };
  return (gltf.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

// Cursors are anchored by node name (spec §2.2): a blank or duplicate name would put a dot on the wrong mesh.
describe('sample case GLB mesh node names are unique', () => {
  it.each(['../../../backend/seed/sample/model.glb', '../../../backend/seed/sample-2/model.glb'])('%s', (rel) => {
    const names = meshNodeNames(rel);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n, i) => !n || names.indexOf(n) !== i)).toEqual([]);
  });
});
