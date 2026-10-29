# 定最终分享方式

Type: grilling
Status: resolved
Assignee: zhuoxuan233
Map: [翻麻将：从想法到规格书](../map.md)

## Question

地图「Not yet specified」里的最后一项：打包好的游戏怎么交到朋友手上，是直接发打包文件，还是挂到 GitHub Pages 之类的静态托管。

术语见 [CONTEXT.md](../../../CONTEXT.md)。

## Answer

**挂到 GitHub Pages：公开仓库 `fan-majiang`，推到 `main` 就用 GitHub Actions 自动打包发布，网址是 `<用户名>.github.io/fan-majiang/`。** 两轮问答，Q1 由用户回答，其余九条都选了推荐项。

1. **朋友在哪里打开**（Q1）：主要在大陆以外，或者都能正常上 GitHub，用手机浏览器或电脑打开。所以不用考虑 `github.io` 在大陆打不开、微信拦外链的问题。
2. **谁能打开**（Q2）：拿到链接就能玩，不设密码、不登录。
3. **不做 PWA**（Q3）：不加离线缓存，断网打不开。手机浏览器自带的"添加到主屏幕"照样能用。
4. **不要自己的域名**（Q4）：用 GitHub Pages 的免费地址。
5. **更新**（Q5）：改了就重新发布，朋友刷新就是新版。存档格式变了就照[定存档与记忆](05-save-and-memory.md)第 8 条处理：读不出来就丢掉、开新局，提示一句。不做版本公告。
6. **托管**（Q6）：GitHub Pages。免费账号要求仓库公开，源码和素材都公开。素材是 CC0，代码公开也无所谓。不选 Cloudflare Pages 或 Netlify，是为了只用一个平台。
7. **仓库名**（Q7）：`fan-majiang`。Vite 打包时 `base` 设成 `/fan-majiang/`。
8. **发布方式**（Q8）：用 GitHub 官方的 Pages 工作流（GitHub Actions），推到 `main` 就自动打包、发布。不手动维护 `gh-pages` 分支。
9. **仓库里放什么**（Q9）：
   - `main` 只放正式游戏：源码、牌面素材、规格书和 CONTEXT.md。
   - 现在 `.scratch/` 里的原型、模拟脚本和调研报告，整体提交到存档分支 `prototype-archive`，不并进 `main`。
   - 规格书引用调研结论时，链接到这个分支。
10. **许可证**（Q10）：不写。以后想开源再加。

**不直接发文件的原因**：页面里有后台线程（求解器）和本机存档，用 `file://` 打开时，后台线程在不少浏览器里跑不起来；手机上也很难打开一个 HTML 文件。
