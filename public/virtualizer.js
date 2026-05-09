export function createVirtualizer({
  viewport, spacer, rows,
  rowHeight, expandedHeight,
  overscan = 6,
  measureExpandedRow = null,
}) {
  let entries = [];
  const expanded = new Set();
  // Keyed by entry.i (stable source-file line index). Never evicted: a given
  // log line's expanded height is stable, so it survives setEntries() across refetches.
  const heightCache = new Map();

  let renderRow = () => document.createDocumentFragment();
  let onRowToggle = () => {};

  function rowH(entry) {
    if (!expanded.has(entry.i)) return rowHeight;
    const cached = heightCache.get(entry.i);
    if (cached != null) return cached;
    if (measureExpandedRow) {
      const h = Math.ceil(measureExpandedRow(entry));
      if (Number.isFinite(h) && h > 0) {
        heightCache.set(entry.i, h);
        return h;
      }
    }
    return expandedHeight;
  }

  let offsets = [0];

  function buildOffsets() {
    const next = new Array(entries.length + 1);
    next[0] = 0;
    for (let k = 0; k < entries.length; k++) {
      next[k + 1] = next[k] + rowH(entries[k]);
    }
    return next;
  }

  function findFirstVisible(scrollTop) {
    let lo = 0;
    let hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid + 1] <= scrollTop) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function buildRow(entry, top) {
    const isExpanded = expanded.has(entry.i);
    const wrapper = document.createElement('div');
    wrapper.className = 'log-row sev-' + entry.severity.toLowerCase() + (isExpanded ? ' expanded' : '');
    wrapper.tabIndex = 0;
    wrapper.style.top = top + 'px';
    wrapper.style.height = rowH(entry) + 'px';
    wrapper.dataset.idx = String(entry.i);
    wrapper.append(renderRow(entry, isExpanded));
    return wrapper;
  }

  function render() {
    if (entries.length === 0) {
      rows.replaceChildren();
      return;
    }
    const scrollTop = viewport.scrollTop;
    const viewportH = viewport.clientHeight;
    const start = Math.max(0, findFirstVisible(scrollTop) - overscan);
    const end   = Math.min(entries.length, findFirstVisible(scrollTop + viewportH) + overscan);

    const visible = [];
    for (let k = start; k < end; k++) {
      visible.push(buildRow(entries[k], offsets[k]));
    }
    rows.replaceChildren(...visible);
  }

  function recompute() {
    offsets = buildOffsets();
    spacer.style.height = (offsets[entries.length] ?? 0) + 'px';
    render();
  }

  viewport.addEventListener('scroll', render, { passive: true });
  function toggleRowAt(row) {
    const idx = Number(row.dataset.idx);
    if (expanded.has(idx)) expanded.delete(idx);
    else expanded.add(idx);
    onRowToggle(idx);
    recompute();
  }

  rows.addEventListener('click', (ev) => {
    const row = ev.target.closest('.log-row');
    if (!row) return;
    toggleRowAt(row);
  });

  rows.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const row = ev.target.closest('.log-row');
    if (!row) return;
    ev.preventDefault();
    toggleRowAt(row);
  });

  return {
    setEntries(next, { keepScroll = false } = {}) {
      entries = next;
      if (!keepScroll) {
        expanded.clear();
        viewport.scrollTop = 0;
      }
      recompute();
    },
    setRenderRow(fn) { renderRow = fn; recompute(); },
    setOnRowToggle(fn) { onRowToggle = fn; },
    rerender() { recompute(); },
  };
}
