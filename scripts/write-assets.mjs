import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, 'assets', 'unitArt.json'), 'utf8'));
} catch {
  console.log('[assets] 缺少 assets/unitArt.json，跳过还原（先跑 python3 tools/units_art.py）');
  process.exit(0);
}
let n = 0;
for (const [rel, b64] of Object.entries(manifest)) {
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(String(b64), 'base64'));
  n += 1;
}
console.log(`[assets] 还原 ${n} 个文件到 public/assets/`);
