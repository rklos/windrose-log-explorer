const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

const PATTERNS = [
  { re: /\[[0-9A-F]{16,}\]/g, cls: 'tok-guid' },
  { re: /https?:\/\/\S+/g, cls: 'tok-url' },
  { re: /"[^"]*"|'[^']*'/g, cls: 'tok-string' },
  { re: /\b\d+(?:\.\d+)?\b/g, cls: 'tok-number' },
];

function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];
  const sorted = ranges
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .map(([s, e]) => [s, e])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of sorted) {
    const top = merged[merged.length - 1];
    if (top && s <= top[1]) top[1] = Math.max(top[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

function tokenRegions(message) {
  const regions = [];
  for (const { re, cls } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(message)) !== null) {
      regions.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }
  regions.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const ai = PATTERNS.findIndex((p) => p.cls === a.cls);
    const bi = PATTERNS.findIndex((p) => p.cls === b.cls);
    return ai - bi;
  });
  const resolved = [];
  let pos = 0;
  for (const r of regions) {
    if (r.start < pos) continue;
    resolved.push(r);
    pos = r.end;
  }
  return resolved;
}

export function colorize(message, highlights = []) {
  const tokens = tokenRegions(message);
  const hl = mergeRanges(highlights);

  // Cut the message at every token/highlight edge so each segment is uniformly
  // wrapped (token span inside, mark outside) without producing nested spans.
  const N = message.length;
  const cuts = new Set([0, N]);
  for (const t of tokens) { cuts.add(t.start); cuts.add(t.end); }
  for (const [s, e] of hl) { cuts.add(s); cuts.add(e); }
  const sortedCuts = [...cuts].filter((b) => b >= 0 && b <= N).sort((a, b) => a - b);

  let out = '';
  for (let k = 0; k < sortedCuts.length - 1; k++) {
    const s = sortedCuts[k];
    const e = sortedCuts[k + 1];
    if (s === e) continue;
    const tok = tokens.find((r) => r.start <= s && s < r.end);
    const isHl = hl.some(([hs, he]) => hs <= s && s < he);
    let chunk = escapeHtml(message.slice(s, e));
    if (tok) chunk = `<span class="${tok.cls}">${chunk}</span>`;
    if (isHl) chunk = `<mark class="match">${chunk}</mark>`;
    out += chunk;
  }
  return out;
}

export function highlight(text, highlights = []) {
  const merged = mergeRanges(highlights);
  if (merged.length === 0) return escapeHtml(text);
  let out = '';
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out += escapeHtml(text.slice(pos, s));
    out += `<mark class="match">${escapeHtml(text.slice(s, e))}</mark>`;
    pos = e;
  }
  if (pos < text.length) out += escapeHtml(text.slice(pos));
  return out;
}
