/**
 * 九张兵牌的定稿数值。唯一口径：
 *   每 tick 伤害 = 人数 × 每兵每 tick 基础伤害 × 克制系数 × (1 − 护甲/100)
 * 不是 DPS、不是每秒。与 tools/balance_calc.py 的表 1 完全一致。
 */

export type Line = 'inf' | 'rng' | 'cav';

export interface UnitDef {
  code: string;
  name: string;
  line: Line;
  /** 满编人数：30 / 20 / 10 三档，同时是画面剪影数量的依据 */
  men: number;
  /** 每兵血量 */
  hp: number;
  /** 每兵每 tick 基础伤害 */
  dmg: number;
  /** 护甲，只有 10 / 20 / 30 三档 */
  armor: number;
  speed: number;
  range: number;
}

export const UNITS: Record<string, UnitDef> = {
  A1: { code: 'A1', name: '新兵', line: 'inf', men: 30, hp: 40, dmg: 1.0, armor: 10, speed: 1.0, range: 1 },
  A2: { code: 'A2', name: '步兵', line: 'inf', men: 30, hp: 50, dmg: 1.15, armor: 20, speed: 1.0, range: 1 },
  A3: { code: 'A3', name: '重步', line: 'inf', men: 30, hp: 60, dmg: 1.3, armor: 30, speed: 0.8, range: 1 },
  B1: { code: 'B1', name: '民兵弓', line: 'rng', men: 20, hp: 30, dmg: 1.8, armor: 10, speed: 0.8, range: 4 },
  B2: { code: 'B2', name: '弓手', line: 'rng', men: 20, hp: 36, dmg: 2.1, armor: 10, speed: 0.8, range: 4 },
  B3: { code: 'B3', name: '长弓', line: 'rng', men: 20, hp: 42, dmg: 2.4, armor: 10, speed: 0.8, range: 5 },
  C1: { code: 'C1', name: '轻骑', line: 'cav', men: 10, hp: 90, dmg: 3.2, armor: 10, speed: 2.5, range: 1 },
  C2: { code: 'C2', name: '骑兵', line: 'cav', men: 10, hp: 100, dmg: 3.6, armor: 20, speed: 2.5, range: 1 },
  C3: { code: 'C3', name: '重骑', line: 'cav', men: 10, hp: 110, dmg: 4.0, armor: 30, speed: 2.2, range: 1 }
};

/** 克制三角：重步→骑兵 1.8；骑兵→弓 1.8；弓→步兵 1.3；其余 1.0。 */
export const COUNTER: Record<string, number> = {
  'inf>cav': 1.8,
  'cav>rng': 1.8,
  'rng>inf': 1.3
};

export function counterOf(attacker: Line, defender: Line): number {
  return COUNTER[`${attacker}>${defender}`] ?? 1.0;
}

/** 满编血量池；传 men 可算残部。 */
export function hpPool(code: string, men?: number): number {
  const u = UNITS[code];
  return (men ?? u.men) * u.hp;
}

/** 一次打击的伤害（人数为当前存活人数）。 */
export function damageOn(attacker: string, defender: string, men?: number): number {
  const a = UNITS[attacker];
  const d = UNITS[defender];
  const n = men ?? a.men;
  return n * a.dmg * counterOf(a.line, d.line) * (1 - d.armor / 100);
}

/** 线序：步兵在前、弓在中、骑在后。 */
export function order(comp: string[]): string[] {
  const rank: Record<Line, number> = { inf: 0, rng: 1, cav: 2 };
  return [...comp].sort((x, y) => rank[UNITS[x].line] - rank[UNITS[y].line]);
}
