import Fuse from '/vendor/fuse.esm.min.js';
import { colorize, escapeHtml, highlight } from '/coloring.js';
import { createVirtualizer } from '/virtualizer.js';
import {
  PRESETS,
  DEFAULT_PRESET_KEY,
  resolveSelection,
  formatTriggerLabel,
  selectionFromSearchParams,
  applySelectionToSearchParams,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from '/time-range.js';
import {
  chooseBucketMs,
  severityKey,
  bucketEntries,
  pickTickFormat,
  formatTickLabel,
  chooseTickPositions,
} from '/histogram.js';

const SEVERITY_BUCKETS = [
  { key: 'verbose',  label: 'Verbose',  match: ['Verbose', 'VeryVerbose'], dotVar: '--sev-verbose'  },
  { key: 'display',  label: 'Display',  match: ['Display', 'Log'],         dotVar: '--sev-display'  },
  { key: 'warning',  label: 'Warning',  match: ['Warning'],                dotVar: '--sev-warning'  },
  { key: 'error',    label: 'Error',    match: ['Error', 'Fatal'],         dotVar: '--sev-error'    },
];

const SEV_BADGE = {
  Verbose: 'VRB', VeryVerbose: 'VVB',
  Display: 'DSP', Log: 'LOG',
  Warning: 'WRN', Error: 'ERR', Fatal: 'FTL',
};

const $ = (id) => document.getElementById(id);
const els = {
  headStats:        $('head-stats'),
  severityTrigger:  $('severity-trigger'),
  severityLabel:    $('severity-trigger-label'),
  severityPopover:  $('severity-popover'),
  severityList:     $('severity-list'),
  sevAll:           $('sev-all'),
  sevNone:          $('sev-none'),
  sevReset:         $('sev-reset'),

  timeTrigger:      $('time-trigger'),
  timeLabel:        $('time-trigger-label'),
  timePopover:      $('time-popover'),
  presetList:       $('preset-list'),
  absFrom:          $('abs-from'),
  absTo:            $('abs-to'),
  absApply:         $('abs-apply'),
  absFileMin:       $('abs-file-min'),
  absFileMax:       $('abs-file-max'),

  reloadBtn:        $('reload-btn'),
  autoRefreshBtn:   $('auto-refresh-toggle'),

  searchInput:      $('search-input'),

  histogramPane:    $('histogram-pane'),
  histogramSvg:     $('histogram-svg'),
  histogramEmpty:   $('histogram-empty'),
  histogramTooltip: $('histogram-tooltip'),

  logEmpty:         $('log-empty'),
  logViewport:      $('log-viewport'),
  logSpacer:        $('log-spacer'),
  logRows:          $('log-rows'),

  measureHost:      $('measure-host'),
};

const state = {
  meta: null,
  entries: [],
  fuse: null,
  filtered: [],
  queryMatches: null,
  selection: { kind: 'preset', key: DEFAULT_PRESET_KEY },
  resolvedFromMs: null,
  resolvedToMs: null,
  activeSev: new Set(['display', 'warning', 'error']),
  query: '',
  autoRefreshOn: true,
  timePopoverOpen: false,
  severityPopoverOpen: false,
  histogramDragActive: false,
  fetchInFlight: false,
};

window.__state = state;

/* URL state */

function readUrlState() {
  const params = new URLSearchParams(location.search);
  state.selection = selectionFromSearchParams(params);
  if (params.get('sev')) {
    state.activeSev = new Set(params.get('sev').split(',').filter(Boolean));
  }
  if (params.get('q')) state.query = params.get('q');
  if (params.get('refresh') === 'off') state.autoRefreshOn = false;
}

function writeUrlState() {
  const params = new URLSearchParams();
  applySelectionToSearchParams(params, state.selection);
  params.set('sev', [...state.activeSev].join(','));
  if (state.query) params.set('q', state.query);
  if (!state.autoRefreshOn) params.set('refresh', 'off');
  history.replaceState(null, '', `?${params.toString()}`);
}

/* Generic dropdown shell */

function positionPopover(popover, trigger) {
  const rect = trigger.getBoundingClientRect();
  popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
  const popWidth = popover.offsetWidth || 320;
  let left = rect.right + window.scrollX - popWidth;
  if (left < 8) left = 8;
  popover.style.left = `${left}px`;
}

function createDropdown({ trigger, popover, onOpen, onClose }) {
  let open = false;

  function close() {
    if (!open) return;
    open = false;
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKey);
    onClose?.();
  }

  function openIt() {
    if (open) return;
    open = true;
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPopover(popover, trigger);
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onDocKey);
    onOpen?.();
  }

  function onDocMouseDown(ev) {
    if (popover.contains(ev.target) || trigger.contains(ev.target)) return;
    close();
  }
  function onDocKey(ev) { if (ev.key === 'Escape') close(); }

  trigger.addEventListener('click', () => (open ? close() : openIt()));
  return { open: openIt, close, isOpen: () => open };
}

/* Fetch */

async function fetchMeta() {
  const r = await fetch('/api/log/meta');
  if (!r.ok) throw new Error(`meta ${r.status}`);
  state.meta = await r.json();
  els.absFileMin.textContent = state.meta.min;
  els.absFileMax.textContent = state.meta.max;
}

function resolveActiveWindow(nowMs = Date.now()) {
  const r = resolveSelection(state.selection, nowMs);
  if (!r) return null;
  state.resolvedFromMs = r.fromMs;
  state.resolvedToMs   = r.toMs;
  return r;
}

async function fetchEntries({ keepScroll = false } = {}) {
  if (state.fetchInFlight) return;
  state.fetchInFlight = true;
  try {
    const win = resolveActiveWindow();
    if (!win) return;
    const url = new URL('/api/log', location.origin);
    url.searchParams.set('from', new Date(win.fromMs).toISOString());
    url.searchParams.set('to',   new Date(win.toMs).toISOString());

    let r;
    try {
      r = await fetch(url);
    } catch (err) {
      showFetchError(err.message);
      return;
    }
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({ error: r.statusText }));
      showFetchError(errBody.error || `Error ${r.status}`);
      return;
    }
    const json = await r.json();
    state.entries = json.entries;
    onEntriesUpdated({ keepScroll });
  } finally {
    state.fetchInFlight = false;
  }
}

function showFetchError(message) {
  els.logEmpty.hidden = false;
  els.logViewport.hidden = true;
  els.logEmpty.innerHTML = `Failed: ${escapeHtml(message)} <button class="popover-btn" id="retry-btn">Retry</button>`;
  document.getElementById('retry-btn')?.addEventListener('click', () => fetchEntries());
}

/* Severity bucket helpers */

function chipCounts(entries) {
  const counts = { verbose: 0, display: 0, warning: 0, error: 0 };
  for (const e of entries) counts[severityKey(e.severity)] += 1;
  return counts;
}

/* Row rendering */

function renderRow(e, isExpanded) {
  const time = e.hasOwnTs ? new Date(e.ts).toISOString().slice(11, 23) : '';
  const badge = SEV_BADGE[e.severity] ?? 'DSP';
  const dotColor = `var(--sev-${e.severity.toLowerCase()}, var(--fg-secondary))`;
  const matches = state.queryMatches?.get(e.i);
  const catHl = matches?.category ?? null;
  const msgHl = matches?.compactMessage ?? null;
  const fullHl = matches?.fullText ?? null;
  const cat = e.category ? `<span class="cat">${highlight(e.category, catHl)}</span>` : '';
  const msg = colorize(e.compactMessage, msgHl);
  const extra = isExpanded
    ? `<div class="extra"><div class="raw">${highlight(e.fullText, fullHl)}</div></div>`
    : '';
  return `
    <span class="chev" aria-hidden="true">›</span>
    <span class="ts">${time}</span>
    <span class="sev"><span class="dot" style="background:${dotColor}"></span>${badge}</span>
    <div class="body">${cat}<span class="msg">${msg}</span></div>
    ${extra}
  `;
}

/* Variable-height measurement */

function measureExpandedRow(entry) {
  const viewportWidth = els.logViewport.clientWidth || 1200;
  els.measureHost.style.width = `${viewportWidth}px`;
  els.measureHost.innerHTML =
    `<div class="log-row sev-${entry.severity.toLowerCase()} expanded">${renderRow(entry, true)}</div>`;
  const node = els.measureHost.firstElementChild;
  return node?.getBoundingClientRect().height ?? 110;
}

/* Virtualizer */

const virtualizer = createVirtualizer({
  viewport: els.logViewport,
  spacer: els.logSpacer,
  rows: els.logRows,
  rowHeight: 24,
  expandedHeight: 110,
  measureExpandedRow,
});
virtualizer.setRenderRow(renderRow);

/* Stats */

function renderHeadStats() {
  const fileName = state.meta?.file ?? '';
  const totalLines = state.meta?.totalLines?.toLocaleString() ?? '0';
  const shown = state.filtered.length.toLocaleString();
  els.headStats.innerHTML = `
    <span class="stat"><span>FILE</span><strong>${escapeHtml(fileName)}</strong></span>
    <span class="stat"><span>LINES</span><strong>${totalLines}</strong></span>
    <span class="stat"><span>SHOWN</span><strong>${shown}</strong></span>
  `;
}

/* Filter pipeline + entries-updated hook */

function applyFilters({ keepScroll = false } = {}) {
  const set = state.activeSev;
  const candidate = state.entries.filter((e) => set.has(severityKey(e.severity)));

  if (state.query) {
    if (!state.fuse || state.fuse.__candidate !== candidate) {
      state.fuse = new Fuse(candidate, {
        keys: ['compactMessage', 'category', 'fullText'],
        threshold: 0.35,
        ignoreLocation: true,
        includeMatches: true,
        minMatchCharLength: 2,
      });
      state.fuse.__candidate = candidate;
    }
    const results = state.fuse.search(state.query);
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
    state.fuse = null;
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

function renderEmptyHint(container) {
  const minMax = state.meta ? `${escapeHtml(state.meta.min)} → ${escapeHtml(state.meta.max)}` : '—';
  container.innerHTML = `
    <div>No entries in this window.</div>
    <div>File covers ${minMax}.</div>
    <button type="button" class="jump-link" id="jump-link">Jump to file's range</button>
  `;
  const link = container.querySelector('#jump-link');
  link?.addEventListener('click', () => {
    if (!state.meta) return;
    state.selection = { kind: 'absolute', from: state.meta.min, to: state.meta.max };
    renderTimeTrigger();
    writeUrlState();
    fetchEntries();
  });
}

function onEntriesUpdated({ keepScroll = false } = {}) {
  renderSeverityTrigger();
  renderHistogram();
  applyFilters({ keepScroll });
}

function renderSeverityTrigger() {
  const selected = SEVERITY_BUCKETS.filter((b) => state.activeSev.has(b.key));
  if (selected.length === 0) {
    els.severityLabel.textContent = 'Severity: none';
  } else if (selected.length <= 2) {
    els.severityLabel.textContent = `Severity: ${selected.map((b) => b.label).join(', ')}`;
  } else {
    els.severityLabel.textContent = `${selected.length} selected`;
  }
}
function renderTimeTrigger() {
  els.timeLabel.textContent = formatTriggerLabel(state.selection);
}

/* Bootstrap */

readUrlState();
els.searchInput.value = state.query;
els.autoRefreshBtn.setAttribute('aria-pressed', String(state.autoRefreshOn));
renderTimeTrigger();
renderSeverityTrigger();

/* Wire search + full toggle + reload button */

let searchTimer;
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.searchInput.value.trim();
    writeUrlState();
    applyFilters();
  }, 150);
});

els.reloadBtn.addEventListener('click', () => {
  fetchEntries({ keepScroll: true });
});

/* Severity multiselect controller */

function renderSeverityList() {
  const counts = chipCounts(state.entries);
  els.severityList.innerHTML = SEVERITY_BUCKETS.map((b) => {
    const checked = state.activeSev.has(b.key);
    return `
      <li role="option" aria-checked="${checked}" data-key="${b.key}" tabindex="0">
        <span class="checkbox" aria-hidden="true"></span>
        <span class="sev-dot" style="--dot-color: var(${b.dotVar})" aria-hidden="true"></span>
        <span class="sev-name">${escapeHtml(b.label)}</span>
        <span class="sev-count">${(counts[b.key] ?? 0).toLocaleString()}</span>
      </li>
    `;
  }).join('');
}

const severityDropdown = createDropdown({
  trigger: els.severityTrigger,
  popover: els.severityPopover,
  onOpen: () => {
    state.severityPopoverOpen = true;
    renderSeverityList();
  },
  onClose: () => { state.severityPopoverOpen = false; },
});

els.severityList.addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-key]');
  if (!li) return;
  const key = li.dataset.key;
  if (state.activeSev.has(key)) state.activeSev.delete(key);
  else state.activeSev.add(key);
  li.setAttribute('aria-checked', String(state.activeSev.has(key)));
  renderSeverityTrigger();
  writeUrlState();
  applyFilters();
});

els.sevAll.addEventListener('click', () => {
  state.activeSev = new Set(SEVERITY_BUCKETS.map((b) => b.key));
  renderSeverityList();
  renderSeverityTrigger();
  writeUrlState();
  applyFilters();
});
els.sevNone.addEventListener('click', () => {
  state.activeSev = new Set();
  renderSeverityList();
  renderSeverityTrigger();
  writeUrlState();
  applyFilters();
});
els.sevReset.addEventListener('click', () => {
  state.activeSev = new Set(['display', 'warning', 'error']);
  renderSeverityList();
  renderSeverityTrigger();
  writeUrlState();
  applyFilters();
});

/* Time-range picker controller */

function renderPresetList() {
  const activeKey = state.selection.kind === 'preset' ? state.selection.key : null;
  els.presetList.innerHTML = PRESETS.map((p) => `
    <li role="option" data-key="${p.key}" aria-current="${activeKey === p.key}">${escapeHtml(p.label)}</li>
  `).join('');
}

function syncAbsoluteInputsFromSelection() {
  const fromIso = state.resolvedFromMs != null ? new Date(state.resolvedFromMs).toISOString() : '';
  const toIso   = state.resolvedToMs   != null ? new Date(state.resolvedToMs  ).toISOString() : '';
  els.absFrom.value = fromIso ? isoToDatetimeLocalValue(fromIso) : '';
  els.absTo.value   = toIso   ? isoToDatetimeLocalValue(toIso)   : '';
}

const timeDropdown = createDropdown({
  trigger: els.timeTrigger,
  popover: els.timePopover,
  onOpen: () => {
    state.timePopoverOpen = true;
    renderPresetList();
    syncAbsoluteInputsFromSelection();
  },
  onClose: () => { state.timePopoverOpen = false; },
});

els.presetList.addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-key]');
  if (!li) return;
  state.selection = { kind: 'preset', key: li.dataset.key };
  renderTimeTrigger();
  writeUrlState();
  timeDropdown.close();
  fetchEntries();
});

els.absApply.addEventListener('click', () => {
  const fromIso = datetimeLocalValueToIso(els.absFrom.value);
  const toIso   = datetimeLocalValueToIso(els.absTo.value);
  if (!fromIso || !toIso) return;
  state.selection = { kind: 'absolute', from: fromIso, to: toIso };
  renderTimeTrigger();
  writeUrlState();
  timeDropdown.close();
  fetchEntries();
});

/* Histogram controller */

const HISTOGRAM_HEIGHT = 96;
const HISTOGRAM_AXIS_HEIGHT = 16;
const HISTOGRAM_PAD_LEFT = 6;
const HISTOGRAM_PAD_RIGHT = 6;
const HISTOGRAM_PAD_TOP = 4;
const SEVERITY_RENDER_ORDER = ['error', 'warning', 'display', 'verbose'];
const TICK_TARGET = 6;

let histogramBuckets = [];
let histogramBucketMs = 0;

function renderHistogram() {
  const fromMs = state.resolvedFromMs;
  const toMs   = state.resolvedToMs;
  if (fromMs == null || toMs == null) return;

  const windowMs = Math.max(1, toMs - fromMs);
  histogramBucketMs = chooseBucketMs(windowMs);
  histogramBuckets = bucketEntries(state.entries, fromMs, toMs, histogramBucketMs);

  const totalCount = histogramBuckets.reduce((s, b) => s + b.total, 0);
  if (totalCount === 0) {
    els.histogramSvg.innerHTML = '';
    els.histogramEmpty.textContent = 'No data';
    els.histogramEmpty.hidden = false;
    return;
  }
  els.histogramEmpty.hidden = true;

  const svg = els.histogramSvg;
  const width  = svg.clientWidth || 1000;
  const height = HISTOGRAM_HEIGHT;
  const chartTop = HISTOGRAM_PAD_TOP;
  const chartHeight = height - HISTOGRAM_AXIS_HEIGHT - chartTop;
  const chartLeft = HISTOGRAM_PAD_LEFT;
  const chartWidth = width - HISTOGRAM_PAD_LEFT - HISTOGRAM_PAD_RIGHT;

  const maxTotal = Math.max(1, ...histogramBuckets.map((b) => b.total));
  const barW = chartWidth / histogramBuckets.length;

  const tickFormat = pickTickFormat(windowMs);
  const ticks = chooseTickPositions(histogramBuckets, TICK_TARGET, (ms) => formatTickLabel(ms, tickFormat));

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  let bars = '';
  for (let i = 0; i < histogramBuckets.length; i++) {
    const b = histogramBuckets[i];
    const x = chartLeft + i * barW;
    let y = chartTop + chartHeight;
    for (const sev of SEVERITY_RENDER_ORDER) {
      const c = b.counts[sev];
      if (c <= 0) continue;
      const segH = (c / maxTotal) * chartHeight;
      y -= segH;
      bars += `<rect class="bar-${sev}" data-bucket="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(0, barW - 1).toFixed(2)}" height="${segH.toFixed(2)}"></rect>`;
    }
  }

  let yLabels = '';
  yLabels += `<text class="y-label" x="6" y="${chartTop + 10}">${maxTotal}</text>`;
  yLabels += `<text class="y-label" x="6" y="${chartTop + chartHeight - 2}">0</text>`;

  let tickMarks = '';
  for (const t of ticks) {
    const x = chartLeft + (t.index + 0.5) * barW;
    tickMarks += `<text class="axis-label" x="${x.toFixed(2)}" y="${height - 4}" text-anchor="middle">${escapeHtml(t.label)}</text>`;
  }

  const selectionRect = `<rect class="selection-rect" id="selection-rect" x="0" y="${chartTop}" width="0" height="${chartHeight}" visibility="hidden"></rect>`;

  svg.innerHTML = bars + yLabels + tickMarks + selectionRect;
}

/* Drag-to-zoom */

let dragStart = null;

function bucketIndexFromEvent(ev) {
  const rect = els.histogramSvg.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const chartLeft = HISTOGRAM_PAD_LEFT;
  const chartWidth = rect.width - HISTOGRAM_PAD_LEFT - HISTOGRAM_PAD_RIGHT;
  const xInChart = Math.max(0, Math.min(chartWidth, x - chartLeft));
  const barW = chartWidth / histogramBuckets.length;
  const idx = Math.min(histogramBuckets.length - 1, Math.floor(xInChart / barW));
  return idx;
}

function setSelectionRect(startIdx, endIdx) {
  const rectEl = els.histogramSvg.querySelector('#selection-rect');
  if (!rectEl) return;
  if (startIdx == null || endIdx == null) {
    rectEl.setAttribute('visibility', 'hidden');
    return;
  }
  const rect = els.histogramSvg.getBoundingClientRect();
  const chartWidth = rect.width - HISTOGRAM_PAD_LEFT - HISTOGRAM_PAD_RIGHT;
  const barW = chartWidth / histogramBuckets.length;
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const x = HISTOGRAM_PAD_LEFT + lo * barW;
  const w = (hi - lo + 1) * barW;
  rectEl.removeAttribute('visibility');
  rectEl.setAttribute('x', x.toFixed(2));
  rectEl.setAttribute('width', w.toFixed(2));
}

els.histogramSvg.addEventListener('mousedown', (ev) => {
  if (histogramBuckets.length === 0) return;
  if (ev.button !== 0) return;
  dragStart = bucketIndexFromEvent(ev);
  state.histogramDragActive = true;
  setSelectionRect(dragStart, dragStart);
  ev.preventDefault();
});

window.addEventListener('mousemove', (ev) => {
  if (dragStart == null) return;
  const cur = bucketIndexFromEvent(ev);
  setSelectionRect(dragStart, cur);
});

window.addEventListener('mouseup', (ev) => {
  if (dragStart == null) return;
  const end = bucketIndexFromEvent(ev);
  const lo = Math.min(dragStart, end);
  const hi = Math.max(dragStart, end);
  dragStart = null;
  state.histogramDragActive = false;
  setSelectionRect(null, null);

  const fromMs = histogramBuckets[lo].fromMs;
  const toMs   = histogramBuckets[hi].toMs;
  state.selection = {
    kind: 'absolute',
    from: new Date(fromMs).toISOString(),
    to:   new Date(toMs).toISOString(),
  };
  renderTimeTrigger();
  writeUrlState();
  fetchEntries();
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && dragStart != null) {
    dragStart = null;
    state.histogramDragActive = false;
    setSelectionRect(null, null);
  }
});

/* Tooltip */

els.histogramSvg.addEventListener('mousemove', (ev) => {
  if (histogramBuckets.length === 0 || state.resolvedFromMs == null || state.resolvedToMs == null) {
    els.histogramTooltip.hidden = true;
    return;
  }
  const idx = bucketIndexFromEvent(ev);
  const b = histogramBuckets[idx];
  if (!b) {
    els.histogramTooltip.hidden = true;
    return;
  }
  const tickFormat = pickTickFormat(state.resolvedToMs - state.resolvedFromMs);
  const headerText = `${formatTickLabel(b.fromMs, tickFormat)} → ${formatTickLabel(b.toMs, tickFormat)}`;
  els.histogramTooltip.innerHTML = `
    <div class="header">${escapeHtml(headerText)}</div>
    <div class="row"><span class="dot" style="--dot-color: var(--sev-error)"></span><span class="name">Error</span><span class="count">${b.counts.error}</span></div>
    <div class="row"><span class="dot" style="--dot-color: var(--sev-warning)"></span><span class="name">Warning</span><span class="count">${b.counts.warning}</span></div>
    <div class="row"><span class="dot" style="--dot-color: var(--sev-display)"></span><span class="name">Display</span><span class="count">${b.counts.display}</span></div>
    <div class="row"><span class="dot" style="--dot-color: var(--sev-verbose)"></span><span class="name">Verbose</span><span class="count">${b.counts.verbose}</span></div>
  `;
  const paneRect = els.histogramPane.getBoundingClientRect();
  els.histogramTooltip.hidden = false;
  const tipW = els.histogramTooltip.offsetWidth || 180;
  let left = ev.clientX - paneRect.left + 12;
  if (left + tipW > paneRect.width) left = ev.clientX - paneRect.left - tipW - 12;
  els.histogramTooltip.style.left = `${Math.max(0, left)}px`;
  els.histogramTooltip.style.top  = `4px`;
});

els.histogramSvg.addEventListener('mouseleave', () => {
  els.histogramTooltip.hidden = true;
});

window.addEventListener('resize', () => {
  if (state.entries.length > 0) renderHistogram();
});

/* Auto-refresh driver */

const AUTO_REFRESH_INTERVAL_MS = 5000;
let autoRefreshTimer = null;

function shouldSkipTick() {
  if (!state.autoRefreshOn) return true;
  if (document.visibilityState !== 'visible') return true;
  if (state.timePopoverOpen) return true;
  if (state.severityPopoverOpen) return true;
  if (state.histogramDragActive) return true;
  if (state.fetchInFlight) return true;
  return false;
}

async function autoRefreshTick() {
  if (shouldSkipTick()) return;
  await fetchEntries({ keepScroll: true });
}

function startAutoRefresh() {
  if (autoRefreshTimer != null) return;
  autoRefreshTimer = setInterval(autoRefreshTick, AUTO_REFRESH_INTERVAL_MS);
}
function stopAutoRefresh() {
  if (autoRefreshTimer == null) return;
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
}

els.autoRefreshBtn.addEventListener('click', () => {
  state.autoRefreshOn = !state.autoRefreshOn;
  els.autoRefreshBtn.setAttribute('aria-pressed', String(state.autoRefreshOn));
  writeUrlState();
  if (state.autoRefreshOn) startAutoRefresh();
  else stopAutoRefresh();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.autoRefreshOn) {
    autoRefreshTick();
  }
});

if (state.autoRefreshOn) startAutoRefresh();

(async function bootstrap() {
  try {
    await fetchMeta();
  } catch (err) {
    els.logEmpty.textContent = `Failed: ${err.message}`;
    return;
  }
  await fetchEntries();
})();
