/**
 * 全局常量：所有数值只在这里定义一次，画面与结算都读它。
 */

/** 逻辑分辨率（像素层的基准）。宽度 360 是为了在 390–430 CSS px 的手机上能整数倍 1:1 铺满。 */
export const LOGICAL = { w: 360, h: 780 } as const;

/** 一个 tick 的秒数，与 GDD 定稿一致：单场上限 150 tick = 60 秒。 */
export const TICK_SEC = 0.4;
export const MAX_TICK = 150;
export const SIEGE_MAX_TICK = 400;

/** 战场 4 列 × 8 行。 */
export const GRID = { cols: 4, rows: 8 } as const;

/** 战场区：每格 90 × 70，8 行共 560。 */
export const FIELD = { top: 56, cellW: 90, cellH: 70 } as const;

/** 玩家占第 6–8 行（索引 5–7），敌军自上压下。 */
export const PLAYER_ROWS = [5, 6, 7];
export const ENEMY_ROWS = [0, 1, 2, 3];

export function cellRect(col: number, row: number) {
  return {
    x: col * FIELD.cellW,
    y: FIELD.top + row * FIELD.cellH,
    w: FIELD.cellW,
    h: FIELD.cellH
  };
}

export function cellCenter(col: number, row: number) {
  const r = cellRect(col, row);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
