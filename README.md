# 竖屏兵牌战役 · Banner War

骑马与砍杀式的「兵种指挥 + 部队养成」，竖屏、单手、Web 手机浏览器。
单局 roguelite：8 层地图、随机三选一招募、遗物改规则，打穿最后一层攻城就算通关。

线上地址：https://logo749.github.io/banner-war/

## 现在能玩到什么

- 4×8 战场，长按兵牌 0.3 秒拖到第 6–8 行布阵（或点牌再点格子）。
- 点「开战」，按 0.4 秒一 tick 推进，所有己方兵牌自动集火对面最前排，打空后整体转向下一张。
- 血量条实时跟随，阵亡兵牌变暗；15 秒内出胜负（单场上限 150 tick）。
- 数值与设计文档完全一致，`npm run verify` 可以逐条对账。

> 演示模式：打开 `/?demo=1` 自动布阵并开战；`/?demo=1&tick=18` 直接推进 18 个 tick 看中途状态。

## 跑起来

```bash
npm install
npm run dev      # 本地开发，手机与电脑同一局域网可直接用手机打开
npm run verify   # 数值回归：与 tools/balance_calc.py 对账
npm run build    # 生产构建，产物在 dist/
npm run preview  # 本地预览构建产物
```

## 目录

```
src/
  config.ts          逻辑分辨率、tick、4×8 网格与格子坐标
  sim/               纯结算层，不 import 引擎，可单独跑测试
    units.ts         九张兵牌数值、克制三角、伤害公式
    battle.ts        集火结算、1v1、战力估算、敌配生成
    rng.ts           种子随机（保证同输入同结果）
  game/
    BattleScene.ts   战场绘制、人数条同步、tick 推进
    textures.ts      代码生成的 64×64 占位像素兵
scripts/verify.ts    M1 数值过关测试
docs/                设计、排期、技术、素材四份文档
```

## 部署

推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages。
仓库 Settings → Pages → Source 选 **GitHub Actions** 一次，之后每次推送自动更新。

## 文档

- [设计摘要](docs/game-design.md) — 规则与数值的唯一口径
- [开发计划与验收](docs/plan.md) — 7 个里程碑、每阶段自己怎么验
- [技术与素材](docs/tech.md) — 引擎选择、两套分辨率、像素管线
- [素材许可与署名](docs/assets.md) — 免费素材来源与禁止项

MIT License
