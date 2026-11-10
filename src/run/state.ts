/**
 * 单局 roguelite 的局内状态：银币、层数、部队（含残部人数）、名望。
 * 只存局内可丢的东西；名望是跨局保留的，失败也留。
 */
import { UNITS, order } from '../sim/units';
import { armyCp, buildEnemy } from '../sim/battle';
import { mulberry32 } from '../sim/rng';

export type NodeKind = 'battle' | 'recruit' | 'supply' | 'boss';

/** 8 层的节点排布：打完、招兵、再打、补给拉练、再打、招兵、再打、守关 */
export const NODES: NodeKind[] = ['battle', 'recruit', 'battle', 'supply', 'battle', 'recruit', 'battle', 'boss'];

export interface Card {
  id: string;
  code: string;
  /** 当前人数：满编是 UNITS[code].men，打完仗按剩余血量折算 */
  men: number;
}

export interface RunState {
  coins: number;
  fame: number;
  /** 即将进入的层，0 基；等于 8 表示已通关 */
  layer: number;
  deck: Card[];
  /** 最近一次战斗结果，地图页用来显示 */
  lastResult?: string;
  /** 递增，用来生成稳定的卡牌 id */
  seq: number;
}

const KEY = 'bw:run:v2';
const START_DECK = ['A1', 'A2', 'B2', 'B2', 'C1'];
const START_COINS = 80;

export function newRun(fame = 0): RunState {
  let seq = 1;
  const deck: Card[] = START_DECK.map((code) => ({ id: `c${seq++}`, code, men: UNITS[code].men }));
  return { coins: START_COINS, fame, layer: 0, deck, seq };
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RunState;
    if (!parsed || !Array.isArray(parsed.deck)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRun(s: RunState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 存不了就只活在这一局里，不影响玩 */
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 每层敌军强度系数：前松后紧，第 8 层守关最狠。
 *  区间参考 docs/plan.md：玩家战力 954 时，系数 0.78→1.16 对应战损约 25%→65%。 */
export const LAYER_FACTOR = [0.78, 0.84, 0.9, 0.94, 0.98, 1.02, 1.08, 1.16];

/** 按当前部队战力生成该层敌军，随层数换池子 */
export function enemyFor(layer: number, deck: Array<Card | string>): string[] {
  const pool =
    layer < 2 ? ['A1', 'A2', 'B1', 'C1'] : layer < 5 ? ['A1', 'A2', 'A3', 'B1', 'B2', 'C1'] : ['A2', 'A3', 'B2', 'B3', 'C1', 'C2'];
  const codes = deck.map((c) => (typeof c === 'string' ? c : c.code));
  const cp = armyCp(codes);
  const factor = LAYER_FACTOR[Math.min(layer, LAYER_FACTOR.length - 1)];
  const target = cp * factor;
  const comp = buildEnemy(target, pool, 6);
  return order(comp.length ? comp : ['A1', 'A1']);
}

export function rewardOf(layer: number): number {
  return 60 + layer * 25;
}

export function supplyCost(): number {
  return 60;
}

/** 补给：花银币把全军的缺员补回 30% */
export function supply(s: RunState): boolean {
  const cost = supplyCost();
  if (s.coins < cost) return false;
  s.coins -= cost;
  for (const c of s.deck) {
    const full = UNITS[c.code].men;
    c.men = Math.min(full, c.men + full * 0.3);
  }
  return true;
}

/** 招募三选一，价格随层数上浮；同层多次打开也给同一批，靠 seed 固定 */
export interface Offer {
  code: string;
  price: number;
}

export function recruitOffer(layer: number): Offer[] {
  const rng = mulberry32(20261110 + layer * 7919);
  const pool = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];
  const picked: Offer[] = [];
  while (picked.length < 3) {
    const code = pool[Math.floor(rng() * pool.length)];
    if (picked.some((p) => p.code === code)) continue;
    const base = UNITS[code].men * (2.2 + UNITS[code].dmg);
    picked.push({ code, price: Math.round((base + layer * 6) / 10) * 10 });
  }
  return picked;
}

/** 战后结算：写回残部人数、发银币、推进层数 */
export function applyBattle(s: RunState, win: boolean, survivors: Array<{ id: string; men: number }>) {
  for (const sv of survivors) {
    const card = s.deck.find((c) => c.id === sv.id);
    if (card) card.men = Math.max(0, Math.round(sv.men * 10) / 10);
  }
  // 阵亡的兵牌直接出局
  s.deck = s.deck.filter((c) => c.men >= 1);
  if (win) {
    s.coins += rewardOf(s.layer);
    s.layer += 1;
    s.lastResult = `胜 · +${rewardOf(s.layer - 1)} 银币`;
    s.fame += 10;
  } else {
    s.lastResult = '败 · 本局结束';
    s.fame += Math.max(0, s.layer * 4);
  }
}
