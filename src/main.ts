/**
 * 入口：算整数倍缩放、起 Phaser、接上「地图 → 布阵 → 战斗 → 结算 → 回地图」的局内循环。
 * 手牌走 DOM（设备分辨率），战场走 Phaser（逻辑分辨率），这正是 GDD 的「两套分辨率」。
 */
import Phaser from 'phaser';
import { FIELD, GRID, LOGICAL } from './config';
import { UNITS } from './sim/units';
import { BattleScene } from './game/BattleScene';
import { renderMap } from './run/map';
import { applyBattle, clearRun, enemyFor, loadRun, newRun, NODES, saveRun, supply, type RunState } from './run/state';

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

const stage = document.getElementById('stage')!;
const canvasHost = document.getElementById('canvas-host')!;
const hand = document.getElementById('hand')!;
const ghost = document.getElementById('ghost')!;

// ---- 地图层 ----
const mapHost = document.createElement('div');
mapHost.style.cssText = 'position:absolute;inset:0;z-index:9;display:none;';
stage.appendChild(mapHost);

// ---- 动作条：变阵 / 预备队 / 冲锋号 / 开战 ----
const actionBar = document.createElement('div');
actionBar.style.cssText =
  'position:absolute;left:0;right:0;bottom:var(--hand-h);height:36px;display:none;align-items:center;' +
  'justify-content:space-between;gap:6px;padding:0 8px;box-sizing:border-box;z-index:7;' +
  'background:linear-gradient(180deg,rgba(9,11,16,0),rgba(9,11,16,0.82));';
stage.appendChild(actionBar);

function mkAct(text: string, onClick: () => void) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText =
    'flex:0 0 auto;padding:6px 9px;border-radius:7px;border:1px solid #4a5a7a;background:#1b2432;' +
    'color:#cfd6e6;font-size:11px;line-height:1.2;min-height:28px;touch-action:manipulation;';
  b.addEventListener('click', onClick);
  return b;
}

const btnSwap = mkAct('变阵', () => {
  if (!battle.running) return;
  if (battle.swap()) refreshActions();
});
const btnReserve = mkAct('预备队', () => {
  if (!battle.running) return;
  const next = deck.find((c) => !placedIds.has(c.id));
  if (!next) {
    battle.flashTip('没有预备的兵牌了');
    return;
  }
  if (battle.addReserve(next.id, next.code, next.men)) {
    placedIds.add(next.id);
    placedIds.add(next.id);
    syncHandUsed();
    refreshActions();
  }
});
const btnHorn = mkAct('冲锋号', () => {
  if (!battle.running) return;
  if (battle.horn()) refreshActions();
});
const startBtn = mkAct('开战', () => {
  if (!battle.ready || battle.running || battle.finished) return;
  if (battle.playerCount() < 3) {
    battle.flashTip(`至少上 3 张兵牌（现在 ${battle.playerCount()} 张）`);
    return;
  }
  battle.start();
  refreshActions();
});
startBtn.style.cssText += 'border-color:#d8a566;background:#2a2318;color:#f0d8a8;font-size:12px;padding:6px 14px;';

actionBar.append(btnSwap, btnReserve, btnHorn, startBtn);

function refreshActions() {
  const lock = battle.running || battle.finished;
  startBtn.textContent = battle.running ? '交战中' : battle.finished ? '已结束' : '开战';
  startBtn.disabled = lock;
  btnSwap.disabled = !battle.canSwap();
  btnReserve.disabled = !battle.canReserve();
  btnHorn.disabled = !battle.canHorn();
  for (const b of [btnSwap, btnReserve, btnHorn, startBtn]) b.style.opacity = b.disabled ? '0.45' : '1';
  syncHandUsed();
}

// ---- 局内状态 ----
let run: RunState = loadRun() ?? newRun();
let deck = run.deck;
const placedIds = new Set<string>();

interface HandCard {
  id: string;
  code: string;
  el: HTMLDivElement;
  used: boolean;
}
const handCards: HandCard[] = [];

function renderHand() {
  hand.innerHTML = '';
  handCards.length = 0;
  for (const card of deck) {
    const el = document.createElement('div');
    el.className = 'card';
    const u = UNITS[card.code];
    const chip = document.createElement('div');
    chip.style.cssText = `width:26px;height:6px;border-radius:3px;background:${CHIP[u.line]};margin:6px 0 4px;`;
    const name = document.createElement('div');
    name.textContent = u.name;
    const men = document.createElement('div');
    men.textContent = `${Math.round(card.men)}/${u.men}`;
    men.style.color = '#7d879c';
    el.append(chip, name, men);
    hand.appendChild(el);
    handCards.push({ id: card.id, code: card.code, el, used: false });
  }
  syncHandUsed();
}

function syncHandUsed() {
  for (const c of handCards) {
    c.used = placedIds.has(c.id) || battle.running || battle.finished;
    c.el.style.opacity = placedIds.has(c.id) ? '0.25' : battle.running || battle.finished ? '0.55' : '1';
  }
}

// ---- 屏幕切换 ----
function showMap() {
  mapHost.style.display = 'block';
  actionBar.style.display = 'none';
  hand.style.display = 'none';
  ghost.style.display = 'none';
  renderMap(mapHost, run, {
    onEnter: advanceNode,
    onRecruit: (code, price) => {
      if (run.coins < price) return;
      run.coins -= price;
      run.deck.push({ id: `c${run.seq++}`, code, men: UNITS[code].men });
      run.layer += 1;
      deck = run.deck;
      saveRun(run);
      showMap();
    },
    onSupply: () => {
      supply(run);
      run.layer += 1;
      deck = run.deck;
      saveRun(run);
      showMap();
    },
    onRestart: () => {
      const fame = run.fame;
      clearRun();
      run = newRun(fame);
      deck = run.deck;
      saveRun(run);
      showMap();
    }
  });
}

/** 当前节点：战斗就进战场，募兵/补给就直接推进一层 */
function advanceNode() {
  const kind = NODES[Math.min(run.layer, NODES.length - 1)];
  if (kind === 'battle' || kind === 'boss') {
    enterBattle();
    return;
  }
  run.layer += 1;
  saveRun(run);
  showMap();
}

function enterBattle() {
  mapHost.style.display = 'none';
  actionBar.style.display = 'flex';
  hand.style.display = 'flex';
  placedIds.clear();
  deck = run.deck;
  renderHand();
  battle.reset(enemyFor(run.layer, deck), run.layer + 1, (r) => {
    applyBattle(run, r.win, r.survivors);
    saveRun(run);
    deck = run.deck;
    refreshActions();
    setTimeout(() => {
      renderHand();
      showMap();
    }, 600);
  });
  refreshActions();
}

// ---- 拖拽 / 点选 ----
interface DragState {
  card: HandCard;
  startX: number;
  startY: number;
  long: boolean;
  timer: number;
  moved: boolean;
}
let drag: DragState | null = null;
let selected: HandCard | null = null;

function select(card: HandCard | null) {
  handCards.forEach((c) => c.el.classList.toggle('selected', c === card));
  selected = card;
}

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

function tryPlace(card: HandCard, clientX: number, clientY: number) {
  const cell = cellFromPoint(clientX, clientY);
  if (!cell) return false;
  if (!battle.ready || battle.running || battle.finished) return false;
  const entry = deck.find((c) => c.id === card.id);
  if (!entry) return false;
  if (!battle.placePlayer(card.code, cell.col, cell.row, card.id, entry.men)) return false;
  placedIds.add(card.id);
  card.el.classList.remove('selected');
  selected = null;
  syncHandUsed();
  refreshActions();
  return true;
}

hand.addEventListener('pointerdown', (e) => {
  const target = (e.target as HTMLElement).closest('.card') as HTMLDivElement | null;
  if (!target) return;
  const card = handCards.find((c) => c.el === target);
  if (!card || card.used || battle.running) return;
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

// ---- 首屏 ----
renderHand();
showMap();

// ---- 演示模式：?demo=battle 自动布阵开战，用于回归截图 ----
const params = new URLSearchParams(location.search);
if (params.get('demo') === 'battle') {
  const want = Number(params.get('layer') ?? '1');
  const boot = () => {
    if (!battle.ready) {
      requestAnimationFrame(boot);
      return;
    }
    run.layer = Math.min(Math.max(want - 1, 0), 7);
    deck = run.deck;
    enterBattle();
    const formation: Array<{ code: string; col: number; row: number; men: number }> = [
      { code: 'A1', col: 1, row: 5, men: 30 },
      { code: 'A2', col: 2, row: 5, men: 30 },
      { code: 'B2', col: 0, row: 6, men: 20 },
      { code: 'B2', col: 3, row: 6, men: 20 },
      { code: 'C1', col: 1, row: 7, men: 10 }
    ];
    formation.forEach((f, i) => {
      battle.placePlayer(f.code, f.col, f.row, `d${i}`, f.men);
    });
    battle.start();
    refreshActions();
  };
  boot();
}
