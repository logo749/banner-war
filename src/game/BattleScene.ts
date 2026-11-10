/**
 * 战场场景：只负责画格子、画兵牌、按 tick 推进结算并刷新人数条。
 * 所有规则都在 src/sim/ 里，这里不写任何数值。
 */
import Phaser from 'phaser';
import { ENEMY_ROWS, FIELD, GRID, LOGICAL, PLAYER_ROWS, TICK_SEC } from '../config';
import { UNITS } from '../sim/units';
import { armyCp, createBattle, type Battle, type Squad } from '../sim/battle';
import { buildUnitTextures, textureKey, type Side } from './textures';

const BAR_W = 44;

/** 本关敌军的实际编成：布阵阶段就摆在敌区，预览即实际编成，不临场再抽。
 *  标定依据：对标准 5 张（A1 A2 B2 B2 C1，战力 954）战损 52%、38 tick（15.2s），
 *  落在 docs/plan.md M1 的「15–25 秒、余兵 14%–50%」区间内。*/
const ENEMY_FORMATION = ['A3', 'B2', 'C1', 'C2'];
const ENEMY_COLS = [1, 2, 0, 3];
const ENEMY_ROW_SLOTS = [3, 2, 1, 0];

interface Placed {
  code: string;
  col: number;
  row: number;
  side: Side;
  sprite: Phaser.GameObjects.Image;
  bar: Phaser.GameObjects.Rectangle;
  barBg: Phaser.GameObjects.Rectangle;
  index: number;
  /** 站位基准点：所有动作都以它为中心来回，避免动画把兵牌越漂越偏 */
  baseX: number;
  baseY: number;
  dead: boolean;
  lastHp: number;
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
    this.spawnEnemy();
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
      // 敌区用中性深灰而非暗红：暗红会和敌兵红甲糊成一片
      else if (inEnemy) g.fillStyle(0x201c26, 1);
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
    // 落子反馈：0.85→1 的弹一下并轻微上浮。透明度不参与动画，避免任何一帧丢失导致兵牌不可见
    sprite.setScale(0.85);
    sprite.setY(pos.y + 3);
    this.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, y: pos.y, duration: 160, ease: 'Quad.easeOut' });
    this.placed.push({ code, col, row, side: 'p', sprite, bar, barBg, index: -1, baseX: pos.x, baseY: pos.y, dead: false, lastHp: 0 });
    this.tip.setVisible(false);
    this.refreshHud();
    return true;
  }

  playerCount(): number {
    return this.placed.filter((p) => p.side === 'p').length;
  }

  /** 临时提示（例如兵牌不够就点开战），1.6 秒后自动恢复正常提示 */
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

  /** 布阵阶段就把本关敌军摆出来，玩家能看着敌阵选兵；开战时直接复用这批，不另生成。 */
  private spawnEnemy() {
    ENEMY_FORMATION.forEach((code, i) => {
      const col = ENEMY_COLS[i % ENEMY_COLS.length];
      const row = ENEMY_ROW_SLOTS[i % ENEMY_ROW_SLOTS.length];
      const pos = this.cellCenter(col, row);
      const sprite = this.add.image(pos.x, pos.y, textureKey(code, 'e')).setDisplaySize(64, 64);
      const barBg = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x000000, 0.6).setOrigin(0, 0.5);
      const bar = this.add.rectangle(pos.x - BAR_W / 2, pos.y + 30, BAR_W, 4, 0x62c06a).setOrigin(0, 0.5);
      this.placed.push({ code, col, row, side: 'e', sprite, bar, barBg, index: -1, baseX: pos.x, baseY: pos.y, dead: false, lastHp: 0 });
    });
  }

  start() {
    if (this.battle) return;
    const players = this.placed.filter((p) => p.side === 'p').sort((a, b) => a.row - b.row || a.col - b.col);
    const enemies = this.placed.filter((p) => p.side === 'e');
    if (players.length === 0 || enemies.length === 0) return;

    const playerSquads: Squad[] = players.map((p) => ({ code: p.code, men: UNITS[p.code].men }));
    const enemySquads: Squad[] = enemies.map((p) => ({ code: p.code, men: UNITS[p.code].men }));
    players.forEach((p, i) => (p.index = i));
    enemies.forEach((p, i) => (p.index = i));

    this.battle = createBattle(playerSquads, enemySquads, 150);
    this.acc = 0;
    for (const u of this.placed) {
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      u.lastHp = slot ? slot.hp : 0;
    }
    this.refreshHud();
    this.drumRoll();
  }

  /** 开战瞬间的列队踏步，告诉玩家“打起来了” */
  private drumRoll() {
    this.placed.forEach((u, i) => {
      if (u.dead) return;
      const dir = u.side === 'p' ? -1 : 1;
      const barY = u.baseY + 30;
      this.tweens.add({
        targets: u.sprite,
        y: u.baseY + dir * 7,
        duration: 110,
        yoyo: true,
        delay: i * 25,
        ease: 'Sine.easeOut'
      });
      this.tweens.add({
        targets: [u.bar, u.barBg],
        y: barY + dir * 7,
        duration: 110,
        yoyo: true,
        delay: i * 25,
        ease: 'Sine.easeOut'
      });
      // 呼吸感：两条 tick 之间也有细微起伏，看着不像贴图
      this.tweens.add({
        targets: u.sprite,
        scaleY: 0.97,
        duration: 420 + (i % 4) * 60,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });
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
      this.playTickFx();
      this.acc -= stepMs;
      guard += 1;
    }
    this.syncUnits();
    this.refreshHud();
  }

  /** 每一 tick 的动作表现：近战前冲、弓手放箭、受击闪光、伤亡飘字。规则全在 sim 里，这里只做表演。 */
  private playTickFx() {
    if (!this.battle) return;
    const enemies = this.placed.filter((p) => p.side === 'e' && !p.dead);
    const players = this.placed.filter((p) => p.side === 'p' && !p.dead);
    for (const u of [...players, ...enemies]) {
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      if (!slot || slot.hp <= 0) continue;
      const dir = u.side === 'p' ? -1 : 1;
      const line = UNITS[u.code].line;
      const target = u.side === 'p' ? this.frontOf('e') : this.frontOf('p');
      if (line === 'rng') this.shoot(u, target);
      else this.lunge(u, dir, line === 'cav' ? 22 : 11);
    }
    const hitEnemy = this.frontOf('e');
    const hitPlayer = this.frontOf('p');
    if (hitEnemy) this.hitFlash(hitEnemy);
    if (hitPlayer) this.hitFlash(hitPlayer);
    this.popDamage();
  }

  private lunge(u: Placed, dir: number, power: number) {
    // 绝对坐标往返（不是 += 相对位移）：每 tick 都精确回到站位，避免累积漂移把人“飘”出格子
    const dy = dir * power;
    const barY = u.baseY + 30;
    this.tweens.add({ targets: u.sprite, y: u.baseY + dy, duration: 70, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: [u.bar, u.barBg], y: barY + dy, duration: 70, ease: 'Sine.easeOut' });
    this.time.delayedCall(70, () => {
      this.tweens.add({ targets: u.sprite, y: u.baseY, duration: 130, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: [u.bar, u.barBg], y: barY, duration: 130, ease: 'Sine.easeIn' });
    });
  }

  private shoot(from: Placed, to: Placed | null) {
    if (!to) return;
    const arrow = this.add.rectangle(from.baseX, from.baseY - 8, 3, 3, 0xeadcb0).setDepth(30);
    this.tweens.add({
      targets: arrow,
      x: to.baseX,
      y: to.baseY,
      duration: 150,
      ease: 'Linear',
      onComplete: () => arrow.destroy()
    });
  }

  private hitFlash(u: Placed) {
    if (u.dead) return;
    u.sprite.setTint(0xff8f70);
    this.time.delayedCall(120, () => {
      if (!u.sprite.scene) return;
      if (u.dead) u.sprite.setTint(0x8a8fa0);
      else u.sprite.clearTint();
    });
  }

  /** 伤害飘字：拿本 tick 的血量差，直接从结算结果读，不另算一套 */
  private popDamage() {
    if (!this.battle) return;
    for (const u of this.placed) {
      const slot = u.side === 'p' ? this.battle.att[u.index] : this.battle.dfn[u.index];
      if (!slot) continue;
      const loss = u.lastHp - slot.hp;
      u.lastHp = slot.hp;
      if (loss < 1) continue;
      const txt = this.add
        .text(u.baseX + 6, u.baseY - 12, `-${Math.round(loss)}`, {
          fontFamily: 'ui-monospace, monospace',
          fontSize: '10px',
          color: '#ffcf9a'
        })
        .setOrigin(0.5)
        .setDepth(40);
      // 掉血过百才震屏，避免每秒八次抖动把人晃晕
      if (loss >= 100) this.cameras.main.shake(70, 0.003);
      this.tweens.add({
        targets: txt,
        y: txt.y - 14,
        alpha: 0,
        duration: 480,
        ease: 'Quad.easeOut',
        onComplete: () => txt.destroy()
      });
    }
  }

  /** 对面最前排的存活兵牌（与 sim 的集火口径一致：索引最小的活人） */
  private frontOf(side: 'p' | 'e'): Placed | null {
    if (!this.battle) return null;
    const slots = side === 'p' ? this.battle.att : this.battle.dfn;
    const idx = slots.findIndex((s) => s.hp > 0);
    if (idx < 0) return null;
    return this.placed.find((p) => p.side === side && p.index === idx) ?? null;
  }

  /** 倒下的兵牌：侧倒 + 压暗，而不是凭空消失 */
  private fall(u: Placed) {
    u.dead = true;
    u.bar.setVisible(false);
    u.barBg.setVisible(false);
    this.tweens.add({
      targets: u.sprite,
      angle: u.side === 'p' ? -72 : 72,
      y: u.baseY + 6,
      alpha: 0.45,
      duration: 320,
      ease: 'Quad.easeIn',
      onComplete: () => u.sprite.setTint(0x8a8fa0)
    });
  }

  private syncUnits() {
    if (!this.battle) return;
    for (const unit of this.placed) {
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
    this.hud.setText(`T ${ticks}/150 · 我 ${left} · 敌 ${enemyLeft} · 战力 ${Math.round(cp)}`);
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
