/**
 * 构建前准备兵牌贴图。
 * 1) 有 assets/unitArt.json（文本清单）→ 直接把 base64 还原成 PNG；
 * 2) 没有清单且 PNG 缺失 → 尝试用 tools/units_art.py 从图集重新生成（需 Python + Pillow）；
 * 3) 都不可用 → 跳过，让贴图走代码兜底色块，构建不因素材而失败。
 * 二进制不进 git，只有本脚本与 tools/units_art.py 是源。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.cwd();
const units = join(root, 'public', 'assets', 'units', 'inf_p.png');
const manifestPath = join(root, 'assets', 'unitArt.json');

function restoreFromManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let n = 0;
  for (const [rel, b64] of Object.entries(manifest)) {
    const out = join(root, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(String(b64), 'base64'));
    n += 1;
  }
  console.log(`[assets] 从清单还原 ${n} 个文件`);
  return n > 0;
}

function generateWithPython() {
  try {
    execFileSync('python3', ['-m', 'pip', 'install', '--quiet', '--user', '--break-system-packages', 'pillow'], {
      stdio: 'ignore'
    });
  } catch {
    // 已经装了或装不上都继续，下面直接试跑
  }
  try {
    execFileSync('python3', ['tools/units_art.py', '--src', '.cache/ts'], { stdio: 'inherit' });
    return existsSync(units);
  } catch (err) {
    console.warn('[assets] 生成失败：', err instanceof Error ? err.message : err);
    return false;
  }
}

if (existsSync(units)) {
  console.log('[assets] 贴图已在，跳过');
} else if (existsSync(manifestPath) && restoreFromManifest()) {
  // done
} else if (!generateWithPython()) {
  console.warn('[assets] 没有可用贴图，将使用代码兜底色块');
}
