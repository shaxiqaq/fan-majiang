// 存档（spec.md 第 10 节）：当前这一局和上次选的难度，存在本机浏览器的 localStorage 里。
// 只存开局牌阵和动作，读出来时从开局重放；有一步不合规则、版本号不对或数据坏了，就整局丢掉。
import { N } from '../core/core';
import type { Step } from '../core/solver';
import { DEFAULT_DIFF, validDiff } from './difficulty';
import { game, indexSolution, replay, setSaver, type Action, type Hint } from './state';

const GAME_KEY = 'fan-majiang/game';
const PREFS_KEY = 'fan-majiang/prefs';
const VERSION = 1;

type SavedGame = {
  v: number;
  diff: number;
  start: number[];
  red: number[]; // 三张赤五在开局牌阵里的格
  solution: Step[];
  actions: Action[];
  steps: number;
  laiziUsed: number;
  hintsUsed: number;
  elapsedMs: number;
  started: boolean;
  hint: Hint | null;
};
type Prefs = { lastDiff: number; seenRules: boolean };

function read(key: string): unknown {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // 存不进去（无痕模式、空间满）就算了
  }
}

export function loadPrefs(): Prefs {
  const p = read(PREFS_KEY) as Partial<Prefs> | null;
  return { lastDiff: validDiff(p?.lastDiff) ? p!.lastDiff : DEFAULT_DIFF, seenRules: !!p?.seenRules };
}
export const savePrefs = (p: Prefs) => write(PREFS_KEY, p);

export function saveGame() {
  const red: number[] = [];
  for (let i = 0; i < N; i++) if (game.startRed[i]) red.push(i);
  const now = performance.now();
  const data: SavedGame = {
    v: VERSION,
    diff: game.diff,
    start: Array.from(game.start),
    red,
    solution: game.solution,
    actions: game.history.map((h) => h.act),
    steps: game.steps,
    laiziUsed: game.laiziUsed,
    hintsUsed: game.hintsUsed,
    elapsedMs: game.elapsedMs + (game.segStart === null ? 0 : now - game.segStart),
    started: game.started,
    hint: game.hint,
  };
  write(GAME_KEY, data);
  const p = loadPrefs();
  if (p.lastDiff !== game.diff) savePrefs({ ...p, lastDiff: game.diff });
}

const isInt = (x: unknown): x is number => Number.isInteger(x);

// 'none'：没有存档；'bad'：有存档但读不出来（已经丢掉）；'ok'：恢复好了
export function loadGame(): 'none' | 'ok' | 'bad' {
  const d = read(GAME_KEY) as SavedGame | null;
  if (d === null) {
    try { if (localStorage.getItem(GAME_KEY) === null) return 'none'; } catch { return 'none'; }
  }
  try {
    if (!d || d.v !== VERSION || !validDiff(d.diff) || !Array.isArray(d.start) || d.start.length !== N) throw 0;
    if (!d.start.every((k) => isInt(k) && k >= -1 && k < 34) || !Array.isArray(d.red) || !d.red.every((i) => isInt(i) && i >= 0 && i < N)) throw 0;
    if (!Array.isArray(d.solution) || !Array.isArray(d.actions)) throw 0;
    if (![d.steps, d.laiziUsed, d.hintsUsed].every((x) => isInt(x) && x >= 0) || typeof d.elapsedMs !== 'number') throw 0;
    game.diff = d.diff;
    game.start = Int8Array.from(d.start);
    game.startRed = new Uint8Array(N);
    for (const i of d.red) game.startRed[i] = 1;
    game.solution = d.solution;
    indexSolution();
    if (!replay(d.actions)) throw 0;
    Object.assign(game, {
      steps: d.steps, laiziUsed: d.laiziUsed, hintsUsed: d.hintsUsed,
      elapsedMs: d.elapsedMs, started: !!d.started, segStart: null,
      hint: d.hint ?? null, thinking: false, pending: null, version: game.version + 1,
    });
    return 'ok';
  } catch {
    try { localStorage.removeItem(GAME_KEY); } catch {}
    return 'bad';
  }
}

// 每次操作完马上存；用时在页面隐藏、关闭时存，平时每隔几秒存一次
export function startAutosave() {
  setSaver(saveGame);
  setInterval(() => game.started && !game.won && saveGame(), 5000);
  addEventListener('pagehide', saveGame);
}
