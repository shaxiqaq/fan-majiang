// 保证有解的发牌。
//
// 正推法：先不看牌面，只看牌位。从满盘开始，每步任选两个能连上的牌位翻掉，记下顺序；
// 最后给每一对分配牌种。这个顺序本身就是一条合法的翻牌顺序，所以牌阵一定有解。
// 任何牌位集合里都至少有一对能连上（某行/列有两个牌位 → 相邻两个直连；
// 否则每行每列至多一个 → 任意两个拐一次弯就能连上），所以一次就成功，不需要重试。
//
// 倒推法（从空盘成对放牌）理论上能得到同样的牌阵，但随机放置经常把最后几格堵死，
// 试跑 1000 次全部失败，已弃用。
//
// 筛选法：随机发牌、求解器判定、有解才要。随机牌阵几乎从不有解，不可行。
import { N, KINDS, connect, randInt, shuffle } from './core.mjs';
import { solve } from './solver.mjs';

const isAdjacent = (a, b, cols) => Math.abs(a - b) === 1 && ((a / cols) | 0) === ((b / cols) | 0) || Math.abs(a - b) === cols;

// cells: 要放牌的格（默认整个棋盘）；pairKinds: 每一对的牌种（默认 34 种各两对）
// spread（0~1）: 每一步以这个概率优先挑不相邻的可连牌位。越大，牌阵里相邻同牌越少、
// 看起来越像随机发牌，也越难（见报告）。
export function genForward(rand, { cells = null, pairKinds = null, spread = 0, cols = 17 } = {}) {
  const pass = new Uint8Array(N).fill(1);
  const live = cells ? cells.slice() : Array.from({ length: N }, (_, i) => i);
  for (const c of live) pass[c] = 0;
  const pairs = [];
  while (live.length) {
    shuffle(live, rand);
    const wantFar = spread > 0 && rand() < spread;
    let pick = null;
    for (const a of live) {
      const cands = live.filter((b) => b !== a && connect(a, b, pass));
      if (!cands.length) continue;
      if (!pick) pick = [a, cands[randInt(rand, cands.length)]];
      if (!wantFar) break;
      const far = cands.filter((b) => !isAdjacent(a, b, cols));
      if (far.length) { pick = [a, far[randInt(rand, far.length)]]; break; }
    }
    if (!pick) throw new Error('不可能：总能找到一对能连上的牌位');
    const [a, b] = pick;
    pass[a] = pass[b] = 1;
    live.splice(live.indexOf(a), 1);
    live.splice(live.indexOf(b), 1);
    pairs.push(pick);
  }
  let kinds = pairKinds;
  if (!kinds) {
    kinds = [];
    for (let k = 0; k < KINDS; k++) kinds.push(k, k);
  }
  kinds = shuffle(kinds.slice(), rand);
  const board = new Int8Array(N).fill(-1);
  pairs.forEach(([a, b], i) => { board[a] = board[b] = kinds[i]; });
  return { board, solution: pairs };
}

// 互换法：正推法发好后随机互换 swaps 对不同种的牌，再用带移动的求解器确认有解，无解或超时就重来。
// 互换以后正推法的生成解不再成立，返回的 solution 是求解器找到的那条解（含移动，格式见 solver.mjs 的 solveMoves）。
// 见 research/09-move-simulation.md 第 5 节。
export function genSwap(rand, { spread = 1, swaps = 16, budget = 50000 } = {}) {
  for (let tries = 1; ; tries++) {
    const { board } = genForward(rand, { spread });
    for (let k = 0; k < swaps; k++) {
      let a, b;
      do { a = randInt(rand, N); b = randInt(rand, N); } while (board[a] === board[b]);
      [board[a], board[b]] = [board[b], board[a]];
    }
    const r = solve(board, { moves: true, budget });
    if (r.result === 'solvable') return { board, solution: r.solution, tries };
  }
}
