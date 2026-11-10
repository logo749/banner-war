# 素材放置说明

这个目录只放**切好的图集**，不放原始素材包（Tiny Swords 等许可禁止再分发，原始包已被 `.gitignore` 忽略）。

```
public/assets/
  tiny-swords/     主单位与地形、UI
  mtpixls/         骑兵与枪兵（按 Tiny Swords 调色板重着色）
  castle/          第 8 层攻城用的城墙与城门
  kenney/          UI 元素与音效（CC0）
```

当前版本还没接素材，战场上的兵由 `src/game/textures.ts` 用代码生成 64×64 占位图。
接素材的步骤：

1. 从 itch 页手动领取并解压到上表目录（原始包放 `raw/`，该目录不进 git）。
2. 切片成 64×64 图集，导出 `*.png` + `*.json`（Aseprite / TexturePacker 皆可），`*.aseprite` 不进 git。
3. 修改 `src/game/textures.ts`：把 `generateTexture(...)` 换成 `this.load.atlas(...)` + `this.add.image(key)`。
4. 更新 `docs/assets.md` 的署名区与设置页署名。

素材许可见 [../docs/assets.md](../docs/assets.md)。
