/**
 * M1 的过关测试：TS 结算必须与 tools/balance_calc.py 的表 2 / 表 11 对上。
 * 跑法：npm run verify
 */
import { UNITS, order } from '../src/sim/units';
import { armyFight, createBattle, duel, HORN_TICKS, HORN_MULT } from '../src/sim/battle';
import { NODES, LAYER_FACTOR, enemyFor, recruitOffer, newRun, supplyCost, supply } from '../src/run/state';

let failures = 0;
function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  实际=${actual}  期望=${expected}`);
}

console.log('— 1v1 对撞（表 2）—');
{
  const a = duel('A3', 'B3');
  // 注：脚本里的 duel() 是 33 tick，但它的对撞函数先扣攻方再扣守方；集团战口径（army_fight）是 32。
  // 本作引擎只保留一套结算，取集团战口径，所以这里对齐 32。
  check('重步 vs 长弓 tick', String(a.ticks), '32');
  check('重步 vs 长弓 剩余人数', String(Math.round(a.xMen)), '19');

  const b = duel('A3', 'C3');
  check('重步 vs 重骑 tick', String(b.ticks), '26');
  check('重步 vs 重骑 剩余人数', String(Math.round(b.xMen)), '24');

  const c = duel('C3', 'B3');
  check('重骑 vs 长弓 tick', String(c.ticks), '16');
  check('重骑 vs 长弓 剩余人数', String(Math.round(c.yMen >= 0 && c.winner === 'att' ? c.xMen : c.yMen)), '8');
}

console.log('\n— 攻城三波（表 11，7 张牌 + 波间归队 30%）—');
{
  const player = order(['A2', 'A2', 'A2', 'B2', 'B2', 'C2', 'C1']);
  const waves = [
    order(['A1', 'A1', 'B1', 'C1']),
    order(['A1', 'A2', 'B1', 'C1']),
    order(['A2', 'A1', 'B2', 'C1', 'C1'])
  ];
  let st = 1.0;
  const expected = ['15', '22', '49'];
  waves.forEach((wave, i) => {
    const r = armyFight(
      player.map((c) => ({ code: c, men: UNITS[c].men * st })),
      wave.map((c) => ({ code: c, men: UNITS[c].men }))
    );
    const loss = Math.round((1 - r.attRemain) * 100);
    check(`第 ${i + 1} 波战损%`, String(loss), expected[i]);
    st = st * r.attRemain + st * (1 - r.attRemain) * 0.3;
  });
  check('通关剩余兵力%', String(Math.round(st * 100)), '50');
}

console.log('\n— 确定性（同输入三次必须同结果）—');
{
  const run = () => {
    const bt = createBattle(
      [{ code: 'A2', men: 30 }, { code: 'B1', men: 20 }],
      [{ code: 'A1', men: 30 }, { code: 'C1', men: 10 }]
    );
    while (!bt.done) bt.step();
    return `${bt.ticks}|${bt.attRemain().toFixed(6)}|${bt.dfnRemain().toFixed(6)}`;
  };
  const r1 = run();
  const r2 = run();
  const r3 = run();
  check('三次结果一致', String(r1 === r2 && r2 === r3), 'true');
}

console.log('\n— S2 战中三动作 —');
{
  // 冲锋号：同一场战斗，前 6 tick 伤害必须吃到 1.45 倍，之后回落
  const mk = (horn: boolean) => {
    const bt = createBattle(
      [{ code: 'A2', men: 30, id: 'p0' }],
      [{ code: 'A2', men: 30, id: 'e0' }],
      150
    );
    if (horn) bt.horn();
    const dmg: number[] = [];
    let prev = bt.dfn[0].hp;
    for (let i = 0; i < 10 && !bt.done; i += 1) {
      bt.step();
      dmg.push(prev - bt.dfn[0].hp);
      prev = bt.dfn[0].hp;
    }
    return { dmg, bt };
  };
  const base = mk(false);
  const buffed = mk(true);
  // 第 1 tick 双方都是满编，倍数可以直接比
  check(`冲锋号首 tick 伤害 ×${HORN_MULT}`, String(Math.abs(buffed.dmg[0] / base.dmg[0] - HORN_MULT) < 0.01), 'true');
  check(`冲锋号 ${HORN_TICKS} tick 后归零`, String(buffed.bt.hornTicks), '0');
  // 只比同一条 run 内相邻 tick：失效那一下必须明显掉下来
  const dropOk = buffed.dmg[HORN_TICKS] < buffed.dmg[HORN_TICKS - 1] * 0.9;
  check('冲锋号结束后伤害回落', String(dropOk), 'true');
  check('冲锋号只能用一次', String(buffed.bt.horn() === false), 'true');
}
{
  // 变阵：最前排退到队尾，集火目标随之改变
  const bt = createBattle(
    [
      { code: 'A1', men: 30, id: 'front' },
      { code: 'A2', men: 30, id: 'second' },
      { code: 'B2', men: 20, id: 'back' }
    ],
    [{ code: 'A3', men: 30, id: 'e0' }],
    150
  );
  const beforeFront = bt.att[0].id;
  bt.swapFrontBack();
  check('变阵后队首换人', bt.att[0].id, 'second');
  check('变阵后队尾是原前排', bt.att[bt.att.length - 1].id, beforeFront);
  check('变阵顺序不乱', bt.att.map((s) => s.id).join(','), 'second,back,front');
}
{
  // 投预备队：总血量基数变大、立刻参与结算
  const bt = createBattle([{ code: 'A2', men: 30, id: 'p0' }], [{ code: 'A2', men: 30, id: 'e0' }], 150);
  const hp0 = bt.attHp0Total();
  const hp = bt.att[0].hp;
  bt.addReserve({ code: 'B2', men: 20, id: 'r0' });
  check('预备队进场后槽位+1', String(bt.att.length), '2');
  check('总血量基数累加', String(bt.attHp0Total() === hp0 + 20 * 36), 'true');
  check('原槽血量不变', String(bt.att[0].hp === hp), 'true');
  while (!bt.done) bt.step();
  check('预备队参与结算（战斗仍能收尾）', String(bt.done), 'true');
}

console.log('\n— S3 单局闭环 —');
{
  check('8 层节点表', NODES.join('>'), 'battle>recruit>battle>supply>battle>recruit>battle>boss');
  const s = newRun();
  check('开局银币', String(s.coins), '80');
  check('开局部队', `${s.deck.length} 张`, '5 张');
  check('补给价', String(supplyCost()), '60');

  // 敌强随层上升，同一套牌每层都要打得更吃力
  const deck = s.deck.map((c) => c.code);
  const cp = [];
  for (let i = 0; i < 8; i += 1) cp.push(enemyFor(i, deck).length);
  check('每层都有敌人', String(cp.every((n) => n > 0)), 'true');
  check('层强系数递增', String(LAYER_FACTOR.every((v, i) => i === 0 || v >= LAYER_FACTOR[i - 1])), 'true');

  // 同层招募固定（否则读档出来的三选一会变）
  const a = recruitOffer(2).map((o) => o.code).join(',');
  const b = recruitOffer(2).map((o) => o.code).join(',');
  check('同层招募固定', String(a === b), 'true');

  // 补给：花 60 补员 30%，银币不够就不给买
  const s2 = newRun();
  s2.deck[0].men = 10;
  check('补给成功', String(supply(s2)), 'true');
  check('补给扣银币', String(s2.coins), '20');
  check('补给回员', String(Math.round(s2.deck[0].men)), '19');
  s2.coins = 10;
  const before = s2.deck[0].men;
  check('银币不足补给失败', String(supply(s2) === false && s2.deck[0].men === before), 'true');
}

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项未通过`}`);
process.exit(failures === 0 ? 0 : 1);
