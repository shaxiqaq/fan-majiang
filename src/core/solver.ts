// 有解判定：带记忆化的 DFS。
// 每个节点先把安全翻牌做完（绝不吃亏），只在"四张同牌怎么配对"上分叉；
// 再用乐观推算剪掉一定无解的局面。超过节点预算记为超时。
//
// moves: true 时改用 solveMoves（把移动算进分支），解的格式也不同，见下面。
// 不传时和加入移动之前完全一样，原型现有的调用不受影响。
import { Game, DIR_NAMES } from './core';
import type { BoardLike, DirName, FlipRecord } from './core';
import { collectMoves, listMoves, doMove, undoMove } from './move';
import type { MoveRecord } from './move';

const TIMEOUT = Symbol('timeout');

export type FlipStep = { type: 'flip'; a: number; b: number };
export type MoveStep = { type: 'move'; dir: DirName; head: number; len: number; dist: number; from: number; to: number; partner: number };
export type Step = FlipStep | MoveStep;

export type SolveStatus = 'solvable' | 'unsolvable' | 'timeout';
export type Phase1Status = 'skipped' | 'exhausted' | 'timeout';
export type SolveResult = {
  result: SolveStatus;
  nodes: number;
  solution: Step[] | null;
  phase: 1 | 2;
  phase1?: Phase1Status;
  phase1Nodes?: number;
  likely?: 'unsolvable';
};
// 只翻牌（不带 moves）时的结果：解是 [a, b] 对的列表
export type FlipSolveResult = { result: SolveStatus; nodes: number; solution: [number, number][] | null };

export type BranchOrder = 'scored' | 'plain';
export type SolveMovesOptions = { budget?: number; split?: number; order1?: BranchOrder; order2?: BranchOrder };
export type SolveOptions = SolveMovesOptions & { prune?: boolean; moves?: boolean };

export function solve(board: BoardLike, opts: SolveOptions & { moves: true }): SolveResult;
export function solve(board: BoardLike, opts?: SolveOptions & { moves?: false }): FlipSolveResult;
export function solve(board: BoardLike, opts?: SolveOptions): SolveResult | FlipSolveResult;
export function solve(board: BoardLike, { budget = 100000, prune = true, moves = false, ...rest }: SolveOptions = {}): SolveResult | FlipSolveResult {
  if (moves) return solveMoves(board, { budget, ...rest });
  const g = new Game(board);
  const failed = new Set<number>();
  const stack: FlipRecord[] = [];
  let nodes = 0;
  const flip = (a: number, b: number) => stack.push(g.flip(a, b));
  const undoTo = (n: number) => { while (stack.length > n) g.undo(stack.pop()!); };

  function dfs(): boolean {
    if (++nodes > budget) throw TIMEOUT;
    const mark = stack.length;
    let m: [number, number] | null;
    while ((m = g.safeMove())) flip(m[0], m[1]);
    if (g.left === 0) return true;
    const key = g.key();
    if (!failed.has(key) && !(prune && g.hasPermanentBlock())) {
      // 剩下能翻的都是"四张中选一对"的分叉；按翻完后的可翻对数从多到少试
      const ms = g.moves();
      const order: [number, number, number][] = [];
      for (let i = 0; i < ms.length; i += 2) {
        const rec = g.flip(ms[i], ms[i + 1]);
        order.push([g.moveCount(), ms[i], ms[i + 1]]);
        g.undo(rec);
      }
      order.sort((x, y) => y[0] - x[0]);
      for (const [, a, b] of order) {
        const before = stack.length;
        flip(a, b);
        if (dfs()) return true;
        undoTo(before);
      }
      failed.add(key);
    }
    undoTo(mark);
    return false;
  }

  try {
    const ok = dfs();
    return { result: ok ? 'solvable' : 'unsolvable', nodes, solution: ok ? stack.map(([a, b]): [number, number] => [a, b]) : null };
  } catch (e) {
    if (e === TIMEOUT) return { result: 'timeout', nodes, solution: null };
    throw e;
  }
}

// 校验解：按顺序重放，每一步都必须是同牌且能连上
export function verify(board: BoardLike, solution: readonly (readonly [number, number])[]): boolean {
  const g = new Game(board);
  for (const [a, b] of solution) {
    if (g.board[a] !== g.board[b] || g.board[a] < 0 || !g.canFlip(a, b)) return false;
    g.flip(a, b);
  }
  return g.left === 0;
}

// ---- 加入移动以后 ----
//
// 分支：能直接翻的每一对，加上每一次能配上的移动（两张以上的牌串；单张牌串的移动和直接翻牌结果一样，
// 不重复算）的每一种配法。
//
// 去重：牌会换格，只看"哪些格空了"的键分不清局面，改用"每格放的是哪种牌"的 Zobrist 键（kindKey）。
// 同种的牌互换位置算同一个局面。
//
// 安全翻牌：只翻牌时，"只剩两张且能连上"之类的翻牌绝不吃亏；有了移动就不一定了。
// 这一对还在场上时，可以拿它当"配上的那一对"去移动它所在的牌串，把串里别的牌顺路带到新位置；
// 先把它直接翻掉，这次顺路就没了。模拟里这种情况在残局很常见（见报告），所以分两轮搜：
//   第一轮照旧强制先做安全翻牌，分支按 order1 排，最多用 split × budget 个节点。找到解就是真的有解。
//   第一轮没找到（搜完了或者用完了它那份预算），第二轮不强制安全翻牌、分支按 order2 排，从头再搜，
//   直到总预算用完。第二轮搜完才算证明无解；预算用完记为超时。
//   第一轮搜完都没有解时，超时的结果里会带 likely: 'unsolvable'（只是参考，不是证明）。
// order: 'scored' 每个分支都试走一步、按走完后能直接翻的对数排（准，但每个节点贵）；
//        'plain' 只给翻牌这样打分，移动不打分、排在翻牌后面（便宜）。两种排法擅长的局面不一样。
//
// 解的格式：[{ type: 'flip', a, b } | { type: 'move', dir, head, len, dist, from, to, partner }]
// 字段含义同 move.ts 的 collectMoves；dir 是 'up' | 'down' | 'left' | 'right'。
type StackEntry = [0, FlipRecord, FlipStep] | [1, MoveRecord, MoveStep];
type Branch = { score: number; flip: true; a: number; b: number } | { score: number; flip: false; mv: number[]; i: number };

export function solveMoves(board: BoardLike, { budget = 100000, split = 0.1, order1 = 'scored', order2 = 'plain' }: SolveMovesOptions = {}): SolveResult {
  const g = new Game(board);
  const stack: StackEntry[] = []; // [type, rec, step]
  let nodes = 0;
  const flipStep = (a: number, b: number) => stack.push([0, g.flip(a, b), { type: 'flip', a, b }]);
  const moveStep = (m: number[], i: number) => {
    const rec = doMove(g, m[i], m[i + 1], m[i + 2], m[i + 3], m[i + 5], m[i + 6]);
    stack.push([1, rec, { type: 'move', dir: DIR_NAMES[m[i]], head: m[i + 1], len: m[i + 2], dist: m[i + 3], from: m[i + 4], to: m[i + 5], partner: m[i + 6] }]);
  };
  const undoTo = (n: number) => {
    while (stack.length > n) {
      const e = stack.pop()!;
      if (e[0] === 0) g.undo(e[1]);
      else undoMove(g, e[1]);
    }
  };

  // 当前局面的所有分支，从看上去最好的排起
  function branches(order: BranchOrder): Branch[] {
    const out: Branch[] = [];
    const fl = g.moves();
    for (let i = 0; i < fl.length; i += 2) {
      const rec = g.flip(fl[i], fl[i + 1]);
      out.push({ score: g.moveCount() + 0.5, flip: true, a: fl[i], b: fl[i + 1] }); // 同分时先翻牌
      g.undo(rec);
    }
    const mv = collectMoves(g.board, [], 2);
    for (let i = 0; i < mv.length; i += 7) {
      let score = 0;
      if (order === 'scored') {
        const rec = doMove(g, mv[i], mv[i + 1], mv[i + 2], mv[i + 3], mv[i + 5], mv[i + 6]);
        score = g.moveCount();
        undoMove(g, rec);
      }
      out.push({ score, flip: false, mv, i });
    }
    out.sort((x, y) => y.score - x.score);
    return out;
  }

  function search(forceSafe: boolean, order: BranchOrder, limit: number): boolean {
    const failed = new Set<number>();
    const dfs = (): boolean => {
      if (++nodes > limit) throw TIMEOUT;
      const mark = stack.length;
      if (forceSafe) {
        let m: [number, number] | null;
        while ((m = g.safeMove())) flipStep(m[0], m[1]);
      }
      if (g.left === 0) return true;
      const key = g.kindKey();
      if (!failed.has(key)) {
        for (const br of branches(order)) {
          const before = stack.length;
          if (br.flip) flipStep(br.a, br.b);
          else moveStep(br.mv, br.i);
          if (dfs()) return true;
          undoTo(before);
        }
        failed.add(key);
      }
      undoTo(mark);
      return false;
    };
    return dfs();
  }

  const done = (result: SolveStatus, extra: Omit<SolveResult, 'result' | 'nodes' | 'solution'>): SolveResult =>
    ({ result, nodes, solution: result === 'solvable' ? stack.map((s) => s[2]) : null, ...extra });
  let phase1: Phase1Status = 'skipped';
  if (split > 0) {
    try {
      if (search(true, order1, Math.floor(budget * split))) return done('solvable', { phase: 1 });
      phase1 = 'exhausted';
    } catch (e) {
      if (e !== TIMEOUT) throw e;
      phase1 = 'timeout';
      undoTo(0);
    }
  }
  const phase1Nodes = nodes;
  try {
    return done(search(false, order2, budget) ? 'solvable' : 'unsolvable', { phase: 2, phase1, phase1Nodes });
  } catch (e) {
    if (e !== TIMEOUT) throw e;
    return done('timeout', { phase: 2, phase1, phase1Nodes, ...(phase1 === 'exhausted' ? { likely: 'unsolvable' as const } : {}) });
  }
}

// 校验带移动的解：每一步都必须合法（翻牌能连上；移动在 listMoves 里、配法也在）
export function verifyMoves(board: BoardLike, solution: readonly Step[]): boolean {
  const g = new Game(board);
  for (const s of solution) {
    if (s.type === 'flip') {
      if (g.board[s.a] !== g.board[s.b] || g.board[s.a] < 0 || !g.canFlip(s.a, s.b)) return false;
      g.flip(s.a, s.b);
    } else {
      const m = listMoves(g.board).find((x) => x.dir === s.dir && x.head === s.head && x.dist === s.dist);
      if (!m || m.len !== s.len || !m.pairs.some((p) => p.from === s.from && p.to === s.to && p.partner === s.partner)) return false;
      doMove(g, DIR_NAMES.indexOf(s.dir), s.head, s.len, s.dist, s.to, s.partner);
    }
  }
  return g.left === 0;
}
