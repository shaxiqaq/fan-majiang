// 后台线程里跑求解器（原型，用完即扔）。
// solve：对一个局面求解，返回结果、耗时、节点数和解的第一步（就是提示要亮的那一步）。
//        moves: true 时把移动算进去（第一步可能是一次移动，格式见 sim/solver.mjs 的 solveMoves）；
//        flipFirst: true 时第一轮也按"先试翻牌、移动排后面"的顺序搜，提示就会尽量给翻牌。
// bench：在这台设备上测求解耗时。局面取法和 research/09 一样：正推法发牌，
//        会移动的稳健型模拟玩家走到第 k 步时的局面（k=0 是刚发好的整副牌阵）。swaps > 0 时用互换法发牌。
import { solve } from '../sim/solver.mjs';
import { genForward, genSwap } from '../sim/generate.mjs';
import { play } from '../sim/players.mjs';
import { rng, EMPTY } from '../sim/core.mjs';

const opts = (budget, moves, flipFirst) => ({ budget, moves, ...(moves && flipFirst ? { order1: 'plain' } : {}) });

self.onmessage = (e) => {
  const m = e.data;
  if (m.cmd === 'solve') {
    const t0 = performance.now();
    const r = solve(m.board, opts(m.budget, m.moves, m.flipFirst));
    const ms = performance.now() - t0;
    const left = m.board.reduce((n, k) => n + (k !== EMPTY), 0);
    self.postMessage({ id: m.id, result: r.result, nodes: r.nodes, ms, left, first: r.solution ? r.solution[0] : null });
  } else if (m.cmd === 'bench') bench(m);
};

function stats(a) {
  const s = [...a].sort((x, y) => x - y);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean: s.reduce((x, y) => x + y, 0) / s.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
}

function bench({ spread, swaps = 0, budget, perK, ks, flipFirst }) {
  const per = Object.fromEntries(ks.map((k) => [k, { ms: [], solvable: 0, unsolvable: 0, timeout: 0, moveFirst: 0 }]));
  const gen = [];
  let done = 0;
  const total = perK * ks.length;
  for (let t = 0; t < perK; t++) {
    const seed = (Math.random() * 2 ** 31) | 0;
    const t0 = performance.now();
    const { board } = swaps ? genSwap(rng(seed), { spread, swaps }) : genForward(rng(seed), { spread });
    gen.push(performance.now() - t0);
    const snaps = { 0: Int8Array.from(board) };
    play(board, rng(seed + 1), 'steady', 'joker', (g, f) => {
      if (ks.includes(f)) snaps[f] = Int8Array.from(g.board);
    }, { moves: true });
    for (const k of ks) {
      if (!snaps[k]) continue;
      const t1 = performance.now();
      const r = solve(snaps[k], opts(budget, true, flipFirst));
      const dt = performance.now() - t1;
      per[k].ms.push(dt);
      per[k][r.result]++;
      if (r.solution?.[0]?.type === 'move') per[k].moveFirst++;
      self.postMessage({ cmd: 'progress', done: ++done, total, k, ms: dt, result: r.result });
    }
  }
  const rows = ks.map((k) => ({ k, n: per[k].ms.length, ...stats(per[k].ms), solvable: per[k].solvable, unsolvable: per[k].unsolvable, timeout: per[k].timeout, moveFirst: per[k].moveFirst }));
  self.postMessage({ cmd: 'done', rows, gen: stats(gen), cores: navigator.hardwareConcurrency, ua: navigator.userAgent });
}
