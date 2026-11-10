/**
 * 占位像素美术：全部由代码生成 64×64 贴图，不依赖外部素材包。
 * 换成 Tiny Swords 真素材时，只需要把这里替换成 scene.textures.addImage(key, img)，
 * 其余场景代码与命中/人数条逻辑都不动。
 */
import Phaser from 'phaser';
import type { Line } from '../sim/units';
import { UNITS } from '../sim/units';

export type Side = 'p' | 'e';

const PALETTE: Record<Side, { cloth: number; armor: number; skin: number; leg: number }> = {
  p: { cloth: 0x3e6fb0, armor: 0x9dbde8, skin: 0xe8c39a, leg: 0x232833 },
  e: { cloth: 0xa8402f, armor: 0xe0907c, skin: 0xe8c39a, leg: 0x232833 }
};

export function textureKey(code: string, side: Side): string {
  const u = UNITS[code];
  return `u_${u.line}_${code}_${side}`;
}

function drawSoldier(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  pal: { cloth: number; armor: number; skin: number; leg: number },
  level: number,
  shield: boolean
) {
  // 腿
  g.fillStyle(pal.leg, 1);
  g.fillRect(x + 4, y + 22, 3, 6);
  g.fillRect(x + 9, y + 22, 3, 6);
  // 身体
  g.fillStyle(pal.cloth, 1);
  g.fillRect(x + 3, y + 12, 10, 12);
  // 甲片：等级越高，肩甲越厚
  g.fillStyle(pal.armor, 1);
  g.fillRect(x + 2, y + 10, 12, 3 + level * 1.5);
  // 头
  g.fillStyle(pal.skin, 1);
  g.fillRect(x + 5, y + 4, 6, 6);
  // 盔
  g.fillStyle(pal.armor, 1);
  g.fillRect(x + 4, y + 2, 8, 3);
  if (level >= 3) {
    g.fillRect(x + 7, y - 2, 2, 4); // 盔缨
  }
  if (shield) {
    g.fillStyle(pal.armor, 1);
    g.fillRect(x - 2 + level, y + 13, 3 + level, 8);
  }
}

function drawArcher(g: Phaser.GameObjects.Graphics, x: number, y: number, pal: { cloth: number; armor: number; skin: number; leg: number }, level: number) {
  drawSoldier(g, x, y, pal, level, false);
  // 弓
  g.lineStyle(2, 0xd9e2f0, 1);
  g.beginPath();
  g.moveTo(x - 3, y + 8);
  g.lineTo(x - 6, y + 18);
  g.lineTo(x - 3, y + 28);
  g.strokePath();
}

function drawHorse(g: Phaser.GameObjects.Graphics, x: number, y: number, pal: { cloth: number; armor: number; skin: number; leg: number }, level: number) {
  // 马身
  g.fillStyle(0x2f333d, 1);
  g.fillRect(x + 6, y + 26, 34, 13);
  g.fillRect(x + 38, y + 22, 9, 10); // 颈
  g.fillRect(x + 45, y + 20, 8, 7); // 头
  // 腿
  g.fillRect(x + 9, y + 39, 4, 10);
  g.fillRect(x + 19, y + 39, 4, 10);
  g.fillRect(x + 30, y + 39, 4, 10);
  g.fillRect(x + 40, y + 39, 4, 10);
  // 骑手
  g.fillStyle(pal.cloth, 1);
  g.fillRect(x + 20, y + 12, 9, 13);
  g.fillStyle(pal.skin, 1);
  g.fillRect(x + 22, y + 6, 6, 6);
  g.fillStyle(pal.armor, 1);
  g.fillRect(x + 21, y + 4, 8, 3);
  if (level >= 3) g.fillRect(x + 24, y + 0, 2, 4);
  // 长枪
  g.fillStyle(0xcfd6e6, 1);
  g.fillRect(x + 30, y + 6, 2, 26);
}

export function buildUnitTextures(scene: Phaser.Scene) {
  (Object.keys(UNITS) as string[]).forEach((code) => {
    (['p', 'e'] as Side[]).forEach((side) => {
      const key = textureKey(code, side);
      if (scene.textures.exists(key)) return;
      const pal = PALETTE[side];
      const g = scene.add.graphics();
      g.clear();
      const u = UNITS[code];
      const level = code.endsWith('3') ? 3 : code.endsWith('2') ? 2 : 1;
      if (u.line === 'inf') {
        drawSoldier(g, 4, 26, pal, level, true);
        drawSoldier(g, 25, 26, pal, level, true);
        drawSoldier(g, 46, 26, pal, level, true);
      } else if (u.line === 'rng') {
        drawArcher(g, 14, 26, pal, level);
        drawArcher(g, 38, 26, pal, level);
      } else {
        drawHorse(g, 4, 18, pal, level);
      }
      g.generateTexture(key, 64, 64);
      g.destroy();
    });
  });
}

export function lineOf(code: string): Line {
  return UNITS[code].line;
}
