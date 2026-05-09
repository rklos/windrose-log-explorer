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

export function colorize(message) {
  // Collect all match regions from the raw string, in order, across all patterns.
  // Run patterns on the raw message so quotes/numbers are found before HTML escaping.
  const regions = [];
  for (const { re, cls } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(message)) !== null) {
      regions.push({ start: m.index, end: m.index + m[0].length, match: m[0], cls });
    }
  }

  // Sort by start position; earlier wins (first pattern in list wins ties via stable sort).
  regions.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const ai = PATTERNS.findIndex((p) => p.cls === a.cls);
    const bi = PATTERNS.findIndex((p) => p.cls === b.cls);
    return ai - bi;
  });

  // Walk the raw message, skipping overlapping regions.
  let out = '';
  let pos = 0;
  for (const r of regions) {
    if (r.start < pos) continue; // overlapping — skip
    out += escapeHtml(message.slice(pos, r.start));
    out += `<span class="${r.cls}">${escapeHtml(r.match)}</span>`;
    pos = r.end;
  }
  out += escapeHtml(message.slice(pos));
  return out;
}
