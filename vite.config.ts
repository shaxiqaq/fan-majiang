/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

// GitHub Pages 的网址是 <用户名>.github.io/fan-majiang/，见 spec.md 第 11 节
export default defineConfig({
  base: '/fan-majiang/',
  worker: { format: 'es' },
  // 移动规则和暴力实现的对照要跑几千个局面，机器忙的时候会超过默认的 5 秒
  test: { testTimeout: 30000 },
});
