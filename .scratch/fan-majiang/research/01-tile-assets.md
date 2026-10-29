# 调研：可免费使用的日麻牌面素材

对应票：[找可以免费使用的日麻牌面素材](../issues/01-tile-assets.md)
调研日期：2026-10-10。只读了仓库目录、LICENSE、README、提交记录、Wikimedia Commons 文件页和 npm 元数据，没有下载或安装任何素材包（SVG 内容是在浏览器或 GitHub API 里在线查看的，没有存到本地）。

## 结论

**推荐 [FluffyStuff/riichi-mahjong-tiles](https://github.com/FluffyStuff/riichi-mahjong-tiles)，用 `Regular/` 目录下的 SVG。**

- 许可证：**CC0 1.0（公有领域贡献）**。可以免费使用、修改、随游戏打包分发，不强制署名。
- 覆盖：34 种牌全有；三张赤五都有（`Man5-Dora` / `Pin5-Dora` / `Sou5-Dora`）；有牌背（`Back.svg`）和空白牌身（`Front.svg`）。
- 格式：SVG，画布 300×400（3:4），40 个文件全部同一尺寸、同一作者，风格统一；另有同名 PNG 导出和一套黑色牌身变体（`Black/`）。
- 获取：直接从 GitHub 仓库复制 `Regular/*.svg` 到项目里即可，不需要 npm 包。

## 候选对比

| | ① FluffyStuff/riichi-mahjong-tiles | ② Wikimedia Commons：Cangjie6 斜视图 SVG | ③ KDE libkmahjongg 牌组 |
|---|---|---|---|
| 34 种牌 | 全有 | 全有 | 全有（另有花牌、季节牌） |
| 赤五 ×3 | 有（字/图案全红，外加一个红点） | 有（整张牌面图案改为红色） | **没有** |
| 牌背 | 有（红色 / 黑色两版） | 有（绿色，`MJhide.svg`） | 未见单独牌背元素 |
| 空白牌身 | 有（`Front.svg`，牌面图案单独叠上去） | 每个文件自带牌身，不分层 | 有（`TILE_1`…`TILE_4`，带选中态） |
| 许可证 | **CC0 1.0** | CC BY-SA 4.0（需署名 + 相同方式共享） | GPL-2.0-or-later |
| 格式/尺寸 | SVG 300×400（3:4，正面平视）+ PNG | SVG 512×622（带立体侧边的斜视图） | 单个 SVG 精灵图，按元素 id 取牌 |
| 获取方式 | GitHub 仓库直接取文件 | Commons 上逐个文件下载（约 38 个文件页） | KDE GitLab 仓库 |
| 风格统一 | 统一（同一作者、同一画布） | 基本统一，但部分文件由其他人重绘/修改 | 统一 |

## 候选 ①：FluffyStuff/riichi-mahjong-tiles（推荐）

### 获取方式

- 仓库：<https://github.com/FluffyStuff/riichi-mahjong-tiles>（默认分支 `master`，写本文时最新提交为 [`26e127b`](https://github.com/FluffyStuff/riichi-mahjong-tiles/commit/26e127ba2117f45cdce5ea0225748cc0cfad3169)，2024-06-15）。
- 目录结构（来源：[GitHub 仓库目录](https://github.com/FluffyStuff/riichi-mahjong-tiles/tree/26e127ba2117f45cdce5ea0225748cc0cfad3169)）：
  - `Regular/`：浅色牌身的 SVG，40 个文件。
  - `Black/`：黑色牌身的 SVG，40 个文件，文件名与 `Regular/` 一一对应。
  - `Export/Regular/`、`Export/Black/`：上面两套的 PNG 导出。
  - `ExampleRegular.png`、`ExampleBlack.png`：全套预览图。
- README 原话说明内容是"vector graphics and PNG exports of riichi mahjong tiles"，分 regular 和 black 两种（[README](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/README.md)）。
- 也有把这套牌包成 npm 包的第三方项目，但都是 React 组件，而且许可证标注和原仓库不一致（见下文"看过但没选的"），所以建议直接从原仓库复制 SVG。

### 覆盖情况（`Regular/` 目录下的文件名）

来源：[仓库目录 `Regular/`](https://github.com/FluffyStuff/riichi-mahjong-tiles/tree/26e127ba2117f45cdce5ea0225748cc0cfad3169/Regular)

| 内容 | 文件 |
|---|---|
| 万子 1–9 | `Man1.svg` … `Man9.svg` |
| 筒子 1–9 | `Pin1.svg` … `Pin9.svg` |
| 索子 1–9 | `Sou1.svg` … `Sou9.svg` |
| 风牌 | `Ton.svg`（东）、`Nan.svg`（南）、`Shaa.svg`（西）、`Pei.svg`（北） |
| 三元牌 | `Haku.svg`（白）、`Hatsu.svg`（发）、`Chun.svg`（中） |
| 赤五 | `Man5-Dora.svg`、`Pin5-Dora.svg`、`Sou5-Dora.svg` |
| 牌背 | `Back.svg` |
| 空白牌身 | `Front.svg` |
| 问号牌 | `Blank.svg`（虽然叫 Blank，实际是一个红色"?"图案，表示未知牌） |

合计 27 + 4 + 3 + 3 + 3 = 40 个文件，34 种牌和三张赤五齐全。

- 赤五：提交 [`47616e1`](https://github.com/FluffyStuff/riichi-mahjong-tiles/commit/47616e107d74d93cca3ed99b5d2e636d28f1218d)"Add dora dot and tile front/back side"给三张 `*5-Dora` 加了红点，同时加入了 `Front`/`Back`。在线查看 [`Pin5-Dora.svg`](https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/Pin5-Dora.svg)、[`Sou5-Dora.svg`](https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/Sou5-Dora.svg)、[`Man5-Dora.svg`](https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/Man5-Dora.svg)：图案全部是红色（`#d71e1e`），左侧还有一个红点；普通 `Man5.svg` 的"伍"字是黑色、"萬"字是暗红色，两者一眼能分清。
- 牌背：[`Regular/Back.svg`](https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Regular/Back.svg) 是一块带圆角的红色牌背（`#ff3737`），带轻微高光/阴影；[`Black/Back.svg`](https://raw.githubusercontent.com/FluffyStuff/riichi-mahjong-tiles/master/Black/Back.svg) 是深灰色牌背。
- 白板：`Regular/Haku.svg` 的可见内容是空的（只有一个空的图层），叠在 `Front.svg` 上就是一张纯白的牌，和 [`ExampleRegular.png`](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/ExampleRegular.png) 里第四行第六张一致。也就是说这套里的白板**没有蓝框**。

### 文件结构：牌面和牌身是分开的两层

- 所有 SVG 的根元素都是 `width="300" height="400" viewBox="0 0 300 400"`（在线读取 `Front`、`Back`、`Blank`、`Man1`、`Man5-Dora`、`Haku` 的 `<svg>` 标签确认），即 3:4。
- `Front.svg` 的可见内容是一块 300×400、圆角半径 40 的米白色牌身（`#f5f0eb`），外加两处用模糊滤镜做的高光/阴影。
- `Man1.svg` 这类牌面文件的可见内容**只有图案本身，背景透明**，没有牌身；牌身矩形只出现在 `<defs>` 里，不会画出来。所以显示一张牌要把 `Front.svg` 和牌面 SVG 叠在一起（两层同尺寸，直接重叠即可）。
- `Back.svg` 自带完整牌身，不需要叠 `Front.svg`。
- 文件是 Inkscape 0.91 存的原始 SVG，含编辑器元数据；`Regular/` 40 个文件共约 778 KB（按 GitHub 目录里的文件大小加总），单个 7–60 KB。打包前用 SVGO 之类压缩一下会小很多（这是推测，没实测）。

### 许可证

- 当前 [`LICENSE.md`](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/LICENSE.md) 全文："This work is in the public domain. For more information, visit https://creativecommons.org/publicdomain/zero/1.0/."
- README 的 License 一节："All assets are in the public domain"，链接到 CC0 1.0（[README](https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/README.md)）。
- **历史**：2024-06-15 之前是 CC BY 4.0。提交 [`26e127b`](https://github.com/FluffyStuff/riichi-mahjong-tiles/commit/26e127ba2117f45cdce5ea0225748cc0cfad3169)"Update license to public domain"把 LICENSE.md 和 README 从"Creative Commons Attribution 4.0 International License"改成了 CC0。所以网上一些旧的转载/衍生包还写着 CC BY 4.0（例如下文的 `react-riichi-mahjong-tiles`）。直接从原仓库当前版本取文件，按 CC0 使用即可。
- GitHub 仓库侧栏/API 显示许可证为"Other"（`NOASSERTION`），只是因为 LICENSE.md 是一句自定义文字，GitHub 认不出来（[GitHub API](https://api.github.com/repos/FluffyStuff/riichi-mahjong-tiles)），不影响上面的结论。

CC0 对本项目意味着什么（来源：[CC0 1.0 说明页](https://creativecommons.org/publicdomain/zero/1.0/)，具有法律效力的是其 [Legal Code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)）：

| 问题 | 回答 |
|---|---|
| 能否免费使用 | 能。说明页写的是可以复制、修改、分发，"even for commercial purposes, all without asking permission"。 |
| 是否要求署名 | 不要求，CC0 放弃了这些权利。说明页只提醒使用时"should not imply endorsement"（不要暗示作者为你背书）。 |
| 能否修改（改尺寸、配色、合成牌身） | 能。 |
| 能否随游戏一起打包分发 | 能，对游戏代码本身也没有任何许可证上的要求。 |
| 其他 | CC0 不涉及商标/专利，作者不提供任何担保。 |

建议（非强制）：在游戏的"关于"处写一行"牌面素材：FluffyStuff/riichi-mahjong-tiles（CC0）"，成本几乎为零，也方便以后找回来源。

## 候选 ②：Wikimedia Commons 上 Cangjie6 的斜视图 SVG（备选）

- 分类页：[Category:SVG Oblique illustrations of Mahjong tiles](https://commons.wikimedia.org/wiki/Category:SVG_Oblique_illustrations_of_Mahjong_tiles)；赤牌见 [Category:Red Mahjong tiles](https://commons.wikimedia.org/wiki/Category:Red_Mahjong_tiles)。
- 命名：`MJw1-.svg`…`MJw9-.svg`（万）、`MJt*-`（筒）、`MJs*-`（索）、`MJf1-`…`MJf4-`（风）、`MJd1-`…`MJd3-`（三元），后缀 `-` 是正立放置，另有横放 `=` 和其他角度 `x/y/z` 等变体（据分类页文件列表）。
- 赤五：[`MJw5r-.svg`](https://commons.wikimedia.org/wiki/File:MJw5r-.svg)、[`MJt5r-.svg`](https://commons.wikimedia.org/wiki/File:MJt5r-.svg)、[`MJs5r-.svg`](https://commons.wikimedia.org/wiki/File:MJs5r-.svg)，描述均为"red version"；在线看缩略图，整张牌面图案都改成了红色，没有红点。
- 牌背：[`MJhide.svg`](https://commons.wikimedia.org/wiki/File:MJhide.svg)（"A hidden Mahjong Tile"），绿色牌背。
- 白板：[`MJd3-.svg`](https://commons.wikimedia.org/wiki/File:MJd3-.svg) 带蓝框。
- 尺寸：抽查的正立牌都是 512×622；风格是带立体侧边、粗黑描边的卡通斜视图，侧边厚度占在画面里，排成格子时每张牌会有一侧"厚边"。
- 许可证：抽查的 16 个文件页均为 **CC BY-SA 4.0**、`AttributionRequired: true`（通过 [Commons API](https://commons.wikimedia.org/w/api.php?action=query&titles=File:MJw5-.svg|File:MJw5r-.svg|File:MJhide.svg&prop=imageinfo&iiprop=extmetadata) 读取的文件元数据）。作者大多是 Cangjie6，但部分文件有多位作者，例如 [`MJt1-.svg`](https://commons.wikimedia.org/wiki/File:MJt1-.svg) 署名为"Cangjie6 (remake), Jerry Crimson Mann (original), User:Dewclouds (vectorisation)"，[`MJw5b-.svg`](https://commons.wikimedia.org/wiki/File:MJw5b-.svg) 由另一位用户修改。每个文件都是单独授权，要逐个核对、逐个署名。
- CC BY-SA 4.0 的要求（[说明页](https://creativecommons.org/licenses/by-sa/4.0/)）：可以分享、修改、商用；必须署名、附许可证链接、说明是否修改；如果改了素材（"remix, transform, or build upon"），改后的素材要以同样的许可证发布。只是打包进游戏不会让游戏代码也必须用 BY-SA，但改过的牌面图要按 BY-SA 公开。
- 不选它的原因：署名和相同方式共享的义务比 CC0 麻烦；要逐个文件下载、逐个核对作者；斜视图带厚边，不如平视图适合密集的 8×17 格子。

## 候选 ③：KDE libkmahjongg 牌组（不推荐）

- 来源：KDE 的 [libkmahjongg](https://invent.kde.org/games/libkmahjongg)，README 说它为 KMahjongg 和 KShisen（KDE 版的四川省/连连看）提供牌组。牌组在 [`tilesets/`](https://invent.kde.org/games/libkmahjongg/-/tree/master/tilesets)，有 default、traditional、classic、jade 等 7 套，每套一个 SVG 精灵图加一个 `.desktop` 描述文件。
- 许可证：[`default.desktop`](https://invent.kde.org/games/libkmahjongg/-/blob/master/tilesets/default.desktop) 和 [`traditional.desktop`](https://invent.kde.org/games/libkmahjongg/-/blob/master/tilesets/traditional.desktop) 都写着 `License=GPL-2.0-or-later`。
- 覆盖：`default.svg` 里的元素 id 有 `CHARACTER_1–9`、`ROD_1–9`、`BAMBOO_1–9`、`WIND_1–4`、`DRAGON_1–3`、`FLOWER_1–4`、`SEASON_1–4`、`TILE_1–4`（含 `_SEL` 选中态），**没有赤五**，也没有单独的牌背元素。
- 不选它的原因：缺赤五；GPL 是针对软件的许可证，用在打包进游戏的美术素材上，分发时的义务（提供源码、整体是否算衍生作品）不好判断，对一个给朋友玩的小游戏来说是不必要的麻烦。

## 看过但没选的

- [tempai-dev/riichi-mahjong-tiles-svg](https://github.com/tempai-dev/riichi-mahjong-tiles-svg)：README 自述 SVG 是从"some Chinese site"上找到的位图描出来的，作者"don't own and don't claim any rights on the original source raster material"，虽然声明 MIT 或 CC-PDDC，但原图来源不明，版权不干净；而且主要是整版拼图，只拆出了几张单牌。
- [perthmahjongsoc/mahjong-tiles-svg](https://github.com/perthmahjongsoc/mahjong-tiles-svg)：README 说明是候选 ② 的 SVGO 压缩版，CC BY-SA 4.0；文件按 Unicode 麻将牌区段命名，所以**只有普通牌和牌背 🀫，没有赤五**；SVG 存在 Git LFS 里（`.gitattributes`）。
- npm [`riichi-mahjong-tiles`](https://www.npmjs.com/package/riichi-mahjong-tiles)（SakaiTaka23）：把候选 ① 包成 React 组件，npm 上标 MIT，依赖 React 19。
- npm [`react-riichi-mahjong-tiles`](https://www.npmjs.com/package/react-riichi-mahjong-tiles)（MaijaHeiskanen）：同样是候选 ① 的 React 组件封装，npm 和 README 标的是 CC BY 4.0（沿用了原仓库改许可证之前的说法），需要 React。
- npm [`@johnmorrisdotca/jarajara`](https://www.npmjs.com/package/@johnmorrisdotca/jarajara)：MIT，是一个完整的麻将牌叠叠乐库，画的是 144 张中国麻将（含花牌），README 说其中一种牌面设计就是 FluffyStuff 的 riichi 牌。功能远超需要，不适合只取素材。

这几个 npm 包都会把 React 或整套游戏逻辑带进来，而本项目只需要几十个静态 SVG，所以都不如直接从原仓库复制文件。

## 推荐理由

1. **许可证最省心**：CC0，不用署名，可随意改尺寸、改配色、合成牌身，随游戏打包分发没有任何附加义务。
2. **覆盖最完整**：34 种 + 三张赤五 + 牌背 + 空白牌身，正好是本游戏要的全部内容，不用自己补画。
3. **适合格子布局**：正面平视、3:4、所有文件同一画布，CSS 里每格一个固定比例的盒子即可；赤五带红点且整体变红，和普通五一眼能分清。
4. **获取简单**：一个 GitHub 仓库，40 个 SVG 复制进项目即可，不引入任何运行时依赖。
5. **认可度高**：仓库有 591 个 star（[GitHub API](https://api.github.com/repos/FluffyStuff/riichi-mahjong-tiles)，2026-10-10 读取），多个第三方项目（上面的 npm 包、jarajara）都在用它。

## 给后续票的提示（不是本票的结论，只是用到这套素材时要注意的事实）

- **叠层显示**：每张未翻牌 = `Front.svg` + 牌面 SVG 两层；翻掉后如果显示牌背，用 `Back.svg` 单层即可。也可以在构建时把两层合成一个文件，CC0 允许。
- **白板是纯白的**：`Haku` 叠上 `Front` 就是一张没有任何图案的牌。如果「牌阵界面与交互原型」决定空位显示成"空白牌身"，会和白板分不清；要么空位显示牌背或真正留空，要么给白板自己加一个蓝框（CC0 允许改）。
- **比例 3:4**：电脑横屏 8 行 × 17 列时，整个牌阵的宽高比约为 (17×3):(8×4) = 51:32 ≈ 1.6，接近 16:10 屏幕；手机竖屏 17 行 × 8 列时为 24:68 ≈ 0.35，比常见手机屏幕（约 0.46）更瘦长，牌的大小会受高度限制。具体大小留给原型票验证。
- **滤镜**：`Front.svg` 和 `Back.svg` 用了 SVG 模糊滤镜做高光/阴影（牌面图案文件没有）。136 张牌同屏时如果手机上卡，可以去掉滤镜或改用 `Export/` 里的 PNG。
- **牌背颜色**：`Regular` 牌背是红色，`Black` 牌背是深灰色；两套牌身可以混用（例如浅色牌身 + 深色牌背），文件名一一对应。

## 没有核实的点

- `Export/` 里 PNG 的像素尺寸：没有下载文件，所以没核实。SVG 里写的导出分辨率是 180 dpi（`inkscape:export-xdpi="180"`），推测导出为 300×400 的两倍左右，但未验证。
- 候选 ② 只抽查了 16 个文件页的许可证和尺寸，没有逐个核对全部 38 个所需文件。
- SVGO 压缩后的体积没有实测。

## 来源

- FluffyStuff/riichi-mahjong-tiles 仓库：<https://github.com/FluffyStuff/riichi-mahjong-tiles>
- 同上，LICENSE.md：<https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/LICENSE.md>
- 同上，README：<https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/README.md>
- 同上，改许可证的提交：<https://github.com/FluffyStuff/riichi-mahjong-tiles/commit/26e127ba2117f45cdce5ea0225748cc0cfad3169>
- 同上，加入红点和 Front/Back 的提交：<https://github.com/FluffyStuff/riichi-mahjong-tiles/commit/47616e107d74d93cca3ed99b5d2e636d28f1218d>
- 同上，预览图：<https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/ExampleRegular.png>、<https://github.com/FluffyStuff/riichi-mahjong-tiles/blob/26e127ba2117f45cdce5ea0225748cc0cfad3169/ExampleBlack.png>
- GitHub API 仓库信息：<https://api.github.com/repos/FluffyStuff/riichi-mahjong-tiles>
- CC0 1.0 说明页：<https://creativecommons.org/publicdomain/zero/1.0/>；Legal Code：<https://creativecommons.org/publicdomain/zero/1.0/legalcode>
- CC BY-SA 4.0 说明页：<https://creativecommons.org/licenses/by-sa/4.0/>
- Wikimedia Commons 分类：<https://commons.wikimedia.org/wiki/Category:SVG_Oblique_illustrations_of_Mahjong_tiles>、<https://commons.wikimedia.org/wiki/Category:Red_Mahjong_tiles>
- Commons 文件页：<https://commons.wikimedia.org/wiki/File:MJw5r-.svg>、<https://commons.wikimedia.org/wiki/File:MJt5r-.svg>、<https://commons.wikimedia.org/wiki/File:MJs5r-.svg>、<https://commons.wikimedia.org/wiki/File:MJhide.svg>、<https://commons.wikimedia.org/wiki/File:MJd3-.svg>、<https://commons.wikimedia.org/wiki/File:MJt1-.svg>、<https://commons.wikimedia.org/wiki/File:MJw5b-.svg>
- KDE libkmahjongg：<https://invent.kde.org/games/libkmahjongg>；牌组目录：<https://invent.kde.org/games/libkmahjongg/-/tree/master/tilesets>
- tempai-dev/riichi-mahjong-tiles-svg：<https://github.com/tempai-dev/riichi-mahjong-tiles-svg>
- perthmahjongsoc/mahjong-tiles-svg：<https://github.com/perthmahjongsoc/mahjong-tiles-svg>
- npm：<https://www.npmjs.com/package/riichi-mahjong-tiles>、<https://www.npmjs.com/package/react-riichi-mahjong-tiles>、<https://www.npmjs.com/package/@johnmorrisdotca/jarajara>
