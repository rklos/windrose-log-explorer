import { DEFAULT_PRESET_KEY } from '/time-range.js';

export const SEVERITY_BUCKETS = [
  { key: 'verbose',  label: 'Verbose',  match: ['Verbose', 'VeryVerbose'], dotVar: '--sev-verbose'  },
  { key: 'display',  label: 'Display',  match: ['Display', 'Log'],         dotVar: '--sev-display'  },
  { key: 'warning',  label: 'Warning',  match: ['Warning'],                dotVar: '--sev-warning'  },
  { key: 'error',    label: 'Error',    match: ['Error', 'Fatal'],         dotVar: '--sev-error'    },
];

export const SEV_BADGE = {
  Verbose: 'VRB', VeryVerbose: 'VVB',
  Display: 'DSP', Log: 'LOG',
  Warning: 'WRN', Error: 'ERR', Fatal: 'FTL',
};

export const state = {
  meta: null,
  entries: [],
  filtered: [],
  queryMatches: null,
  selection: { kind: 'preset', key: DEFAULT_PRESET_KEY },
  resolvedFromMs: null,
  resolvedToMs: null,
  activeSev: new Set(['display', 'warning', 'error']),
  query: '',
  autoRefreshOn: true,
  timePopoverOpen: false,
  severityPopoverOpen: false,
  histogramDragActive: false,
  fetchInFlight: false,
};

window.__state = state; // debug hatch
