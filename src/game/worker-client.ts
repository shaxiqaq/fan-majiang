// 主线程这一侧：发牌和求解各用一个后台线程，按 id 对上回复。
// 分开两个线程，是为了按「开局」时不用排在一次慢的提示求解后面。
import type { DealReply, SolveReply } from './worker';

function channel<R extends { id: number }>() {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, (r: R) => void>();
  let seq = 0;
  w.onmessage = (e: MessageEvent<R>) => {
    pending.get(e.data.id)?.(e.data);
    pending.delete(e.data.id);
  };
  return (msg: object): Promise<R> =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      w.postMessage({ ...msg, id });
    });
}

const dealCh = channel<DealReply>();
const solveCh = channel<SolveReply>();

export const dealAsync = (diff: number, seed: number) => dealCh({ cmd: 'deal', diff, seed });
export const solveAsync = (board: Int8Array, budget: number) => solveCh({ cmd: 'solve', board: Int8Array.from(board), budget });
