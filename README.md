# Windrose Log Explorer

A small Express + vanilla-JS app for exploring Unreal Engine `.log` files in the browser. Server-side time-range filtering, client-side severity chips, Fuse.js fuzzy search, and a row-by-row "show full line" expansion. Styled with a dark walnut / amber palette.

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
- **Severity chips.** Verbose / Display / Warning / Error. Verbose is off by default; chip counts reflect the current 30-min slice.
- **Fuse.js fuzzy search** across the compact message, category, and the raw line — so you can find tokens that live in the hidden tail (paths, GUIDs) even in compact mode.
- **Per-row click expansion.** Click any row to reveal `frame · source path · raw line`. Toggle **Show full lines** to expand every row at once.
- **URL state sync.** Time range, severities, search, and expansion state persist in the query string — copy the URL to share your view.

## Develop

```sh
npm test         # vitest, ~73 tests
npm start        # boot the server (with LOG_FILE)
```

## Layout

```
public/         # static frontend (mounted at /)
  index.html
  style.css
  app.js          # controller — fetch, filter, render
  coloring.js     # inline message highlighting
  virtualizer.js  # fixed-row windowed list
src/
  server.js       # Express app + endpoints
  parser.js       # streaming UE log parser + cache
docs/superpowers/
  specs/          # design spec
  plans/          # implementation plan
logs/             # log files (sample data)
```

## License

MIT
