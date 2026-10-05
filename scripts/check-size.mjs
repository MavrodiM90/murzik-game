// Проверка бюджета: суммарный gzip всего dist ≤ 1 МБ.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIMIT = 1024 * 1024;
const exts = new Set(['.js', '.css', '.html', '.svg', '.webmanifest', '.png', '.json']);
let total = 0;
const rows = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (exts.has(extname(p))) {
      const raw = readFileSync(p);
      const gz = extname(p) === '.png' ? raw.length : gzipSync(raw).length;
      total += gz;
      rows.push([p.split(String.fromCharCode(92)).join('/'), raw.length, gz]);
    }
  }
}
walk('dist');
rows.sort((a, b) => b[2] - a[2]).slice(0, 6).forEach(([p, r, g]) => console.log(`${p}  raw ${(r / 1024).toFixed(1)} KB  gzip ${(g / 1024).toFixed(1)} KB`));
console.log(`ИТОГО gzip: ${(total / 1024).toFixed(1)} KB (лимит ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error('Бюджет превышен!');
  process.exit(1);
}
