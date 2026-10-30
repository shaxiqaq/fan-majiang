// 移动规则的手工用例
// 棋盘用小图画：'.' 是空位，小写字母是牌种（a=0, b=1, ...），没画到的格都是填充牌 '#'（牌种 33，
// 和图里的牌都不同，不会被配上）。填充牌自己能做的移动和这里无关，所以每个用例只看指定的牌串。
import { describe, it, expect } from 'vitest';
import { COLS, N, EMPTY, Game, rng, randInt, DOWN, RIGHT, STEP, connect } from './core';
import { listMoves, collectMoves, doMove, undoMove, hasMove } from './move';
import { genForward } from './generate';

const FILL = 33;
const at = (r: number, c: number) => r * COLS + c;
function grid(lines: string[]): Int8Array {
  const board = new Int8Array(N).fill(FILL);
  lines.forEach((line, r) => [...line].forEach((ch, c) => {
    board[at(r, c)] = ch === '.' ? EMPTY : ch === '#' ? FILL : ch.charCodeAt(0) - 97;
  }));
  return board;
}
const show = (board: Int8Array, rows = 3, cols = 8) => {
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) { const k = board[at(r, c)]; s += k === EMPTY ? '.' : k === FILL ? '#' : String.fromCharCode(97 + k); }
    out.push(s);
  }
  return out.join('/');
};
// 指定牌串（串头的格、方向）的所有移动：{ dist: [[from, to, partner], ...] }
function movesOf(board: Int8Array, head: number, dir: string): Record<number, number[][]> {
  const out: Record<number, number[][]> = {};
  for (const m of listMoves(board)) if (m.head === head && m.dir === dir) out[m.dist] = m.pairs.map((p) => [p.from, p.to, p.partner]);
  return out;
}
const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

// 1. 整串走（「定移动机制」里的例子）：拖东往右 2 格，西、南跟着走；南落到下面那张南的正上方，配上。
describe('整串走', () => {
  const b = grid(['wse..z', '###s']);
  it('拖东往右 2 格能配上', () => {
    expect(movesOf(b, at(0, 2), 'right')[2]).toEqual([[at(0, 1), at(0, 3), at(1, 3)]]);
  });
  it('牌串是东、南、西三张', () => {
    const m = listMoves(b).find((x) => x.head === at(0, 2) && x.dir === 'right' && x.dist === 2);
    expect(m?.cells).toEqual([at(0, 2), at(0, 1), at(0, 0)]);
  });
  it('移完西、东到了新位置，南和下面的南翻掉；撤回整次还原', () => {
    const g = new Game(b);
    const rec = doMove(g, RIGHT, at(0, 2), 3, 2, at(0, 3), at(1, 3));
    expect(show(g.board, 2, 6)).toBe('..w.ez/###.##');
    undoMove(g, rec);
    expect([...g.board]).toEqual([...b]);
    expect(g.kindKey()).toBe(new Game(b).kindKey());
  });
});

// 2. 配不上就不算：同一串只走 1 格，谁都对不上，这次移动不存在
describe('配不上就不算', () => {
  it('走 1 格没有配法，不列出', () => {
    const b = grid(['wse..z', '###s']);
    expect(movesOf(b, at(0, 2), 'right')[1]).toBeUndefined();
  });
  it('整串怎么走都配不上', () => {
    const lone = grid(['ab...', '#####']);
    expect(Object.keys(movesOf(lone, at(0, 1), 'right')).length).toBe(0);
  });
});

// 3. 身后隔着空位的牌不跟着走：b、c 一起往右 2 格，c 落到下面那张 c 的正上方
describe('身后隔空位', () => {
  const b = grid(['a.cb..d', '####c']);
  it('牌串只有 b、c 两张', () => {
    const m = listMoves(b).find((x) => x.head === at(0, 3) && x.dir === 'right' && x.dist === 2);
    expect(m?.cells).toEqual([at(0, 3), at(0, 2)]);
  });
  it('a 留在原处', () => {
    const g = new Game(b);
    doMove(g, RIGHT, at(0, 3), 2, 2, at(0, 4), at(1, 4));
    expect(show(g.board, 2, 7)).toBe('a....bd/####.##');
  });
});

// 4. 可以停在中间某格：前面有 4 个空位，只有走 3 格时被带着走的 b 落到下面那张 b 的正上方
it('停在中间：只有走 3 格能配上', () => {
  const b = grid(['ba....c', '###b']);
  const ms = movesOf(b, at(0, 1), 'right');
  expect(Object.keys(ms)).toEqual(['3']);
  expect(ms[3]).toEqual([[at(0, 0), at(0, 3), at(1, 3)]]);
});

// 5. 牌串里两张挨着的同牌不算配上
describe('串里的同牌', () => {
  it('两张 a 一起走，怎么走都不算配上', () => {
    const b = grid(['aa....', '######']);
    expect(Object.keys(movesOf(b, at(0, 1), 'right')).length).toBe(0);
  });
  // 串里有两张 a，外面还有第三张：只能和外面那张配。串头那张走 3 格也能对上，但它本来就能拐一次弯连上，不算
  it('只和没动的那张配上', () => {
    const b2 = grid(['aa....', '####a']);
    expect(movesOf(b2, at(0, 1), 'right')).toEqual({ 4: [[at(0, 0), at(0, 4), at(1, 4)]] });
  });
});

// 6. 一张牌能配好几张：被带着走的 b 走 3 格后，上面、下面各有一张 b
describe('一张配多张', () => {
  const b = grid(['###b###', 'bx...', '###b###']);
  const ms = movesOf(b, at(1, 1), 'right');
  it('走 3 格有两种配法', () => {
    const partners = (ms[3] || []).map((p) => p[2]).sort((x, y) => x - y);
    expect(partners).toEqual([at(0, 3), at(2, 3)]);
  });
  it('别的格数配不上', () => {
    expect(Object.keys(ms)).toEqual(['3']);
  });
});

// 7. 竖着走：b、a 一起往下走 3 格，b 落到 (3,0)，右边隔一个空位是 b
describe('竖着走', () => {
  const b = grid(['b', 'a', '..', '..b', '.']);
  it('往下 3 格，b 隔空位和右边的 b 横着对上', () => {
    expect(movesOf(b, at(1, 0), 'down')[3]).toEqual([[at(0, 0), at(3, 0), at(3, 2)]]);
  });
  it('a 跟到 (4,0)，上面几格空出来', () => {
    const g = new Game(b);
    doMove(g, DOWN, at(1, 0), 2, 3, at(3, 0), at(3, 2));
    for (const r of [0, 1, 2, 3]) expect(g.board[at(r, 0)]).toBe(EMPTY);
    expect(g.board[at(4, 0)]).toBe(0);
  });
});

// 8. 本来就能直接翻的一对不算配上：串头前方挡路的同牌、串尾身后的同牌，中间全是空位，移动前就连得上
it('串头前方、串尾身后的同牌：本来就能连上，不算配上', () => {
  expect(Object.keys(movesOf(grid(['a.ab..#']), at(0, 3), 'right')).length).toBe(0);
  expect(Object.keys(movesOf(grid(['.ab..b#']), at(0, 2), 'right')).length).toBe(0);
});

// 9. 牌串让出来的格打通了两张没动的同牌：不算这次移动配上（移完可以照常翻）
it('让出的格打通别的牌：不算配上', () => {
  const b = grid(['c#', 'xy..', 'c#']);
  expect(Object.keys(movesOf(b, at(1, 1), 'right')).length).toBe(0);
});

// 10. 单张的牌串：挪过去能对上的同牌，移动前一定能拐一次弯连上，所以连默认也不列出
describe('单张牌串', () => {
  const b = grid(['.a..', '##a#']);
  it('默认也不列', () => {
    expect(movesOf(b, at(0, 1), 'right')[1]).toBeUndefined();
  });
  it('single: false 时不列', () => {
    expect(listMoves(b, { single: false }).some((m) => m.head === at(0, 1))).toBe(false);
  });
});

// 11. 同一格位置不同牌种，kindKey 要分得开
it('kindKey 区分牌种', () => {
  const g1 = new Game(grid(['ab.'])), g2 = new Game(grid(['ba.']));
  expect(g1.kindKey()).not.toBe(g2.kindKey());
  expect(g1.key()).toBe(g2.key());
});

// 12. 和暴力实现对照：在随机局面上真的把牌串挪过去，逐对检查不拐弯的连线，并去掉移动前就能连上的
function brute(board: Int8Array): Set<string> {
  const set = new Set<string>();
  const pass = board.map((k) => (k === EMPTY ? 1 : 0));
  for (let head = 0; head < N; head++) {
    if (board[head] === EMPTY) continue;
    for (let dir = 0; dir < 4; dir++) {
      const s = STEP[dir];
      const ok = (from: number, to: number) => to >= 0 && to < N && (dir < 2 || ((from / COLS) | 0) === ((to / COLS) | 0));
      if (!ok(head, head + s) || board[head + s] !== EMPTY) continue;
      const cells = [head];
      while (ok(cells.at(-1)!, cells.at(-1)! - s) && board[cells.at(-1)! - s] !== EMPTY) cells.push(cells.at(-1)! - s);
      for (let dist = 1; ok(head + s * (dist - 1), head + s * dist) && board[head + s * dist] === EMPTY; dist++) {
        const nb = Int8Array.from(board);
        for (const c of cells) nb[c] = EMPTY;
        const moved = new Set(cells.map((c) => c + s * dist));
        for (const c of cells) nb[c + s * dist] = board[c];
        for (const c of cells) {
          const to = c + s * dist;
          for (let u = 0; u < N; u++) if (!moved.has(u) && nb[u] === nb[to] && straight(nb, to, u) && !connect(c, u, pass)) set.add([dir, head, dist, c, u].join());
        }
      }
    }
  }
  return set;
}
function straight(b: Int8Array, x: number, y: number): boolean {
  const rx = (x / COLS) | 0, cx = x % COLS, ry = (y / COLS) | 0, cy = y % COLS;
  if (rx === ry) { for (let c = Math.min(cx, cy) + 1; c < Math.max(cx, cy); c++) if (b[rx * COLS + c] !== EMPTY) return false; return true; }
  if (cx === cy) { for (let r = Math.min(rx, ry) + 1; r < Math.max(rx, ry); r++) if (b[r * COLS + cx] !== EMPTY) return false; return true; }
  return false;
}
it('和暴力实现对照、单张牌串配不上、执行再撤回还原', () => {
  let bad = 0, total = 0, positions = 0, singles = 0, singleBad = 0, undoBad = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rand = rng(seed);
    const g = new Game(genForward(rand, { spread: 1 }).board);
    // 随便翻、随便移，沿途取局面
    for (let step = 0; step < 60 && g.left > 0; step++) {
      const fast = new Set<string>();
      const flat = collectMoves(g.board, []);
      for (let i = 0; i < flat.length; i += 7) {
        fast.add([flat[i], flat[i + 1], flat[i + 3], flat[i + 4], flat[i + 6]].join());
        // 配上的那一对移动前一定连不上；单张牌串因此永远配不上
        if (flat[i + 2] === 1) singles++;
        if (g.canFlip(flat[i + 4], flat[i + 6])) singleBad++;
        // 执行再撤回，局面原样回来
        const before = Int8Array.from(g.board), key = g.kindKey();
        const rec = doMove(g, flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 5], flat[i + 6]);
        undoMove(g, rec);
        if (g.kindKey() !== key || !same([...g.board], [...before])) undoBad++;
      }
      const ref = brute(g.board);
      positions++;
      total += ref.size;
      if (ref.size !== fast.size || [...ref].some((k) => !fast.has(k))) bad++;
      const ms = g.moves();
      if (ms.length && (rand() < 0.6 || flat.length === 0)) { const i = randInt(rand, ms.length / 2) * 2; g.flip(ms[i], ms[i + 1]); }
      else if (flat.length) {
        const i = randInt(rand, flat.length / 7) * 7;
        doMove(g, flat[i], flat[i + 1], flat[i + 2], flat[i + 3], flat[i + 5], flat[i + 6]);
      } else break;
    }
  }
  // 局面要够多、配法不能全被排除，这个对照才有意义
  expect(positions).toBeGreaterThan(3000);
  expect(total).toBeGreaterThan(10000);
  expect(singles).toBe(0);
  expect(bad).toBe(0);
  expect(singleBad).toBe(0);
  expect(undoBad).toBe(0);
});

// 13. hasMove：开局满盘没有空位，一次移动都没有
it('满盘没有移动', () => {
  const g = genForward(rng(5), { spread: 1 });
  expect(hasMove(g.board, 1)).toBe(false);
});
