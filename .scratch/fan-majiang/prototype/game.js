// 原型用的对局状态（用完即扔）。规则、发牌、求解器直接复用 ../sim/。
// 提示、赖子、撤回、步数的行为照「定发牌与死局策略」「定移动机制」实现；原型只决定它们长什么样。
//
// 撤回栈里每一项都存着做这一步之前的整副棋盘和赤五标记（按格记，牌串移动时赤五跟着走），
// 撤回就是整个换回去；"往回找有解的局面"也直接拿这些快照去求解。
import { ROWS, N, COLS, EMPTY, UP, DOWN, LEFT, RIGHT, STEP, DIR_NAMES, Game, rng, randInt, shuffle } from '../sim/core.mjs';
import { genForward, genSwap } from '../sim/generate.mjs';
import { listMoves, collectMoves, hasMove, doMove } from '../sim/move.mjs';

export const RED_KINDS = [4, 13, 22]; // 五万、五筒、五索
export const HAKU = 31;
export { UP, DOWN, LEFT, RIGHT, STEP };

export const settings = { orient: 'auto', budget: 100000, render: 'svg', hakuFrame: false, hintFlipFirst: true }; // 提示优先给翻牌：「移动的界面原型」定的默认
export const ui = { board: null, variant: 'A', moves: true }; // moves：当前方案会不会移动

export const game = {
  seed: 0, diff: 0.5, spread: 0.5, swaps: 0, genMs: 0, genTries: 1,
  // solution：开局时存下的一条解，每一步是 { type: 'flip', a, b } 或求解器格式的移动。
  // 正推法发的牌（swaps = 0）只有翻牌，solKeys 是这些对；互换法发的牌存求解器找到的解，solBoards[i] 是走完前 i 步的棋盘。
  board: null, red: null, solution: [], solKeys: new Set(), solBoards: [],
  history: [], steps: 0, laiziUsed: 0, hintsUsed: 0,
  startedAt: 0, wonAt: null,
  hint: null, thinking: false, version: 0,
  left: N, moveCount: 0, slideCount: 0, deadlock: false, won: false,
  pending: null, // 牌串已经挪过去、还没翻牌（等玩家选配法）时的 { m, board, red }
  solveLog: [],
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit() {
  refresh();
  applyOrient();
  document.body.classList.toggle('haku-frame', settings.hakuFrame);
  listeners.forEach((fn) => fn());
}

export function orient() {
  if (settings.orient !== 'auto') return settings.orient;
  return innerWidth < innerHeight ? 'portrait' : 'landscape';
}
export function applyOrient() {
  const p = orient() === 'portrait';
  document.body.classList.toggle('portrait', p);
  document.body.classList.toggle('landscape', !p);
}

function refresh() {
  if (!game.board || game.pending) return;
  const g = new Game(game.board);
  game.left = g.left;
  game.moveCount = g.left ? g.moveCount() : 0;
  game.slideCount = g.left ? collectMoves(game.board, [], 2).length / 7 : 0;
  game.won = g.left === 0;
  game.deadlock = g.left > 0 && game.moveCount === 0 && (!ui.moves || game.slideCount === 0);
  if (game.won && !game.wonAt) game.wonAt = Date.now();
  if (!game.won) game.wonAt = null;
}

const pairKey = (a, b) => (a < b ? a * 1000 + b : b * 1000 + a);

// 难度 d（0~2）分两段：0~1 是正推法的 spread；1~2 是 spread = 1 再互换 0~68 对牌
export function dealOf(d) {
  return d <= 1 ? { spread: d, swaps: 0 } : { spread: 1, swaps: Math.round((d - 1) * 68) };
}
export const diffLabel = (d) => {
  const { spread, swaps } = dealOf(d);
  return swaps ? `spread 1 + 互换 ${swaps} 对` : `spread ${spread.toFixed(2)}`;
};

export function newGame({ diff = game.diff, seed = (Math.random() * 2 ** 31) | 0 } = {}) {
  const { spread, swaps } = dealOf(diff);
  const t0 = performance.now();
  let board, solution, genTries = 1;
  if (swaps) ({ board, solution, tries: genTries } = genSwap(rng(seed), { spread, swaps }));
  else ({ board, solution } = genForward(rng(seed), { spread }));
  const genMs = performance.now() - t0;
  if (!swaps) solution = solution.map(([a, b]) => ({ type: 'flip', a, b }));
  // 每种五里随机挑一张做赤五
  const rand = rng(seed ^ 0x5bd1e995);
  const red = new Uint8Array(N);
  for (const k of RED_KINDS) {
    const cells = [];
    for (let i = 0; i < N; i++) if (board[i] === k) cells.push(i);
    red[cells[randInt(rand, cells.length)]] = 1;
  }
  Object.assign(game, {
    seed, diff, spread, swaps, genMs, genTries, board: Int8Array.from(board), red, solution,
    solKeys: swaps ? new Set() : new Set(solution.map(({ a, b }) => pairKey(a, b))),
    solBoards: swaps ? solBoards(board, solution) : [],
    history: [], steps: 0, laiziUsed: 0, hintsUsed: 0,
    startedAt: Date.now(), wonAt: null, hint: null, thinking: false, pending: null,
  });
  game.version++;
  emit();
}

export const isEmpty = (i) => game.board[i] === EMPTY;
export const sameKind = (a, b) => a !== b && game.board[a] >= 0 && game.board[a] === game.board[b];

function passOf(board) {
  const pass = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (board[i] === EMPTY) pass[i] = 1;
  return pass;
}
function rowClear(pass, r, c1, c2) {
  if (c1 > c2) [c1, c2] = [c2, c1];
  for (let c = c1 + 1; c < c2; c++) if (!pass[r * COLS + c]) return false;
  return true;
}
function colClear(pass, c, r1, r2) {
  if (r1 > r2) [r1, r2] = [r2, r1];
  for (let r = r1 + 1; r < r2; r++) if (!pass[r * COLS + c]) return false;
  return true;
}
// 和 core.mjs 的 connect 判定相同，但返回途经的折点，供画线用：[a, b] 或 [a, 拐点, b]
export function pathOf(a, b) {
  if (!sameKind(a, b)) return null;
  const pass = passOf(game.board);
  const ra = (a / COLS) | 0, ca = a % COLS, rb = (b / COLS) | 0, cb = b % COLS;
  if (ra === rb) return rowClear(pass, ra, ca, cb) ? [a, b] : null;
  if (ca === cb) return colClear(pass, ca, ra, rb) ? [a, b] : null;
  const k1 = ra * COLS + cb;
  if (pass[k1] && rowClear(pass, ra, ca, cb) && colClear(pass, cb, ra, rb)) return [a, k1, b];
  const k2 = rb * COLS + ca;
  if (pass[k2] && colClear(pass, ca, ra, rb) && rowClear(pass, rb, ca, cb)) return [a, k2, b];
  return null;
}

// ---- 翻牌、移动、撤回 ----
const snap = () => ({ board: Int8Array.from(game.board), red: Uint8Array.from(game.red) });

function flipRaw(a, b, laizi) {
  const k = game.board[a];
  game.history.push({ type: 'flip', a, b, k, laizi, ...snap() });
  game.board[a] = game.board[b] = EMPTY;
  game.steps++;
  if (laizi) game.laiziUsed++;
}
function changed() {
  game.hint = null;
  game.version++;
  emit();
}

export function flip(a, b, { laizi = false } = {}) {
  flipRaw(a, b, laizi);
  changed();
}

// 格 i 往 dir 走一格到哪（出界为 -1）
export function nextCell(i, dir) {
  const r = (i / COLS) | 0, c = i % COLS;
  if (dir === UP) return r > 0 ? i - COLS : -1;
  if (dir === DOWN) return r < ROWS - 1 ? i + COLS : -1;
  if (dir === LEFT) return c > 0 ? i - 1 : -1;
  return c < COLS - 1 ? i + 1 : -1;
}

// 格 i 上的牌朝 dir 走时所在的牌串：{ dirIndex, head, len, cells（从串头往后）, gap（前方连续空位数）}
export function runAt(i, dir, board = game.board) {
  if (board[i] === EMPTY) return null;
  let head = i, n;
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

// 当前局面所有能配上的移动，按「方向:串头:格数」查配法
let moveIdx = { v: -1, map: null };
function moveMap() {
  if (moveIdx.v !== game.version) {
    const map = new Map();
    for (const m of listMoves(game.board)) map.set(`${m.dirIndex}:${m.head}:${m.dist}`, m);
    moveIdx = { v: game.version, map };
  }
  return moveIdx.map;
}
export const pairsFor = (dir, head, dist) => moveMap().get(`${dir}:${head}:${dist}`)?.pairs ?? [];
// 牌串朝 run.dirIndex 走几格能配上
export function matchDists(run) {
  const out = [];
  if (run) for (let d = 1; d <= run.gap; d++) if (pairsFor(run.dirIndex, run.head, d).length) out.push(d);
  return out;
}
export const destCells = (m) => m.cells.map((c) => c + STEP[m.dirIndex] * m.dist);

function shiftRaw(m) {
  const s = STEP[m.dirIndex], d = s * m.dist;
  for (let j = 0; j < m.len; j++) {
    const c = m.head - s * j;
    game.board[c + d] = game.board[c];
    game.red[c + d] = game.red[c];
    game.board[c] = EMPTY;
    game.red[c] = 0;
  }
}

// 第一步：牌串挪过去（还没翻牌）。m = { dirIndex, head, len, cells, dist }
export function beginMove(m) {
  game.pending = { m, ...snap() };
  shiftRaw(m);
  game.version++;
  emit();
}
// 第二步：翻掉选定的一对 pair = { from, to, partner }，整次移动记成撤回栈里的一项
export function commitMove(pair) {
  const { m, board, red } = game.pending;
  const k = game.board[pair.to];
  game.history.push({ type: 'move', a: pair.to, b: pair.partner, k, laizi: false, board, red, move: m, pair });
  game.board[pair.to] = game.board[pair.partner] = EMPTY;
  game.steps++;
  game.pending = null;
  changed();
}
// 玩家没选配法：作废，牌串回到原处
export function cancelMove() {
  const p = game.pending;
  if (!p) return null;
  game.board = p.board;
  game.red = p.red;
  game.pending = null;
  game.version++;
  emit();
  return p.m;
}

function popOne() {
  const h = game.history.pop();
  if (!h) return null;
  game.board = h.board;
  game.red = h.red;
  if (h.laizi) game.laiziUsed--;
  return h;
}
// 返回撤回的那一项（移动的话界面拿它画牌串退回去）
export function undo() {
  const h = popOne();
  if (!h) return null;
  changed();
  return h;
}
export function undoTimes(n) {
  for (let i = 0; i < n; i++) popOne();
  changed();
}

export const elapsed = () => (game.wonAt ?? Date.now()) - game.startedAt;
export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// 还在存下的解上 → 一定有解，提示超时时可以沿着它给下一步。
// 正推法：没移动过、翻掉的每一对都恰好是生成解里的一对（按牌位算，顺序随意）。
// 互换法：解里有移动，翻牌顺序一变、牌串的长短和位置就跟着变，所以只认"棋盘和解走完同样步数时一模一样"。
function solBoards(board, solution) {
  const g = new Game(board);
  const out = [Int8Array.from(g.board)];
  for (const s of solution) {
    if (s.type === 'flip') g.flip(s.a, s.b);
    else doMove(g, DIR_NAMES.indexOf(s.dir), s.head, s.len, s.dist, s.to, s.partner);
    out.push(Int8Array.from(g.board));
  }
  return out;
}
const sameBoard = (x, y) => x.every((k, i) => k === y[i]);
export function onPath(hist = game.history) {
  if (!game.swaps) return hist.every((h) => h.type === 'flip' && game.solKeys.has(pairKey(h.a, h.b)));
  const b = hist === game.history ? game.board : hist.length < game.history.length ? game.history[hist.length].board : game.board;
  return hist.length < game.solBoards.length && sameBoard(b, game.solBoards[hist.length]);
}
function nextOnPath() {
  if (game.swaps) return game.solution[game.history.length] ?? null;
  return game.solution.find((s) => game.board[s.a] !== EMPTY) ?? null;
}

// ---- 求解器（后台线程） ----
let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const done = pending.get(e.data.id);
      pending.delete(e.data.id);
      done?.(e.data);
    };
  }
  return worker;
}
export function solveAsync(board, purpose, { moves = ui.moves } = {}) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, (r) => {
      game.solveLog.unshift({ purpose, result: r.result, ms: r.ms, nodes: r.nodes, left: r.left, first: r.first });
      game.solveLog.length = Math.min(game.solveLog.length, 10);
      resolve(r);
    });
    getWorker().postMessage({ cmd: 'solve', id, board: Int8Array.from(board), budget: settings.budget, moves, flipFirst: settings.hintFlipFirst });
  });
}

// 从当前局面往回找最近一个确认有解的局面，返回要撤回几步
async function findBack(moves) {
  const H = game.history.length;
  for (let j = 1; j <= H; j++) {
    const L = H - j;
    if (L === 0 || onPath(game.history.slice(0, L))) return j;
    if ((await solveAsync(game.history[L].board, '往回找', { moves })).result === 'solvable') return j;
  }
  return H;
}

// 求解器给的一步 → 提示
function moveHint(s) {
  const dirIndex = DIR_NAMES.indexOf(s.dir);
  const cells = [];
  for (let j = 0; j < s.len; j++) cells.push(s.head - STEP[dirIndex] * j);
  return { type: 'move', m: { dirIndex, head: s.head, len: s.len, cells, dist: s.dist }, pair: { from: s.from, to: s.to, partner: s.partner } };
}
function stepToHint(s, source) {
  if (Array.isArray(s)) return { type: 'pair', a: s[0], b: s[1], source };
  if (s.type === 'flip') return { type: 'pair', a: s.a, b: s.b, source };
  return { ...moveHint(s), source };
}

// 不会移动的方案（A–D）提示照旧只给翻牌
export async function requestHint({ moves = ui.moves } = {}) {
  if (game.thinking || game.won || game.pending) return;
  game.hintsUsed++;
  game.hint = null;
  game.thinking = true;
  const v = game.version;
  emit();
  const r = await solveAsync(game.board, '提示', { moves });
  let hint = null;
  if (r.result === 'solvable') hint = stepToHint(r.first, '求解器');
  else if (r.result === 'unsolvable') hint = { type: 'unsolvable', back: await findBack(moves) };
  else if (onPath()) hint = stepToHint(nextOnPath(), '存下的解兜底');
  else {
    const ms = new Game(game.board).moves();
    if (ms.length) {
      const j = randInt(Math.random, ms.length / 2) * 2;
      hint = { type: 'pair', a: ms[j], b: ms[j + 1], source: '随便一对（兜底）' };
    } else if (moves) {
      const mv = listMoves(game.board, { single: false });
      if (mv.length) {
        const m = mv[randInt(Math.random, mv.length)];
        hint = { type: 'move', m, pair: m.pairs[0], source: '随便一次移动（兜底）' };
      }
    }
  }
  game.thinking = false;
  if (game.version === v) game.hint = hint; // 想的时候玩家又翻了或撤了，结果作废
  emit();
}

// ---- 调试用 ----
// 随手型那样乱走（翻牌和移动各一半），走到真正的死局为止
// 不经过界面直接做完一次移动（调试用）
function moveRaw(dirIndex, head, len, dist, pair) {
  const cells = [];
  for (let j = 0; j < len; j++) cells.push(head - STEP[dirIndex] * j);
  const m = { dirIndex, head, len, cells, dist };
  const before = snap();
  shiftRaw(m);
  game.history.push({ type: 'move', a: pair.to, b: pair.partner, k: game.board[pair.to], laizi: false, ...before, move: m, pair });
  game.board[pair.to] = game.board[pair.partner] = EMPTY;
  game.steps++;
}
export function playToDeadlock() {
  for (let attempt = 0; attempt < 300; attempt++) {
    const g = new Game(game.board);
    const steps = [];
    for (;;) {
      const fl = g.moves();
      const mv = collectMoves(g.board, [], 2);
      if (!fl.length && !mv.length) break;
      if (mv.length && (!fl.length || Math.random() < 0.5)) {
        const i = randInt(Math.random, mv.length / 7) * 7;
        steps.push({ mv: mv.slice(i, i + 7) });
        doMove(g, mv[i], mv[i + 1], mv[i + 2], mv[i + 3], mv[i + 5], mv[i + 6]);
      } else {
        const j = randInt(Math.random, fl.length / 2) * 2;
        steps.push({ a: fl[j], b: fl[j + 1] });
        g.flip(fl[j], fl[j + 1]);
      }
    }
    if (g.left > 0) {
      for (const s of steps) {
        if (!s.mv) { flipRaw(s.a, s.b, false); continue; }
        const [dirIndex, head, len, dist, from, to, partner] = s.mv;
        moveRaw(dirIndex, head, len, dist, { from, to, partner });
      }
      changed();
      return steps.length;
    }
  }
  return -1;
}
export function fastForward({ leave = 0, pairs = Infinity } = {}) {
  if (!onPath()) return false;
  let left = game.board.reduce((n, k) => n + (k !== EMPTY), 0), done = 0;
  for (let s; left > leave && done < pairs && (s = nextOnPath()); left -= 2, done++) {
    if (s.type === 'flip') flipRaw(s.a, s.b, false);
    else moveRaw(DIR_NAMES.indexOf(s.dir), s.head, s.len, s.dist, { from: s.from, to: s.to, partner: s.partner });
  }
  changed();
  return true;
}
// 看提示长什么样：挑一次两张以上的牌串的移动，做完仍然有解的，直接当提示亮出来（不算已用提示）
// multi: 只挑有多种配法的（这时不管做完有没有解）
export async function demoMoveHint({ multi = false } = {}) {
  if (game.pending) return 'busy';
  const v = game.version;
  const mv = shuffle(listMoves(game.board, { single: false }).filter((m) => !multi || m.pairs.length > 1), Math.random);
  for (const m of mv.slice(0, multi ? 1 : 25)) {
    const pair = m.pairs[0];
    if (!multi) {
      const g = new Game(game.board);
      doMove(g, m.dirIndex, m.head, m.len, m.dist, pair.to, pair.partner);
      if ((await solveAsync(g.board, '演示')).result !== 'solvable') continue;
    }
    if (game.version !== v) return 'busy';
    game.hint = { type: 'move', m, pair, source: multi ? '演示（多种配法）' : '演示' };
    emit();
    return 'ok';
  }
  return 'none';
}

export function runBench({ perK, onProgress }) {
  return new Promise((resolve) => {
    const w = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      if (e.data.cmd === 'progress') onProgress(e.data);
      else {
        w.terminate();
        resolve(e.data);
      }
    };
    w.postMessage({ cmd: 'bench', spread: game.spread, swaps: game.swaps, budget: settings.budget, perK, ks: [0, 10, 25, 40], flipFirst: settings.hintFlipFirst });
  });
}
