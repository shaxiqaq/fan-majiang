// 打印一局"随手型"玩到第一次死局时的棋盘，用肉眼核对规则
import { rng, randomDeal, Game, ROWS, COLS, randInt } from './core.mjs';
const NAMES = [...'123456789'].map((d) => d + 'm').concat([...'123456789'].map((d) => d + 'p'), [...'123456789'].map((d) => d + 's'), ['E ', 'S ', 'W ', 'N ', 'Wh', 'Gr', 'Rd']);
const show = (g) => { for (let r = 0; r < ROWS; r++) { let s = ''; for (let c = 0; c < COLS; c++) { const k = g.board[r * COLS + c]; s += (k < 0 ? '..' : NAMES[k]) + ' '; } console.log(s); } };
const rand = rng(7);
const g = new Game(randomDeal(rand));
console.log('开局可翻对数:', g.moveCount()); show(g);
let steps = 0;
for (;;) { const ms = g.moves(); if (!ms.length) break; const i = randInt(rand, ms.length / 2) * 2; g.flip(ms[i], ms[i + 1]); steps++; }
console.log(`\n翻了 ${steps} 对后死局，剩 ${g.left} 张:`); show(g);
// 再统计 2000 局第一次死局时剩多少张
const sum = { random: [], steady: [] };
import('./players.mjs').then(({ play }) => {
  for (const st of ['random', 'steady']) for (let i = 0; i < 2000; i++) sum[st].push(play(randomDeal(rand), rand, st).firstDeadLeft);
  for (const st of ['random', 'steady']) { const a = sum[st].sort((x, y) => x - y); console.log(st, '第一次死局剩余张数 P10/P50/P90:', a[200], a[1000], a[1800]); }
});
