import { describe, expect, it } from 'vitest';
import { dayNumber, factFor, FACTS } from './facts';

describe('daily brain fact', () => {
  it('keeps one fact for the whole California day, changing at local midnight', () => {
    // 2026-10-24 in Los Angeles runs 07:00Z on the 24th to 07:00Z on the 25th (PDT).
    const morning = new Date('2026-10-24T08:00:00Z');
    const night = new Date('2026-10-25T06:59:00Z');
    const next = new Date('2026-10-25T07:01:00Z');
    expect(dayNumber(morning)).toBe(dayNumber(night));
    expect(dayNumber(next)).toBe(dayNumber(night) + 1);
    expect(factFor(morning)).toBe(factFor(night));
  });

  it('shows every fact once before any repeats', () => {
    const start = new Date('2026-01-01T20:00:00Z');
    const seen = Array.from({ length: FACTS.length }, (_, d) => factFor(new Date(start.getTime() + d * 86_400_000)));
    expect(new Set(seen).size).toBe(FACTS.length);
    expect(factFor(new Date(start.getTime() + FACTS.length * 86_400_000))).toBe(seen[0]);
  });

  it('every fact is complete and links to a source', () => {
    expect(FACTS.length).toBeGreaterThanOrEqual(20);
    for (const f of FACTS) {
      expect(f.title.length).toBeGreaterThan(10);
      expect(f.body.length).toBeGreaterThan(30);
      expect(f.source.url).toMatch(/^https:\/\/(www\.cancer\.gov|www\.nibib\.nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov)\//);
      expect(`${f.title} ${f.body}`).not.toMatch(/\bhealthy\b/i); // copy rule
    }
  });
});
