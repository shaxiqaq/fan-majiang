// 界面需要、但求解器用不着的规则小工具：画线用的折点、某张牌所在的牌串。
// 判定本身照 core/ 的实现（spec.md 第 3 节），这里只换一种返回形式。
import { ROWS, COLS, N, EMPTY, UP, DOWN, LEFT, STEP } from '../core/core';

export const RED_KINDS = [4, 13, 22]; // 五万、五筒、五索
export const HAKU = 31;

// 一次移动：牌串从 head 往 dirIndex 方向排，cells 是移动前从串头到串尾的格
export type Move = { dirIndex: number; head: number; len: number; cells: number[]; dist: number };
// 一种配法：串里 from 那张走到 to，和没动的 partner 对上
export type Pair = { from: number; to: number; partner: number };
// 牌串加上它前方的连续空位数
export type Run = Omit<Move, 'dist'> & { gap: number };

export const cellsOf = (dirIndex: number, head: number, len: number): number[] =>
  Array.from({ length: len }, (_, j) => head - STEP[dirIndex] * j);
export const destCells = (m: Move): number[] => m.cells.map((c) => c + STEP[m.dirIndex] * m.dist);

function passOf(board: Int8Array): Uint8Array {
  const pass = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (board[i] === EMPTY) pass[i] = 1;
  return pass;
}
function rowClear(pass: Uint8Array, r: number, c1: number, c2: number): boolean {
  if (c1 > c2) [c1, c2] = [c2, c1];
  for (let c = c1 + 1; c < c2; c++) if (!pass[r * COLS + c]) return false;
  return true;
}
function colClear(pass: Uint8Array, c: number, r1: number, r2: number): boolean {
  if (r1 > r2) [r1, r2] = [r2, r1];
  for (let r = r1 + 1; r < r2; r++) if (!pass[r * COLS + c]) return false;
  return true;
}

export const sameKind = (board: Int8Array, a: number, b: number): boolean => a !== b && board[a] >= 0 && board[a] === board[b];

// 和 core 的 connect 判定相同，但返回途经的折点，供画线用：[a, b] 或 [a, 拐点, b]；连不上为 null
export function pathOf(board: Int8Array, a: number, b: number): number[] | null {
  if (!sameKind(board, a, b)) return null;
  const pass = passOf(board);
  const ra = (a / COLS) | 0, ca = a % COLS, rb = (b / COLS) | 0, cb = b % COLS;
  if (ra === rb) return rowClear(pass, ra, ca, cb) ? [a, b] : null;
  if (ca === cb) return colClear(pass, ca, ra, rb) ? [a, b] : null;
  const k1 = ra * COLS + cb;
  if (pass[k1] && rowClear(pass, ra, ca, cb) && colClear(pass, cb, ra, rb)) return [a, k1, b];
  const k2 = rb * COLS + ca;
  if (pass[k2] && colClear(pass, ca, ra, rb) && rowClear(pass, rb, ca, cb)) return [a, k2, b];
  return null;
}

// 格 i 往 dir 走一格到哪（出界为 -1）
export function nextCell(i: number, dir: number): number {
  const r = (i / COLS) | 0, c = i % COLS;
  if (dir === UP) return r > 0 ? i - COLS : -1;
  if (dir === DOWN) return r < ROWS - 1 ? i + COLS : -1;
  if (dir === LEFT) return c > 0 ? i - 1 : -1;
  return c < COLS - 1 ? i + 1 : -1;
}

// 格 i 上的牌朝 dir 走时所在的牌串
export function runAt(board: Int8Array, i: number, dir: number): Run | null {
  if (board[i] === EMPTY) return null;
  let head = i, n: number;
  while ((n = nextCell(head, dir)) >= 0 && board[n] !== EMPTY) head = n;
  const back = dir ^ 1; // UP↔DOWN、LEFT↔RIGHT
  const cells = [head];
  let c = head;
  while ((n = nextCell(c, back)) >= 0 && board[n] !== EMPTY) cells.push((c = n));
  let gap = 0;
  c = head;
  while ((n = nextCell(c, dir)) >= 0 && board[n] === EMPTY) { gap++; c = n; }
  return { dirIndex: dir, head, len: cells.length, cells, gap };
}
