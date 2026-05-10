import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DIST_DIR = path.join(ROOT, 'dist');
const FUSE_SRC = path.join(ROOT, 'node_modules', 'fuse.js', 'dist', 'fuse.basic.mjs');

const LOG_FILE = process.env.LOG_FILE;
if (!LOG_FILE) {
  console.error('LOG_FILE env var is required (path to a UE log file to bake into the static build).');
  process.exit(1);
}
const LOG_FILE_ABS = path.resolve(ROOT, LOG_FILE);

await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });
await cp(PUBLIC_DIR, DIST_DIR, { recursive: true });

await mkdir(path.join(DIST_DIR, 'vendor'), { recursive: true });
await cp(FUSE_SRC, path.join(DIST_DIR, 'vendor', 'fuse.esm.min.js'));

console.log(`Parsing ${LOG_FILE_ABS}…`);
const parsed = await parseFile(LOG_FILE_ABS);

await mkdir(path.join(DIST_DIR, 'data'), { recursive: true });
await writeFile(
  path.join(DIST_DIR, 'data', 'meta.json'),
  JSON.stringify({
    file: path.basename(LOG_FILE_ABS),
    min: new Date(parsed.min).toISOString(),
    max: new Date(parsed.max).toISOString(),
    totalLines: parsed.totalLines,
  }),
);
await writeFile(
  path.join(DIST_DIR, 'data', 'entries.json'),
  JSON.stringify({ entries: parsed.entries }),
);

await writeFile(
  path.join(DIST_DIR, 'config.js'),
  'export const STATIC_MODE = true;\nexport const STATIC_DATA_BASE = \'./data\';\n',
);

// Pages deploys under a sub-path (user.github.io/<repo>/), so root-absolute
// imports like `/foo.js` resolve to the wrong host root. Rewrite them to
// relative paths in HTML and JS files inside dist/.
const ABS_IMPORT_RE = /(\bfrom\s+['"]|\bimport\s*\(\s*['"])\/([^'"\/][^'"]*)(['"])/g;
const ABS_ATTR_RE = /\b(src|href)=(["'])\/([^"'\/][^"']*)(["'])/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

for await (const file of walk(DIST_DIR)) {
  if (!/\.(html|js|mjs)$/.test(file)) continue;
  const orig = await readFile(file, 'utf8');
  const next = orig
    .replace(ABS_IMPORT_RE, '$1./$2$3')
    .replace(ABS_ATTR_RE, '$1=$2./$3$4');
  if (next !== orig) await writeFile(file, next);
}

const { size } = await stat(path.join(DIST_DIR, 'data', 'entries.json'));
console.log(`Wrote dist/ — ${parsed.entries.length} entries, entries.json ${(size / 1024 / 1024).toFixed(2)} MiB`);
