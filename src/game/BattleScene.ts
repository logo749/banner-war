/**
 * 战场场景：只负责画格子、画兵牌、按 tick 推进结算并刷新人数条。
 * 所有规则都在 src/sim/ 里，这里不写任何数值。
 */
import Phaser from 'phaser';
import { ENEMY_ROWS, FIELD, GRID, LOGICAL, PLAYER_ROWS, TICK_SEC } from '../config';
import { UNITS } from '../sim/units';
import { armyCp, buildEnemy, createBattle, type Battle, type Squad } from '../sim/battle';
import { buildUnitTextures, textureKey, type Side } from './textures';

const BAR_W = 44;

interface Placed {
  code: string;
  col: number;
  row: number;
  side: Side;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  index: number;
}

export class BattleScene extends Phaser.Scene {
  /** create() 跑完才变 true，入口用它挡住“还没画好就点”的情况 */
  ready = false;
  private placed: Placed[] = [];
  private battle: Battle | null = null;
  private acc = 0;
  private hud!: Phaser.GameObjects.Text;
  private tip!: Phaser.GameObjects.Text;
  private resultText?: Phaser.GameObjects.Text;

  constructor() {
    super('battle');
  }

  create() {
    buildUnitTextures(this);
    this.drawField();
    this.hud = this.add.text(10, 12, '', {
      fontFamily: 'ui-monospace, monospace',
      fontSize: '11px',
      color: '#8fa1bf'
    });
    this.tip = this.add
      .text(LOGICAL.w / 2, 36, '长按兵牌拖到第 6–8 行', {
        fontFamily: 'sans-serif',
        fontSize: '10px',
        color: '#5f6a80'
      })
      .setOrigin(0.5, 0);
    this.refreshHud();
    this.ready = true;
  }

  private drawField() {
    const g = this.add.graphics();
    g.fillStyle(0x0d1017, 1);
    g.fillRect(0, 0, LOGICAL.w, LOGICAL.h);
    g.fillStyle(0x10141d, 1);
    g.fillRect(0, FIELD.top - 6, LOGICAL.w, GRID.rows * FIELD.cellH + 12);

    for (let row = 0; row < GRID.rows; row += 1) {
      const inPlayer = (PLAYER_ROWS as readonly number[]).includes(row);
      const inEnemy = (ENEMY_ROWS as readonly number[]).includes(row);
      if (inPlayer) g.fillStyle(0x16202f, 1);
      else if (inEnemy) g.fillStyle(0x241a1a, 1);
      else g.fillStyle(0x141822, 1);
      g.fillRect(0, FIELD.top + row * FIELD.cellH, LOGICAL.w, FIELD.cellH - 1);
    }

    g.lineStyle(1, 0x263043, 1);
    for (let c = 0; c <= GRID.cols; c += 1) {
      g.beginPath();
      g.moveTo(c * FIELD.cellW, FIELD.top);
      g.lineTo(c * FIELD.cellW, FIELD.top + GRID.rows * FIELD.cellH);
      g.strokePath();
    }
    for (let r = 0; r <= GRID.rows; r += 1) {
      g.beginPath();
      g.moveTo(0, FIELD.top + r * FIELD.cellH);
      g.lineTo(LOGICAL.w, FIELD.top + r * FIELD.cellH);
      g.strokePath();
    }
    // 战线
    g.lineStyle(2, 0x3d4a63, 1);
    g.beginPath();
    g.moveTo(0, FIELD.top + 4 * FIELD.cellH);
    g.lineTo(LOGICAL.w, FIELD.top + 4 * FIELD.cellH);
    g.strokePath();
  }

  private cellCenter(col: number, row: number) {
    return { x: col * FIELD.cellW + FIELD.cellW / 2, y: FIELD.top + row * FIELD.cellH + FIELD.cellH / 2 };
  }

  occupied(col: number, row: number): boolean {
    return this.placed.some((p) => p.col === col && p.row === row);
  }

  placePlayer(code: string, col: number, row: number): boolean {
    if (!(PLAYER_ROWS as readonly number[]).includes(row)) return false;
    if (this.occupied(col, row)) return false;
    if (this.battle) return false;
    const pos = this.cellCenter(col, row);
    const sprite = this.add.image(pos.x, pos.y, textureKey(code, 'p')).setDisplaySize(64, 64);
    const barBg = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x000000, 0.6).setOrigin(0, 0.5);
    const bar = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x62c06a).setOrigin(0, 0.5);
    sprite.setAlpha(0);
    this.tweens.add({ targets: sprite, alpha: 1, y: pos.y - 3, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    this.placed.push({ code, col, row, side: 'p', sprite, bar, barBg, index: -1 });
    this.tip.setVisible(false);
    this.refreshHud();
    return true;
  }

  playerCount(): number {
    return this.placed.filter((p) => p.side === 'p').length;
  }

  playerComp(): string[] {
    return this.placed.filter((p) => p.side === 'p').map((p) => p.code);
  }

  get running(): boolean {
    return this.battle !== null && !this.battle.done;
  }

  start() {
    if (this.battle || this.placed.length === 0) return;
    const players = this.placed.sort((a, b) => a.row - b.row || a.col - b.col);
    const cp = armyCp(players.map((p) => p.code));
    const enemyCodes = buildEnemy(cp * 0.55, ['A1', 'A2', 'B1', 'B2', 'C1'], 4);
    const cols = [1, 2, 0, 3];
    const enemyRows = [3, 2, 1, 0];
    const enemies: Placed[] = [];
    enemyCodes.forEach((code, i) => {
      const col = cols[i % cols.length];
      const row = enemyRows[i % enemyRows.length];
      const pos = this.cellCenter(col, row);
      const sprite = this.add.image(pos.x, pos.y, textureKey(code, 'e')).setDisplaySize(64, 64);
      const barBg = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x000000, 0.6).setOrigin(0, 0.5);
      const bar = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x62c06a).setOrigin(0, 0.5);
      enemies.push({ code, col, row, side: 'e', sprite, bar, barBg, index: -1 });
    });
    this.placed.push(...enemies);

    const playerSquads: Squad[] = players.map((p) => ({ code: p.code, men: UNITS[p.code].men }));
    const enemySquads: Squad[] = enemies.map((p) => ({ code: p.code, men: UNITS[p.code].men }));
    players.forEach((p, i) => (p.index = i));
    enemies.forEach((p, i) => (p.index = i));

    this.battle = createBattle(playerSquads, enemySquads, 150);
    this.acc = 0;
    this.refreshHud();
  }

  /** 调试用：立刻推进 n 个 tick（?tick=n 回归截图走这里） */
  debugStep(n: number) {
    if (!this.battle) return;
    for (let i = 0; i < n && !this.battle.done; i += 1) this.battle.step();
    this.syncUnits();
    this.refreshHud();
  }

  update(_time: number, delta: number) {
    if (!this.battle || this.battle.done) {
      this.syncUnits();
      return;
    }
    this.acc += delta;
    const stepMs = TICK_SEC * 1000;
    let guard = 0;
    while (this.acc >= stepMs && !this.battle.done && guard < 8) {
      this.battle.step();
      this.acc -= stepMs;
      guard += 1;
    }
    this.syncUnits();
    this.refreshHud();
  }

  private syncUnits() {
    if (!this.battle) return;
    for (const unit of this.placed) {
      const slot = unit.side === 'p' ? this.battle.att[unit.index] : this.battle.dfn[unit.index];
      if (!slot) continue;
      const ratio = Math.max(slot.hp, 0) / Math.max(slot.hp0, 1);
      const w = BAR_W * ratio;
      unit.bar.width = w;
      unit.bar.setFillStyle(ratio > 0.6 ? 0x62c06a : ratio > 0.3 ? 0xd8b04a : 0xc0574a);
      if (slot.hp <= 0 && unit.sprite.alpha !== 0.3) {
        unit.sprite.setAlpha(0.3);
        unit.sprite.setTint(0x555a66);
      }
    }
  }

  private refreshHud() {
    const ticks = this.battle ? this.battle.ticks : 0;
    const cp = armyCp(this.playerComp());
    const left = this.playerComp().length;
    this.hud.setText(`T ${ticks}/150 · ${left} 张 · 战力 ${Math.round(cp)}`);
    if (this.battle && this.battle.done && !this.resultText) {
      const win = this.battle.winner();
      const remain = Math.round(this.battle.attRemain() * 100);
      this.resultText = this.add
        .text(LOGICAL.w / 2, FIELD.top + 4 * FIELD.cellH, `${win === 'att' ? '胜' : '败'} · 余兵 ${remain}%`, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: win === 'att' ? '#d8c07a' : '#c0574a',
          backgroundColor: '#0b0d12cc',
          padding: { x: 8, y: 4 }
        })
        .setOrigin(0.5);
    }
  }
}
