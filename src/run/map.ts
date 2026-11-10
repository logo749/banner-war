/**
 * 地图页：8 层节点、银币、部队、招募 / 补给面板。
 * 只管把状态画出来并回调，不做任何结算。
 */
import { UNITS } from '../sim/units';
import { NODES, recruitOffer, supplyCost, type NodeKind, type RunState } from './state';

const KIND_LABEL: Record<NodeKind, string> = {
  battle: '遭遇战',
  boss: '守关战',
  recruit: '募兵',
  supply: '补给'
};

const KIND_HINT: Record<NodeKind, string> = {
  battle: '打一场，赢了往下走',
  boss: '第 8 层，敌军最强',
  recruit: '花银币三选一',
  supply: `花 ${supplyCost()} 银币补员 30%`
};

export interface MapHooks {
  onEnter: () => void;
  onRecruit: (code: string, price: number) => void;
  onSupply: () => void;
  onRestart: () => void;
}

export function renderMap(host: HTMLElement, s: RunState, hooks: MapHooks) {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:10px 10px 12px 10px;' +
    'box-sizing:border-box;background:#0d1017;color:#cfd6e6;font-size:12px;overflow:hidden;';

  // 顶栏
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-family:ui-monospace,monospace;font-size:11px;color:#8fa1bf;';
  const left = document.createElement('span');
  left.textContent = `第 ${Math.min(s.layer + 1, 8)}/${8} 层 · 银币 ${s.coins} · 名望 ${s.fame}`;
  const restart = document.createElement('button');
  restart.textContent = '重开';
  restart.style.cssText = 'padding:5px 9px;border-radius:7px;border:1px solid #4a5a7a;background:#1b2432;color:#cfd6e6;font-size:11px;';
  restart.addEventListener('click', hooks.onRestart);
  bar.append(left, restart);
  wrap.appendChild(bar);

  if (s.lastResult) {
    const r = document.createElement('div');
    r.textContent = s.lastResult;
    r.style.cssText = 'font-size:11px;color:#d8b04a;padding-left:2px;';
    wrap.appendChild(r);
  }

  // 8 层节点
  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
  for (let i = 0; i < 8; i += 1) {
    const done = i < s.layer;
    const cur = i === s.layer;
    const row = document.createElement('div');
    row.style.cssText =
      `display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;` +
      `border:1px solid ${cur ? '#d8a566' : '#263043'};background:${cur ? '#1d2430' : done ? '#121722' : '#0f131b'};` +
      `opacity:${done ? 0.45 : cur ? 1 : 0.7};`;
    const idx = document.createElement('span');
    idx.textContent = `${i + 1}`;
    idx.style.cssText = 'width:16px;font-family:ui-monospace,monospace;color:#7d879c;';
    const kind = document.createElement('span');
    kind.textContent = KIND_LABEL[NODES[i]];
    kind.style.cssText = `flex:0 0 52px;color:${NODES[i] === 'boss' ? '#d0706a' : '#cfd6e6'};`;
    const hint = document.createElement('span');
    hint.textContent = done ? '已通过' : KIND_HINT[NODES[i]];
    hint.style.cssText = 'flex:1;color:#6f7b93;font-size:11px;';
    row.append(idx, kind, hint);
    list.appendChild(row);
  }
  wrap.appendChild(list);

  // 部队
  const deckBox = document.createElement('div');
  deckBox.style.cssText = 'flex:1;min-height:0;overflow:auto;border-top:1px solid #1d2637;padding-top:6px;';
  const title = document.createElement('div');
  title.textContent = `部队 ${s.deck.length} 张`;
  title.style.cssText = 'color:#8fa1bf;font-size:11px;margin-bottom:4px;';
  deckBox.appendChild(title);
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
  for (const c of s.deck) {
    const chipEl = document.createElement('div');
    const u = UNITS[c.code];
    chipEl.style.cssText =
      'padding:4px 7px;border-radius:6px;border:1px solid #2f3a52;background:#141a26;font-size:10px;line-height:1.3;';
    chipEl.textContent = `${u.name} ${Math.round(c.men)}/${u.men}`;
    grid.appendChild(chipEl);
  }
  deckBox.appendChild(grid);
  wrap.appendChild(deckBox);

  // 当前节点面板
  const panel = document.createElement('div');
  panel.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  const node = NODES[Math.min(s.layer, NODES.length - 1)];

  if (s.layer >= 8) {
    const win = document.createElement('div');
    win.textContent = '通关了 · 8 层全部打完';
    win.style.cssText = 'text-align:center;color:#d8c07a;font-size:13px;padding:6px;';
    const btn = mkButton('开新局', hooks.onRestart, true);
    panel.append(win, btn);
  } else if ((s.lastResult ?? '').startsWith('败')) {
    const lost = document.createElement('div');
    lost.textContent = `本局结束在第 ${s.layer + 1} 层 · 名望 +${Math.max(0, s.layer * 4)} 已保留`;
    lost.style.cssText = 'text-align:center;color:#c0877a;font-size:12px;padding:6px;';
    const btn = mkButton('开新局', hooks.onRestart, true);
    panel.append(lost, btn);
  } else if (node === 'recruit') {
    const tip = document.createElement('div');
    tip.textContent = `募兵 · 银币 ${s.coins}`;
    tip.style.cssText = 'color:#8fa1bf;font-size:11px;';
    panel.appendChild(tip);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;';
    for (const o of recruitOffer(s.layer)) {
      const u = UNITS[o.code];
      const card = document.createElement('button');
      card.style.cssText =
        'flex:1;min-width:0;padding:6px 4px;border-radius:8px;border:1px solid #39415a;background:#141a26;' +
        'color:#cfd6e6;font-size:11px;line-height:1.4;' + (s.coins < o.price ? 'opacity:0.4;' : '');
      card.innerHTML = `${u.name}<br><span style="color:#d8b04a">${o.price}</span>`;
      if (s.coins >= o.price) card.addEventListener('click', () => hooks.onRecruit(o.code, o.price));
      row.appendChild(card);
    }
    panel.appendChild(row);
    const skip = mkButton('跳过募兵，直接下一层', () => hooks.onEnter(), false);
    panel.appendChild(skip);
  } else if (node === 'supply') {
    const tip = document.createElement('div');
    tip.textContent = `补给 · 银币 ${s.coins} · 补员 30%`;
    tip.style.cssText = 'color:#8fa1bf;font-size:11px;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;';
    const buy = mkButton(`补给 ${supplyCost()}`, hooks.onSupply, s.coins >= supplyCost());
    const skip = mkButton('跳过补给', () => hooks.onEnter(), true);
    row.append(buy, skip);
    panel.append(tip, row);
  } else {
    const btn = mkButton(node === 'boss' ? '迎战守关军' : '进入战斗', hooks.onEnter, true);
    panel.appendChild(btn);
  }

  wrap.appendChild(panel);
  host.appendChild(wrap);
}

function mkButton(text: string, onClick: () => void, primary: boolean) {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.cssText =
    `padding:9px 12px;border-radius:8px;font-size:12px;touch-action:manipulation;` +
    `border:1px solid ${primary ? '#d8a566' : '#4a5a7a'};background:${primary ? '#2a2318' : '#1b2432'};` +
    `color:${primary ? '#f0d8a8' : '#cfd6e6'};`;
  b.addEventListener('click', onClick);
  return b;
}
