// 多线程跑实验：node run.mjs <实验名> <局数> [JSON 选项]
//   solveRandom  随机发牌的有解率             选项 {budget}
//   playRandom   随机发牌上两种玩家 × 三种救法
//   gen          正推法生成的牌阵             选项 {spread, budget}
// 加入移动以后（规则、求解器、玩家都算移动；求解器在 BUDGETS 的几档节点预算下各跑一次）：
//   solveRandomMove  随机发牌的有解率
//   playRandomMove   随机发牌上两种会移动的玩家（赖子救场）
//   genMove          正推法生成的牌阵            选项 {spread}
//   genSwap          spread = 1 再互换 swaps 对牌（更难的发牌办法之一）  选项 {swaps}
// 每局用自己的种子，结果可复现。汇总写到 results/<实验名>[-spread].json
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { rng, randInt, randomDeal, adjacentPairs, Game } from './core.mjs';
import { solve, verify, verifyMoves } from './solver.mjs';
import { listMoves } from './move.mjs';
import { play } from './players.mjs';
import { genForward } from './generate.mjs';

const STYLES = ['random', 'steady'];
const RESCUES = ['joker', 'shuffle', 'solvableShuffle'];

const TRIALS = {
  solveRandom(seed, { budget = 100000 }) {
    const board = randomDeal(rng(seed));
    const t0 = performance.now();
    const r = solve(board, { budget });
    if (r.solution && !verify(board, r.solution)) throw new Error('解校验失败');
    return { result: r.result, nodes: r.nodes, ms: performance.now() - t0 };
  },
  playRandom(seed) {
    const board = randomDeal(rng(seed));
    const out = { adj: adjacentPairs(board), moves0: new Game(board).moveCount() };
    let i = 0;
    for (const s of STYLES) for (const od of RESCUES) out[`${s}/${od}`] = play(board, rng(seed * 31 + ++i), s, od);
    return out;
  },
  gen(seed, { spread = 0, budget = 100000 }) {
    const rand = rng(seed);
    let t0 = performance.now();
    const g = genForward(rand, { spread });
    const genMs = performance.now() - t0;
    if (!verify(g.board, g.solution)) throw new Error('生成的牌阵无解');
    t0 = performance.now();
    const r = solve(g.board, { budget });
    const out = {
      genMs, adj: adjacentPairs(g.board), moves0: new Game(g.board).moveCount(),
      solve: r.result, solveNodes: r.nodes, solveMs: performance.now() - t0,
    };
    out.random = play(g.board, rng(seed * 31 + 1), 'random', 'joker');
    // 稳健型对局中途取快照：翻到第 10/25/40/55 对时局面是否仍然有解、求解多久
    const snaps = {};
    out.steady = play(g.board, rng(seed * 31 + 2), 'steady', 'joker', (gm, flips) => {
      if (SNAP_AT.includes(flips)) snaps[flips] = Int8Array.from(gm.board);
    });
    out.mid = {};
    for (const [at, b] of Object.entries(snaps)) {
      const t1 = performance.now();
      const sr = solve(b, { budget });
      out.mid[at] = { result: sr.result, ms: performance.now() - t1 };
    }
    return out;
  },
};
const SNAP_AT = [10, 25, 40, 55];

// ---- 加入移动以后 ----
const BUDGETS = [2000, 10000, 50000, 200000];
function solveAt(board) {
  const o = {};
  for (const budget of BUDGETS) {
    const t0 = performance.now();
    const r = solve(board, { moves: true, budget });
    const ms = performance.now() - t0;
    if (r.solution && !verifyMoves(board, r.solution)) throw new Error('带移动的解校验失败');
    o[budget] = { result: r.result, ms, nodes: r.nodes, likely: r.likely, first: r.solution ? r.solution[0].type : null };
  }
  return o;
}
// 这个局面上能做的事：能直接翻的对数、能配上的移动有几次（两张以上的牌串）、其中几次有不止一种配法
function options(board) {
  const ms = listMoves(board, { single: false });
  return { flips: new Game(board).moveCount(), moves: ms.length, multi: ms.filter((m) => m.pairs.length > 1).length };
}
Object.assign(TRIALS, {
  solveRandomMove(seed) {
    const board = randomDeal(rng(seed));
    return { adj: adjacentPairs(board), solve: solveAt(board) };
  },
  playRandomMove(seed) {
    const board = randomDeal(rng(seed));
    const out = {};
    let i = 0;
    for (const s of STYLES) out[s] = play(board, rng(seed * 31 + ++i), s, 'joker', null, { moves: true });
    return out;
  },
  genMove(seed, { spread = 0 }) {
    const g = genForward(rng(seed), { spread });
    const out = { adj: adjacentPairs(g.board), solve0: solveAt(g.board) };
    out.random = play(g.board, rng(seed * 31 + 1), 'random', 'joker', null, { moves: true });
    const snaps = {};
    out.steady = play(g.board, rng(seed * 31 + 2), 'steady', 'joker', (gm, flips) => {
      if (SNAP_AT.includes(flips)) snaps[flips] = Int8Array.from(gm.board);
    }, { moves: true });
    out.mid = {};
    for (const [at, b] of Object.entries(snaps)) out.mid[at] = { ...solveAt(b), options: options(b) };
    return out;
  },
  // 强制安全翻牌在有移动时会不会看错：只跑第一轮（split = 1），它搜完说"很可能无解"的局面，
  // 再用不强制安全翻牌的第二轮（预算 20 万）复查。
  safeCheck(seed, { spread = 1 }) {
    const g = genForward(rng(seed), { spread });
    const snaps = {};
    play(g.board, rng(seed * 31 + 2), 'steady', 'joker', (gm, flips) => {
      if (SNAP_AT.includes(flips)) snaps[flips] = Int8Array.from(gm.board);
    }, { moves: true });
    const out = {};
    for (const [at, b] of Object.entries(snaps)) {
      const r1 = solve(b, { moves: true, budget: 50000, split: 1 });
      out[at] = { phase1: r1.result === 'solvable' ? 'solvable' : r1.likely ? 'exhausted' : 'timeout' };
      if (out[at].phase1 === 'exhausted') out[at].recheck = solve(b, { moves: true, budget: 200000, split: 0 }).result;
    }
    return out;
  },
  // 比 spread = 1 更难的发牌办法之一（只为看数据，没有放进 generate.mjs）：
  // 正推法 spread = 1 发好以后，随机挑 swaps 对不同种的牌互换位置，再用带移动的求解器确认有解（预算 5 万），
  // 无解或超时就重来。swaps 越大越接近随机发牌。
  genSwap(seed, { swaps = 8 }) {
    const rand = rng(seed);
    let tries = 0, board, ms = 0;
    for (;;) {
      tries++;
      board = genForward(rand, { spread: 1 }).board;
      for (let k = 0; k < swaps; k++) {
        let a, b;
        do { a = randInt(rand, board.length); b = randInt(rand, board.length); } while (board[a] === board[b]);
        [board[a], board[b]] = [board[b], board[a]];
      }
      const t0 = performance.now();
      const r = solve(board, { moves: true, budget: 50000 });
      ms += performance.now() - t0;
      if (r.result === 'solvable') break;
    }
    return {
      tries, ms, adj: adjacentPairs(board), flipOnly: solve(board, { budget: 20000 }).result,
      random: play(board, rng(seed * 31 + 1), 'random', 'joker', null, { moves: true }),
      steady: play(board, rng(seed * 31 + 2), 'steady', 'joker', null, { moves: true }),
    };
  },
});

const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
const r2 = (x) => Math.round(x * 100) / 100;
const dist = (arr) => ({ mean: r2(mean(arr)), p10: q(arr, 0.1), p50: q(arr, 0.5), p90: q(arr, 0.9), p99: q(arr, 0.99), max: Math.max(...arr) });
const msDist = (arr) => ({ mean: r2(mean(arr)), p50: r2(q(arr, 0.5)), p99: r2(q(arr, 0.99)), max: r2(Math.max(...arr)) });
// 需要 ≤k 次救场的比例
const cdf = (arr, ks = [0, 1, 2, 3, 5, 10]) => Object.fromEntries(ks.map((k) => [`<=${k}`, r2(arr.filter((x) => x <= k).length / arr.length)]));
const playStats = (rs) => ({
  deadRate: r2(rs.filter((r) => r.rescues > 0).length / rs.length),
  firstDeadLeft: rs.some((r) => r.firstDeadLeft !== null) ? dist(rs.filter((r) => r.firstDeadLeft !== null).map((r) => r.firstDeadLeft)) : null,
  rescues: dist(rs.map((r) => r.rescues)),
  rescuesCdf: cdf(rs.map((r) => r.rescues)),
  ...(rs[0].movesUsed !== undefined ? { movesUsed: dist(rs.map((r) => r.movesUsed)) } : {}),
});
const tally = (xs) => { const t = {}; for (const x of xs) t[x] = (t[x] || 0) + 1; return t; };
// solveAt 的结果按预算汇总
const solveStats = (xs) => Object.fromEntries(BUDGETS.map((b) => {
  const ys = xs.map((x) => x[b]);
  return [b, {
    result: tally(ys.map((y) => y.result)),
    likelyUnsolvable: ys.filter((y) => y.likely).length,
    ms: { ...msDist(ys.map((y) => y.ms)), p90: r2(q(ys.map((y) => y.ms), 0.9)) },
    firstIsMove: ys.filter((y) => y.first === 'move').length,
  }];
}));

const SUMMARIES = {
  solveRandomMove: (rs) => ({ adj: dist(rs.map((r) => r.adj)), solve: solveStats(rs.map((r) => r.solve)) }),
  playRandomMove: (rs) => Object.fromEntries(STYLES.map((s) => [s, playStats(rs.map((r) => r[s]))])),
  safeCheck: (rs) => Object.fromEntries(SNAP_AT.map((at) => {
    const xs = rs.map((r) => r[at]).filter(Boolean);
    return [`flip${at}`, { n: xs.length, phase1: tally(xs.map((x) => x.phase1)), recheck: tally(xs.filter((x) => x.recheck).map((x) => x.recheck)) }];
  })),
  genSwap: (rs) => ({
    tries: dist(rs.map((r) => r.tries)), genMs: msDist(rs.map((r) => r.ms)), adj: dist(rs.map((r) => r.adj)),
    flipOnly: tally(rs.map((r) => r.flipOnly)),
    random: playStats(rs.map((r) => r.random)), steady: playStats(rs.map((r) => r.steady)),
  }),
  genMove: (rs) => ({
    adj: dist(rs.map((r) => r.adj)),
    solve0: solveStats(rs.map((r) => r.solve0)),
    random: playStats(rs.map((r) => r.random)),
    steady: playStats(rs.map((r) => r.steady)),
    steadyMid: Object.fromEntries(SNAP_AT.map((at) => {
      const xs = rs.map((r) => r.mid[at]).filter(Boolean);
      const opt = (k) => r2(mean(xs.map((x) => x.options[k])));
      return [`flip${at}`, {
        n: xs.length, solve: solveStats(xs),
        options: { flips: opt('flips'), moves: opt('moves'), multi: opt('multi'), noFlipButMove: xs.filter((x) => x.options.flips === 0 && x.options.moves > 0).length },
      }];
    })),
  }),
  solveRandom: (rs) => ({
    result: tally(rs.map((r) => r.result)),
    provedAtRoot: rs.filter((r) => r.result === 'unsolvable' && r.nodes === 1).length,
    nodes: dist(rs.map((r) => r.nodes)),
    ms: msDist(rs.map((r) => r.ms)),
  }),
  playRandom: (rs) => {
    const out = { adj: dist(rs.map((r) => r.adj)), moves0: dist(rs.map((r) => r.moves0)), noMoveAtStart: rs.filter((r) => r.moves0 === 0).length };
    for (const s of STYLES) for (const od of RESCUES) out[`${s}/${od}`] = playStats(rs.map((r) => r[`${s}/${od}`]));
    return out;
  },
  gen: (rs) => ({
    genMs: msDist(rs.map((r) => r.genMs)),
    adj: dist(rs.map((r) => r.adj)),
    moves0: dist(rs.map((r) => r.moves0)),
    solve: tally(rs.map((r) => r.solve)),
    solveNodes: dist(rs.map((r) => r.solveNodes)),
    solveMs: msDist(rs.map((r) => r.solveMs)),
    random: playStats(rs.map((r) => r.random)),
    steady: playStats(rs.map((r) => r.steady)),
    steadyMid: Object.fromEntries(SNAP_AT.map((at) => {
      const xs = rs.map((r) => r.mid[at]).filter(Boolean);
      return [`flip${at}`, { n: xs.length, result: tally(xs.map((x) => x.result)), ms: msDist(xs.map((x) => x.ms)) }];
    })),
  }),
};

if (isMainThread) {
  const [exp, countStr, optStr] = process.argv.slice(2);
  const count = +countStr, opts = JSON.parse(optStr || '{}');
  const W = opts.workers || Math.max(1, Math.min(os.cpus().length - 1, 15)); // 测耗时用 {"workers":1}，免得线程互相抢
  const t0 = performance.now();
  const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
    const seeds = [];
    for (let s = w; s < count; s += W) seeds.push(1000003 * (s + 1) + (opts.seedSalt || 0));
    const worker = new Worker(new URL(import.meta.url), { workerData: { exp, seeds, opts } });
    worker.on('message', res);
    worker.on('error', rej);
  })));
  const results = parts.flat();
  const summary = { exp, count, opts, wallSec: r2((performance.now() - t0) / 1000), ...SUMMARIES[exp](results) };
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  const name = exp + (opts.spread !== undefined ? `-spread${opts.spread}` : '') + (opts.swaps !== undefined ? `-swaps${opts.swaps}` : '') + (opts.tag ? `-${opts.tag}` : '');
  writeFileSync(new URL(`./results/${name}.json`, import.meta.url), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} else {
  const { exp, seeds, opts } = workerData;
  parentPort.postMessage(seeds.map((s) => TRIALS[exp](s, opts)));
}
