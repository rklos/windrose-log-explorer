import { state } from './state.js';
import { els } from './dom.js';
import { writeUrlState } from './url-state.js';
import { fetchEntries } from './api.js';
import { renderTimeTrigger } from './time-picker.js';
import {
  chooseBucketMs,
  bucketEntries,
  pickTickFormat,
  formatTickLabel,
  chooseTickPositions,
} from '/histogram.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HISTOGRAM_HEIGHT = 96;
const HISTOGRAM_AXIS_HEIGHT = 16;
const HISTOGRAM_PAD_LEFT = 6;
const HISTOGRAM_PAD_RIGHT = 6;
const HISTOGRAM_PAD_TOP = 4;
const SEVERITY_RENDER_ORDER = ['error', 'warning', 'display', 'verbose'];
const TICK_TARGET = 6;

let histogramBuckets = [];
let histogramBucketMs = 0;
let dragStart = null;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function renderHistogram() {
  const fromMs = state.resolvedFromMs;
  const toMs   = state.resolvedToMs;
  if (fromMs == null || toMs == null) return;

  const windowMs = Math.max(1, toMs - fromMs);
  histogramBucketMs = chooseBucketMs(windowMs);
  histogramBuckets = bucketEntries(state.entries, fromMs, toMs, histogramBucketMs);

  const totalCount = histogramBuckets.reduce((s, b) => s + b.total, 0);
  if (totalCount === 0) {
    els.histogramSvg.replaceChildren();
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

  const children = [];

  for (let i = 0; i < histogramBuckets.length; i++) {
    const b = histogramBuckets[i];
    const x = chartLeft + i * barW;
    let y = chartTop + chartHeight;
    for (const sev of SEVERITY_RENDER_ORDER) {
      const c = b.counts[sev];
      if (c <= 0) continue;
      const segH = (c / maxTotal) * chartHeight;
      y -= segH;
      children.push(svgEl('rect', {
        class: `bar-${sev}`,
        'data-bucket': String(i),
        x: x.toFixed(2),
        y: y.toFixed(2),
        width: Math.max(0, barW - 1).toFixed(2),
        height: segH.toFixed(2),
      }));
    }
  }

  const yMax = svgEl('text', { class: 'y-label', x: '6', y: String(chartTop + 10) });
  yMax.textContent = String(maxTotal);
  children.push(yMax);

  const yMin = svgEl('text', { class: 'y-label', x: '6', y: String(chartTop + chartHeight - 2) });
  yMin.textContent = '0';
  children.push(yMin);

  for (const t of ticks) {
    const x = chartLeft + (t.index + 0.5) * barW;
    const tick = svgEl('text', {
      class: 'axis-label',
      x: x.toFixed(2),
      y: String(height - 4),
      'text-anchor': 'middle',
    });
    tick.textContent = t.label;
    children.push(tick);
  }

  children.push(svgEl('rect', {
    class: 'selection-rect',
    id: 'selection-rect',
    x: '0',
    y: String(chartTop),
    width: '0',
    height: String(chartHeight),
    visibility: 'hidden',
  }));

  svg.replaceChildren(...children);
}

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

function buildTooltipRow(sev, label, count) {
  const row = document.createElement('div');
  row.className = 'row';

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.setProperty('--dot-color', `var(--sev-${sev})`);

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = label;

  const countEl = document.createElement('span');
  countEl.className = 'count';
  countEl.textContent = String(count);

  row.append(dot, name, countEl);
  return row;
}

function renderTooltip(bucket, headerText) {
  const header = document.createElement('div');
  header.className = 'header';
  header.textContent = headerText;

  els.histogramTooltip.replaceChildren(
    header,
    buildTooltipRow('error',   'Error',   bucket.counts.error),
    buildTooltipRow('warning', 'Warning', bucket.counts.warning),
    buildTooltipRow('display', 'Display', bucket.counts.display),
    buildTooltipRow('verbose', 'Verbose', bucket.counts.verbose),
  );
}

export function initHistogramView() {
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
    renderTooltip(b, headerText);
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
}
