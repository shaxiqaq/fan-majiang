// 移动规则的手工用例：node test-move.mjs
// 棋盘用小图画：'.' 是空位，小写字母是牌种（a=0, b=1, ...），没画到的格都是填充牌 '#'（牌种 33，
// 和图里的牌都不同，不会被配上）。填充牌自己能做的移动和这里无关，所以每个用例只看指定的牌串。
import { COLS, N, EMPTY, Game, rng, randInt, UP, DOWN, LEFT, RIGHT, STEP } from './core.mjs';
import { listMoves, collectMoves, doMove, undoMove, hasMove } from './move.mjs';
import { genForward } from './generate.mjs';

const FILL = 33;
const at = (r, c) => r * COLS + c;
function grid(lines) {
  const board = new Int8Array(N).fill(FILL);
  lines.forEach((line, r) => [...line].forEach((ch, c) => {
    board[at(r, c)] = ch === '.' ? EMPTY : ch === '#' ? FILL : ch.charCodeAt(0) - 97;
  }));
  return board;
}
const show = (board, rows = 3, cols = 8) => {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let s = '';
    for (let c = 0; c < cols; c++) { const k = board[at(r, c)]; s += k === EMPTY ? '.' : k === FILL ? '#' : String.fromCharCode(97 + k); }
    out.push(s);
  }
  return out.join('/');
};
const DIR = { up: UP, down: DOWN, left: LEFT, right: RIGHT };
// 指定牌串（串头的格、方向）的所有移动：{ dist: [[from, to, partner], ...] }
function movesOf(board, head, dir) {
  const out = {};
  for (const m of listMoves(board)) if (m.head === head && m.dir === dir) out[m.dist] = m.pairs.map((p) => [p.from, p.to, p.partner]);
  return out;
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

let fail = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  ' + detail}`);
  if (!ok) fail++;
}

// 1. 整串走（「定移动机制」里的例子）：拖东往右 2 格，西、南跟着走；南落到下面那张南的正上方，配上。
{
  const b = grid(['wse..z', '###s']);
  const ms = movesOf(b, at(0, 2), 'right');
  check('整串走：拖东往右 2 格能配上', same(ms[2], [[at(0, 1), at(0, 3), at(1, 3)]]), JSON.stringify(ms));
  const m = listMoves(b).find((x) => x.head === at(0, 2) && x.dir === 'right' && x.dist === 2);
  check('整串走：牌串是东、南、西三张', m && same(m.cells, [at(0, 2), at(0, 1), at(0, 0)]), JSON.stringify(m?.cells));
  const g = new Game(b);
  const rec = doMove(g, RIGHT, at(0, 2), 3, 2, at(0, 3), at(1, 3));
  check('整串走：移完西、东到了新位置，南和下面的南翻掉', show(g.board, 2, 6) === '..w.ez/###.##', show(g.board, 2, 6));
  undoMove(g, rec);
  check('整串走：撤回整次还原', same([...g.board], [...b]) && g.kindKey() === new Game(b).kindKey());
}

// 2. 配不上就不算：同一串只走 1 格，谁都对不上，这次移动不存在
{
  const b = grid(['wse..z', '###s']);
  check('配不上就不算：走 1 格没有配法，不列出', movesOf(b, at(0, 2), 'right')[1] === undefined);
  const lone = grid(['ab...', '#####']);
  check('配不上就不算：整串怎么走都配不上', Object.keys(movesOf(lone, at(0, 1), 'right')).length === 0);
}

// 3. 身后隔着空位的牌不跟着走
{
  const b = grid(['a.bc..d', '#####c']);
  const m = listMoves(b).find((x) => x.head === at(0, 3) && x.dir === 'right' && x.dist === 2);
  check('身后隔空位：牌串只有 c、b 两张', m && same(m.cells, [at(0, 3), at(0, 2)]), JSON.stringify(m));
  const g = new Game(b);
  doMove(g, RIGHT, at(0, 3), 2, 2, at(0, 5), at(1, 5));
  check('身后隔空位：a 留在原处', show(g.board, 2, 7) === 'a...b.d/#####.#', show(g.board, 2, 7));
}

// 4. 可以停在中间某格：前面有 3 个空位，只有走 1 格时 b 落到下面那张 b 的正上方
{
  const b = grid(['ab...c', '##b']);
  const ms = movesOf(b, at(0, 1), 'right');
  check('停在中间：只有走 1 格能配上', same(Object.keys(ms), ['1']) && same(ms[1], [[at(0, 1), at(0, 2), at(1, 2)]]), JSON.stringify(ms));
}

// 5. 牌串里两张挨着的同牌不算配上
{
  const b = grid(['aa....', '######']);
  check('串里的同牌：两张 a 一起走，怎么走都不算配上', Object.keys(movesOf(b, at(0, 1), 'right')).length === 0);
  // 串里有两张 a，外面还有第三张：只能和外面那张配
  const b2 = grid(['aa....', '####a']);
  const ms = movesOf(b2, at(0, 1), 'right');
  check('串里的同牌：只和没动的那张配上', same(ms, { 3: [[at(0, 1), at(0, 4), at(1, 4)]], 4: [[at(0, 0), at(0, 4), at(1, 4)]] }), JSON.stringify(ms));
}

// 6. 一张牌能配好几张：b 走 2 格后，上面、下面各有一张 b，前面挡路的也是 b
{
  const b = grid(['###b###', 'ab...b', '###b###']);
  const ms = movesOf(b, at(1, 1), 'right');
  const partners = (ms[2] || []).map((p) => p[2]).sort((x, y) => x - y);
  check('一张配多张：走 2 格有三种配法', same(partners, [at(0, 3), at(1, 5), at(2, 3)].sort((x, y) => x - y)), JSON.stringify(ms));
  check('一张配多张：走 1、3 格只能配前面挡路的那张', same(ms[1], [[at(1, 1), at(1, 2), at(1, 5)]]) && same(ms[3], [[at(1, 1), at(1, 4), at(1, 5)]]), JSON.stringify(ms));
}

// 7. 竖着走：a、b 一起往下走 2 格，b 落到 (3,0)，右边隔一个空位是 b
{
  const b = grid(['a', 'b', '..', '..b', '#']);
  const ms = movesOf(b, at(1, 0), 'down');
  check('竖着走：往下 2 格，b 隔空位和右边的 b 横着对上', same(ms[2], [[at(1, 0), at(3, 0), at(3, 2)]]), JSON.stringify(ms));
  const g = new Game(b);
  doMove(g, DOWN, at(1, 0), 2, 2, at(3, 0), at(3, 2));
  check('竖着走：a 跟到 (2,0)，原来两格空出来', g.board[at(0, 0)] === EMPTY && g.board[at(1, 0)] === EMPTY && g.board[at(2, 0)] === 0 && g.board[at(3, 0)] === EMPTY);
}

// 8. 串尾往后看：腾出来的格加上身后原有的空位，碰到的第一张是同牌，也算配上
{
  const b = grid(['a.ab..#']);
  const ms = movesOf(b, at(0, 3), 'right');
  check('串尾往后看：走 1、2 格都能和身后的 a 配上', same(ms, { 1: [[at(0, 2), at(0, 3), at(0, 0)]], 2: [[at(0, 2), at(0, 4), at(0, 0)]] }), JSON.stringify(ms));
}

// 9. 牌串让出来的格打通了两张没动的同牌：不算这次移动配上（移完可以照常翻）
{
  const b = grid(['c#', 'xy..', 'c#']);
  check('让出的格打通别的牌：不算配上', Object.keys(movesOf(b, at(1, 1), 'right')).length === 0);
}

// 10. 单张的牌串：规则上允许，listMoves 默认列出；single: false 时跳过；hasMove 只看两张以上的
{
  const b = grid(['.a..', '##a#']);
  check('单张牌串：默认列出', movesOf(b, at(0, 1), 'right')[1]?.length === 1);
  check('单张牌串：single: false 时不列', !listMoves(b, { single: false }).some((m) => m.head === at(0, 1)));
}

// 11. 同一格位置不同牌种，kindKey 要分得开
{
  const g1 = new Game(grid(['ab.'])), g2 = new Game(grid(['ba.']));
  check('kindKey 区分牌种', g1.kindKey() !== g2.kindKey() && g1.key() === g2.key());
}

// 12. 和暴力实现对照：在随机局面上真的把牌串挪过去，逐对检查不拐弯的连线
function brute(board) {
  const set = new Set();
  for (let head = 0; head < N; head++) {
    if (board[head] === EMPTY) continue;
    for (let dir = 0; dir < 4; dir++) {
      const s = STEP[dir];
      const ok = (from, to) => to >= 0 && to < N && (dir < 2 || ((from / COLS) | 0) === ((to / COLS) | 0));
      if (!ok(head, head + s) || board[head + s] !== EMPTY) continue;
      const cells = [head];
      while (ok(cells.at(-1), cells.at(-1) - s) && board[cells.at(-1) - s] !== EMPTY) cells.push(cells.at(-1) - s);
      for (let dist = 1; ok(head + s * (dist - 1), head + s * dist) && board[head + s * dist] === EMPTY; dist++) {
        const nb = Int8Array.from(board);
        for (const c of cells) nb[c] = EMPTY;
        const moved = new Set(cells.map((c) => c + s * dist));
        for (const c of cells) nb[c + s * dist] = board[c];
        for (const c of cells) {
          const to = c + s * dist;
          for (let u = 0; u < N; u++) if (!moved.has(u) && nb[u] === nb[to] && straight(nb, to, u)) set.add([dir, head, dist, c, u].join());
        }
      }
    }
  }
  return set;
}
function straight(b, x, y) {
  const rx = (x / COLS) | 0, cx = x % COLS, ry = (y / COLS) | 0, cy = y % COLS;
  if (rx === ry) { for (let c = Math.min(cx, cy) + 1; c < Math.max(cx, cy); c++) if (b[rx * COLS + c] !== EMPTY) return false; return true; }
  if (cx === cy) { for (let r = Math.min(rx, ry) + 1; r < Math.max(rx, ry); r++) if (b[r * COLS + cx] !== EMPTY) return false; return true; }
  return false;
}
{
  let bad = 0, total = 0, positions = 0, singles = 0, singleBad = 0, undoBad = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rand = rng(seed);
    const g = new Game(genForward(rand, { spread: 1 }).board);
    // 随便翻、随便移，沿途取局面
    for (let step = 0; step < 60 && g.left > 0; step++) {
      const fast = new Set();
      const flat = collectMoves(g.board, []);
      for (let i = 0; i < flat.length; i += 7) {
        fast.add([flat[i], flat[i + 1], flat[i + 3], flat[i + 4], flat[i + 6]].join());
        // 单张牌串配上的那一对，不移动也能直接连上（求解器因此可以跳过单张的牌串）
        if (flat[i + 2] === 1) { singles++; if (!g.canFlip(flat[i + 4], flat[i + 6])) singleBad++; }
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
  check(`和暴力实现对照（${positions} 个局面，共 ${total} 种配法）`, bad === 0, `${bad} 个局面不一致`);
  check(`单张牌串配上的 ${singles} 对，都能不移动直接翻`, singleBad === 0, `${singleBad} 对不行`);
  check('每种移动执行再撤回，局面原样回来', undoBad === 0, `${undoBad} 次不一致`);
}

// 13. hasMove：开局满盘没有空位，一次移动都没有
{
  const g = genForward(rng(5), { spread: 1 });
  check('满盘没有移动', !hasMove(g.board, 1));
}

console.log(fail ? `${fail} 个失败` : '全部通过');
process.exit(fail ? 1 : 0);
