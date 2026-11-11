/**
 * 兵牌贴图：贴图键、预加载、按兵种出图口径。规则数值不在这里。
 */
import type Phaser from 'phaser';
import { UNITS } from '../sim/units';

export type Side = 'p' | 'e';

export function textureKey(code: string, side: Side) {
  return `${UNITS[code].line}_${side}`;
}

/** 6 张兵牌图 + 一张兜底色块（资源缺失时不至于什么都看不见） */
export function preloadUnitTextures(scene: Phaser.Scene) {
  for (const code of Object.keys(UNITS)) {
    for (const side of ['p', 'e'] as Side[]) {
      const key = textureKey(code, side);
      if (!scene.textures.exists(key)) scene.load.image(key, `assets/units/${key}.png`);
    }
  }
}

/** 兜底：贴图缺失时用一块按兵种着色的方块顶上 */
export function makeFallbackTexture(scene: Phaser.Scene) {
  if (scene.textures.exists('unit_fallback')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x2f3a52, 1).fillRect(0, 0, 16, 22);
  g.lineStyle(1, 0x9fb2d0, 1).strokeRect(0, 0, 16, 22);
  g.generateTexture('unit_fallback', 16, 22);
  g.destroy();
}

/** 兵牌贴图宽度：步兵 84、弓手 76 */
export function unitWidth(code: string): number {
  return UNITS[code].line === 'rng' ? 76 : 84;
}

/** 骑兵图是竖长的，按宽度出图会又瘦又长，改按高度出图 */
export function unitHeight(code: string): number {
  return UNITS[code].line === 'cav' ? 72 : 0;
}

/** 行军颠簸结束、窗口变化后都要回到统一口径 */
export function fitUnit(sprite: Phaser.GameObjects.Image, code: string) {
  const h = unitHeight(code);
  if (h > 0) {
    const w = (sprite.width / sprite.height) * h;
    sprite.setDisplaySize(Math.round(w), h);
  } else {
    const w = unitWidth(code);
    sprite.setDisplaySize(w, Math.round((sprite.height / sprite.width) * w));
  }
}

export function makeUnitSprite(
  scene: Phaser.Scene,
  code: string,
  side: Side,
  x: number,
  y: number
): Phaser.GameObjects.Image {
  const key = textureKey(code, side);
  const sprite = scene.textures.exists(key)
    ? scene.add.image(x, y, key)
    : scene.add.image(x, y, 'unit_fallback');
  fitUnit(sprite, code);
  return sprite;
}

export function lineOf(code: string): 'inf' | 'rng' | 'cav' {
  return UNITS[code].line;
}
