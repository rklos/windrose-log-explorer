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
    for (const m of message.matchAll(re)) {
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

function tokenSpan(cls, child) {
  const span = document.createElement('span');
  span.className = cls;
  span.append(child);
  return span;
}

function matchMark(child) {
  const mark = document.createElement('mark');
  mark.className = 'match';
  mark.append(child);
  return mark;
}

export function colorize(message, highlights = []) {
  const tokens = tokenRegions(message);
  const hl = mergeRanges(highlights);

  // Cut the message at every token/highlight edge so each segment is wrapped
  // uniformly (token span inside, mark outside) without nested spans.
  const N = message.length;
  const cuts = new Set([0, N]);
  for (const t of tokens) { cuts.add(t.start); cuts.add(t.end); }
  for (const [s, e] of hl) { cuts.add(s); cuts.add(e); }
  const sortedCuts = [...cuts].filter((b) => b >= 0 && b <= N).sort((a, b) => a - b);

  const frag = document.createDocumentFragment();
  for (let k = 0; k < sortedCuts.length - 1; k++) {
    const s = sortedCuts[k];
    const e = sortedCuts[k + 1];
    if (s === e) continue;
    const tok = tokens.find((r) => r.start <= s && s < r.end);
    const isHl = hl.some(([hs, he]) => hs <= s && s < he);

    let node = document.createTextNode(message.slice(s, e));
    if (tok) node = tokenSpan(tok.cls, node);
    if (isHl) node = matchMark(node);
    frag.append(node);
  }
  return frag;
}

export function highlight(text, highlights = []) {
  const merged = mergeRanges(highlights);
  const frag = document.createDocumentFragment();
  if (merged.length === 0) {
    frag.append(document.createTextNode(text));
    return frag;
  }
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) frag.append(document.createTextNode(text.slice(pos, s)));
    frag.append(matchMark(document.createTextNode(text.slice(s, e))));
    pos = e;
  }
  if (pos < text.length) frag.append(document.createTextNode(text.slice(pos)));
  return frag;
}
