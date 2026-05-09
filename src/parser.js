import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';

const TIMESTAMP_LINE_RE =
  /^\[(?<date>\d{4}\.\d{2}\.\d{2})-(?<time>\d{2}\.\d{2}\.\d{2}):(?<ms>\d{3})\]\[\s*(?<frame>\d+)\](?<rest>.*)$/;

const CATEGORY_SEVERITY_RE =
  /^(?<category>[A-Za-z][A-Za-z0-9_]*): (?<severity>Verbose|VeryVerbose|Display|Log|Warning|Error|Fatal):\s*(?<message>.*)$/;

const SOURCE_PATH_TAIL_RE = /\s+\[[A-Za-z]:\\[^\]]+:\d+\]\s*$/;
const SEQ_ID_HEAD_RE = /^\[\s*-?\d+(?::\d+)?\]\s+/;

const KNOWN_SEVERITIES = new Set([
  'Verbose',
  'VeryVerbose',
  'Display',
  'Log',
  'Warning',
  'Error',
  'Fatal',
]);

function parseTimestampToMs(date, time, ms) {
  // date = "2026.05.05", time = "15.01.16", ms = "191"
  const [y, mo, d] = date.split('.').map(Number);
  const [h, mi, s] = time.split('.').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s, Number(ms));
}

export function tokenizeLine(rawLine, index) {
  // Strip BOM on the first line if present.
  const line = index === 0 ? rawLine.replace(/^﻿/, '') : rawLine;

  const tsMatch = TIMESTAMP_LINE_RE.exec(line);
  let ts = null;
  let frame = null;
  let body = line;

  if (tsMatch) {
    const { date, time, ms, frame: f, rest } = tsMatch.groups;
    ts = parseTimestampToMs(date, time, ms);
    frame = Number(f);
    body = rest;
  }

  const csMatch = CATEGORY_SEVERITY_RE.exec(body);
  let category = null;
  let severity = 'Display';
  let message = body;

  if (csMatch) {
    category = csMatch.groups.category;
    const sev = csMatch.groups.severity;
    severity = KNOWN_SEVERITIES.has(sev) ? sev : 'Display';
    message = csMatch.groups.message;
  }

  let compactMessage = message;
  let sourcePath = null;
  const pathMatch = compactMessage.match(SOURCE_PATH_TAIL_RE);
  if (pathMatch) {
    sourcePath = pathMatch[0].trim().slice(1, -1); // strip surrounding [ ]
    compactMessage = compactMessage.slice(0, -pathMatch[0].length);
  }
  compactMessage = compactMessage.replace(SEQ_ID_HEAD_RE, '');
  compactMessage = compactMessage.trim();

  return {
    i: index,
    ts,
    groupTs: ts,
    hasOwnTs: ts !== null,
    frame,
    category,
    severity,
    message,
    compactMessage,
    sourcePath,
    fullText: line,
  };
}

export async function parseFile(path) {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const entries = [];
  let i = 0;
  for await (const line of rl) {
    entries.push(tokenizeLine(line, i));
    i += 1;
  }

  // Pass 2 — see Task 3.
  fillTimestamps(entries);

  let min = Infinity;
  let max = -Infinity;
  for (const e of entries) {
    if (e.ts !== null) {
      if (e.ts < min) min = e.ts;
      if (e.ts > max) max = e.ts;
    }
  }

  if (min === Infinity) {
    const stats = await stat(path);
    min = stats.mtimeMs;
    max = stats.mtimeMs;
    for (const e of entries) {
      e.ts = stats.mtimeMs;
      e.groupTs = stats.mtimeMs;
    }
  }

  return { entries, min, max, totalLines: entries.length };
}

const cache = new Map();

export async function getCachedParse(path) {
  const stats = await stat(path);
  const key = path;
  const cached = cache.get(key);
  if (
    cached &&
    cached.mtimeMs === stats.mtimeMs &&
    cached.size === stats.size
  ) {
    return cached.value;
  }
  const value = await parseFile(path);
  cache.set(key, { mtimeMs: stats.mtimeMs, size: stats.size, value });
  return value;
}

export function fillTimestamps(entries) {
  const n = entries.length;
  if (n === 0) return;

  // Forward sweep — record the most recent own-timestamp seen so far.
  const prevTs = new Array(n);
  let lastTs = null;
  for (let k = 0; k < n; k++) {
    if (entries[k].hasOwnTs) lastTs = entries[k].ts;
    prevTs[k] = lastTs;
  }

  // Backward sweep — record the next own-timestamp.
  const nextTs = new Array(n);
  let nextSeen = null;
  for (let k = n - 1; k >= 0; k--) {
    if (entries[k].hasOwnTs) nextSeen = entries[k].ts;
    nextTs[k] = nextSeen;
  }

  // Fill orphans.
  for (let k = 0; k < n; k++) {
    const e = entries[k];
    if (e.hasOwnTs) continue;
    e.ts = nextTs[k] ?? prevTs[k];
    e.groupTs = prevTs[k] ?? nextTs[k];
  }
}
