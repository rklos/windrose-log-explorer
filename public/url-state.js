import { state } from './state.js';
import { selectionFromSearchParams, applySelectionToSearchParams } from '/time-range.js';

export function readUrlState() {
  const params = new URLSearchParams(location.search);
  state.selection = selectionFromSearchParams(params);
  if (params.get('sev')) {
    state.activeSev = new Set(params.get('sev').split(',').filter(Boolean));
  }
  if (params.get('q')) state.query = params.get('q');
  if (params.get('refresh') === 'off') state.autoRefreshOn = false;
}

export function writeUrlState() {
  const params = new URLSearchParams();
  applySelectionToSearchParams(params, state.selection);
  params.set('sev', [...state.activeSev].join(','));
  if (state.query) params.set('q', state.query);
  if (!state.autoRefreshOn) params.set('refresh', 'off');
  history.replaceState(null, '', `?${params.toString()}`);
}
