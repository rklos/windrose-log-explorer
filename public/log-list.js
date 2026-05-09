import Fuse from '/vendor/fuse.esm.min.js';
import { state, SEV_BADGE } from './state.js';
import { els } from './dom.js';
import { writeUrlState } from './url-state.js';
import { fetchEntries } from './api.js';
import { renderSeverityTrigger } from './severity-filter.js';
import { renderTimeTrigger } from './time-picker.js';
import { renderHistogram } from './histogram-view.js';
import { colorize, highlight } from '/coloring.js';
import { createVirtualizer } from '/virtualizer.js';
import { severityKey } from '/histogram.js';

let virtualizer = null;

// Fuse cache: rebuild only when the candidate set actually changed.
// Keyed by state.entries reference + activeSev set contents.
let fuseInstance = null;
let fuseEntriesRef = null;
let fuseSevKey = null;

function buildSevSpan(entry) {
  const sev = document.createElement('span');
  sev.className = 'sev';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = `var(--sev-${entry.severity.toLowerCase()}, var(--fg-secondary))`;
  sev.append(dot, document.createTextNode(SEV_BADGE[entry.severity] ?? 'DSP'));
  return sev;
}

function buildBody(entry, matches) {
  const body = document.createElement('div');
  body.className = 'body';
  if (entry.category) {
    const cat = document.createElement('span');
    cat.className = 'cat';
    cat.append(highlight(entry.category, matches?.category ?? null));
    body.append(cat);
  }
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.append(colorize(entry.compactMessage, matches?.compactMessage ?? null));
  body.append(msg);
  return body;
}

function renderRow(entry, isExpanded) {
  const matches = state.queryMatches?.get(entry.i);
  const frag = document.createDocumentFragment();

  const chev = document.createElement('span');
  chev.className = 'chev';
  chev.setAttribute('aria-hidden', 'true');
  chev.textContent = '›';

  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = entry.hasOwnTs ? new Date(entry.ts).toISOString().slice(11, 23) : '';

  frag.append(chev, ts, buildSevSpan(entry), buildBody(entry, matches));

  if (isExpanded) {
    const extra = document.createElement('div');
    extra.className = 'extra';
    const raw = document.createElement('div');
    raw.className = 'raw';
    raw.append(highlight(entry.fullText, matches?.fullText ?? null));
    extra.append(raw);
    frag.append(extra);
  }

  return frag;
}

function measureExpandedRow(entry) {
  const viewportWidth = els.logViewport.clientWidth || 1200;
  els.measureHost.style.width = `${viewportWidth}px`;
  const wrapper = document.createElement('div');
  wrapper.className = `log-row sev-${entry.severity.toLowerCase()} expanded`;
  wrapper.append(renderRow(entry, true));
  els.measureHost.replaceChildren(wrapper);
  return wrapper.getBoundingClientRect().height ?? 110;
}

function statSpan(label, value) {
  const span = document.createElement('span');
  span.className = 'stat';
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  const valueEl = document.createElement('strong');
  valueEl.textContent = value;
  span.append(labelEl, valueEl);
  return span;
}

export function renderHeadStats() {
  const fileName = state.meta?.file ?? '';
  const totalLines = state.meta?.totalLines?.toLocaleString() ?? '0';
  const shown = state.filtered.length.toLocaleString();
  els.headStats.replaceChildren(
    statSpan('FILE', fileName),
    statSpan('LINES', totalLines),
    statSpan('SHOWN', shown),
  );
}

function renderEmptyHint(container) {
  const minMax = state.meta ? `${state.meta.min} → ${state.meta.max}` : '—';
  const line1 = document.createElement('div');
  line1.textContent = 'No entries in this window.';
  const line2 = document.createElement('div');
  line2.textContent = `File covers ${minMax}.`;
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'jump-link';
  link.textContent = "Jump to file's range";
  link.addEventListener('click', () => {
    if (!state.meta) return;
    state.selection = { kind: 'absolute', from: state.meta.min, to: state.meta.max };
    renderTimeTrigger();
    writeUrlState();
    fetchEntries();
  });
  container.replaceChildren(line1, line2, link);
}

export function applyFilters({ keepScroll = false } = {}) {
  const set = state.activeSev;
  const candidate = state.entries.filter((e) => set.has(severityKey(e.severity)));

  if (state.query) {
    const sevKey = [...set].sort().join('|');
    if (!fuseInstance || fuseEntriesRef !== state.entries || fuseSevKey !== sevKey) {
      fuseInstance = new Fuse(candidate, {
        keys: ['compactMessage', 'category', 'fullText'],
        threshold: 0.35,
        ignoreLocation: true,
        includeMatches: true,
        minMatchCharLength: 2,
      });
      fuseEntriesRef = state.entries;
      fuseSevKey = sevKey;
    }
    const results = fuseInstance.search(state.query);
    state.queryMatches = new Map();
    state.filtered = results.map((r) => {
      const byKey = {};
      for (const m of r.matches ?? []) {
        // Fuse indices are inclusive [start, end]; convert to [start, endExclusive).
        byKey[m.key] = m.indices.map(([s, e]) => [s, e + 1]);
      }
      state.queryMatches.set(r.item.i, byKey);
      return r.item;
    });
  } else {
    state.queryMatches = null;
    state.filtered = candidate;
  }

  if (state.filtered.length === 0) {
    els.logViewport.hidden = true;
    els.logEmpty.hidden = false;
    renderEmptyHint(els.logEmpty);
  } else {
    els.logEmpty.hidden = true;
    els.logViewport.hidden = false;
    virtualizer.setEntries(state.filtered, { keepScroll });
  }
  renderHeadStats();
}

export function onEntriesUpdated({ keepScroll = false } = {}) {
  renderSeverityTrigger();
  renderHistogram();
  applyFilters({ keepScroll });
}

export function initLogList() {
  virtualizer = createVirtualizer({
    viewport: els.logViewport,
    spacer: els.logSpacer,
    rows: els.logRows,
    rowHeight: 24,
    expandedHeight: 110,
    measureExpandedRow,
  });
  virtualizer.setRenderRow(renderRow);

  let searchTimer;
  els.searchInput.addEventListener('input', () => {
    els.searchSpinner.hidden = false;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.searchInput.value.trim();
      writeUrlState();
      requestAnimationFrame(() => {
        applyFilters();
        els.searchSpinner.hidden = true;
      });
    }, 250);
  });

  els.reloadBtn.addEventListener('click', () => {
    fetchEntries({ keepScroll: true });
  });
}
