import { state } from './common/state.js';
import { els } from './common/dom.js';
import { readUrlState } from './common/url-state.js';
import { fetchMeta, fetchEntries, setOnEntriesUpdated } from './common/api.js';
import { initSeverityFilter, renderSeverityTrigger } from './features/severity/severity-filter.js';
import { initTimePicker, renderTimeTrigger } from './features/time/time-picker.js';
import { initLogList, applyFilters, onEntriesUpdated } from './features/log-list/log-list.js';
import { initHistogramView } from './features/histogram/histogram-view.js';
import { initAutoRefresh } from './features/auto-refresh/auto-refresh.js';

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
