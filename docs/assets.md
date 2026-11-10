# 素材许可与署名

全部素材走 0 元档。下面每一条都要照做，尤其是「禁止项」。

## 已选的免费素材

| 素材 | 用途 | 体积 | 许可要点 |
|---|---|---|---|
| Tiny Swords（Pixel Frog） | 主力：Warrior / Lancer / Archer / Monk 四类人族、8 建筑、64×64 地形、整套 UI、每单位 5 套配色、10fps 动画 | 免费包 3.3MB | 禁止再分发 / 转售 / 重打包；页上另挂 CC0 旧版 2.6MB |
| MtPixls Medieval Army Pack | 骑兵与枪兵补充，20 个 64×64 sprite sheet，仅待机 2–6 帧 | 免费 1MB | 禁令含 NFT、AI 训练 |
| Free Medieval Castle Defense Pixel Art Kit | 第 8 层攻城：模块化城墙 / 城门 / 梯子 / 图标 / 现成要塞场景 | 免费 1MB | 按 itch 页说明署名 |
| Kenney UI Pack / UI Audio | 400+ UI 元素、约 50 音效 | CC0 | 无强制署名，仍建议写 |

未采用：Tiny Kingdoms 完整包 $1.99（含骑兵真动画）——用户选 0 元档，骑兵先静态过渡。
备选但需申报：VibeForge Free Knight（作者声明 PixelLab 生成式 AI 产出）。

## 仓库里的处理

- 原始素材包**不进 git**：`.gitignore` 忽略 `public/assets/**/raw/` 与全部 `.aseprite` 源文件（许可禁止再分发）。
- 只提交：切好的图集（`*.png` + `*.json`）、署名文件、加载清单。
- 换素材时更新本文件和游戏内「关于」页的署名区。

## 游戏内署名

M6 发布前必须有，写在设置页底部：

```
Pixel art: Tiny Swords by Pixel Frog · MtPixls Medieval Army Pack
Castle kit: Free Medieval Castle Defense Pixel Art Kit
UI: Kenney UI Pack (CC0)
```

## 待办

- [ ] Tiny Swords 手动下载（itch 需点击领取）后解压到 `public/assets/tiny-swords/`
- [ ] MtPixls 取骑兵 sheet，按 Tiny Swords 调色板重着色
- [ ] Castle kit 取城墙与城门，拼第 8 层场景
- [ ] Kenney UI/音效接入手牌点击与开战
