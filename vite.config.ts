import { defineConfig } from 'vite';

// GitHub Pages 的网址是 <用户名>.github.io/fan-majiang/，见 spec.md 第 11 节
export default defineConfig({
  base: '/fan-majiang/',
  worker: { format: 'es' },
});
