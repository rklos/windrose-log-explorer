export const PRESETS = [
  { key: '5m',  label: 'Last 5 minutes',  ms:  5 * 60_000 },
  { key: '15m', label: 'Last 15 minutes', ms: 15 * 60_000 },
  { key: '30m', label: 'Last 30 minutes', ms: 30 * 60_000 },
  { key: '1h',  label: 'Last 1 hour',     ms:  1 * 60 * 60_000 },
  { key: '3h',  label: 'Last 3 hours',    ms:  3 * 60 * 60_000 },
  { key: '6h',  label: 'Last 6 hours',    ms:  6 * 60 * 60_000 },
  { key: '12h', label: 'Last 12 hours',   ms: 12 * 60 * 60_000 },
  { key: '24h', label: 'Last 24 hours',   ms: 24 * 60 * 60_000 },
  { key: '2d',  label: 'Last 2 days',     ms:  2 * 24 * 60 * 60_000 },
  { key: '3d',  label: 'Last 3 days',     ms:  3 * 24 * 60 * 60_000 },
  { key: '7d',  label: 'Last 7 days',     ms:  7 * 24 * 60 * 60_000 },
];

export const DEFAULT_PRESET_KEY = '30m';

export function findPreset(key) {
  return PRESETS.find((p) => p.key === key);
}

export function resolvePreset(key, nowMs) {
  const p = findPreset(key);
  if (!p) return null;
  return { fromMs: nowMs - p.ms, toMs: nowMs };
}

export function resolveSelection(selection, nowMs) {
  if (selection.kind === 'preset') return resolvePreset(selection.key, nowMs);
  if (selection.kind === 'absolute') {
    return { fromMs: Date.parse(selection.from), toMs: Date.parse(selection.to) };
  }
  return null;
}

function formatIsoForLabel(iso) {
  return iso.replace('T', ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
}

export function formatTriggerLabel(selection) {
  if (selection.kind === 'preset') {
    const p = findPreset(selection.key);
    return p ? p.label : 'Custom range';
  }
  return `${formatIsoForLabel(selection.from)} → ${formatIsoForLabel(selection.to)}`;
}

export function selectionFromSearchParams(params) {
  const range = params.get('range');
  if (range && findPreset(range)) return { kind: 'preset', key: range };
  const from = params.get('from');
  const to = params.get('to');
  if (from && to) return { kind: 'absolute', from, to };
  return { kind: 'preset', key: DEFAULT_PRESET_KEY };
}

export function applySelectionToSearchParams(params, selection) {
  params.delete('range');
  params.delete('from');
  params.delete('to');
  if (selection.kind === 'preset') {
    params.set('range', selection.key);
  } else {
    params.set('from', selection.from);
    params.set('to', selection.to);
  }
}

export function isoToDatetimeLocalValue(iso) {
  return iso.replace(/\.\d+Z$/, '').replace(/Z$/, '');
}

export function datetimeLocalValueToIso(value) {
  if (!value) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}Z`;
}
