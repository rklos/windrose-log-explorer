import { describe, it, expect } from 'vitest';
import { resolveWindow } from './server.js';

const DEFAULT_WINDOW_MS = 30 * 60 * 1000;

const BASE = {
  min: 1000,
  max: 10_000_000,
  defaultWindowMs: DEFAULT_WINDOW_MS,
};

describe('resolveWindow', () => {
  it('no params → window is [max - 30min, max]', () => {
    const result = resolveWindow({ ...BASE, fromRaw: null, toRaw: null });
    expect(result).toEqual({ from: BASE.max - DEFAULT_WINDOW_MS, to: BASE.max });
  });

  it('only from → window is [from, max]', () => {
    const from = 5_000_000;
    const result = resolveWindow({ ...BASE, fromRaw: from, toRaw: null });
    expect(result).toEqual({ from, to: BASE.max });
  });

  it('only to → window is [to - 30min, to]', () => {
    const to = 8_000_000;
    const result = resolveWindow({ ...BASE, fromRaw: null, toRaw: to });
    expect(result).toEqual({ from: to - DEFAULT_WINDOW_MS, to });
  });

  it('both from and to → window is [from, to] exactly', () => {
    const from = 3_000_000;
    const to = 7_000_000;
    const result = resolveWindow({ ...BASE, fromRaw: from, toRaw: to });
    expect(result).toEqual({ from, to });
  });

  it('invalid from (NaN) → error: invalid `from`', () => {
    const result = resolveWindow({ ...BASE, fromRaw: NaN, toRaw: null });
    expect(result).toEqual({ error: 'invalid `from`' });
  });

  it('invalid to (NaN) → error: invalid `to`', () => {
    const result = resolveWindow({ ...BASE, fromRaw: null, toRaw: NaN });
    expect(result).toEqual({ error: 'invalid `to`' });
  });

  it('from > to → error: `from` is after `to`', () => {
    const result = resolveWindow({ ...BASE, fromRaw: 9_000_000, toRaw: 2_000_000 });
    expect(result).toEqual({ error: '`from` is after `to`' });
  });
});
