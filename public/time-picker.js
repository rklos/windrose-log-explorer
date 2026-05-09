import { state } from './state.js';
import { els } from './dom.js';
import { writeUrlState } from './url-state.js';
import { createDropdown } from './dropdown.js';
import { fetchEntries } from './api.js';
import {
  PRESETS,
  formatTriggerLabel,
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from '/time-range.js';

export function renderTimeTrigger() {
  els.timeLabel.textContent = formatTriggerLabel(state.selection);
}

function renderPresetList() {
  const activeKey = state.selection.kind === 'preset' ? state.selection.key : null;
  els.presetList.replaceChildren(
    ...PRESETS.map((p) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.key = p.key;
      li.setAttribute('aria-current', String(activeKey === p.key));
      li.textContent = p.label;
      return li;
    }),
  );
}

function syncAbsoluteInputsFromSelection() {
  const fromIso = state.resolvedFromMs != null ? new Date(state.resolvedFromMs).toISOString() : '';
  const toIso   = state.resolvedToMs   != null ? new Date(state.resolvedToMs  ).toISOString() : '';
  els.absFrom.value = fromIso ? isoToDatetimeLocalValue(fromIso) : '';
  els.absTo.value   = toIso   ? isoToDatetimeLocalValue(toIso)   : '';
}

export function initTimePicker() {
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
}
