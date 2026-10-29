// 后台线程：发牌和求解都在这里跑，不卡界面（spec.md 第 4.4、9.1 节）。
//   deal：按难度发一副牌阵，挑三张赤五，返回存下的解
//   solve：带移动的求解器，返回结果和解的第一步
import { N, rng, randInt } from '../core/core';
import { genForward, genSwap } from '../core/generate';
import { solve, type Step } from '../core/solver';
import { dealOf } from './difficulty';
import { RED_KINDS } from './rules';

export type DealRequest = { cmd: 'deal'; id: number; diff: number; seed: number };
export type SolveRequest = { cmd: 'solve'; id: number; board: Int8Array; budget: number };
export type DealReply = { id: number; board: Int8Array; red: Uint8Array; solution: Step[] };
export type SolveReply = { id: number; result: 'solvable' | 'unsolvable' | 'timeout'; first: Step | null };

function deal({ diff, seed }: DealRequest): Omit<DealReply, 'id'> {
  const { spread, swaps, swap } = dealOf(diff);
  const rand = rng(seed);
  let board: Int8Array, solution: Step[];
  if (swap) ({ board, solution } = genSwap(rand, { spread, swaps }));
  else {
    const g = genForward(rand, { spread });
    board = g.board;
    solution = g.solution.map(([a, b]) => ({ type: 'flip' as const, a, b }));
  }
  // 每种五里随机挑一张做赤五
  const rr = rng(seed ^ 0x5bd1e995);
  const red = new Uint8Array(N);
  for (const k of RED_KINDS) {
    const cells: number[] = [];
    for (let i = 0; i < N; i++) if (board[i] === k) cells.push(i);
    red[cells[randInt(rr, cells.length)]] = 1;
  }
  return { board, red, solution };
}

self.onmessage = (e: MessageEvent<DealRequest | SolveRequest>) => {
  const m = e.data;
  if (m.cmd === 'deal') {
    self.postMessage({ id: m.id, ...deal(m) } satisfies DealReply);
  } else {
    // 提示优先给翻牌：第一轮也按"翻牌在前、移动在后"的顺序搜（spec.md 第 5.5、9.1 节）
    const r = solve(m.board, { moves: true, budget: m.budget, order1: 'plain' });
    self.postMessage({ id: m.id, result: r.result, first: r.solution?.[0] ?? null } as SolveReply);
  }
};
