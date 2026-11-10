/**
 * 战斗结算。纯函数层，不 import 任何引擎代码。
 * 规则（GDD 定稿）：所有己方兵牌自动攻击对方最前排的存活兵牌，打空后整体转向下一张。
 */
import { SIEGE_MAX_TICK, MAX_TICK } from '../config';
import { UNITS, hpPool, counterOf, order } from './units';

export interface Squad {
  code: string;
  /** 当前人数，可为小数（残部推进时会出现） */
  men: number;
  /** 跨 tick 稳定的身份，用来把结算槽位映射回画面兵牌 */
  id?: string;
}

interface Slot {
  id: string;
  code: string;
  men0: number;
  hp: number;
  hp0: number;
  dead: boolean;
}

export interface Battle {
  readonly att: Slot[];
  readonly dfn: Slot[];
  ticks: number;
  readonly limit: number;
  done: boolean;
  /** 冲锋号剩余 tick；>0 时攻方每 tick 伤害 ×HORN_MULT */
  hornTicks: number;
  /** 每场只能吹一次，过期也不能再吹 */
  hornUsed: boolean;
  step(): void;
  /** 攻方总血量基数（投预备队后会变大，剩余比例以它作分母） */
  attHp0Total(): number;
  /** 攻方剩余血量比例（0–1） */
  attRemain(): number;
  dfnRemain(): number;
  winner(): 'att' | 'dfn' | null;
  /** 变阵：把最前排与最后排换位，挨打的人和出手顺序同时改变 */
  swapFrontBack(): boolean;
  /** 投预备队：把一支新兵牌追加进攻方，立刻参与结算 */
  addReserve(squad: Squad): boolean;
  /** 冲锋号：接下来 HORN_TICKS 个 tick 攻方伤害提升 */
  horn(): boolean;
}

export const HORN_TICKS = 6;
export const HORN_MULT = 1.45;

function makeSlots(list: Squad[]): Slot[] {
  return list.map((s, i) => {
    const hp = s.men * UNITS[s.code].hp;
    return { id: s.id ?? `${s.code}#${i}`, code: s.code, men0: s.men, hp, hp0: hp, dead: false };
  });
}

function firstAlive(slots: Slot[]): number {
  for (let i = 0; i < slots.length; i += 1) if (slots[i].hp > 0) return i;
  return -1;
}

/** 一张兵牌在某 tick 的输出：人数按剩余血量占比线性衰减。 */
function outputOf(slot: Slot, targetCode: string): number {
  if (slot.hp <= 0 || slot.hp0 <= 0) return 0;
  const self = UNITS[slot.code];
  const target = UNITS[targetCode];
  const alive = slot.men0 * (slot.hp / slot.hp0);
  return alive * self.dmg * counterOf(self.line, target.line) * (1 - target.armor / 100);
}

export function createBattle(att: Squad[], dfn: Squad[], limit = MAX_TICK): Battle {
  const a = makeSlots(att);
  const b = makeSlots(dfn);
  let attHp0 = a.reduce((s, x) => s + x.hp0, 0);
  const dfnHp0 = b.reduce((s, x) => s + x.hp0, 0);

  const battle: Battle = {
    att: a,
    dfn: b,
    ticks: 0,
    limit,
    done: false,
    hornTicks: 0,
    hornUsed: false,
    step() {
      if (battle.done || battle.ticks >= limit) {
        battle.done = true;
        return;
      }
      const af = firstAlive(a);
      const bf = firstAlive(b);
      if (af < 0 || bf < 0) {
        battle.done = true;
        return;
      }
      battle.ticks += 1;
      const targetOfA = b[bf].code;
      const targetOfB = a[af].code;

      const mult = battle.hornTicks > 0 ? HORN_MULT : 1;
      let dmgToB = 0;
      for (const s of a) dmgToB += outputOf(s, targetOfA) * mult;
      let dmgToA = 0;
      for (const s of b) dmgToA += outputOf(s, targetOfB);
      if (battle.hornTicks > 0) battle.hornTicks -= 1;

      // 与脚本一致：不做 0 截断，超额伤害保留为负值，剩余比例按原样求和。
      a[af].hp -= dmgToA;
      b[bf].hp -= dmgToB;

      if (firstAlive(a) < 0 || firstAlive(b) < 0) battle.done = true;
    },
    swapFrontBack() {
      if (battle.done || a.length < 2) return false;
      const front = a.shift();
      if (!front) return false;
      a.push(front);
      return true;
    },
    addReserve(squad) {
      if (battle.done) return false;
      if (a.some((s) => s.id === squad.id)) return false;
      const slot = makeSlots([squad])[0];
      a.push(slot);
      attHp0 += slot.hp0;
      return true;
    },
    horn() {
      if (battle.done || battle.hornUsed) return false;
      battle.hornUsed = true;
      battle.hornTicks = HORN_TICKS;
      return true;
    },
    // 与脚本同口径：阵亡兵牌的负血量不清零，直接参与求和，再整体取 max(…, 0)。
    attHp0Total() {
      return attHp0;
    },
    attRemain() {
      if (attHp0 <= 0) return 0;
      return Math.max(a.reduce((s, x) => s + x.hp, 0), 0) / attHp0;
    },
    dfnRemain() {
      if (dfnHp0 <= 0) return 0;
      return Math.max(b.reduce((s, x) => s + x.hp, 0), 0) / dfnHp0;
    },
    winner() {
      if (!battle.done) return null;
      if (firstAlive(a) < 0) return 'dfn';
      if (firstAlive(b) < 0) return 'att';
      return null;
    }
  };
  return battle;
}

/** 一次跑完，返回 tick 数与双方剩余比例（与脚本 army_fight 同口径）。 */
export function armyFight(att: Squad[], dfn: Squad[], limit = SIEGE_MAX_TICK) {
  const bt = createBattle(att, dfn, limit);
  while (!bt.done) bt.step();
  return { ticks: bt.ticks, attRemain: bt.attRemain(), dfnRemain: bt.dfnRemain(), winner: bt.winner() };
}

/** 1v1 对撞，返回 tick 与双方剩余人数。 */
export function duel(x: string, y: string, menX?: number, menY?: number) {
  const mx = menX ?? UNITS[x].men;
  const my = menY ?? UNITS[y].men;
  const r = armyFight(
    [{ code: x, men: mx }],
    [{ code: y, men: my }],
    MAX_TICK
  );
  return {
    ticks: r.ticks,
    xMen: (r.attRemain * hpPool(x, mx)) / UNITS[x].hp,
    yMen: (r.dfnRemain * hpPool(y, my)) / UNITS[y].hp,
    winner: r.winner
  };
}

/** 战力 = sqrt(总血量 × 总输出)。用于生成敌配与估战损。 */
export function armyCp(comp: string[]): number {
  const hp = comp.reduce((s, c) => s + hpPool(c), 0);
  const dps = comp.reduce((s, c) => s + UNITS[c].men * UNITS[c].dmg, 0);
  return Math.sqrt(hp * dps);
}

/** 从池里搜最接近目标战力的组合（同种可重复），返回按线序排好的阵容。 */
export function buildEnemy(targetCp: number, pool: string[], cap = 8): string[] {
  let best: string[] = [];
  let bestDiff = Infinity;
  const walk = (start: number, picked: string[]) => {
    const cp = picked.length ? armyCp(picked) : 0;
    const diff = Math.abs(cp - targetCp);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [...picked];
    }
    if (picked.length >= cap) return;
    for (let i = start; i < pool.length; i += 1) {
      picked.push(pool[i]);
      walk(i, picked);
      picked.pop();
    }
  };
  walk(0, []);
  return order(best);
}
