# 翻麻将

单人网页小游戏：在 8×17 的日麻牌阵上，按"最多拐一次弯"的连线规则把同牌两两翻掉，也可以把一串牌滑过去让同牌对上。

在线玩：<https://shaxiqaq.github.io/fan-majiang/>

- 规格书：[spec.md](spec.md)；术语：[CONTEXT.md](CONTEXT.md)
- 讨论原票、调研和原型在 `prototype-archive` 分支的 `.scratch/fan-majiang/` 里

```bash
npm install
npm run dev     # 开发服务器（--host，手机连同一个 Wi-Fi 也能打开）
npm test        # 规则、移动、发牌、求解器的测试
npm run build   # 打包到 dist/
```

推到 `main` 会自动测试、打包并发布到 GitHub Pages（`.github/workflows/pages.yml`）。
