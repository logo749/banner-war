/**
 * 战场场景：画格、画兵牌、按 tick 推进结算、表演层动画。规则全在 src/sim/。
 * 三段表演：布阵 → 行军（march）→ 交锋（engaged 门控后才开始 tick）。
 * 站位只是表演：sim 始终集火“索引最小的活人”，assignSlots() 把它翻译成一条战线。
 */
import Phaser from 'phaser';
import { ENEMY_ROWS, FIELD, GRID, LOGICAL, PLAYER_ROWS, TICK_SEC } from '../config';
import { UNITS } from '../sim/units';
import { armyCp, createBattle, HORN_MULT, type Battle, type Squad } from '../sim/battle';
import { fitUnit, makeFallbackTexture, makeUnitSprite, preloadUnitTextures, type Side } from './textures';

const BAR_W = 28;
const BORDER_Y = FIELD.top + 4 * FIELD.cellH;
const LINE_Y: Record<Side, number> = { e: BORDER_Y - 16, p: BORDER_Y + 16 };
const RANK_GAP = 38;

export interface BattleEnd {
  win: boolean;
  survivors: Array<{ id: string; men: number }>;
  ticks: number;
}

interface Placed {
  id: string;
  code: string;
  col: number;
  row: number;
  side: Side;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  barDy: number;
  index: number;
  men: number;
  baseX: number;
  baseY: number;
  dead: boolean;
  lastHp: number;
}

interface SlotPos {
  x: number;
  y: number;
}

export class BattleScene extends Phaser.Scene {
  ready = false;
  private placed: Placed[] = [];
  private battle: Battle | null = null;
  private acc = 0;
  private hud!: Phaser.GameObjects.Text;
  private tip!: Phaser.GameObjects.Text;
  private resultText?: Phaser.GameObjects.Text;
  private enemyComp: string[] = [];
  private layer = 1;
  private onEnd?: (r: BattleEnd) => void;
  private ended = false;
  private engaged = false;
  private used = { swap: false, horn: false, reserve: false };

  constructor() {
    super('battle');
  }

  preload() {
    preloadUnitTextures(this);
    this.load.image('ground', 'assets/terrain/ground.png');
  }

  create() {
    makeFallbackTexture(this);
    this.drawField();
    this.hud = this.add
      .text(10, 12, '', { fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#8fa1bf' })
      .setDepth(60);
    this.tip = this.add
      .text(LOGICAL.w / 2, 36, '', { fontFamily: 'sans-serif', fontSize: '10px', color: '#5f6a80' })
      .setOrigin(0.5, 0)
      .setDepth(60);
    this.refreshHud();
    this.ready = true;
  }

  reset(enemy: string[], layer: number, onEnd: (r: BattleEnd) => void) {
    this.enemyComp = enemy;
    this.layer = layer;
    this.onEnd = onEnd;
    this.battle = null;
    this.ended = false;
    this.engaged = false;
    this.acc = 0;
    this.used = { swap: false, horn: false, reserve: false };
    for (const p of this.placed) {
      p.sprite.destroy();
      p.bar.destroy();
      p.barBg.destroy();
    }
    this.placed = [];
    this.resultText?.destroy();
    this.resultText = undefined;
    this.tip.setText('长按兵牌拖到第 6–8 行').setColor('#5f6a80').setVisible(true);
    this.spawnEnemy();
    this.refreshHud();
  }

  private drawField() {
    this.add.rectangle(0, 0, LOGICAL.w, LOGICAL.h, 0x0d1017).setOrigin(0, 0).setDepth(-12);
    const fieldH = GRID.rows * FIELD.cellH + 12;
    if (this.textures.exists('ground')) {
      this.add.tileSprite(0, FIELD.top - 6, LOGICAL.w, fieldH, 'ground').setOrigin(0, 0).setDepth(-6).setAlpha(0.95);
      this.add.rectangle(0, FIELD.top - 6, LOGICAL.w, fieldH, 0x0a0e15, 0.3).setOrigin(0, 0).setDepth(-5);
    }
    const g = this.add.graphics();
    for (let row = 0; row < GRID.rows; row += 1) {
      if ((PLAYER_ROWS as readonly number[]).includes(row)) g.fillStyle(0x16202f, 0.3);
      else if ((ENEMY_ROWS as readonly number[]).includes(row)) g.fillStyle(0x28181f, 0.34);
      else g.fillStyle(0x141822, 0.22);
      g.fillRect(0, FIELD.top + row * FIELD.cellH, LOGICAL.w, FIELD.cellH - 1);
    }
    g.lineStyle(1, 0x9aa6b8, 0.16);
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
    g.lineStyle(2, 0x3d4a63, 1);
    g.beginPath();
    g.moveTo(0, BORDER_Y);
    g.lineTo(LOGICAL.w, BORDER_Y);
    g.strokePath();
  }

  private cellCenter(col: number, row: number) {
    return { x: col * FIELD.cellW + FIELD.cellW / 2, y: FIELD.top + row * FIELD.cellH + FIELD.cellH / 2 };
  }

  occupied(col: number, row: number): boolean {
    return this.placed.some((p) => p.col === col && p.row === row);
  }

  /** 立绘 + 人数条一起造；条位置口径只在这里（脚下） */
  private spawnUnit(code: string, side: Side, x: number, y: number) {
    const sprite = makeUnitSprite(this, code, side, x, y).setDepth(20);
    const barDy = sprite.displayHeight / 2 + 3;
    const barBg = this.add.rectangle(x - BAR_W / 2, y + barDy, BAR_W, 4, 0x000000, 0.6).setOrigin(0, 0.5).setDepth(25);
    const bar = this.add.rectangle(x - BAR_W / 2, y + barDy, BAR_W, 4, 0x62c06a).setOrigin(0, 0.5).setDepth(26);
    return { sprite, barBg, bar, barDy };
  }

  placePlayer(code: string, col: number, row: number, id: string, men = UNITS[code].men): boolean {
    if (!(PLAYER_ROWS as readonly number[]).includes(row)) return false;
    if (this.occupied(col, row)) return false;
    if (this.battle) return false;
    const pos = this.cellCenter(col, row);
    const { sprite, bar, barBg, barDy } = this.spawnUnit(code, 'p', pos.x, pos.y);
    sprite.setScale(sprite.scaleX * 0.85, sprite.scaleY * 0.85).setY(pos.y + 3);
    this.tweens.add({ targets: sprite, scaleX: sprite.scaleX / 0.85, scaleY: sprite.scaleY / 0.85, y: pos.y, duration: 160, ease: 'Quad.easeOut' });
    this.placed.push({ id, code, col, row, side: 'p', sprite, bar, barBg, barDy, index: -1, men, baseX: pos.x, baseY: pos.y, dead: false, lastHp: 0 });
    this.tip.setVisible(false);
    this.refreshHud();
    return true;
  }

  playerCount(): number {
    return this.placed.filter((p) => p.side === 'p').length;
  }

  flashTip(text: string) {
    if (this.battle) return;
    this.tip.setText(text).setColor('#d8b04a').setVisible(true);
    this.time.delayedCall(1600, () => {
      if (this.battle) return;
      this.tip.setColor('#5f6a80').setText('长按兵牌拖到第 6–8 行');
      if (this.playerCount() > 0) this.tip.setVisible(false);
    });
  }

  playerComp(): string[] {
    return this.placed.filter((p) => p.side === 'p').map((p) => p.code);
  }

  get running(): boolean {
    return this.battle !== null && !this.battle.done;
  }

  get finished(): boolean {
    return this.battle !== null && this.battle.done;
  }

  /** 布阵阶段就把敌军摆出来：近战/骑在前，弓手退后 */
  private spawnEnemy() {
    const front = [
      { col: 1, row: 3 },
      { col: 2, row: 3 },
      { col: 0, row: 3 },
      { col: 3, row: 3 },
      { col: 1, row: 2 },
      { col: 2, row: 2 }
    ];
    const back = [
      { col: 1, row: 1 },
      { col: 2, row: 1 },
      { col: 0, row: 0 },
      { col: 3, row: 0 },
      { col: 0, row: 2 },
      { col: 3, row: 2 }
    ];
    let fi = 0;
    let bi = 0;
    this.enemyComp.forEach((code, i) => {
      const isRanged = UNITS[code].line === 'rng';
      const slot = isRanged ? back[bi++ % back.length] : front[fi++ % front.length];
      const pos = this.cellCenter(slot.col, slot.row);
      const { sprite, bar, barBg, barDy } = this.spawnUnit(code, 'e', pos.x, pos.y);
      this.placed.push({ id: `e${i}`, code, col: slot.col, row: slot.row, side: 'e', sprite, bar, barBg, barDy, index: i, men: UNITS[code].men, baseX: pos.x, baseY: pos.y, dead: false, lastHp: 0 });
    });
  }

  start() {
    if (this.battle) return;
    const players = this.placed.filter((p) => p.side === 'p').sort((a, b) => a.row - b.row || a.col - b.col);
    const enemies = this.placed.filter((p) => p.side === 'e');
    if (players.length === 0 || enemies.length === 0) return;
    const playerSquads: Squad[] = players.map((p) => ({ code: p.code, men: p.men, id: p.id }));
    const enemySquads: Squad[] = enemies.map((p) => ({ code: p.code, men: p.men, id: p.id }));
    players.forEach((p, i) => (p.index = i));
    enemies.forEach((p, i) => (p.index = i));
    this.battle = createBattle(playerSquads, enemySquads, 150);
    this.acc = 0;
    for (const u of this.placed) {
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      u.lastHp = slot ? slot.hp : 0;
    }
    this.refreshHud();
    this.march();
  }

  /** sim 索引 → 战线上的人：近战/骑顶前排，弓手退后排；两军各让 8px 不叠住 */
  private assignSlots(side: Side): Map<string, SlotPos> {
    const living = this.placed.filter((u) => u.side === side && !u.dead).sort((a, b) => a.index - b.index);
    const out = new Map<string, SlotPos>();
    const melee = living.filter((u) => UNITS[u.code].line !== 'rng');
    const ranged = living.filter((u) => UNITS[u.code].line === 'rng');
    const dir = side === 'p' ? 1 : -1;
    const stagger = side === 'e' ? -8 : 8;
    melee.forEach((u, i) => {
      out.set(u.id, {
        x: (i % 4) * FIELD.cellW + FIELD.cellW / 2 + stagger,
        y: LINE_Y[side] + dir * Math.floor(i / 4) * RANK_GAP
      });
    });
    ranged.forEach((u, i) => {
      out.set(u.id, { x: ((i + 1) % 4) * FIELD.cellW + FIELD.cellW / 2 + stagger, y: LINE_Y[side] + dir * (RANK_GAP + 4) });
    });
    return out;
  }

  /** 开战冲锋：双方一起压向战线，走到接触距离才开打 */
  private march() {
    const ps = this.assignSlots('p');
    const es = this.assignSlots('e');
    let last = 0;
    for (const side of ['p', 'e'] as Side[]) {
      const map = side === 'p' ? ps : es;
      this.placed
        .filter((u) => u.side === side && !u.dead)
        .sort((a, b) => a.index - b.index)
        .forEach((u, i) => {
          const slot = map.get(u.id);
          if (!slot) return;
          const dist = Phaser.Math.Distance.Between(u.sprite.x, u.sprite.y, slot.x, slot.y);
          const dur = Phaser.Math.Clamp(600 + dist * 6, 900, 2000);
          const delay = i * 50 + (side === 'e' ? 0 : 40);
          last = Math.max(last, delay + dur);
          this.dust(u, 3);
          this.tweens.add({
            targets: u.sprite,
            x: slot.x,
            y: slot.y,
            duration: dur,
            delay,
            ease: 'Sine.easeInOut',
            onComplete: () => {
              u.baseX = slot.x;
              u.baseY = slot.y;
              this.dust(u, 2);
            }
          });
          this.tweens.add({
            targets: u.sprite,
            scaleY: u.sprite.scaleY * 0.94,
            duration: 150,
            delay: delay + 40,
            yoyo: true,
            repeat: Math.max(1, Math.round(dur / 300)),
            ease: 'Sine.easeInOut',
            onComplete: () => fitUnit(u.sprite, u.code)
          });
        });
    }
    const banner = this.add
      .text(LOGICAL.w / 2, BORDER_Y - 62, '全军推进', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: '#e8d8a8',
        backgroundColor: '#0b0d12cc',
        padding: { x: 8, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(55);
    this.time.delayedCall(320, () => {
      banner.setText('接战！');
      this.cameras.main.shake(180, 0.004);
      this.time.delayedCall(760, () => {
        this.tweens.add({ targets: banner, alpha: 0, duration: 300, onComplete: () => banner.destroy() });
      });
    });
    this.time.delayedCall(last + 60, () => {
      this.engaged = true;
      this.acc = 0;
      this.clash();
      this.reflow();
    });
  }

  private clash() {
    const p = this.frontOf('p');
    const e = this.frontOf('e');
    if (!p || !e) return;
    const mx = (p.sprite.x + e.sprite.x) / 2;
    const my = (p.sprite.y + e.sprite.y) / 2;
    for (let i = 0; i < 8; i += 1) {
      const spark = this.add.rectangle(mx, my, 3, 3, i % 2 ? 0xffe6b0 : 0xffffff).setDepth(35);
      this.tweens.add({
        targets: spark,
        x: mx + Phaser.Math.Between(-26, 26),
        y: my + Phaser.Math.Between(-22, 18),
        alpha: 0,
        scale: 0.4,
        duration: Phaser.Math.Between(240, 420),
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy()
      });
    }
    this.cameras.main.shake(90, 0.003);
  }

  private dust(u: Placed, n: number) {
    for (let i = 0; i < n; i += 1) {
      const px = u.sprite.x + Phaser.Math.Between(-18, 18);
      const py = u.sprite.y + u.sprite.displayHeight / 2 - 2;
      const puff = this.add.rectangle(px, py, Phaser.Math.Between(4, 8), 3, 0x6b6355).setDepth(15).setAlpha(0.7);
      this.tweens.add({
        targets: puff,
        x: px + Phaser.Math.Between(-10, 10),
        y: py - Phaser.Math.Between(2, 10),
        alpha: 0,
        duration: Phaser.Math.Between(280, 520),
        delay: i * 60,
        onComplete: () => puff.destroy()
      });
    }
  }

  /** 有人倒下或补人后，后面的自己顶上 */
  private reflow() {
    if (!this.battle) return;
    for (const side of ['p', 'e'] as Side[]) {
      const map = this.assignSlots(side);
      for (const u of this.placed) {
        if (u.side !== side || u.dead) continue;
        const slot = map.get(u.id);
        if (!slot) continue;
        if (Math.abs(u.baseX - slot.x) < 1 && Math.abs(u.baseY - slot.y) < 1) continue;
        u.baseX = slot.x;
        u.baseY = slot.y;
        this.dust(u, 2);
        this.tweens.add({ targets: u.sprite, x: slot.x, y: slot.y, duration: 260, ease: 'Sine.easeInOut' });
      }
    }
  }

  canSwap(): boolean {
    return !!this.battle && !this.ended && !this.used.swap;
  }

  canHorn(): boolean {
    return !!this.battle && !this.ended && !this.used.horn;
  }

  canReserve(): boolean {
    return !!this.battle && !this.ended && !this.used.reserve;
  }

  swap(): boolean {
    if (!this.canSwap() || !this.battle) return false;
    if (!this.battle.swapFrontBack()) return false;
    this.used.swap = true;
    this.battle.att.forEach((s, i) => {
      const u = this.placed.find((p) => p.side === 'p' && p.id === s.id);
      if (u) u.index = i;
    });
    this.flashBanner('变阵');
    this.reflow();
    this.refreshHud();
    return true;
  }

  horn(): boolean {
    if (!this.canHorn() || !this.battle) return false;
    if (!this.battle.horn()) return false;
    this.used.horn = true;
    this.cameras.main.flash(120, 255, 220, 130);
    this.flashBanner(`冲锋号 ×${HORN_MULT}`);
    this.refreshHud();
    return true;
  }

  addReserve(id: string, code: string, men: number): boolean {
    if (!this.canReserve() || !this.battle) return false;
    if (this.placed.some((p) => p.id === id)) return false;
    let slot: { col: number; row: number } | null = null;
    for (const row of [7, 6, 5]) {
      for (let col = 0; col < GRID.cols; col += 1) {
        if (!this.occupied(col, row)) {
          slot = { col, row };
          break;
        }
      }
      if (slot) break;
    }
    if (!slot) {
      this.flashTip('没有空位可以投预备队了');
      return false;
    }
    const pos = this.cellCenter(slot.col, slot.row);
    const { sprite, bar, barBg, barDy } = this.spawnUnit(code, 'p', pos.x, pos.y);
    sprite.setAlpha(0.2);
    this.tweens.add({ targets: sprite, alpha: 1, duration: 200 });
    this.placed.push({ id, code, col: slot.col, row: slot.row, side: 'p', sprite, bar, barBg, barDy, index: this.battle.att.length, men, baseX: pos.x, baseY: pos.y, dead: false, lastHp: 0 });
    this.battle.addReserve({ code, men, id });
    this.used.reserve = true;
    this.flashBanner('预备队登场');
    this.time.delayedCall(240, () => this.reflow());
    this.refreshHud();
    return true;
  }

  private flashBanner(text: string) {
    const t = this.add
      .text(LOGICAL.w / 2, BORDER_Y - 62, text, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: '#e8d8a8',
        backgroundColor: '#0b0d12cc',
        padding: { x: 6, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({ targets: t, y: t.y - 18, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  update(_time: number, delta: number) {
    if (!this.battle || this.battle.done || !this.engaged) {
      this.syncUnits();
      return;
    }
    this.acc += delta;
    const stepMs = TICK_SEC * 1000;
    let guard = 0;
    while (this.acc >= stepMs && !this.battle.done && guard < 8) {
      this.battle.step();
      this.playTickFx();
      this.acc -= stepMs;
      guard += 1;
    }
    this.syncUnits();
    this.refreshHud();
    if (this.battle.done && !this.ended) {
      this.ended = true;
      const win = this.battle.winner() === 'att';
      const survivors = this.battle.att.map((s) => ({ id: s.id, men: Math.max(0, (s.men0 * Math.max(s.hp, 0)) / Math.max(s.hp0, 1)) }));
      const ticks = this.battle.ticks;
      this.time.delayedCall(600, () => this.onEnd?.({ win, survivors, ticks }));
    }
  }

  private playTickFx() {
    if (!this.battle) return;
    for (const u of this.placed) {
      if (u.dead) continue;
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      if (!slot || slot.hp <= 0) continue;
      const line = UNITS[u.code].line;
      const target = u.side === 'p' ? this.frontOf('e') : this.frontOf('p');
      if (line === 'rng') this.shoot(u, target);
      else this.lunge(u, line === 'cav' ? 30 : 16, target);
    }
    const hitEnemy = this.frontOf('e');
    const hitPlayer = this.frontOf('p');
    if (hitEnemy) this.hitFlash(hitEnemy);
    if (hitPlayer) this.hitFlash(hitPlayer);
    this.popDamage();
  }

  /** 前刺用绝对坐标往返，保证每 tick 都回到战线上 */
  private lunge(u: Placed, power: number, target: Placed | null) {
    const dir = u.side === 'p' ? -1 : 1;
    const ax = u.baseX;
    const ay = u.baseY;
    const gap = target ? Math.abs(target.baseY - ay) : power;
    const reach = Math.max(8, Math.min(power, gap * 0.45));
    this.slash(u, dir);
    this.tweens.add({ targets: u.sprite, x: ax, y: ay + dir * reach, duration: 90, ease: 'Sine.easeOut' });
    this.time.delayedCall(90, () => {
      this.tweens.add({ targets: u.sprite, x: ax, y: ay, duration: 140, ease: 'Sine.easeIn' });
    });
    if (target) {
      const mx = (u.sprite.x + target.sprite.x) / 2 + Phaser.Math.Between(-6, 6);
      const my = (ay + target.baseY) / 2 + Phaser.Math.Between(-4, 4);
      const spark = this.add.rectangle(mx, my, 4, 4, 0xffe9c0).setDepth(32);
      this.tweens.add({ targets: spark, alpha: 0, scale: 0.3, duration: 220, onComplete: () => spark.destroy() });
    }
  }

  private slash(u: Placed, toward: number) {
    const dir = toward < 0 ? -1 : 1;
    const arc = this.add.rectangle(u.sprite.x + Phaser.Math.Between(-6, 6), u.sprite.y + dir * 10, 22, 3, 0xfff2cf).setDepth(33).setAlpha(0.9);
    arc.setAngle(dir < 0 ? -38 : 38);
    this.tweens.add({
      targets: arc,
      x: arc.x + dir * 6,
      y: arc.y + dir * 16,
      alpha: 0,
      scaleY: 0.4,
      duration: 170,
      ease: 'Quad.easeOut',
      onComplete: () => arc.destroy()
    });
  }

  private shoot(from: Placed, to: Placed | null) {
    if (!to) return;
    const arrow = this.add.rectangle(from.sprite.x, from.sprite.y - 6, 9, 2, 0xe8dcb0).setDepth(30);
    const midY = (from.sprite.y + to.sprite.y) / 2 - 26;
    this.tweens.add({
      targets: arrow,
      x: (from.sprite.x + to.sprite.x) / 2,
      y: midY,
      duration: 90,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: arrow,
          x: to.sprite.x,
          y: to.sprite.y,
          angle: 30,
          duration: 110,
          ease: 'Sine.easeIn',
          onComplete: () => arrow.destroy()
        });
      }
    });
  }

  private hitFlash(u: Placed) {
    if (u.dead) return;
    u.sprite.setTint(0xffe0c0);
    this.time.delayedCall(120, () => {
      if (!u.sprite.scene) return;
      if (u.dead) u.sprite.setTint(0x8a8fa0);
      else u.sprite.clearTint();
    });
  }

  private popDamage() {
    if (!this.battle) return;
    for (const u of this.placed) {
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      if (!slot) continue;
      const loss = u.lastHp - slot.hp;
      u.lastHp = slot.hp;
      if (loss < 1) continue;
      const txt = this.add
        .text(u.sprite.x + 8, u.sprite.y - u.sprite.displayHeight * 0.5, `-${Math.round(loss)}`, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '10px',
          color: '#ffcf9a'
        })
        .setOrigin(0.5)
        .setDepth(40);
      if (loss >= 100) this.cameras.main.shake(70, 0.003);
      this.tweens.add({ targets: txt, y: txt.y - 14, alpha: 0, duration: 480, ease: 'Quad.easeOut', onComplete: () => txt.destroy() });
    }
  }

  /** 对面最前排的活人（与 sim 集火口径一致） */
  private frontOf(side: Side): Placed | null {
    if (!this.battle) return null;
    const slots = side === 'p' ? this.battle.att : this.battle.dfn;
    const idx = slots.findIndex((s) => s.hp > 0);
    if (idx < 0) return null;
    return this.placed.find((p) => p.side === side && p.index === idx) ?? null;
  }

  /** 倒下：侧倒压暗留场，血条收起，后排补位 */
  private fall(u: Placed) {
    u.dead = true;
    u.bar.setVisible(false);
    u.barBg.setVisible(false);
    this.dust(u, 4);
    this.tweens.add({
      targets: u.sprite,
      angle: u.side === 'p' ? -68 : 68,
      y: u.baseY + 8,
      alpha: 0.4,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => u.sprite.setTint(0x8a8fa0)
    });
    this.time.delayedCall(360, () => this.reflow());
  }

  private syncUnits() {
    if (!this.battle) return;
    for (const unit of this.placed) {
      unit.bar.setPosition(unit.sprite.x - BAR_W / 2, unit.sprite.y + unit.barDy);
      unit.barBg.setPosition(unit.sprite.x - BAR_W / 2, unit.sprite.y + unit.barDy);
      const slot = unit.side === 'p' ? this.battle.att[unit.index] : this.battle.dfn[unit.index];
      if (!slot) continue;
      const ratio = Math.max(slot.hp, 0) / Math.max(slot.hp0, 1);
      unit.bar.width = BAR_W * ratio;
      unit.bar.setFillStyle(ratio > 0.6 ? 0x62c06a : ratio > 0.3 ? 0xd8b04a : 0xc0574a);
      if (slot.hp <= 0 && !unit.dead) this.fall(unit);
    }
  }

  private refreshHud() {
    const ticks = this.battle ? this.battle.ticks : 0;
    const cp = armyCp(this.playerComp());
    const left = this.playerComp().length;
    const enemyLeft = this.placed.filter((p) => p.side === 'e').length;
    const horn = this.battle && this.battle.hornTicks > 0 ? ` · 冲锋号 ${this.battle.hornTicks}` : '';
    this.hud.setText(`第 ${this.layer} 层 · T ${ticks}/150 · 我 ${left} · 敌 ${enemyLeft} · 战力 ${Math.round(cp)}${horn}`);
    if (this.battle && this.battle.done && !this.resultText) {
      const win = this.battle.winner();
      const remain = Math.round(this.battle.attRemain() * 100);
      this.resultText = this.add
        .text(LOGICAL.w / 2, BORDER_Y, `${win === 'att' ? '胜' : '败'} · 余兵 ${remain}%`, {
          fontFamily: 'sans-serif',
          fontSize: '13px',
          color: win === 'att' ? '#d8c07a' : '#c0574a',
          backgroundColor: '#0b0d12cc',
          padding: { x: 8, y: 4 }
        })
        .setOrigin(0.5)
        .setDepth(45);
    }
  }
}
