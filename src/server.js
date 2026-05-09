import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCachedParse } from './parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

export function resolveWindow({ fromRaw, toRaw, min: _min, max, defaultWindowMs }) {
  if (fromRaw !== null && Number.isNaN(fromRaw)) return { error: 'invalid `from`' };
  if (toRaw !== null && Number.isNaN(toRaw)) return { error: 'invalid `to`' };

  let from;
  let to;
  if (fromRaw === null && toRaw === null) {
    to = max;
    from = max - defaultWindowMs;
  } else if (fromRaw !== null && toRaw === null) {
    from = fromRaw;
    to = max;
  } else if (fromRaw === null && toRaw !== null) {
    to = toRaw;
    from = toRaw - defaultWindowMs;
  } else {
    from = fromRaw;
    to = toRaw;
  }
  if (from > to) return { error: '`from` is after `to`' };
  return { from, to };
}

function parseISO(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : NaN;
}

// Only start the server when run directly (not when imported by tests).
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const PORT = Number(process.env.PORT) || 3000;
  const LOG_FILE = process.env.LOG_FILE;

  if (!LOG_FILE) {
    console.error('LOG_FILE env var is required (path to a .log/.txt file).');
    process.exit(1);
  }

  const LOG_FILE_ABS = path.resolve(LOG_FILE);

  const app = express();
  app.disable('x-powered-by');

  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  app.use(
    '/vendor/fuse.esm.min.js',
    express.static(
      path.resolve(__dirname, '..', 'node_modules', 'fuse.js', 'dist', 'fuse.basic.mjs'),
    ),
  );

  app.get('/api/log/meta', async (_req, res, next) => {
    try {
      const parsed = await getCachedParse(LOG_FILE_ABS);
      res.json({
        file: path.basename(LOG_FILE_ABS),
        min: new Date(parsed.min).toISOString(),
        max: new Date(parsed.max).toISOString(),
        totalLines: parsed.totalLines,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/log', async (req, res, next) => {
    try {
      const parsed = await getCachedParse(LOG_FILE_ABS);
      const fromRaw = parseISO(req.query.from);
      const toRaw = parseISO(req.query.to);

      const result = resolveWindow({
        fromRaw,
        toRaw,
        min: parsed.min,
        max: parsed.max,
        defaultWindowMs: DEFAULT_WINDOW_MS,
      });

      if (result.error) {
        return res.status(400).json({
          error: result.error,
          min: new Date(parsed.min).toISOString(),
          max: new Date(parsed.max).toISOString(),
        });
      }

      const { from, to } = result;
      const entries = parsed.entries.filter(
        (e) => e.groupTs >= from && e.groupTs <= to,
      );

      res.json({
        window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
        entries,
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: err.message ?? 'unknown error' });
  });

  app.listen(PORT, () => {
    console.log(`Windrose Log Explorer on http://localhost:${PORT}`);
    console.log(`Serving log file: ${LOG_FILE_ABS}`);
  });
}
