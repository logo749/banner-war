/**
 * M1 的过关测试：TS 结算必须与 tools/balance_calc.py 的表 2 / 表 11 对上。
 * 跑法：npm run verify
 */
import { UNITS, order } from '../src/sim/units';
import { armyFight, createBattle, duel } from '../src/sim/battle';

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

console.log(`\n${failures === 0 ? '全部通过' : `${failures} 项未通过`}`);
process.exit(failures === 0 ? 0 : 1);
