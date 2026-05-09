import { state } from './state.js';
import { els } from './dom.js';
import { readUrlState } from './url-state.js';
import { fetchMeta, fetchEntries, setOnEntriesUpdated } from './api.js';
import { initSeverityFilter, renderSeverityTrigger } from './severity-filter.js';
import { initTimePicker, renderTimeTrigger } from './time-picker.js';
import { initLogList, applyFilters, onEntriesUpdated } from './log-list.js';
import { initHistogramView } from './histogram-view.js';
import { initAutoRefresh } from './auto-refresh.js';

readUrlState();
els.searchInput.value = state.query;
els.autoRefreshBtn.setAttribute('aria-pressed', String(state.autoRefreshOn));

initSeverityFilter({ onChange: applyFilters });
initTimePicker();
initLogList();
initHistogramView();
initAutoRefresh();

setOnEntriesUpdated(onEntriesUpdated);

renderTimeTrigger();
renderSeverityTrigger();

(async function bootstrap() {
  try {
    await fetchMeta();
  } catch (err) {
    els.logEmpty.textContent = `Failed: ${err.message}`;
    return;
  }
  await fetchEntries();
})();
