import { state } from './state.js';
import { els } from './dom.js';
import { resolveSelection } from '../features/time/time-range.js';
import { STATIC_MODE, STATIC_DATA_BASE } from '../config.js';

let onEntriesUpdated = () => {};
export function setOnEntriesUpdated(fn) { onEntriesUpdated = fn ?? (() => {}); }

let staticEntriesPromise = null;
function loadStaticEntries() {
  if (!staticEntriesPromise) {
    staticEntriesPromise = fetch(`${STATIC_DATA_BASE}/entries.json`).then((r) => {
      if (!r.ok) throw new Error(`entries ${r.status}`);
      return r.json();
    });
  }
  return staticEntriesPromise;
}

export async function fetchMeta() {
  const url = STATIC_MODE ? `${STATIC_DATA_BASE}/meta.json` : '/api/log/meta';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`meta ${r.status}`);
  state.meta = await r.json();
  els.absFileMin.textContent = state.meta.min;
  els.absFileMax.textContent = state.meta.max;
}

export function resolveActiveWindow(nowMs = Date.now()) {
  const r = resolveSelection(state.selection, nowMs);
  if (!r) return null;
  state.resolvedFromMs = r.fromMs;
  state.resolvedToMs   = r.toMs;
  return r;
}

export async function fetchEntries({ keepScroll = false } = {}) {
  if (state.fetchInFlight) return;
  state.fetchInFlight = true;
  try {
    const win = resolveActiveWindow();
    if (!win) return;

    if (STATIC_MODE) {
      let all;
      try {
        all = await loadStaticEntries();
      } catch (err) {
        showFetchError(err.message);
        return;
      }
      state.entries = all.entries.filter(
        (e) => e.groupTs >= win.fromMs && e.groupTs <= win.toMs,
      );
      onEntriesUpdated({ keepScroll });
      return;
    }

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
  els.logEmpty.replaceChildren();
  els.logEmpty.append(`Failed: ${message} `);
  const retry = document.createElement('button');
  retry.className = 'popover-btn no-flex';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => fetchEntries());
  els.logEmpty.append(retry);
}
