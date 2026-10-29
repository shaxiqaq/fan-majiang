// 移动的规则（见「定移动机制」和 CONTEXT.md 的「牌串」「移动」）。
//
// 先选一个方向。同一行（左右）或同一列（上下）里一段紧挨着的未翻牌，最前面那张在这个方向上
// 紧挨着空位，这一整段就是一个牌串；只能整串走。牌串沿这个方向直走 dist 格（1 到前方连续空位数），
// 走完以后，串里至少要有一张牌和一张没动的同牌之间是不拐弯的连线（同行或同列、中间全是空位），
// 并翻掉其中一对；一对都配不上，这次移动不算。
//
// 挪完以后要找的"没动的同牌"有三种来源，都不用真的把牌挪过去再看：
//   1. 串里每张牌落点的垂直方向（左右移动时看上下）：那几格在别的行/列，挪动不影响；
//   2. 最前面那张往前看：前方空位走完碰到的第一张牌（就是挡住牌串的那张）；
//   3. 最后面那张往后看：腾出来的格加上原来身后的空位，碰到的第一张牌。
// 串内两张牌永远不算配上：它们都动了，而"没动的同牌"要求另一张没动。
//
// 只有一张牌的牌串：挪过去配上，结果和直接翻掉这一对完全一样（路径就是一条最多拐一次弯的连线）。
// 规则上允许，listMoves 默认列出来；求解器和模拟玩家跳过它们，免得同一个结果算两遍。
import { ROWS, COLS, N, EMPTY, UP, DOWN, LEFT, RIGHT, STEP, DIR_NAMES } from './core';
import type { BoardLike, DirName, FlipRecord, Game } from './core';

// 撤回移动用的记录：[dir, head, len, dist, 翻牌记录]
export type MoveRecord = [number, number, number, number, FlipRecord];

export type MovePair = { from: number; to: number; partner: number };
export type ListedMove = {
  dir: DirName;
  dirIndex: number;
  head: number;
  len: number;
  dist: number;
  cells: number[];
  pairs: MovePair[];
};

// near[d * N + i]：从格 i 往方向 d 看，越过空位碰到的第一张未翻牌（不含 i 本身），没有为 -1
export function nearest(board: BoardLike, near: Int16Array = new Int16Array(4 * N)): Int16Array {
  for (let c = 0; c < COLS; c++) {
    let last = -1;
    for (let r = 0; r < ROWS; r++) {
      const i = r * COLS + c;
      near[UP * N + i] = last;
      if (board[i] !== EMPTY) last = i;
    }
    last = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = r * COLS + c;
      near[DOWN * N + i] = last;
      if (board[i] !== EMPTY) last = i;
    }
  }
  for (let r = 0; r < ROWS; r++) {
    let last = -1;
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      near[LEFT * N + i] = last;
      if (board[i] !== EMPTY) last = i;
    }
    last = -1;
    for (let c = COLS - 1; c >= 0; c--) {
      const i = r * COLS + c;
      near[RIGHT * N + i] = last;
      if (board[i] !== EMPTY) last = i;
    }
  }
  return near;
}

const NEAR = new Int16Array(4 * N);
const OPP = [DOWN, UP, RIGHT, LEFT];
// 垂直于移动方向的两个方向
const SIDES: readonly (readonly [number, number])[] = [[LEFT, RIGHT], [LEFT, RIGHT], [UP, DOWN], [UP, DOWN]];

// 列举所有能配上的移动，每种配法往 out 里推 7 个数：
//   dir, head, len, dist, from, to, partner
// head 是牌串最前面那张牌（移动前）的格，len 是串长，dist 是走几格；
// from → to 是配上的那张牌移动前后的格，partner 是那张没动的同牌。
// 同一个 (dir, head, dist) 的几种配法挨着推。minLen = 2 时跳过单张的牌串。
export function collectMoves(board: BoardLike, out: number[], minLen = 1): number[] {
  const near = nearest(board, NEAR);
  for (let dir = 0; dir < 4; dir++) {
    const s = STEP[dir], back = OPP[dir];
    const [sa, sb] = SIDES[dir];
    const vertical = dir === UP || dir === DOWN;
    const lines = vertical ? COLS : ROWS, along = vertical ? ROWS : COLS;
    for (let line = 0; line < lines; line++) {
      // t 从这条线在移动方向上的最前端往回数。扫到的每段紧挨着的未翻牌，第一张就是串头；
      // 它前面一格要么是空位（上一段已经过去了），要么是棋盘边（t = 0，走不了）。
      for (let t = 0; t < along; t++) {
        const head = cellAt(vertical, line, dir, along, t);
        if (board[head] === EMPTY) continue;
        let len = 1;
        while (t + len < along && board[cellAt(vertical, line, dir, along, t + len)] !== EMPTY) len++;
        if (t > 0 && len >= minLen) {
          const rear = head - s * (len - 1);
          const blocker = near[dir * N + head]; // 挡住牌串的那张
          const behind = near[back * N + rear]; // 串尾身后的第一张
          const gap = blocker < 0 ? t : (blocker - head) / s - 1; // 前方连续空位数
          const kHead = board[head], kRear = board[rear];
          for (let dist = 1; dist <= gap; dist++) {
            const d = s * dist;
            if (blocker >= 0 && board[blocker] === kHead) out.push(dir, head, len, dist, head, head + d, blocker);
            if (behind >= 0 && board[behind] === kRear) out.push(dir, head, len, dist, rear, rear + d, behind);
            for (let i = 0, c = head; i < len; i++, c -= s) {
              const k = board[c], to = c + d;
              const p = near[sa * N + to], q = near[sb * N + to];
              if (p >= 0 && board[p] === k) out.push(dir, head, len, dist, c, to, p);
              if (q >= 0 && board[q] === k) out.push(dir, head, len, dist, c, to, q);
            }
          }
        }
        t += len - 1;
      }
    }
  }
  return out;
}

function cellAt(vertical: boolean, line: number, dir: number, along: number, t: number): number {
  const pos = dir === UP || dir === LEFT ? t : along - 1 - t;
  return vertical ? pos * COLS + line : line * COLS + pos;
}

// 有没有至少一次能配上的移动（死局判定用，找到一个就停）
export function hasMove(board: BoardLike, minLen = 2): boolean {
  return collectMoves(board, [], minLen).length > 0;
}

// 给界面和测试用的版本：把同一次移动（同一个牌串、方向、格数）的几种配法归到一起。
// 返回 [{ dir: 'right', head, len, dist, cells: [移动前从前到后的格], pairs: [{ from, to, partner }] }]
export function listMoves(board: BoardLike, { single = true }: { single?: boolean } = {}): ListedMove[] {
  const flat = collectMoves(board, [], single ? 1 : 2);
  const out: ListedMove[] = [];
  let cur: ListedMove | null = null;
  for (let i = 0; i < flat.length; i += 7) {
    const [dir, head, len, dist, from, to, partner] = flat.slice(i, i + 7);
    if (!cur || cur.dirIndex !== dir || cur.head !== head || cur.dist !== dist) {
      const cells: number[] = [];
      for (let j = 0; j < len; j++) cells.push(head - STEP[dir] * j);
      cur = { dir: DIR_NAMES[dir], dirIndex: dir, head, len, dist, cells, pairs: [] };
      out.push(cur);
    }
    // 同一对可能从两个来源各找到一次（比如单张牌串前后都是同牌时不会重复，这里只防万一）
    if (!cur.pairs.some((p) => p.from === from && p.partner === partner)) cur.pairs.push({ from, to, partner });
  }
  return out;
}

// 在 Game 上执行一次移动并翻掉配上的一对；返回撤回用的记录
export function doMove(g: Game, dir: number, head: number, len: number, dist: number, to: number, partner: number): MoveRecord {
  g.shift(head, dir, len, dist);
  const f = g.flip(to, partner);
  return [dir, head, len, dist, f];
}

export function undoMove(g: Game, [dir, head, len, dist, f]: MoveRecord): void {
  g.undo(f);
  g.unshift(head, dir, len, dist);
}
