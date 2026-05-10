import { state } from '../../common/state.js';
import { els } from '../../common/dom.js';
import { writeUrlState } from '../../common/url-state.js';
import { fetchEntries } from '../../common/api.js';

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

export function initAutoRefresh() {
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
}
