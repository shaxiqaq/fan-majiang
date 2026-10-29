// 连线判定的手工用例：node test.mjs
import { COLS, N, connect, Game, EMPTY } from './core.mjs';

const at = (r, c) => r * COLS + c;
// 全满的棋盘，再把 empties 里的格挖空
const passWith = (empties) => {
  const pass = new Uint8Array(N);
  for (const [r, c] of empties) pass[at(r, c)] = 1;
  return pass;
};

const cases = [
  ['左右相邻', at(0, 0), at(0, 1), [], true],
  ['上下相邻', at(3, 5), at(4, 5), [], true],
  ['斜对角不算相邻', at(0, 0), at(1, 1), [], false],
  ['同行隔一张未翻牌', at(0, 0), at(0, 2), [], false],
  ['同行隔空位直连', at(0, 0), at(0, 3), [[0, 1], [0, 2]], true],
  ['同列隔空位直连', at(0, 4), at(5, 4), [[1, 4], [2, 4], [3, 4], [4, 4]], true],
  ['拐一次弯（拐点在 a 的行）', at(0, 0), at(2, 3), [[0, 1], [0, 2], [0, 3], [1, 3]], true],
  ['拐一次弯（拐点在 b 的行）', at(0, 0), at(2, 3), [[1, 0], [2, 0], [2, 1], [2, 2]], true],
  ['拐点被占', at(0, 0), at(2, 3), [[0, 1], [0, 2], [1, 3]], false],
  ['拐一次弯但路上有牌', at(0, 0), at(2, 3), [[0, 1], [0, 3], [1, 3]], false],
  ['需要拐两次弯', at(0, 0), at(0, 3), [[1, 0], [1, 1], [1, 2], [1, 3]], false],
  ['相邻拐角 L 形（拐点空）', at(0, 0), at(1, 1), [[0, 1]], true],
];

let fail = 0;
for (const [name, a, b, empties, want] of cases) {
  const got = connect(a, b, passWith(empties));
  const got2 = connect(b, a, passWith(empties));
  if (got !== want || got2 !== want) {
    fail++;
    console.log(`✗ ${name}: 期望 ${want}，实际 ${got}/${got2}`);
  } else console.log(`✓ ${name}`);
}

// 交叉死锁：A B / B A，且 A、B 都只剩两张 → 乐观推算也判为永远翻不掉
{
  const board = new Int8Array(N).fill(EMPTY);
  // 用一圈别的牌把它们围住也不影响：这里只放四张
  board[at(3, 3)] = 0; board[at(4, 4)] = 0;
  board[at(3, 4)] = 1; board[at(4, 3)] = 1;
  const g = new Game(board);
  const ok = g.hasPermanentBlock() === true && g.moveCount() === 0;
  console.log(`${ok ? '✓' : '✗'} 交叉死锁被识别为永久卡死`);
  if (!ok) fail++;
}
// 同样四张但 A 的拐点空出 → 不是永久卡死
{
  const board = new Int8Array(N).fill(EMPTY);
  board[at(3, 3)] = 0; board[at(3, 5)] = 0;
  board[at(3, 4)] = 1; board[at(4, 4)] = 1;
  const g = new Game(board);
  const ok = g.hasPermanentBlock() === false;
  console.log(`${ok ? '✓' : '✗'} 可解的四张不被误判`);
  if (!ok) fail++;
}

console.log(fail ? `${fail} 个失败` : '全部通过');
process.exit(fail ? 1 : 0);
