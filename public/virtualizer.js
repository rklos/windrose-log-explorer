// Fixed-row-height windowing. Caller supplies a renderRow(entry, isExpanded) -> string of HTML.
// Per-row expansion state lets a row use the expanded height instead of compact.

export function createVirtualizer({ viewport, spacer, rows, rowHeight, expandedHeight, overscan = 6 }) {
  let entries = [];
  const expanded = new Set();
  let globalExpanded = false;

  let renderRow = () => '';
  let onRowToggle = () => {};

  function rowH(entry) {
    return globalExpanded || expanded.has(entry.i) ? expandedHeight : rowHeight;
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

  function render() {
    if (entries.length === 0) {
      rows.innerHTML = '';
      return;
    }
    const scrollTop = viewport.scrollTop;
    const viewportH = viewport.clientHeight;
    const start = Math.max(0, findFirstVisible(scrollTop) - overscan);
    const end = Math.min(entries.length, findFirstVisible(scrollTop + viewportH) + overscan);

    let html = '';
    for (let k = start; k < end; k++) {
      const top = offsets[k];
      const e = entries[k];
      const isExpanded = globalExpanded || expanded.has(e.i);
      html += '<div class="log-row sev-' + e.severity.toLowerCase() + (isExpanded ? ' expanded' : '') + '" style="top:' + top + 'px;height:' + rowH(e) + 'px" data-idx="' + e.i + '">' + renderRow(e, isExpanded) + '</div>';
    }
    rows.innerHTML = html;
  }

  function recompute() {
    offsets = buildOffsets();
    spacer.style.height = (offsets[entries.length] ?? 0) + 'px';
    render();
  }

  viewport.addEventListener('scroll', render, { passive: true });
  rows.addEventListener('click', (ev) => {
    const row = ev.target.closest('.log-row');
    if (!row) return;
    const idx = Number(row.dataset.idx);
    if (expanded.has(idx)) expanded.delete(idx);
    else expanded.add(idx);
    onRowToggle(idx);
    recompute();
  });

  return {
    setEntries(next) {
      entries = next;
      expanded.clear();
      viewport.scrollTop = 0;
      recompute();
    },
    setRenderRow(fn) { renderRow = fn; recompute(); },
    setOnRowToggle(fn) { onRowToggle = fn; },
    setGlobalExpanded(flag) { globalExpanded = !!flag; recompute(); },
    rerender() { recompute(); },
  };
}
