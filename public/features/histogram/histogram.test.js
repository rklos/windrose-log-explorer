import { describe, it, expect } from 'vitest';
import {
  chooseBucketMs,
  severityKey,
  bucketEntries,
  pickTickFormat,
  formatTickLabel,
  chooseTickPositions,
} from './histogram.js';

describe('chooseBucketMs', () => {
  it('5 min window → 5s buckets', () => {
    expect(chooseBucketMs(5 * 60_000)).toBe(5_000);
  });

  it('1 hour window → 1 min buckets', () => {
    expect(chooseBucketMs(60 * 60_000)).toBe(60_000);
  });

  it('6 hour window → 5 min buckets', () => {
    expect(chooseBucketMs(6 * 60 * 60_000)).toBe(5 * 60_000);
  });

  it('24 hour window → 30 min buckets', () => {
    expect(chooseBucketMs(24 * 60 * 60_000)).toBe(30 * 60_000);
  });

  it('7 day window → 3 hour buckets', () => {
    expect(chooseBucketMs(7 * 24 * 60 * 60_000)).toBe(3 * 60 * 60_000);
  });

  it('30 day (custom) window → 6 hour fallback', () => {
    expect(chooseBucketMs(30 * 24 * 60 * 60_000)).toBe(6 * 60 * 60_000);
  });
});

describe('severityKey', () => {
  it.each([
    ['Verbose', 'verbose'],
    ['VeryVerbose', 'verbose'],
    ['Display', 'display'],
    ['Log', 'display'],
    ['Warning', 'warning'],
    ['Error', 'error'],
    ['Fatal', 'error'],
  ])('maps %s → %s', (sev, key) => {
    expect(severityKey(sev)).toBe(key);
  });

  it('unknown severity defaults to display', () => {
    expect(severityKey('Bogus')).toBe('display');
  });
});

describe('bucketEntries', () => {
  it('snaps first bucket to wall-clock multiples of bucketMs', () => {
    const fromMs = 1717_200_037_000;
    const toMs = fromMs + 120_000;
    const buckets = bucketEntries([], fromMs, toMs, 60_000);
    expect(buckets[0].fromMs % 60_000).toBe(0);
  });

  it('counts entries into the right bucket and severity', () => {
    const fromMs = 30_000_000;
    const toMs   = fromMs + 60_000;
    const entries = [
      { ts: fromMs +  5_000, severity: 'Display' },
      { ts: fromMs + 25_000, severity: 'Warning' },
      { ts: fromMs + 25_500, severity: 'Error' },
      { ts: fromMs + 55_000, severity: 'Verbose' },
    ];
    const buckets = bucketEntries(entries, fromMs, toMs, 30_000);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].counts).toEqual({ verbose: 0, display: 1, warning: 1, error: 1 });
    expect(buckets[0].total).toBe(3);
    expect(buckets[1].counts).toEqual({ verbose: 1, display: 0, warning: 0, error: 0 });
    expect(buckets[1].total).toBe(1);
  });

  it('skips entries outside [fromMs, toMs]', () => {
    const fromMs = 30_000_000;
    const toMs   = fromMs + 60_000;
    const entries = [
      { ts: fromMs - 1_000, severity: 'Display' },
      { ts: toMs   + 1_000, severity: 'Display' },
    ];
    const buckets = bucketEntries(entries, fromMs, toMs, 30_000);
    const totals = buckets.reduce((s, b) => s + b.total, 0);
    expect(totals).toBe(0);
  });

  it('skips entries with ts === null', () => {
    const fromMs = 30_000_000;
    const toMs   = fromMs + 60_000;
    const entries = [{ ts: null, severity: 'Display' }];
    const buckets = bucketEntries(entries, fromMs, toMs, 30_000);
    const totals = buckets.reduce((s, b) => s + b.total, 0);
    expect(totals).toBe(0);
  });

  it('returns [] when toMs <= fromMs', () => {
    expect(bucketEntries([], 100, 100, 60_000)).toEqual([]);
    expect(bucketEntries([], 100, 50,  60_000)).toEqual([]);
  });
});

describe('pickTickFormat', () => {
  it('≤ 1h → HH:MM:SS', () => {
    expect(pickTickFormat(60 * 60_000)).toBe('HH:MM:SS');
  });

  it('≤ 24h → HH:MM', () => {
    expect(pickTickFormat(24 * 60 * 60_000)).toBe('HH:MM');
  });

  it('≤ 7d → MM-DD HH:MM', () => {
    expect(pickTickFormat(7 * 24 * 60 * 60_000)).toBe('MM-DD HH:MM');
  });

  it('> 7d → MM-DD', () => {
    expect(pickTickFormat(30 * 24 * 60 * 60_000)).toBe('MM-DD');
  });
});

describe('formatTickLabel', () => {
  it('formats HH:MM:SS in UTC', () => {
    const ms = Date.UTC(2026, 4, 8, 14, 5, 9);
    expect(formatTickLabel(ms, 'HH:MM:SS')).toBe('14:05:09');
  });

  it('formats HH:MM in UTC', () => {
    const ms = Date.UTC(2026, 4, 8, 14, 5, 9);
    expect(formatTickLabel(ms, 'HH:MM')).toBe('14:05');
  });

  it('formats MM-DD HH:MM in UTC', () => {
    const ms = Date.UTC(2026, 4, 8, 14, 5, 9);
    expect(formatTickLabel(ms, 'MM-DD HH:MM')).toBe('05-08 14:05');
  });

  it('formats MM-DD in UTC', () => {
    const ms = Date.UTC(2026, 4, 8, 14, 5, 9);
    expect(formatTickLabel(ms, 'MM-DD')).toBe('05-08');
  });
});

describe('chooseTickPositions', () => {
  it('returns ~desired count of ticks evenly spaced by bucket index', () => {
    const buckets = Array.from({ length: 60 }, (_, i) => ({
      fromMs: i * 1000, toMs: (i + 1) * 1000, counts: {}, total: 0,
    }));
    const ticks = chooseTickPositions(buckets, 6, (ms) => String(ms));
    expect(ticks.length).toBeGreaterThanOrEqual(5);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks[0].index).toBe(0);
  });

  it('returns [] for empty buckets', () => {
    expect(chooseTickPositions([], 6, () => '')).toEqual([]);
  });
});
