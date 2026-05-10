const BUCKET_RULES = [
  { maxWindowMs:                  5 * 60_000, bucketMs:        5_000 },
  { maxWindowMs:                 15 * 60_000, bucketMs:       15_000 },
  { maxWindowMs:                 30 * 60_000, bucketMs:       30_000 },
  { maxWindowMs:                 60 * 60_000, bucketMs:       60_000 },
  { maxWindowMs:             3 * 60 * 60_000, bucketMs:   3 * 60_000 },
  { maxWindowMs:             6 * 60 * 60_000, bucketMs:   5 * 60_000 },
  { maxWindowMs:            12 * 60 * 60_000, bucketMs:  10 * 60_000 },
  { maxWindowMs:            24 * 60 * 60_000, bucketMs:  30 * 60_000 },
  { maxWindowMs:        2 * 24 * 60 * 60_000, bucketMs:  60 * 60_000 },
  { maxWindowMs:        3 * 24 * 60 * 60_000, bucketMs:  60 * 60_000 },
  { maxWindowMs:        7 * 24 * 60 * 60_000, bucketMs:   3 * 60 * 60_000 },
];
const FALLBACK_BUCKET_MS = 6 * 60 * 60_000;

export function chooseBucketMs(windowMs) {
  for (const rule of BUCKET_RULES) {
    if (windowMs <= rule.maxWindowMs) return rule.bucketMs;
  }
  return FALLBACK_BUCKET_MS;
}

const SEVERITY_TO_KEY = {
  Verbose: 'verbose', VeryVerbose: 'verbose',
  Display: 'display', Log: 'display',
  Warning: 'warning',
  Error: 'error', Fatal: 'error',
};

export function severityKey(severity) {
  return SEVERITY_TO_KEY[severity] ?? 'display';
}

export function bucketEntries(entries, fromMs, toMs, bucketMs) {
  if (toMs <= fromMs || bucketMs <= 0) return [];
  const startMs = Math.floor(fromMs / bucketMs) * bucketMs;
  const endMs   = Math.ceil(toMs   / bucketMs) * bucketMs;
  const count   = Math.max(1, Math.round((endMs - startMs) / bucketMs));
  const buckets = Array.from({ length: count }, (_, i) => ({
    fromMs: startMs + i * bucketMs,
    toMs:   startMs + (i + 1) * bucketMs,
    counts: { verbose: 0, display: 0, warning: 0, error: 0 },
    total: 0,
  }));
  for (const e of entries) {
    if (e.ts == null) continue;
    if (e.ts < fromMs || e.ts > toMs) continue;
    const idx = Math.floor((e.ts - startMs) / bucketMs);
    if (idx < 0 || idx >= count) continue;
    const key = severityKey(e.severity);
    buckets[idx].counts[key] += 1;
    buckets[idx].total += 1;
  }
  return buckets;
}

export function pickTickFormat(windowMs) {
  if (windowMs <=          60 * 60_000) return 'HH:MM:SS';
  if (windowMs <=     24 * 60 * 60_000) return 'HH:MM';
  if (windowMs <= 7 * 24 * 60 * 60_000) return 'MM-DD HH:MM';
  return 'MM-DD';
}

export function formatTickLabel(ms, format) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const HH = pad(d.getUTCHours());
  const MM = pad(d.getUTCMinutes());
  const SS = pad(d.getUTCSeconds());
  const month = pad(d.getUTCMonth() + 1);
  const day   = pad(d.getUTCDate());
  if (format === 'HH:MM:SS')    return `${HH}:${MM}:${SS}`;
  if (format === 'HH:MM')       return `${HH}:${MM}`;
  if (format === 'MM-DD HH:MM') return `${month}-${day} ${HH}:${MM}`;
  return `${month}-${day}`;
}

export function chooseTickPositions(buckets, desiredTickCount, formatter) {
  if (buckets.length === 0) return [];
  const step = Math.max(1, Math.round(buckets.length / Math.max(1, desiredTickCount - 1)));
  const ticks = [];
  for (let i = 0; i < buckets.length; i += step) {
    ticks.push({ index: i, label: formatter(buckets[i].fromMs) });
  }
  return ticks;
}
