// 发牌的用例：牌数、牌种、生成解能校验通过；同一种子发出同一副牌
import { describe, it, expect } from 'vitest';
import { N, KINDS, rng } from './core';
import { genForward, genSwap } from './generate';
import { solve, verify, verifyMoves } from './solver';

const sum = (b: Int8Array) => { let h = 0; for (const x of b) h = (h * 31 + x + 1) >>> 0; return h; };

function expectFullDeck(board: Int8Array) {
  expect(board.length).toBe(N);
  expect(N).toBe(136);
  const count = new Array(KINDS).fill(0);
  for (const k of board) {
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThan(KINDS);
    count[k]++;
  }
  expect(count).toEqual(new Array(KINDS).fill(4));
}

// 原版 .mjs 跑出来的牌阵校验和，用来确认移植后结果一模一样
const FORWARD_REF: Record<string, number> = {
  '1_0.75': 3813754192, '1_1': 1543115968,
  '2_0.75': 3428444536, '2_1': 1404198436,
  '3_0.75': 2344080542, '3_1': 1531022380,
};

describe('genForward', () => {
  for (const seed of [1, 2, 3]) for (const spread of [0.75, 1]) {
    it(`seed ${seed} spread ${spread}：满副牌、生成解校验通过、和原版一致`, () => {
      const { board, solution } = genForward(rng(seed), { spread });
      expectFullDeck(board);
      expect(solution.length).toBe(N / 2);
      expect(verify(board, solution)).toBe(true);
      expect(sum(board)).toBe(FORWARD_REF[`${seed}_${spread}`]);
    });
  }
  it('同一种子发出同一副牌', () => {
    expect([...genForward(rng(42), { spread: 1 }).board]).toEqual([...genForward(rng(42), { spread: 1 }).board]);
    expect([...genForward(rng(42), { spread: 1 }).board]).not.toEqual([...genForward(rng(43), { spread: 1 }).board]);
  });
});

describe('genSwap', () => {
  // [校验和, tries, 解的步数]，原版 .mjs 跑出来的
  const SWAP_REF: Record<number, [number, number, number]> = { 1: [3660388582, 1, 68], 2: [3898323334, 1, 68] };
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed} spread 1 swaps 16：满副牌、带移动的解校验通过`, () => {
      const { board, solution, tries } = genSwap(rng(seed), { spread: 1, swaps: 16 });
      expectFullDeck(board);
      expect(tries).toBeGreaterThanOrEqual(1);
      expect(verifyMoves(board, solution)).toBe(true);
      const ref = SWAP_REF[seed];
      if (ref) expect([sum(board), tries, solution.length]).toEqual(ref);
    });
  }
  it('同一种子发出同一副牌', () => {
    expect([...genSwap(rng(9)).board]).toEqual([...genSwap(rng(9)).board]);
  });
});

it('只翻牌的 solve 和原版一致', () => {
  const r = solve(genForward(rng(7), { spread: 0.75 }).board, { budget: 20000 });
  expect([r.result, r.nodes]).toEqual(['solvable', 19]);
  expect(verify(genForward(rng(7), { spread: 0.75 }).board, r.solution!)).toBe(true);
});
