---

## 素材管线

- 源：Tiny Swords（Pixel Frog，CC0），镜像仓库 `Hdisa/Tiny-Swords`，192px 帧网格的 `Warrior/Archer` 图集。
- 生成：`python3 tools/units_art.py --src <本地图集目录>` → 切帧、按「一队人」排版（步兵 3 人 / 弓手 2 人 / 骑兵 1 骑）、`trim()` 裁透明边 → 写 `public/assets/units/*.png` 与 `public/assets/terrain/ground.png`。
- 骑兵：免费包里没有骑乘单位，用骑士上半身 + 自绘俯视马体合成。
- 草地：`Tilemap_Flat.png` 的砖 60×64 不可无缝，改为在 3×3 画布随机撒草簇按 64 周期复制，取中间格。
- 二进制不进 git：PNG 以 base64 存在 `assets/unitArt.json`，`scripts/write-assets.mjs` 在 `predev`/`prebuild` 还原。
