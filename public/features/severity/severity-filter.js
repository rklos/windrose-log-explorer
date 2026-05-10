import { state, SEVERITY_BUCKETS } from '../../common/state.js';
import { els } from '../../common/dom.js';
import { writeUrlState } from '../../common/url-state.js';
import { createDropdown } from '../../common/dropdown.js';
import { severityKey } from '../histogram/histogram.js';

let onChange = () => {};

function chipCounts(entries) {
  const counts = { verbose: 0, display: 0, warning: 0, error: 0 };
  for (const e of entries) counts[severityKey(e.severity)] += 1;
  return counts;
}

function buildSeverityItem(bucket, checked, count) {
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.setAttribute('aria-checked', String(checked));
  li.dataset.key = bucket.key;
  li.tabIndex = 0;

  const checkbox = document.createElement('span');
  checkbox.className = 'checkbox';
  checkbox.setAttribute('aria-hidden', 'true');

  const dot = document.createElement('span');
  dot.className = 'sev-dot';
  dot.style.setProperty('--dot-color', `var(${bucket.dotVar})`);
  dot.setAttribute('aria-hidden', 'true');

  const name = document.createElement('span');
  name.className = 'sev-name';
  name.textContent = bucket.label;

  const countEl = document.createElement('span');
  countEl.className = 'sev-count';
  countEl.textContent = (count ?? 0).toLocaleString();

  li.append(checkbox, dot, name, countEl);
  return li;
}

export function renderSeverityList() {
  const counts = chipCounts(state.entries);
  els.severityList.replaceChildren(
    ...SEVERITY_BUCKETS.map((b) =>
      buildSeverityItem(b, state.activeSev.has(b.key), counts[b.key]),
    ),
  );
}

export function renderSeverityTrigger() {
  const selected = SEVERITY_BUCKETS.filter((b) => state.activeSev.has(b.key));
  if (selected.length === 0) {
    els.severityLabel.textContent = 'Severity: none';
  } else if (selected.length <= 2) {
    els.severityLabel.textContent = `Severity: ${selected.map((b) => b.label).join(', ')}`;
  } else {
    els.severityLabel.textContent = `${selected.length} selected`;
  }
}

export function initSeverityFilter({ onChange: cb } = {}) {
  onChange = cb ?? (() => {});

  createDropdown({
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
    onChange();
  });

  els.sevAll.addEventListener('click', () => {
    state.activeSev = new Set(SEVERITY_BUCKETS.map((b) => b.key));
    renderSeverityList();
    renderSeverityTrigger();
    writeUrlState();
    onChange();
  });
  els.sevNone.addEventListener('click', () => {
    state.activeSev = new Set();
    renderSeverityList();
    renderSeverityTrigger();
    writeUrlState();
    onChange();
  });
  els.sevReset.addEventListener('click', () => {
    state.activeSev = new Set(['display', 'warning', 'error']);
    renderSeverityList();
    renderSeverityTrigger();
    writeUrlState();
    onChange();
  });
}
