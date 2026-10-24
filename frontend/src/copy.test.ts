/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const BANNED = new RegExp(['heal', 'thy'].join(''), 'i'); // split so this file doesn't match itself

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

it('UI source never uses the banned word (contract §5)', () => {
  const hits = files(fileURLToPath(new URL('.', import.meta.url)))
    .filter((p) => /\.(tsx?|css|json)$/.test(p) && !/\.test\.ts$/.test(p))
    .filter((p) => BANNED.test(readFileSync(p, 'utf8')));
  expect(hits).toEqual([]);
});
