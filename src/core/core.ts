// 翻麻将规则核心：8×17 牌阵，横竖连线最多拐一次弯，途经的格必须是空位。
// 术语见 CONTEXT.md。牌种 0..33；赤五在规则上等同普通五，模拟里不区分。

export const ROWS = 8, COLS = 17, N = ROWS * COLS, KINDS = 34, EMPTY = -1;

export type Rand = () => number;
// 能当牌阵读的东西：Int8Array 或普通数组
export type BoardLike = ArrayLike<number>;
// 撤回翻牌用的记录：[a, b, 牌种]
export type FlipRecord = [number, number, number];

// sfc32，可复现的随机数
export function rng(seed: number): Rand {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  return next;
}

export const randInt = (rand: Rand, n: number): number => Math.floor(rand() * n);

export function shuffle<T>(arr: T[], rand: Rand): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(rand, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function randomDeal(rand: Rand): Int8Array {
  const tiles: number[] = [];
  for (let k = 0; k < KINDS; k++) for (let i = 0; i < 4; i++) tiles.push(k);
  return Int8Array.from(shuffle(tiles, rand));
}

// Zobrist 表：两张 32 位表拼成 53 位以内的整数键
const Z1 = new Int32Array(N), Z2 = new Int32Array(N);
{
  const r = rng(12345);
  for (let i = 0; i < N; i++) {
    Z1[i] = (r() * 4294967296) | 0;
    Z2[i] = (r() * 4294967296) | 0;
  }
}

// 带牌种的 Zobrist 表（格 × 牌种）。加入移动后牌会换格，只看"哪些格空了"的键分不清局面，
// 要用这一张。另开种子，Z1/Z2 的取值不变，只翻牌的求解器结果照旧可复现。
const ZK1 = new Int32Array(N * KINDS), ZK2 = new Int32Array(N * KINDS);
{
  const r = rng(67890);
  for (let i = 0; i < N * KINDS; i++) {
    ZK1[i] = (r() * 4294967296) | 0;
    ZK2[i] = (r() * 4294967296) | 0;
  }
}

// 四个方向：上、下、左、右。STEP 是沿该方向走一格时格下标的增量。
export const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;
export type DirIndex = 0 | 1 | 2 | 3;
export type DirName = 'up' | 'down' | 'left' | 'right';
export const DIR_NAMES: readonly DirName[] = ['up', 'down', 'left', 'right'];
export const STEP: readonly number[] = [-COLS, COLS, -1, 1];

// pass[c] = 1 表示连线可以经过该格。正常对局里 pass 恰好等于"是空位"；
// 乐观推算时会额外把"可能被翻掉的牌"也标成可经过。
export function connect(a: number, b: number, pass: ArrayLike<number>): boolean {
  const ra = (a / COLS) | 0, ca = a - ra * COLS;
  const rb = (b / COLS) | 0, cb = b - rb * COLS;
  if (ra === rb) return rowClear(pass, ra, ca, cb);
  if (ca === cb) return colClear(pass, ca, ra, rb);
  // 拐点 (ra, cb)：先沿 a 所在行走，再沿 b 所在列走
  if (pass[ra * COLS + cb] && rowClear(pass, ra, ca, cb) && colClear(pass, cb, ra, rb)) return true;
  // 拐点 (rb, ca)：先沿 a 所在列走，再沿 b 所在行走
  if (pass[rb * COLS + ca] && colClear(pass, ca, ra, rb) && rowClear(pass, rb, ca, cb)) return true;
  return false;
}

// 同一行 c1、c2 之间（不含两端）全部可经过
function rowClear(pass: ArrayLike<number>, r: number, c1: number, c2: number): boolean {
  if (c1 > c2) [c1, c2] = [c2, c1];
  const base = r * COLS;
  for (let c = c1 + 1; c < c2; c++) if (!pass[base + c]) return false;
  return true;
}

function colClear(pass: ArrayLike<number>, c: number, r1: number, r2: number): boolean {
  if (r1 > r2) [r1, r2] = [r2, r1];
  for (let r = r1 + 1; r < r2; r++) if (!pass[r * COLS + c]) return false;
  return true;
}

// 四张同牌的三种两两配对方式（下标）
const PAIRINGS: readonly (readonly [number, number, number, number])[] = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];

export class Game {
  board: Int8Array;
  pass: Uint8Array;
  pos: number[][];
  left: number;
  h1: number;
  h2: number;
  k1: number;
  k2: number;

  constructor(board: BoardLike) {
    this.board = Int8Array.from(board);
    this.pass = new Uint8Array(N);
    this.pos = Array.from({ length: KINDS }, () => [] as number[]);
    this.left = 0;
    this.h1 = 0;
    this.h2 = 0;
    this.k1 = 0;
    this.k2 = 0;
    for (let i = 0; i < N; i++) {
      const k = this.board[i];
      if (k === EMPTY) this.pass[i] = 1;
      else {
        this.pos[k].push(i);
        this.left++;
        this.h1 ^= Z1[i];
        this.h2 ^= Z2[i];
        this.k1 ^= ZK1[i * KINDS + k];
        this.k2 ^= ZK2[i * KINDS + k];
      }
    }
  }

  // 只看哪些格有牌：牌不会换格时（只翻牌）足够区分局面
  key(): number {
    return (this.h1 >>> 0) * 2097152 + (this.h2 >>> 11);
  }

  // 看每格放的是哪种牌：有移动时用这个
  kindKey(): number {
    return (this.k1 >>> 0) * 2097152 + (this.k2 >>> 11);
  }

  canFlip(a: number, b: number): boolean {
    return connect(a, b, this.pass);
  }

  // 翻牌：返回撤回所需的记录
  flip(a: number, b: number): FlipRecord {
    const k = this.board[a];
    this.board[a] = this.board[b] = EMPTY;
    this.pass[a] = this.pass[b] = 1;
    this.pos[k] = this.pos[k].filter((p) => p !== a && p !== b);
    this.left -= 2;
    this.h1 ^= Z1[a] ^ Z1[b];
    this.h2 ^= Z2[a] ^ Z2[b];
    this.k1 ^= ZK1[a * KINDS + k] ^ ZK1[b * KINDS + k];
    this.k2 ^= ZK2[a * KINDS + k] ^ ZK2[b * KINDS + k];
    return [a, b, k];
  }

  undo([a, b, k]: FlipRecord): void {
    this.board[a] = this.board[b] = k;
    this.pass[a] = this.pass[b] = 0;
    this.pos[k].push(a, b);
    this.left += 2;
    this.h1 ^= Z1[a] ^ Z1[b];
    this.h2 ^= Z2[a] ^ Z2[b];
    this.k1 ^= ZK1[a * KINDS + k] ^ ZK1[b * KINDS + k];
    this.k2 ^= ZK2[a * KINDS + k] ^ ZK2[b * KINDS + k];
  }

  // 把牌串整串沿 dir 挪 dist 格。head 是牌串最前面那张牌的格，len 是串长。
  // 只管挪，不检查合法性、不翻牌；合法性见 move.ts。
  shift(head: number, dir: number, len: number, dist: number): void {
    const s = STEP[dir], d = s * dist;
    for (let i = 0, c = head; i < len; i++, c -= s) this.relocate(c, c + d); // 从前往后挪，目标格总是空的
  }

  unshift(head: number, dir: number, len: number, dist: number): void {
    const s = STEP[dir], d = s * dist;
    for (let i = len - 1, c = head - s * i; i >= 0; i--, c += s) this.relocate(c + d, c); // 从后往前挪回
  }

  relocate(from: number, to: number): void {
    const k = this.board[from];
    this.board[to] = k;
    this.board[from] = EMPTY;
    this.pass[to] = 0;
    this.pass[from] = 1;
    const p = this.pos[k];
    p[p.indexOf(from)] = to;
    this.h1 ^= Z1[from] ^ Z1[to];
    this.h2 ^= Z2[from] ^ Z2[to];
    this.k1 ^= ZK1[from * KINDS + k] ^ ZK1[to * KINDS + k];
    this.k2 ^= ZK2[from * KINDS + k] ^ ZK2[to * KINDS + k];
  }

  // 当前所有能翻的同牌对，扁平数组 [a0, b0, a1, b1, ...]
  moves(): number[] {
    const out: number[] = [];
    for (let k = 0; k < KINDS; k++) {
      const p = this.pos[k];
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) if (connect(p[i], p[j], this.pass)) out.push(p[i], p[j]);
    }
    return out;
  }

  moveCount(): number {
    let n = 0;
    for (let k = 0; k < KINDS; k++) {
      const p = this.pos[k];
      for (let i = 0; i < p.length; i++)
        for (let j = i + 1; j < p.length; j++) if (connect(p[i], p[j], this.pass)) n++;
    }
    return n;
  }

  // "安全翻牌"：做了绝不会让局面变差（翻牌只会增加空位，能连的永远能连）。
  // 1) 只剩两张且能连上；2) 四张都在且某种配对两对都能连上（先返回其中一对）。
  safeMove(): [number, number] | null {
    for (let k = 0; k < KINDS; k++) {
      const p = this.pos[k];
      if (p.length === 2) {
        if (connect(p[0], p[1], this.pass)) return [p[0], p[1]];
      } else if (p.length === 4) {
        for (const [i, j, x, y] of PAIRINGS)
          if (connect(p[i], p[j], this.pass) && connect(p[x], p[y], this.pass)) return [p[i], p[j]];
      }
    }
    return null;
  }

  // 乐观推算：假设被挡住的牌都能先翻掉，求出"有可能被翻掉"的牌。
  // 若有牌在这种最乐观的假设下也永远连不上，则局面一定无解。
  hasPermanentBlock(): boolean {
    const pass = this.pass.slice();
    let changed = true;
    while (changed) {
      changed = false;
      for (let k = 0; k < KINDS; k++) {
        const p = this.pos[k];
        for (let i = 0; i < p.length; i++)
          for (let j = i + 1; j < p.length; j++) {
            if (pass[p[i]] && pass[p[j]]) continue;
            if (connect(p[i], p[j], pass)) {
              pass[p[i]] = pass[p[j]] = 1;
              changed = true;
            }
          }
      }
    }
    for (let i = 0; i < N; i++) if (!pass[i]) return true;
    return false;
  }
}

// 初始牌阵里上下左右相邻的同牌对数（衡量牌阵"看起来"的样子）
export function adjacentPairs(board: BoardLike): number {
  let n = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      if (c + 1 < COLS && board[i] === board[i + 1]) n++;
      if (r + 1 < ROWS && board[i] === board[i + COLS]) n++;
    }
  return n;
}
