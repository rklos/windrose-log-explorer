# Windrose Log Explorer

A small Express + vanilla-JS app for exploring Unreal Engine `.log` files in the browser. Server-side time-range filtering, a draggable severity histogram, severity multiselect, Fuse.js fuzzy search with debounce + spinner, optional 5s auto-refresh, and per-row "show raw line" expansion. State (time range, severities, search, auto-refresh) is reflected in the URL. Styled with a dark walnut / amber palette.

## Requirements

- Node.js >= 22

## Install

```sh
npm install
```

## Run

```sh
LOG_FILE=logs/your-server.log npm start
```

Then open http://localhost:3000 .

### Environment variables

| Var | Default | Notes |
|---|---|---|
| `LOG_FILE` | _required_ | Path to the UE log file (relative to the project root, or absolute). |
| `PORT` | `3000` | HTTP port. |

## Features

- **Server-side time-range filter.** Default window is the last 30 min of the file. Orphan continuation lines are pulled in along with their parent timestamped line, so multi-line stack traces stay together at window edges.
- **Time-range popover.** Quick presets (5m / 15m / 30m / 1h / 3h / 6h / 12h / 24h / 2d / 3d / 7d) plus absolute `from`/`to` date pickers. The popover shows the file's full time range as a hint.
- **Histogram pane.** Stacked bars by severity over the current window. Drag across it to brush a sub-range — the time filter and log list update to match. Hover for per-bucket counts.
- **Severity multiselect popover.** Verbose / Verbose² / Log / Display / Warning / Error / Fatal, each with a live count for the current window. Verbose tiers are off by default. `All` / `None` / `Reset` shortcuts inside the popover.
- **Fuse.js fuzzy search** across the compact message, category, and the raw line — so you can find tokens that live in the hidden tail (paths, GUIDs) even in compact mode. Input is debounced (250ms) and a small spinner next to the search field indicates pending/in-flight work.
- **Per-row click expansion.** Click any row to reveal the raw line; the windowed list re-measures heights so expanded rows don't overlap.
- **Auto-refresh.** Toggle pill in the header re-fetches the current window every 5s. Pauses automatically while a popover is open, the histogram is being dragged, the tab is hidden, or another fetch is already in flight.
- **URL state sync.** Time range (preset key or absolute window), severity set, search query, and the auto-refresh state all persist in the query string — copy the URL to share your view.

## Develop

```sh
npm test         # vitest, 129 tests across 6 files
npm start        # boot the server (with LOG_FILE)
```

## Static build (GitHub Pages)

The Express backend can't run on Pages, so `scripts/build-static.mjs` parses a single log up-front and emits a fully static `dist/` that the frontend reads from `data/meta.json` + `data/entries.json` (time filtering moves client-side).

```sh
LOG_FILE=logs/your-server.log node scripts/build-static.mjs
# then serve dist/ with any static server
```

`.github/workflows/deploy-pages.yml` does this on every push to `main`. Set the repo variable `LOG_FILE` (Settings → Secrets and variables → Actions → Variables) to the path of a log committed to the repo; default is `logs/logs.txt`. **The baked log is published publicly — scrub passwords, account IDs, and invite codes before committing it.**

## Layout

```
public/                  # static frontend (mounted at /)
  index.html
  style.css
  app.js                 # bootstrap — wires modules together
  api.js                 # /api/log + /api/log/meta clients, fetch state
  state.js               # shared in-memory state
  dom.js                 # cached element references
  url-state.js           # query-string read/write
  dropdown.js            # popover open/close helper
  severity-filter.js     # severity multiselect popover + counts
  time-picker.js         # time-range popover (presets + absolute)
  time-range.js          # preset table + selection ↔ URL helpers
  log-list.js            # search, severity filter, virtualized rows
  virtualizer.js         # variable-height windowed list
  coloring.js            # token coloring + match highlighting
  histogram.js           # bucketing + severity rollup (pure)
  histogram-view.js      # SVG rendering, hover, drag-to-brush
  auto-refresh.js        # 5s polling toggle with smart pause
src/
  server.js              # Express app + /api endpoints
  parser.js              # streaming UE log parser + in-memory cache
logs/                    # log files (point `LOG_FILE` here)
```

## License

MIT
