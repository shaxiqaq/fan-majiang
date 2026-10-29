// 对局状态（spec.md 第 3、5、8、9 节）。不碰 DOM：界面 subscribe 以后，每次状态变了就重画。
//
// 撤回历史里每一项记着做这一步的动作，以及做之前的整副棋盘和赤五标记（按格记，牌串移动时赤五跟着走）。
// 撤回就是整个换回去；"往回找有解的局面"也直接拿这些快照去求解。存档只存动作，读出来时从开局重放一遍。
import { N, EMPTY, STEP, DIR_NAMES, Game } from '../core/core';
import { listMoves, hasMove, doMove } from '../core/move';
import type { Step } from '../core/solver';
import { cellsOf, type Move, type Pair } from './rules';
import { dealAsync, solveAsync } from './worker-client';

export const BUDGET = 100000; // 提示用的求解节点预算（spec.md 第 9.1 节）

export type Hint =
  | { type: 'pair'; a: number; b: number; safe: boolean } // safe：做完一定仍然有解
  | { type: 'move'; m: Move; pair: Pair; safe: boolean }
  | { type: 'unsolvable'; back: number }; // 往回 back 步是有解的局面

export type Action =
  | { t: 'f'; a: number; b: number; laizi: boolean }
  | { t: 'm'; dir: number; head: number; len: number; dist: number; from: number; to: number; partner: number };
type HistItem = { act: Action; board: Int8Array; red: Uint8Array };

export const game = {
  diff: 1,
  start: new Int8Array(N) as Int8Array, // 开局牌阵
  startRed: new Uint8Array(N) as Uint8Array,
  solution: [] as Step[], // 存下的解
  board: new Int8Array(N).fill(EMPTY) as Int8Array,
  red: new Uint8Array(N) as Uint8Array,
  history: [] as HistItem[],
  steps: 0,
  laiziUsed: 0,
  hintsUsed: 0,
  // 用时：只算第一次操作以后、页面在前台、还没胜利的时间（spec.md 第 8 节）
  elapsedMs: 0,
  started: false,
  segStart: null as number | null,
  hint: null as Hint | null,
  thinking: false,
  dealing: false,
  version: 0,
  // 由棋盘算出来的
  left: N,
  deadlock: false,
  won: false,
  pending: null as { m: Move; board: Int8Array; red: Uint8Array } | null, // 牌串已经挪过去、等玩家选配法
};

// ---- 订阅 ----
const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
let onSave: () => void = () => {};
export const setSaver = (fn: () => void) => (onSave = fn);

function refresh() {
  if (game.pending) return;
  const g = new Game(game.board);
  game.left = g.left;
  game.won = g.left === 0;
  game.deadlock = g.left > 0 && g.moveCount() === 0 && !hasMove(game.board, 2);
  syncClock();
}
export function emit() {
  refresh();
  listeners.forEach((fn) => fn());
}
// 做完一次操作：清掉提示，存档，重画
function changed() {
  game.hint = null;
  game.version++;
  emit();
  onSave();
}

// ---- 用时 ----
export function syncClock() {
  const run = game.started && !game.won && document.visibilityState === 'visible';
  const now = performance.now();
  if (run && game.segStart === null) game.segStart = now;
  else if (!run && game.segStart !== null) {
    game.elapsedMs += now - game.segStart;
    game.segStart = null;
  }
}
export const elapsed = () => game.elapsedMs + (game.segStart === null ? 0 : performance.now() - game.segStart);
// 第一次操作（点牌、拖牌串、按提示或赖子）时开始计时
export function touch() {
  if (game.started) return;
  game.started = true;
  syncClock();
}
export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ---- 发牌 ----
const pairKey = (a: number, b: number) => (a < b ? a * 1000 + b : b * 1000 + a);
let solKeys = new Set<number>(); // 正推法：生成解里的各对
let solBoards: Int8Array[] = []; // 互换法：解走完前 i 步的棋盘
const isSwap = () => game.diff > 1;

export function indexSolution() {
  solKeys = new Set();
  solBoards = [];
  if (!isSwap()) {
    for (const s of game.solution) if (s.type === 'flip') solKeys.add(pairKey(s.a, s.b));
    return;
  }
  const g = new Game(game.start);
  solBoards.push(Int8Array.from(g.board));
  for (const s of game.solution) {
    if (s.type === 'flip') g.flip(s.a, s.b);
    else doMove(g, DIR_NAMES.indexOf(s.dir), s.head, s.len, s.dist, s.to, s.partner);
    solBoards.push(Int8Array.from(g.board));
  }
}

export function loadDeal(diff: number, board: Int8Array, red: Uint8Array, solution: Step[]) {
  Object.assign(game, {
    diff, start: Int8Array.from(board), startRed: Uint8Array.from(red), solution,
    board: Int8Array.from(board), red: Uint8Array.from(red),
    history: [], steps: 0, laiziUsed: 0, hintsUsed: 0,
    elapsedMs: 0, started: false, segStart: null, hint: null, thinking: false, pending: null,
  });
  hintToken++;
  indexSolution();
}

export async function newGame(diff: number) {
  game.dealing = true;
  hintToken++;
  game.thinking = false;
  emit();
  const r = await dealAsync(diff, (Math.random() * 2 ** 31) | 0);
  game.dealing = false;
  loadDeal(diff, r.board, r.red, r.solution);
  changed();
}

// ---- 翻牌、移动、撤回 ----
const snap = () => ({ board: Int8Array.from(game.board), red: Uint8Array.from(game.red) });

function flipRaw(a: number, b: number, laizi: boolean) {
  game.history.push({ act: { t: 'f', a, b, laizi }, ...snap() });
  game.board[a] = game.board[b] = EMPTY;
  game.steps++;
  if (laizi) game.laiziUsed++;
}
export function flip(a: number, b: number, { laizi = false } = {}) {
  flipRaw(a, b, laizi);
  changed();
}

function shiftRaw(m: Move) {
  const s = STEP[m.dirIndex], d = s * m.dist;
  for (let j = 0; j < m.len; j++) {
    const c = m.head - s * j;
    game.board[c + d] = game.board[c];
    game.red[c + d] = game.red[c];
    game.board[c] = EMPTY;
    game.red[c] = 0;
  }
}
// 移动第一步：牌串挪过去（还没翻牌）
export function beginMove(m: Move) {
  game.pending = { m, ...snap() };
  shiftRaw(m);
  game.hint = null;
  game.version++;
  listeners.forEach((fn) => fn());
}
// 第二步：翻掉选定的一对，整次移动记成撤回历史里的一项
export function commitMove(pair: Pair) {
  const p = game.pending!;
  const { m } = p;
  game.history.push({ act: { t: 'm', dir: m.dirIndex, head: m.head, len: m.len, dist: m.dist, ...pair }, board: p.board, red: p.red });
  game.board[pair.to] = game.board[pair.partner] = EMPTY;
  game.steps++;
  game.pending = null;
  changed();
}
// 玩家没选配法：作废，牌串回到原处。不算步数，也不进撤回历史
export function cancelMove(): Move | null {
  const p = game.pending;
  if (!p) return null;
  game.board = p.board;
  game.red = p.red;
  game.pending = null;
  game.version++;
  emit();
  return p.m;
}

function popOne(): HistItem | null {
  const h = game.history.pop();
  if (!h) return null;
  game.board = h.board;
  game.red = h.red;
  if (h.act.t === 'f' && h.act.laizi) game.laiziUsed--;
  return h;
}
// 返回撤回的那一项（移动的话界面拿它画牌串退回去）
export function undo(): HistItem | null {
  const h = popOne();
  if (h) changed();
  return h;
}
export function undoTimes(n: number) {
  for (let i = 0; i < n; i++) popOne();
  changed();
}
export const moveOf = (a: Extract<Action, { t: 'm' }>): Move => ({
  dirIndex: a.dir, head: a.head, len: a.len, dist: a.dist, cells: cellsOf(a.dir, a.head, a.len),
});

// ---- 存下的解（spec.md 第 9.2 节） ----
// 正推法：没移动过、翻掉的每一对都是解里的一对（顺序随意）。
// 互换法：棋盘和解走完同样步数时一模一样。
export function onPath(L = game.history.length): boolean {
  const hist = game.history.slice(0, L);
  if (!isSwap()) return hist.every((h) => h.act.t === 'f' && solKeys.has(pairKey(h.act.a, h.act.b)));
  const b = L < game.history.length ? game.history[L].board : game.board;
  return L < solBoards.length && solBoards[L].every((k, i) => k === b[i]);
}
function nextOnPath(): Step | null {
  if (isSwap()) return game.solution[game.history.length] ?? null;
  return game.solution.find((s) => s.type === 'flip' && game.board[s.a] !== EMPTY) ?? null;
}

// ---- 提示（spec.md 第 5.5 节） ----
let hintToken = 0;

function stepToHint(s: Step, safe: boolean): Hint {
  if (s.type === 'flip') return { type: 'pair', a: s.a, b: s.b, safe };
  const dirIndex = DIR_NAMES.indexOf(s.dir);
  return {
    type: 'move', safe,
    m: { dirIndex, head: s.head, len: s.len, cells: cellsOf(dirIndex, s.head, s.len), dist: s.dist },
    pair: { from: s.from, to: s.to, partner: s.partner },
  };
}

// 从当前局面往回找最近一个确认有解的局面，返回要撤回几步
async function findBack(): Promise<number> {
  const H = game.history.length;
  for (let j = 1; j <= H; j++) {
    const L = H - j;
    if (L === 0 || onPath(L)) return j;
    if ((await solveAsync(game.history[L].board, BUDGET)).result === 'solvable') return j;
  }
  return H;
}

function randomHint(): Hint | null {
  const ms = new Game(game.board).moves();
  if (ms.length) {
    const j = Math.floor(Math.random() * (ms.length / 2)) * 2;
    return { type: 'pair', a: ms[j], b: ms[j + 1], safe: false };
  }
  const mv = listMoves(game.board, { single: false });
  if (!mv.length) return null;
  const m = mv[Math.floor(Math.random() * mv.length)];
  return { type: 'move', m: { dirIndex: m.dirIndex, head: m.head, len: m.len, cells: m.cells, dist: m.dist }, pair: m.pairs[0], safe: false };
}

export async function requestHint() {
  if (game.thinking || game.won || game.pending || game.dealing) return; // 胜利后、正在想时按提示：忽略
  touch();
  game.hintsUsed++;
  game.hint = null;
  game.thinking = true;
  const token = ++hintToken, v = game.version;
  emit();
  onSave();
  const r = await solveAsync(game.board, BUDGET);
  let hint: Hint | null;
  if (r.result === 'solvable' && r.first) hint = stepToHint(r.first, true);
  else if (r.result === 'unsolvable') hint = { type: 'unsolvable', back: await findBack() };
  else {
    const s = onPath() ? nextOnPath() : null;
    hint = s ? stepToHint(s, true) : randomHint();
  }
  if (token !== hintToken) return; // 想的时候开了新局，或者作废了
  game.thinking = false;
  if (game.version === v) game.hint = hint; // 想的时候玩家又翻了或撤了：结果作废
  emit();
  onSave();
}
// 打开新局面板等场合：正在想的提示作废，已用提示不退回
export function abandonHint() {
  if (!game.thinking) return;
  hintToken++;
  game.thinking = false;
  emit();
}

// ---- 存档重放：从开局牌阵按动作重放，有一步不合规则就返回 false ----
export function replay(actions: Action[]): boolean {
  game.board = Int8Array.from(game.start);
  game.red = Uint8Array.from(game.startRed);
  game.history = [];
  for (const a of actions) {
    if (a.t === 'f') {
      const ok = game.board[a.a] >= 0 && a.a !== a.b && game.board[a.a] === game.board[a.b] && (a.laizi || new Game(game.board).canFlip(a.a, a.b));
      if (!ok) return false;
      game.history.push({ act: a, ...snap() });
      game.board[a.a] = game.board[a.b] = EMPTY;
    } else {
      const m = listMoves(game.board).find((x) => x.dirIndex === a.dir && x.head === a.head && x.dist === a.dist);
      if (!m || m.len !== a.len || !m.pairs.some((p) => p.from === a.from && p.to === a.to && p.partner === a.partner)) return false;
      const before = snap();
      shiftRaw(moveOf(a));
      game.history.push({ act: a, ...before });
      game.board[a.to] = game.board[a.partner] = EMPTY;
    }
  }
  return true;
}
