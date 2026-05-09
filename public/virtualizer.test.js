// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createVirtualizer } from './virtualizer.js';

function makeHarness() {
  const viewport = document.createElement('div');
  Object.defineProperty(viewport, 'clientHeight', { value: 240, configurable: true });
  Object.defineProperty(viewport, 'scrollTop', { value: 0, writable: true, configurable: true });
  const spacer = document.createElement('div');
  const rows = document.createElement('div');
  viewport.append(spacer, rows);
  document.body.append(viewport);
  return { viewport, spacer, rows };
}

function makeEntries(count) {
  return Array.from({ length: count }, (_, i) => ({ i, severity: 'Display' }));
}

const ROW_HEIGHT = 24;
const EXPANDED_HEIGHT = 96;

describe('virtualizer — setEntries with 100 entries', () => {
  let harness;
  let virt;

  beforeEach(() => {
    document.body.innerHTML = '';
    harness = makeHarness();
    virt = createVirtualizer({
      viewport: harness.viewport,
      spacer: harness.spacer,
      rows: harness.rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });
  });

  it('spacer height equals 100 * 24 = 2400 after setEntries(100 rows)', () => {
    virt.setEntries(makeEntries(100));
    expect(harness.spacer.style.height).toBe('2400px');
  });

  it('rows.innerHTML contains only visible window plus overscan (14 to 22 rows)', () => {
    virt.setEntries(makeEntries(100));
    const rowEls = harness.rows.querySelectorAll('.log-row');
    // viewport 240px / 24px = 10 visible + 6 overscan before + 6 overscan after = up to 22
    // at scroll=0 there's no overscan before so: 0..10+6 = 16 rows
    expect(rowEls.length).toBeGreaterThanOrEqual(14);
    expect(rowEls.length).toBeLessThanOrEqual(22);
  });
});

describe('virtualizer — click to expand a row', () => {
  it('clicking a row increases spacer height by (expandedHeight - rowHeight)', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport,
      spacer,
      rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(100));

    const initialHeight = parseInt(spacer.style.height, 10);
    expect(initialHeight).toBe(100 * ROW_HEIGHT);

    // Click the first visible row
    const firstRow = rows.querySelector('.log-row');
    expect(firstRow).not.toBeNull();

    firstRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const newHeight = parseInt(spacer.style.height, 10);
    expect(newHeight).toBe(initialHeight + (EXPANDED_HEIGHT - ROW_HEIGHT));
  });
});

describe('virtualizer — setEntries([])', () => {
  it('makes rows.innerHTML empty and spacer height 0', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport,
      spacer,
      rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(10));
    virt.setEntries([]);

    expect(rows.innerHTML).toBe('');
    expect(spacer.style.height).toBe('0px');
  });
});

describe('virtualizer — setRenderRow', () => {
  it("shows the renderRow function's output inside each row", () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport,
      spacer,
      rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(5));
    virt.setRenderRow((entry) => `<span>entry-${entry.i}</span>`);

    expect(rows.innerHTML).toContain('<span>entry-0</span>');
    expect(rows.innerHTML).toContain('<span>entry-4</span>');
  });
});

describe('virtualizer — variable expanded heights via measureExpandedRow', () => {
  it('uses measured height instead of the static expandedHeight when row is expanded', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const measured = new Map([[0, 200], [1, 50]]);
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
      measureExpandedRow: (entry) => measured.get(entry.i),
    });

    virt.setEntries(makeEntries(2));
    expect(spacer.style.height).toBe(`${2 * ROW_HEIGHT}px`);

    rows.querySelector('.log-row[data-idx="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(spacer.style.height).toBe(`${200 + ROW_HEIGHT}px`);
  });

  it('cached measured height survives setEntries(next, {keepScroll: true})', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    let calls = 0;
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
      measureExpandedRow: (_entry) => { calls += 1; return 150; },
    });

    virt.setEntries(makeEntries(3));
    rows.querySelector('.log-row[data-idx="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(calls).toBe(1);

    virt.setEntries(makeEntries(3), { keepScroll: true });
    expect(calls).toBe(1);
    expect(spacer.style.height).toBe(`${150 + 2 * ROW_HEIGHT}px`);
  });

  it('falls back to expandedHeight when measureExpandedRow returns 0/NaN/negative', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
      measureExpandedRow: () => 0,
    });

    virt.setEntries(makeEntries(2));
    rows.querySelector('.log-row[data-idx="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Fallback path: expandedHeight (96) for entry 0, rowHeight (24) for entry 1 → 120
    expect(spacer.style.height).toBe(`${EXPANDED_HEIGHT + ROW_HEIGHT}px`);
  });
});

describe('virtualizer — setEntries scroll behavior', () => {
  it('default setEntries(next) resets scrollTop to 0', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(100));
    viewport.scrollTop = 500;
    virt.setEntries(makeEntries(100));
    expect(viewport.scrollTop).toBe(0);
  });

  it('setEntries(next, {keepScroll: true}) preserves scrollTop', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(100));
    viewport.scrollTop = 500;
    virt.setEntries(makeEntries(100), { keepScroll: true });
    expect(viewport.scrollTop).toBe(500);
  });

  it('setEntries(next, {keepScroll: true}) preserves expanded set', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(5));
    rows.querySelector('.log-row[data-idx="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const heightBefore = spacer.style.height;

    virt.setEntries(makeEntries(5), { keepScroll: true });
    expect(spacer.style.height).toBe(heightBefore);
  });

  it('default setEntries(next) clears expanded set', () => {
    document.body.innerHTML = '';
    const { viewport, spacer, rows } = makeHarness();
    const virt = createVirtualizer({
      viewport, spacer, rows,
      rowHeight: ROW_HEIGHT,
      expandedHeight: EXPANDED_HEIGHT,
    });

    virt.setEntries(makeEntries(5));
    rows.querySelector('.log-row[data-idx="0"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    virt.setEntries(makeEntries(5));
    expect(spacer.style.height).toBe(`${5 * ROW_HEIGHT}px`);
  });
});
