/**
 * 入口：算整数倍缩放、起 Phaser、把 DOM 手牌接到战场。
 * 手牌走 DOM（设备分辨率），战场走 Phaser（逻辑分辨率），这正是 GDD 的「两套分辨率」。
 */
import Phaser from 'phaser';
import { FIELD, GRID, LOGICAL } from './config';
import { UNITS } from './sim/units';
import { BattleScene } from './game/BattleScene';

const CARDS = ['A1', 'A2', 'B2', 'B2', 'C1'];
const CHIP: Record<string, string> = { inf: '#6f8fc0', rng: '#7fa06a', cav: '#c08a5a' };

function availableBox() {
  // 用实际布局高度（clientHeight）而不是 innerHeight / 100vh：
  // 手机浏览器工具栏、动态视口会让三者不一致，按大的算就会把舞台顶出屏幕、按钮被裁
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const w = Math.min(doc.clientWidth || window.innerWidth, vv ? vv.width : Infinity);
  const h = Math.min(doc.clientHeight || window.innerHeight, vv ? vv.height : Infinity);
  return { w, h };
}

function layout() {
  const { w, h } = availableBox();
  const raw = Math.min(w / LOGICAL.w, h / LOGICAL.h);
  // 能整数倍就整数倍（像素不糊），放不下才降到小数倍——宁可略软也不能被裁
  const s = raw >= 1 ? Math.floor(raw) : Math.max(0.5, raw);
  const root = document.documentElement;
  root.style.setProperty('--stage-w', `${Math.round(LOGICAL.w * s)}px`);
  root.style.setProperty('--stage-h', `${Math.round(LOGICAL.h * s)}px`);
  root.style.setProperty('--hand-h', `${Math.round(Math.max(132, 160 * s))}px`);
}

layout();
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
window.visualViewport?.addEventListener('resize', layout);

const battle = new BattleScene();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: LOGICAL.w,
  height: LOGICAL.h,
  parent: 'canvas-host',
  backgroundColor: '#0d1017',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scene: [battle]
});
void game;

const canvasHost = document.getElementById('canvas-host')!;
const hand = document.getElementById('hand')!;
const ghost = document.getElementById('ghost')!;

// ---- 开战按钮 ----
const startBtn = document.createElement('button');
startBtn.textContent = '开战';
startBtn.style.cssText =
  'position:absolute;right:10px;top:8px;padding:8px 14px;border-radius:8px;border:1px solid #4a5a7a;' +
  'background:#1b2432;color:#cfd6e6;font-size:13px;line-height:1;min-height:34px;min-width:56px;' +
  'touch-action:manipulation;z-index:6;';
startBtn.addEventListener('click', () => {
  if (!battle.ready || battle.running) return;
  // 敌军在布阵阶段就摆好了，上一两张去打必输，先拦住并要求至少 3 张
  if (battle.playerCount() < 3) {
    battle.flashTip(`至少上 3 张兵牌（现在 ${battle.playerCount()} 张）`);
    return;
  }
  battle.start();
  startBtn.disabled = true;
  startBtn.style.opacity = '0.45';
});
document.getElementById('stage')!.appendChild(startBtn);

// ---- 手牌 ----
interface CardView {
  code: string;
  el: HTMLDivElement;
  used: boolean;
}

const cards: CardView[] = CARDS.map((code) => {
  const el = document.createElement('div');
  el.className = 'card';
  const u = UNITS[code];
  const chip = document.createElement('div');
  chip.style.cssText = `width:26px;height:6px;border-radius:3px;background:${CHIP[u.line]};margin:6px 0 4px;`;
  const name = document.createElement('div');
  name.textContent = u.name;
  const men = document.createElement('div');
  men.textContent = `${u.men} 人`;
  men.style.color = '#7d879c';
  el.append(chip, name, men);
  hand.appendChild(el);
  return { code, el, used: false };
});

let selected: CardView | null = null;
function select(card: CardView | null) {
  cards.forEach((c) => c.el.classList.toggle('selected', c === card));
  selected = card;
}

// ---- 拖拽 / 点选 ----
interface DragState {
  card: CardView;
  startX: number;
  startY: number;
  long: boolean;
  timer: number;
  moved: boolean;
}
let drag: DragState | null = null;

function endDrag() {
  if (drag) window.clearTimeout(drag.timer);
  ghost.style.display = 'none';
  drag = null;
}

function cellFromPoint(clientX: number, clientY: number) {
  const rect = canvasHost.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const lx = ((clientX - rect.left) / rect.width) * LOGICAL.w;
  const ly = ((clientY - rect.top) / rect.height) * LOGICAL.h;
  const col = Math.floor(lx / FIELD.cellW);
  const row = Math.floor((ly - FIELD.top) / FIELD.cellH);
  if (col < 0 || col >= GRID.cols || row < 0 || row >= GRID.rows) return null;
  return { col, row };
}

function tryPlace(card: CardView, clientX: number, clientY: number) {
  const cell = cellFromPoint(clientX, clientY);
  if (!cell) return false;
  if (!battle.ready) return false;
  if (!battle.placePlayer(card.code, cell.col, cell.row)) return false;
  card.used = true;
  card.el.style.opacity = '0.25';
  card.el.classList.remove('selected');
  selected = null;
  return true;
}

cards.forEach((card) => {
  card.el.addEventListener('pointerdown', (e) => {
    if (card.used || battle.running) return;
    e.preventDefault();
    select(card);
    drag = {
      card,
      startX: e.clientX,
      startY: e.clientY,
      long: false,
      moved: false,
      timer: window.setTimeout(() => {
        if (!drag) return;
        drag.long = true;
        ghost.style.display = 'block';
        ghost.style.left = `${e.clientX}px`;
        ghost.style.top = `${e.clientY}px`;
      }, 300)
    };
  });
});

window.addEventListener(
  'pointermove',
  (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.long) {
      if (Math.hypot(dx, dy) > 10) drag.moved = true;
      return;
    }
    ghost.style.left = `${e.clientX}px`;
    ghost.style.top = `${e.clientY}px`;
  },
  { passive: true }
);

window.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const state = drag;
  endDrag();
  if (state.long) {
    tryPlace(state.card, e.clientX, e.clientY);
  } else if (!state.moved) {
    select(state.card);
  }
});

// 点格子落子（不用长按的备选路径）
document.getElementById('input-layer')!.addEventListener('pointerup', (e) => {
  if (drag || !selected || battle.running) return;
  tryPlace(selected, e.clientX, e.clientY);
});

// ---- 演示模式：?demo=1 自动布阵并开战，用于回归截图 ----
if (new URLSearchParams(location.search).get('demo') === '1') {
  const formation: Array<{ code: string; col: number; row: number }> = [
    { code: 'A1', col: 1, row: 5 },
    { code: 'A2', col: 2, row: 5 },
    { code: 'B2', col: 0, row: 6 },
    { code: 'B2', col: 3, row: 6 },
    { code: 'C1', col: 1, row: 7 }
  ];
  const boot = () => {
    if (!battle.ready) {
      requestAnimationFrame(boot);
      return;
    }
    formation.forEach((f) => battle.placePlayer(f.code, f.col, f.row));
    cards.forEach((c) => {
      c.used = true;
      c.el.style.opacity = '0.25';
    });
    battle.start();
    const n = Number(new URLSearchParams(location.search).get('tick') ?? '0');
    if (n > 0) battle.debugStep(n);
  };
  boot();
}
