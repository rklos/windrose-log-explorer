import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tokenizeLine, parseFile, fillTimestamps, getCachedParse } from './parser.js';

// ---------------------------------------------------------------------------
// Sample raw lines used across tests
// ---------------------------------------------------------------------------

// Timestamped line with category, severity, sequence ID, and trailing source path
const TS_LINE_WITH_PATH =
  '[2026.05.05-15.01.16:191][927]R5LogCoopProxy: Verbose:    [2278926] UR5CoopRootDocumentBackup::SaveBackupAsync   R5BLIsland[F9E5CF1BBA394D004A9F910505CEA05F]. Save backup requested ...    [D:\\Source\\Build\\work\\R5CoopRootDocumentBackup.cpp:178]';

// Timestamped line WITHOUT a trailing source path
const TS_LINE_NO_PATH =
  '[2026.05.08-23.35.00:692][228]LogOutputDevice: Error: === FR5CheckDetails::PrintCallstackToLog ===';

// Orphan line (no leading timestamp bracket)
const ORPHAN_LINE =
  'LogIoDispatcher: Display: Reading toc: ../../../R5/Content/Paks/global.utoc';

// Line with UTF-8 BOM at position 0
const BOM = '﻿';
const BOM_LINE = `${BOM}Log file open, 05/08/26 23:35:53`;

// Real log file used for parseFile tests
const REAL_LOG =
  '/Users/rklos/Documents/Projects/windrose-log-explorer/logs/vvknngoqj89v73m9cwb56tkoz_logs.txt';

// ---------------------------------------------------------------------------

describe('tokenizeLine — timestamped lines', () => {
  it('parses ts to the correct UTC millisecond value', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    // 2026-05-05T15:01:16.191Z
    expect(entry.ts).toBe(Date.UTC(2026, 4, 5, 15, 1, 16, 191));
  });

  it('sets groupTs equal to ts for own-timestamp lines', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    expect(entry.groupTs).toBe(entry.ts);
  });

  it('preserves the raw line in fullText', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 5);
    expect(entry.fullText).toBe(TS_LINE_WITH_PATH);
  });

  it('message retains the trailing source path', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    expect(entry.message).toMatch(/\[D:\\Source\\Build\\work\\R5CoopRootDocumentBackup\.cpp:178\]/);
  });

  it('compactMessage strips the trailing source path', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    expect(entry.compactMessage).not.toMatch(/\[D:\\.*:\d+\]/);
  });

  it('compactMessage strips the leading sequence-id bracket', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    // seq-id [2278926] should be removed
    expect(entry.compactMessage).not.toMatch(/^\[\d+\]/);
    expect(entry.compactMessage.startsWith('UR5CoopRootDocumentBackup')).toBe(true);
  });

  it('i field equals the index argument', () => {
    expect(tokenizeLine(TS_LINE_WITH_PATH, 0).i).toBe(0);
    expect(tokenizeLine(TS_LINE_WITH_PATH, 42).i).toBe(42);
  });
});

describe('tokenizeLine — orphan lines', () => {
  it('ts is null for an orphan line', () => {
    const entry = tokenizeLine(ORPHAN_LINE, 1);
    expect(entry.ts).toBeNull();
  });

  it('groupTs is null for an orphan line before fillTimestamps runs', () => {
    const entry = tokenizeLine(ORPHAN_LINE, 1);
    expect(entry.groupTs).toBeNull();
  });

  it('hasOwnTs is false for an orphan line', () => {
    const entry = tokenizeLine(ORPHAN_LINE, 1);
    expect(entry.hasOwnTs).toBe(false);
  });

  it('category and severity are still parsed for an orphan line', () => {
    const entry = tokenizeLine(ORPHAN_LINE, 1);
    expect(entry.category).toBe('LogIoDispatcher');
    expect(entry.severity).toBe('Display');
  });

  it('frame is null for an orphan line', () => {
    const entry = tokenizeLine(ORPHAN_LINE, 1);
    expect(entry.frame).toBeNull();
  });
});

describe('tokenizeLine — BOM stripping', () => {
  it('strips BOM when it appears at index 0', () => {
    const entry = tokenizeLine(BOM_LINE, 0);
    expect(entry.fullText.startsWith(BOM)).toBe(false);
    expect(entry.fullText.startsWith('Log')).toBe(true);
  });

  it('does NOT strip BOM when the line is at index > 0', () => {
    const entry = tokenizeLine(BOM_LINE, 1);
    expect(entry.fullText.startsWith(BOM)).toBe(true);
  });
});

describe('tokenizeLine — severity defaults', () => {
  it('defaults severity to Display when category is null (no category match)', () => {
    const entry = tokenizeLine('Some random log line with no category', 0);
    expect(entry.category).toBeNull();
    expect(entry.severity).toBe('Display');
  });

  it.each([
    'Verbose',
    'VeryVerbose',
    'Display',
    'Log',
    'Warning',
    'Error',
    'Fatal',
  ])('accepts severity value "%s"', (sev) => {
    const line = `[2026.05.05-15.01.16:191][  1]SomeCategory: ${sev}: some message`;
    const entry = tokenizeLine(line, 0);
    expect(entry.severity).toBe(sev);
  });
});

describe('tokenizeLine — category regex', () => {
  it('accepts an R5-prefixed category name', () => {
    const entry = tokenizeLine(TS_LINE_WITH_PATH, 0);
    expect(entry.category).toBe('R5LogCoopProxy');
  });

  it('accepts category names containing underscores', () => {
    const line = '[2026.05.05-15.01.16:191][  1]Log_My_Category: Warning: msg';
    const entry = tokenizeLine(line, 0);
    expect(entry.category).toBe('Log_My_Category');
  });

  it('does not treat a bare severity word as a category when no colon-space follows', () => {
    // "Display" alone should not be extracted as a category
    const line = '[2026.05.05-15.01.16:191][  1]Display something without category syntax';
    const entry = tokenizeLine(line, 0);
    // The CATEGORY_SEVERITY_RE requires "Category: Severity:" pattern
    expect(entry.category).toBeNull();
  });
});

describe('parseFile — min/max computation', () => {
  it('min is less than max for the real log file', async () => {
    const result = await parseFile(REAL_LOG);
    expect(result.min).toBeLessThan(result.max);
  });

  it('min and max are finite numbers', async () => {
    const result = await parseFile(REAL_LOG);
    expect(Number.isFinite(result.min)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
  });

  it('has the expected exact min/max bounds (observed from vvknngoqj89v73m9cwb56tkoz_logs.txt)', async () => {
    // First timestamped line: [2026.05.08-23.35.00:667]  → 1778283300667
    // Last  timestamped line: [2026.05.09-08.06.45:910]  → 1778314005910
    const result = await parseFile(REAL_LOG);
    expect(result.min).toBe(1778283300667);
    expect(result.max).toBe(1778314005910);
  });

  it('falls back to mtime when the file has no timestamped lines — entries get ts and groupTs set to mtime', async () => {
    // Create a temporary file that contains only orphan lines
    const tmpPath = join(tmpdir(), `parser-test-zero-ts-${Date.now()}.log`);
    writeFileSync(tmpPath, 'LogOrphan: Display: no timestamp here\n');
    try {
      const result = await parseFile(tmpPath);
      // min and max should both be the mtime of the file (finite, positive)
      expect(Number.isFinite(result.min)).toBe(true);
      expect(result.min).toBeGreaterThan(0);
      expect(result.min).toBe(result.max);
      // every entry must have ts and groupTs equal to the mtime fallback
      for (const e of result.entries) {
        expect(e.ts).toBe(result.min);
        expect(e.groupTs).toBe(result.min);
      }
    } finally {
      unlinkSync(tmpPath);
    }
  });
});

describe('parseFile — entry shape integrity', () => {
  const REQUIRED_FIELDS = [
    'i',
    'ts',
    'groupTs',
    'hasOwnTs',
    'frame',
    'category',
    'severity',
    'message',
    'compactMessage',
    'sourcePath',
    'fullText',
  ];

  it('every entry has all 11 required fields', async () => {
    const { entries } = await parseFile(REAL_LOG);
    for (const entry of entries) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry, `entry ${entry.i} missing field "${field}"`).toHaveProperty(field);
      }
    }
  });

  it('groupTs equals ts for entries that have their own timestamp', async () => {
    const { entries } = await parseFile(REAL_LOG);
    const ownTs = entries.filter((e) => e.hasOwnTs);
    for (const e of ownTs) {
      expect(e.groupTs).toBe(e.ts);
    }
  });

  it('orphan entries have non-null ts and groupTs after fillTimestamps runs', async () => {
    const { entries } = await parseFile(REAL_LOG);
    const orphans = entries.filter((e) => !e.hasOwnTs);
    expect(orphans.length).toBeGreaterThan(0);
    for (const e of orphans) {
      expect(e.ts).not.toBeNull();
      expect(e.groupTs).not.toBeNull();
    }
  });

  it('entry indices are sequential starting from 0', async () => {
    const { entries } = await parseFile(REAL_LOG);
    entries.forEach((e, idx) => {
      expect(e.i).toBe(idx);
    });
  });
});

// ---------------------------------------------------------------------------
// fillTimestamps — unit tests
// ---------------------------------------------------------------------------

// Helper: build a minimal entry array from a descriptor array.
// Each element is either a number (own-ts value) or null (orphan).
function makeEntries(descriptors) {
  return descriptors.map((v, i) => ({
    i,
    ts: v,
    groupTs: v,
    hasOwnTs: v !== null,
  }));
}

describe('fillTimestamps — empty array', () => {
  it('does not throw on an empty array', () => {
    expect(() => fillTimestamps([])).not.toThrow();
  });
});

describe('fillTimestamps — orphan in the middle', () => {
  it('ts equals the next own-ts; groupTs equals the previous own-ts', () => {
    const entries = makeEntries([100, null, 200]);
    fillTimestamps(entries);
    // middle orphan: prevTs=100, nextTs=200
    expect(entries[1].ts).toBe(200);
    expect(entries[1].groupTs).toBe(100);
  });

  it('does not alter own-ts entries', () => {
    const entries = makeEntries([100, null, 200]);
    fillTimestamps(entries);
    expect(entries[0].ts).toBe(100);
    expect(entries[2].ts).toBe(200);
  });
});

describe('fillTimestamps — orphan run at the start (no preceding ts)', () => {
  it('ts and groupTs both fall back to the next own-ts', () => {
    const entries = makeEntries([null, null, 300]);
    fillTimestamps(entries);
    expect(entries[0].ts).toBe(300);
    expect(entries[0].groupTs).toBe(300);
    expect(entries[1].ts).toBe(300);
    expect(entries[1].groupTs).toBe(300);
  });
});

describe('fillTimestamps — orphan run at the end (no following ts)', () => {
  it('ts and groupTs both fall back to the previous own-ts', () => {
    const entries = makeEntries([400, null, null]);
    fillTimestamps(entries);
    expect(entries[1].ts).toBe(400);
    expect(entries[1].groupTs).toBe(400);
    expect(entries[2].ts).toBe(400);
    expect(entries[2].groupTs).toBe(400);
  });
});

describe('fillTimestamps — all-orphan array (no own-ts lines)', () => {
  it('ts and groupTs remain null when there are no own-ts lines', () => {
    const entries = makeEntries([null, null, null]);
    fillTimestamps(entries);
    for (const e of entries) {
      expect(e.ts).toBeNull();
      expect(e.groupTs).toBeNull();
    }
  });
});

describe('fillTimestamps — no orphans', () => {
  it('does not alter any entry when all entries have own timestamps', () => {
    const entries = makeEntries([10, 20, 30]);
    fillTimestamps(entries);
    expect(entries[0].ts).toBe(10);
    expect(entries[1].ts).toBe(20);
    expect(entries[2].ts).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// getCachedParse — cache tests
// ---------------------------------------------------------------------------

describe('getCachedParse', () => {
  const tmpFiles = [];

  afterAll(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch { /* already gone */ }
    }
  });

  it('cold call returns an object with expected shape (entries/min/max/totalLines)', async () => {
    const result = await getCachedParse(REAL_LOG);
    expect(result).toHaveProperty('entries');
    expect(result).toHaveProperty('min');
    expect(result).toHaveProperty('max');
    expect(result).toHaveProperty('totalLines');
    expect(Array.isArray(result.entries)).toBe(true);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.min)).toBe(true);
    expect(Number.isFinite(result.max)).toBe(true);
    expect(typeof result.totalLines).toBe('number');
  });

  it('warm call (same path, file unchanged) returns the same object reference', async () => {
    const a = await getCachedParse(REAL_LOG);
    const b = await getCachedParse(REAL_LOG);
    expect(a).toBe(b);
  });

  it('cache invalidates when the file changes (different object reference after rewrite)', async () => {
    const tmpPath = join(tmpdir(), `parser-cache-test-${Date.now()}.log`);
    tmpFiles.push(tmpPath);

    const line1 = '[2026.05.05-10.00.00:000][  1]LogTest: Display: first line\n';
    writeFileSync(tmpPath, line1);

    const first = await getCachedParse(tmpPath);

    // Append to the file — changes both mtime and size.
    appendFileSync(tmpPath, '[2026.05.05-10.00.01:000][  2]LogTest: Display: second line\n');

    const second = await getCachedParse(tmpPath);

    expect(second).not.toBe(first);
    expect(second.totalLines).toBeGreaterThan(first.totalLines);
  });
});
