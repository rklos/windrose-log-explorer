import Fuse from '/vendor/fuse.esm.min.js';
import { colorize, escapeHtml } from '/coloring.js';
import { createVirtualizer } from '/virtualizer.js';

const SEVERITY_CHIPS = [
  { key: 'verbose',  label: 'Verbose',  match: ['Verbose', 'VeryVerbose'], dot: 'var(--sev-verbose)' },
  { key: 'display',  label: 'Display',  match: ['Display', 'Log'],         dot: 'var(--sev-display)' },
  { key: 'warning',  label: 'Warning',  match: ['Warning'],                dot: 'var(--sev-warning)' },
  { key: 'error',    label: 'Error',    match: ['Error', 'Fatal'],         dot: 'var(--sev-error)' },
];

const SEV_BADGE = {
  Verbose: 'VRB',
  VeryVerbose: 'VVB',
  Display: 'DSP',
  Log: 'LOG',
  Warning: 'WRN',
  Error: 'ERR',
  Fatal: 'FTL',
};

const state = {
  meta: null,
  entries: [],
  fuse: null,
  filtered: [],
  activeSev: new Set(['display', 'warning', 'error']),
  query: '',
  full: false,
  from: null,
  to: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  fileMeta: $('file-meta'),
  stats: $('stats'),
  fromInput: $('from-input'),
  toInput: $('to-input'),
  reload: $('reload-btn'),
  chips: $('severity-chips'),
  search: $('search-input'),
  full: $('full-toggle'),
  empty: $('log-empty'),
  viewport: $('log-viewport'),
  spacer: $('log-spacer'),
  rows: $('log-rows'),
};

function isoToInputValue(iso) {
  return iso.replace(/\.\d+Z$/, '').replace(/Z$/, '');
}
function inputToIso(value) {
  if (!value) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}Z`;
}

function readUrlState() {
  const p = new URLSearchParams(location.search);
  if (p.get('from')) state.from = p.get('from');
  if (p.get('to')) state.to = p.get('to');
  if (p.get('sev')) {
    state.activeSev = new Set(p.get('sev').split(',').filter(Boolean));
  }
  if (p.get('q')) state.query = p.get('q');
  if (p.get('full') === '1') state.full = true;
}

function writeUrlState() {
  const p = new URLSearchParams();
  if (state.from) p.set('from', state.from);
  if (state.to) p.set('to', state.to);
  p.set('sev', [...state.activeSev].join(','));
  if (state.query) p.set('q', state.query);
  if (state.full) p.set('full', '1');
  history.replaceState(null, '', `?${p.toString()}`);
}

async function fetchMeta() {
  const r = await fetch('/api/log/meta');
  if (!r.ok) throw new Error(`meta ${r.status}`);
  state.meta = await r.json();

  els.fileMeta.innerHTML =
    `<div class="file-name">${escapeHtml(state.meta.file)}</div>` +
    `<div>${state.meta.totalLines.toLocaleString()} lines · ${escapeHtml(state.meta.min)} → ${escapeHtml(state.meta.max)}</div>`;

  els.fromInput.min = isoToInputValue(state.meta.min);
  els.fromInput.max = isoToInputValue(state.meta.max);
  els.toInput.min = isoToInputValue(state.meta.min);
  els.toInput.max = isoToInputValue(state.meta.max);

  if (!state.from) {
    const toMs = Date.parse(state.meta.max);
    const fromMs = toMs - 30 * 60 * 1000;
    state.from = new Date(fromMs).toISOString();
    state.to = state.meta.max;
  }
  els.fromInput.value = isoToInputValue(state.from);
  els.toInput.value = isoToInputValue(state.to);
}

async function fetchEntries() {
  els.empty.classList.remove('error');
  els.empty.textContent = 'Loading...';
  els.empty.hidden = false;
  els.viewport.hidden = true;

  const url = new URL('/api/log', location.origin);
  if (state.from) url.searchParams.set('from', state.from);
  if (state.to) url.searchParams.set('to', state.to);

  let r;
  try {
    r = await fetch(url);
  } catch (err) {
    els.empty.classList.add('error');
    els.empty.innerHTML = `Failed: ${escapeHtml(err.message)} <button class="retry" id="retry-btn">Retry</button>`;
    document.getElementById('retry-btn')?.addEventListener('click', () => runFetchAndRender());
    return;
  }

  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    els.empty.classList.add('error');
    els.empty.innerHTML = err.error
      ? `Error: ${escapeHtml(err.error)}. File covers ${escapeHtml(err.min ?? '?')} → ${escapeHtml(err.max ?? '?')}. <button class="retry" id="retry-btn">Retry</button>`
      : `Error ${r.status} <button class="retry" id="retry-btn">Retry</button>`;
    document.getElementById('retry-btn')?.addEventListener('click', () => runFetchAndRender());
    return;
  }
  const json = await r.json();
  state.entries = json.entries;
}

window.__state = state;

function severityChipKey(sev) {
  for (const chip of SEVERITY_CHIPS) {
    if (chip.match.includes(sev)) return chip.key;
  }
  return 'display';
}

function chipCounts() {
  const counts = { verbose: 0, display: 0, warning: 0, error: 0 };
  for (const e of state.entries) counts[severityChipKey(e.severity)] += 1;
  return counts;
}

function buildChips(counts) {
  els.chips.innerHTML = SEVERITY_CHIPS.map((c) => {
    const pressed = state.activeSev.has(c.key);
    const count = counts[c.key] ?? 0;
    return `<button type="button" class="chip" aria-pressed="${pressed}" data-key="${c.key}" style="--dot-color:${c.dot}; --chip-tint: rgba(232,192,104,0.06)">
      <span class="dot"></span><span>${escapeHtml(c.label)}</span><span class="count">${count.toLocaleString()}</span>
    </button>`;
  }).join('');
}

function renderStats() {
  const range = state.from && state.to
    ? `${state.from.slice(11, 19)} → ${state.to.slice(11, 19)}`
    : '—';
  els.stats.innerHTML = `
    <span class="stat"><span>LINES</span><strong>${state.entries.length.toLocaleString()}</strong></span>
    <span class="stat"><span>RANGE</span><strong>${escapeHtml(range)}</strong></span>
    <span class="stat"><span>SHOWN</span><strong>${state.filtered.length.toLocaleString()}</strong></span>
  `;
}

function renderRow(e, isExpanded) {
  const time = e.hasOwnTs ? new Date(e.ts).toISOString().slice(11, 23) : '';
  const badge = SEV_BADGE[e.severity] ?? 'DSP';
  const dotColor = `var(--sev-${e.severity.toLowerCase()}, var(--fg-secondary))`;
  const cat = e.category ? `<span class="cat">${escapeHtml(e.category)}</span>` : '';
  const msg = colorize(e.compactMessage);
  let extra = '';
  if (isExpanded) {
    const metaParts = [];
    if (e.frame !== null) metaParts.push(`frame ${e.frame}`);
    if (e.sourcePath) metaParts.push(escapeHtml(e.sourcePath));
    const meta = metaParts.length ? `<div class="meta">${metaParts.join(' · ')}</div>` : '';
    extra = `<div class="extra">${meta}<div class="raw">${escapeHtml(e.fullText)}</div></div>`;
  }
  return `
    <span class="ts">${time}</span>
    <span class="sev"><span class="dot" style="background:${dotColor}"></span>${badge}</span>
    <div class="body">${cat}<span class="msg">${msg}</span>${extra}</div>
  `;
}

const virtualizer = createVirtualizer({
  viewport: els.viewport,
  spacer: els.spacer,
  rows: els.rows,
  rowHeight: 24,
  expandedHeight: 110,
});
virtualizer.setRenderRow(renderRow);

function applyFilters() {
  const set = state.activeSev;
  const candidate = state.entries.filter((e) => set.has(severityChipKey(e.severity)));

  if (state.query) {
    if (!state.fuse || state.fuse.__candidate !== candidate) {
      state.fuse = new Fuse(candidate, {
        keys: ['compactMessage', 'category', 'fullText'],
        threshold: 0.35,
        ignoreLocation: true,
      });
      state.fuse.__candidate = candidate;
    }
    state.filtered = state.fuse.search(state.query).map((r) => r.item);
  } else {
    state.fuse = null;
    state.filtered = candidate;
  }

  if (state.filtered.length === 0) {
    els.empty.hidden = false;
    els.empty.classList.remove('error');
    els.viewport.hidden = true;
    els.empty.textContent = state.entries.length === 0
      ? `No entries in this window. File covers ${state.meta.min} → ${state.meta.max}.`
      : 'No entries match the current filters.';
  } else {
    els.empty.hidden = true;
    els.empty.classList.remove('error');
    els.viewport.hidden = false;
    virtualizer.setEntries(state.filtered);
  }
  renderStats();
}

function bindControls() {
  els.chips.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.chip');
    if (!btn) return;
    const key = btn.dataset.key;
    if (state.activeSev.has(key)) state.activeSev.delete(key);
    else state.activeSev.add(key);
    btn.setAttribute('aria-pressed', state.activeSev.has(key));
    writeUrlState();
    applyFilters();
  });

  let searchTimer;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value.trim();
      writeUrlState();
      applyFilters();
    }, 150);
  });

  els.full.addEventListener('change', () => {
    state.full = els.full.checked;
    virtualizer.setGlobalExpanded(state.full);
    writeUrlState();
  });

  els.reload.addEventListener('click', () => {
    state.from = inputToIso(els.fromInput.value);
    state.to = inputToIso(els.toInput.value);
    writeUrlState();
    runFetchAndRender();
  });
}

async function runFetchAndRender() {
  await fetchEntries();
  buildChips(chipCounts());
  applyFilters();
}

readUrlState();
els.full.checked = state.full;
els.search.value = state.query;
bindControls();

(async function bootstrap() {
  try {
    await fetchMeta();
  } catch (err) {
    els.empty.classList.add('error');
    els.empty.textContent = `Failed: ${err.message}`;
    return;
  }
  // After fetchMeta, the inputs are seeded with the default 30-min window.
  // Sync state.from/to from the inputs so the first /api/log call matches.
  state.from = inputToIso(els.fromInput.value);
  state.to = inputToIso(els.toInput.value);
  await runFetchAndRender();
  virtualizer.setGlobalExpanded(state.full);
})();
