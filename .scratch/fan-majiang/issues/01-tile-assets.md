# 找可以免费使用的日麻牌面素材

Type: research
Status: resolved
Map: [翻麻将：从想法到规格书](../map.md)

## Question

找到可以用在小范围分享网页游戏里的日麻牌面图片（最好是 SVG），并推荐一套。需要回答：

- 是否覆盖全部 34 种牌、三张赤五（五万/五筒/五索），以及牌背（翻牌后的格可能显示牌背）。
- 许可证是什么：能否免费使用、是否要求署名、能否修改（比如改尺寸、配色）、能否随游戏一起打包分发。
- 文件格式、尺寸/比例、风格是否统一；获取方式（GitHub 仓库、npm 包、直接下载）。
- 给出 1–3 个候选，并推荐一个，说明理由。

术语见 [CONTEXT.md](../../../CONTEXT.md)。

## Answer

推荐 **[FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)** 的 `Regular/` SVG（另有黑色牌身的 `Black/` 和 PNG 导出可选）。

- **许可证**：CC0 1.0（公有领域贡献），免费使用、可修改、可随游戏打包分发，不强制署名（2024-06 之前是 CC BY 4.0，旧转载可能还这么写，以原仓库当前版本为准）。
- **覆盖**：34 种牌全有；三张赤五都有（`Man5-Dora` / `Pin5-Dora` / `Sou5-Dora`，图案全红并带红点）；有牌背 `Back.svg`（红色，黑色版为深灰）和空白牌身 `Front.svg`。
- **格式**：SVG，画布 300×400（3:4），正面平视，40 个文件同一作者、同一画布，风格统一。牌面文件只有图案、背景透明，显示时要叠在 `Front.svg` 上。
- **获取**：直接从 GitHub 仓库复制文件，不需要 npm 包。
- **备选**：Wikimedia Commons 上 Cangjie6 的斜视图 SVG（也有赤五和牌背，但许可证是 CC BY-SA 4.0，需逐个署名）。
- **注意**：这套的白板是纯白的，没有蓝框，原型票设计空位样式时要避免和白板混淆。

详细对比、许可证原文和来源见 [research/01-tile-assets.md](../research/01-tile-assets.md)。
