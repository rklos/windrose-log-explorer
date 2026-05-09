import { describe, it, expect } from 'vitest';
import {
  PRESETS,
  DEFAULT_PRESET_KEY,
  findPreset,
  resolvePreset,
  resolveSelection,
  formatTriggerLabel,
  selectionFromSearchParams,
  applySelectionToSearchParams,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from './time-range.js';

describe('PRESETS', () => {
  it('contains all 11 keys from the spec in order', () => {
    expect(PRESETS.map((p) => p.key)).toEqual([
      '5m','15m','30m','1h','3h','6h','12h','24h','2d','3d','7d',
    ]);
  });

  it('default preset is 30m', () => {
    expect(DEFAULT_PRESET_KEY).toBe('30m');
  });
});

describe('findPreset', () => {
  it('returns the preset object for a known key', () => {
    expect(findPreset('1h')).toEqual({ key: '1h', label: 'Last 1 hour', ms: 60 * 60_000 });
  });

  it('returns undefined for an unknown key', () => {
    expect(findPreset('99x')).toBeUndefined();
  });
});

describe('resolvePreset', () => {
  it('30m at now=10_000_000 yields {fromMs: 10_000_000 - 1_800_000, toMs: 10_000_000}', () => {
    expect(resolvePreset('30m', 10_000_000)).toEqual({ fromMs: 8_200_000, toMs: 10_000_000 });
  });

  it('returns null for an unknown preset key', () => {
    expect(resolvePreset('99x', 10_000_000)).toBeNull();
  });
});

describe('resolveSelection', () => {
  it('preset selection delegates to resolvePreset', () => {
    expect(resolveSelection({ kind: 'preset', key: '1h' }, 10_000_000)).toEqual({
      fromMs: 10_000_000 - 60 * 60_000,
      toMs: 10_000_000,
    });
  });

  it('absolute selection parses ISO strings into ms', () => {
    expect(
      resolveSelection({ kind: 'absolute', from: '2026-05-08T14:00:00Z', to: '2026-05-08T15:00:00Z' }, 0),
    ).toEqual({ fromMs: Date.UTC(2026, 4, 8, 14), toMs: Date.UTC(2026, 4, 8, 15) });
  });

  it('unknown kind returns null', () => {
    expect(resolveSelection({ kind: 'custom' }, 0)).toBeNull();
  });
});

describe('formatTriggerLabel', () => {
  it('preset → preset label', () => {
    expect(formatTriggerLabel({ kind: 'preset', key: '6h' })).toBe('Last 6 hours');
  });

  it('absolute → "YYYY-MM-DD HH:MM:SS → YYYY-MM-DD HH:MM:SS"', () => {
    expect(
      formatTriggerLabel({ kind: 'absolute', from: '2026-05-08T14:00:00Z', to: '2026-05-08T15:30:00Z' }),
    ).toBe('2026-05-08 14:00:00 → 2026-05-08 15:30:00');
  });

  it('unknown preset key → "Custom range"', () => {
    expect(formatTriggerLabel({ kind: 'preset', key: 'bogus' })).toBe('Custom range');
  });
});

describe('selectionFromSearchParams', () => {
  it('range= → preset selection', () => {
    const params = new URLSearchParams('range=1h');
    expect(selectionFromSearchParams(params)).toEqual({ kind: 'preset', key: '1h' });
  });

  it('from + to → absolute selection', () => {
    const params = new URLSearchParams('from=2026-05-08T14:00:00Z&to=2026-05-08T15:00:00Z');
    expect(selectionFromSearchParams(params)).toEqual({
      kind: 'absolute',
      from: '2026-05-08T14:00:00Z',
      to: '2026-05-08T15:00:00Z',
    });
  });

  it('unknown range key falls back to default preset', () => {
    const params = new URLSearchParams('range=bogus');
    expect(selectionFromSearchParams(params)).toEqual({ kind: 'preset', key: '30m' });
  });

  it('empty params → default preset', () => {
    expect(selectionFromSearchParams(new URLSearchParams())).toEqual({ kind: 'preset', key: '30m' });
  });
});

describe('applySelectionToSearchParams', () => {
  it('preset selection sets range and clears from/to', () => {
    const params = new URLSearchParams('from=x&to=y&q=foo');
    applySelectionToSearchParams(params, { kind: 'preset', key: '6h' });
    expect(params.get('range')).toBe('6h');
    expect(params.get('from')).toBeNull();
    expect(params.get('to')).toBeNull();
    expect(params.get('q')).toBe('foo');
  });

  it('absolute selection sets from/to and clears range', () => {
    const params = new URLSearchParams('range=1h');
    applySelectionToSearchParams(params, {
      kind: 'absolute',
      from: '2026-05-08T14:00:00Z',
      to: '2026-05-08T15:00:00Z',
    });
    expect(params.get('range')).toBeNull();
    expect(params.get('from')).toBe('2026-05-08T14:00:00Z');
    expect(params.get('to')).toBe('2026-05-08T15:00:00Z');
  });
});

describe('datetime-local helpers', () => {
  it('isoToDatetimeLocalValue strips fractional seconds and Z', () => {
    expect(isoToDatetimeLocalValue('2026-05-08T14:00:00.123Z')).toBe('2026-05-08T14:00:00');
    expect(isoToDatetimeLocalValue('2026-05-08T14:00:00Z')).toBe('2026-05-08T14:00:00');
  });

  it('datetimeLocalValueToIso pads to seconds and appends Z', () => {
    expect(datetimeLocalValueToIso('2026-05-08T14:00')).toBe('2026-05-08T14:00:00Z');
    expect(datetimeLocalValueToIso('2026-05-08T14:00:00')).toBe('2026-05-08T14:00:00Z');
  });

  it('datetimeLocalValueToIso returns null for empty input', () => {
    expect(datetimeLocalValueToIso('')).toBeNull();
  });
});
