# 技术与素材

## 1 引擎

Phaser `4.2.1` + TypeScript + Vite。

- MIT 协议，npm latest（2026-07-09）。
- 包体：`phaser.min.js` 1.29MB raw / 345KB gzip；当前首包 **386KB gzip**，远低于 5MB 预算。
- Phaser 4 是 render-node 架构，Canvas 渲染器已废弃，统一走 WebGL；Filter 系统把 FX 与 Mask 合并（Blur / Bloom / Vignette / ColorMatrix / Blend）。
- 破坏性变更包含 Point / Mesh / BitmapMask 移除，写场景前查 4.x 文档，别照 3.x 抄。

为什么不用 PixiJS（200KB，只是渲染库，输入/场景/音频都得自己写）或 Cocos（首包 709KB 起）或 Godot/Unity（10MB 起）。

## 2 两套分辨率（整件事的地基）

| 层 | 分辨率 | 缩放 | 说明 |
|---|---|---|---|
| 像素层（战场、兵牌、地形） | 360×780 逻辑像素 | 整数倍 1× / 2× | `image-rendering: pixelated`，禁止任意缩放 |
| 界面层（手牌、数字、按钮） | 设备分辨率 | 自适应 | DOM 层，独立于画布 |

`src/main.ts` 的 `layout()` 只算整数倍：`s = max(1, min(floor(vw/360), floor(vh/780)))`。
手机上 390 CSS px 宽 → s=1，画布 360 宽居中，左右各留 15px；平板上 s=2。

素材是 64×64，格子 90×70，**按 1:1 放，不做二次缩放**——这是「锐」的唯一来源。

## 3 表现四层（八方式）

1. **像素层**：64×64 原图，整数倍放大，nearest，禁任意缩放。
2. **光层**：脚下椭圆投影 + 径向渐变光斑，贴图叠在像素层上。
3. **后期层**：远景整层模糊降饱和、战场清晰、手牌区微虚（伪移轴），再叠暖色分级与暗角。
4. **界面层**：UI 与数字单独画，不跟像素层共用画布。

代价规则：滤镜只加在静态背景层和一次性演出上，**不给每帧刷新的战场层加**。
真 HD-2D 的「像素人站在 3D 场景」那半段要 3D 引擎，首包 5MB→10MB 起，本作不做。

## 4 素材管线

- 目录：`public/assets/tiny-swords/`、`public/assets/mtpixls/`、`public/assets/castle/`、`public/assets/kenney/`。
- **原始素材包不进仓库**（许可禁止再分发），只把「整理后的切片 + 署名」提交，或在构建时本地提供。
- 当前用 `src/game/textures.ts` 代码生成 64×64 占位兵（步/弓/骑三条线，各 3 级），换真素材只需把这里改成 `this.add.image(key, url)`，胜负与人数条逻辑不动。

### 缺口（必须承认的）

1. **骑兵**：Tiny Swords 免费包没有骑乘单位。MtPixls 只有待机 2–6 帧，够静态图或「骑手 + 马」拼伪动画。先静态过渡。
2. **第三档剪影**：免费包给的是「兵种 × 阵营配色」不是「等级」，L1→L3 的强弱靠装备差（盾/旗/盔色）+ 数值条表达。
3. 风格接缝：主单位全部用 Tiny Swords（5 套配色、敌我同源天然统一），MtPixls 只取骑兵与枪兵，按 Tiny Swords 调色板重着色。

### 意外收益

64px 小人缩到 28px 仍读得出兵种，所以一格（90×70）能放「主将 + 两三个兵 + 人数条」。图集估算：9 张兵牌共用 4 类底图，约 96 帧、0.5MB。

## 5 代码分层

```
src/sim/     纯函数结算，不 import phaser，可在 Node 里跑测试
src/game/    只画与同步，不写数值
src/main.ts  布局、DOM 手牌、指针交互
```

铁律：**结算层不碰引擎**。所以 `npm run verify` 可以在没有浏览器的情况下验证全部战斗数值。

## 6 测试与数值对账

`scripts/verify.ts` 断言：

- 1v1：重步 vs 长弓 32 tick 剩 19；重步 vs 重骑 26 tick 剩 24；重骑 vs 长弓 16 tick 剩 8。
- 攻城三波：战损 15% / 22% / 49%，通关余 50%。
- 确定性：同输入三次，tick 与剩余比例完全一致。

**口径说明**：Python 脚本里 `duel()` 先扣攻方再扣守方，与集团战 `army_fight()` 的同时结算不同，同一对会得到 33 与 32。本作只保留同时结算一套，取集团战口径（32）。剩余人数与战损百分比完全一致。

## 7 部署

- 构建：`npm run build` → `dist/`，`base: './'` 适配 Pages 子路径。
- 工作流：`.github/workflows/deploy.yml`，推 `main` 自动构建 + 发布 Pages artifact。
- 一次性人工动作：仓库 Settings → Pages → Source 选 **GitHub Actions**（连接器没有开通 Pages 的 API，只能点这一次）。
