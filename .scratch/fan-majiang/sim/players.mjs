// 两种模拟玩家，玩到翻完为止。
// 随手型：每步在所有能翻的同牌对里随便挑一对；赖子也随便挑一对同牌。
// 稳健型：先做安全翻牌（只剩两张且能连上的、四张能两两连上的），
//         否则挑"翻完后可翻对最多"的那一对；赖子挑用完后可翻对最多的同牌。
// moves: true 时两种玩家也会移动（见文件末尾的 playMoves）。
// 遇到死局的救法 onDead：
//   joker           用一次赖子
//   shuffle         把剩下的牌原地随机重洗
//   solvableShuffle 把剩下的牌原地重排成有解的样子（用正推法）
import { Game, KINDS, N, EMPTY, randInt, shuffle } from './core.mjs';
import { genForward } from './generate.mjs';
import { collectMoves, doMove, undoMove } from './move.mjs';

// onStep(g, flips)：每翻一对后回调，用来取中途局面
export function play(board, rand, style, onDead = 'joker', onStep = null, { moves = false } = {}) {
  if (moves) return playMoves(board, rand, style, onStep);
  let flips = 0;
  let g = new Game(board);
  let rescues = 0, firstDeadLeft = null;
  while (g.left > 0) {
    let m = style === 'steady' ? g.safeMove() : null;
    if (!m) {
      const ms = g.moves();
      if (ms.length === 0) {
        if (firstDeadLeft === null) firstDeadLeft = g.left;
        rescues++;
        if (onDead !== 'joker') {
          g = reshuffle(g, rand, onDead === 'solvableShuffle');
          continue;
        }
        m = style === 'steady' ? bestJoker(g, rand) : randomJoker(g, rand);
      } else if (style === 'steady') m = bestMove(g, ms, rand);
      else {
        const i = randInt(rand, ms.length / 2) * 2;
        m = [ms[i], ms[i + 1]];
      }
    }
    g.flip(m[0], m[1]);
    if (onStep) onStep(g, ++flips);
  }
  return { rescues, firstDeadLeft };
}

function reshuffle(g, rand, solvable) {
  const cells = [], kinds = [];
  for (let i = 0; i < N; i++) if (g.board[i] !== EMPTY) { cells.push(i); kinds.push(g.board[i]); }
  if (solvable) {
    const pairKinds = [];
    for (let k = 0; k < KINDS; k++) for (let t = 0; t < g.pos[k].length / 2; t++) pairKinds.push(k);
    return new Game(genForward(rand, { cells, pairKinds }).board);
  }
  shuffle(kinds, rand);
  const board = new Int8Array(N).fill(EMPTY);
  cells.forEach((c, i) => { board[c] = kinds[i]; });
  return new Game(board);
}

function bestMove(g, ms, rand) {
  let best = -1, pick = null, ties = 0;
  for (let i = 0; i < ms.length; i += 2) {
    const rec = g.flip(ms[i], ms[i + 1]);
    const score = g.moveCount();
    g.undo(rec);
    if (score > best) { best = score; pick = [ms[i], ms[i + 1]]; ties = 1; }
    else if (score === best && randInt(rand, ++ties) === 0) pick = [ms[i], ms[i + 1]];
  }
  return pick;
}

function allSamePairs(g) {
  const out = [];
  for (let k = 0; k < KINDS; k++) {
    const p = g.pos[k];
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) out.push(p[i], p[j]);
  }
  return out;
}

function bestJoker(g, rand) {
  return bestMove(g, allSamePairs(g), rand);
}

function randomJoker(g, rand) {
  const ps = allSamePairs(g);
  const i = randInt(rand, ps.length / 2) * 2;
  return [ps[i], ps[i + 1]];
}

// ---- 会移动的玩家（只用赖子救场）----
// 死局：既没有能直接翻的同牌，也没有能配上的移动（两张以上的牌串；单张的移动等于直接翻牌）。
// 随手型：能翻牌也能移动时，先随机挑一类（各一半），再在这一类里随便挑一个。
// 稳健型：先做安全翻牌；否则把每一对能翻的、每一次能配上的移动都试一下，挑"做完后能直接翻的对数"最多的，
//         最多的也是 0 对时，再比"做完后能配上的移动数"；还同分就翻牌优先。赖子同样这样挑。
// 返回值多了 movesUsed：这局一共移动了几次。
function playMoves(board, rand, style, onStep) {
  const g = new Game(board);
  let rescues = 0, firstDeadLeft = null, movesUsed = 0, steps = 0;
  while (g.left > 0) {
    const sm = style === 'steady' ? g.safeMove() : null;
    if (sm) g.flip(sm[0], sm[1]);
    else {
      const fl = g.moves();
      const mv = collectMoves(g.board, [], 2);
      if (!fl.length && !mv.length) {
        if (firstDeadLeft === null) firstDeadLeft = g.left;
        rescues++;
        if (style === 'steady') { const m = bestOf(g, allSamePairs(g), [], rand); g.flip(m.a, m.b); }
        else { const [a, b] = randomJoker(g, rand); g.flip(a, b); }
      } else {
        let act;
        if (style === 'steady') act = bestOf(g, fl, mv, rand);
        else if (mv.length && (!fl.length || rand() < 0.5)) act = { mv, i: randInt(rand, mv.length / 7) * 7 };
        else { const i = randInt(rand, fl.length / 2) * 2; act = { a: fl[i], b: fl[i + 1] }; }
        if (act.mv) { applyMove(g, act.mv, act.i); movesUsed++; }
        else g.flip(act.a, act.b);
      }
    }
    if (onStep) onStep(g, ++steps);
  }
  return { rescues, firstDeadLeft, movesUsed };
}

const applyMove = (g, m, i) => doMove(g, m[i], m[i + 1], m[i + 2], m[i + 3], m[i + 5], m[i + 6]);

// 在翻牌 fl（扁平 [a, b, ...]，也可以是赖子的同牌对）和移动 mv（collectMoves 的扁平格式）里挑最好的
function bestOf(g, fl, mv, rand) {
  const cands = [];
  for (let i = 0; i < fl.length; i += 2) {
    const rec = g.flip(fl[i], fl[i + 1]);
    cands.push({ score: g.moveCount(), a: fl[i], b: fl[i + 1] });
    g.undo(rec);
  }
  for (let i = 0; i < mv.length; i += 7) {
    const rec = applyMove(g, mv, i);
    cands.push({ score: g.moveCount(), mv, i });
    undoMove(g, rec);
  }
  let best = Math.max(...cands.map((c) => c.score));
  let pool = cands.filter((c) => c.score === best);
  if (best === 0 && pool.length > 1) {
    for (const c of pool) {
      if (c.mv) { const rec = applyMove(g, c.mv, c.i); c.next = collectMoves(g.board, [], 2).length; undoMove(g, rec); }
      else { const rec = g.flip(c.a, c.b); c.next = collectMoves(g.board, [], 2).length; g.undo(rec); }
    }
    best = Math.max(...pool.map((c) => c.next));
    pool = pool.filter((c) => c.next === best);
  }
  if (pool.some((c) => !c.mv)) pool = pool.filter((c) => !c.mv);
  return pool[randInt(rand, pool.length)];
}
