// 游戏界面：棋盘在左、侧栏在右（spec.md 第 5、6、7 节）。交互照原型方案 H：
// 点两张同牌翻掉；按住一张牌，能配上的格亮出箭头，拖过去松手（只停在这些格上）；也可以点牌再点箭头。
// 配上画直线再翻；有多种配法时点亮着的牌选一对，点别处作废、牌串退回去。提示给移动时用虚影加 ▼。
import { UP, DOWN, LEFT, RIGHT, STEP } from '../core/core';
import { listMoves } from '../core/move';
import {
  game, subscribe, flip, undo, undoTimes, requestHint, abandonHint, newGame, elapsed, fmtTime, touch,
  beginMove, commitMove, cancelMove, moveOf,
} from '../game/state';
import { destCells, pathOf, runAt, sameKind, type Move, type Pair, type Run } from '../game/rules';
import { TIERS, tierName, snapTier } from '../game/difficulty';
import { createBoard, sleep, type Deco, type Float } from './board';
import { tileUrl } from './tiles';

const DIRS = [UP, DOWN, LEFT, RIGHT];
const isEmpty = (i: number) => game.board[i] < 0;

export const RULES =
  '<b>玩法</b><br>点两张同牌，中间能用最多拐一次弯的线连上（只能经过空位），就翻掉它们。<br>' +
  '也可以把一串牌横着或竖着拖过去，让串里一张牌和同牌直线对上，翻掉这一对。<br>' +
  '卡住了用「赖子」直接翻掉一对同牌，或者按「提示」。翻完全部就赢。';

type Card = { tone: string; text: string; actions?: [label: string, act: string][] };
type Drag = {
  id: number; i: number; x0: number; y0: number; axis: 'x' | 'y' | null; k: number;
  marks?: Map<number, Move>; pos?: Run; neg?: Run; pitch?: number; cells?: number[]; dead?: boolean;
  stopsPos?: number[]; stopsNeg?: number[]; fl?: Float; refuse?: boolean; off?: number;
};

// 当前局面所有能配上的移动，按「方向:串头:格数」查配法。单张牌不能移动，只看两张以上的牌串
let moveIdx: { v: number; map: Map<string, Pair[]> } = { v: -1, map: new Map() };
function pairsFor(dir: number, head: number, dist: number): Pair[] {
  if (moveIdx.v !== game.version) {
    const map = new Map<string, Pair[]>();
    for (const m of listMoves(game.board, { single: false })) map.set(`${m.dirIndex}:${m.head}:${m.dist}`, m.pairs);
    moveIdx = { v: game.version, map };
  }
  return moveIdx.map.get(`${dir}:${head}:${dist}`) ?? [];
}
function matchDists(run: Run | null): number[] {
  const out: number[] = [];
  if (run) for (let d = 1; d <= run.gap; d++) if (pairsFor(run.dirIndex, run.head, d).length) out.push(d);
  return out;
}

// 侧栏的临时消息（连不上的原因、玩法说明等），过一会儿自己消失
function noter(render: () => void) {
  let note: (Card & { until: number }) | null = null, timer = 0;
  return {
    say(text: string, tone = 'info', ms = 2400) {
      note = { text, tone, until: Date.now() + ms };
      clearTimeout(timer);
      timer = window.setTimeout(render, ms + 20);
      render();
    },
    get: () => (note && note.until > Date.now() ? note : null),
    clear() { note = null; },
  };
}

export function mountApp(app: HTMLElement, { startNote }: { startNote?: { text: string; tone?: string; ms: number } } = {}) {
  app.innerHTML = `
  <div class="game">
    <main class="boardhost"></main>
    <aside class="rail">
      <div class="stats">
        <div class="stat"><small>用时</small><b data-k="time"></b></div>
        <div class="stat"><small>步数</small><b data-k="steps"></b></div>
        <div class="stat"><small>已用赖子</small><b data-k="laizi"></b></div>
        <div class="stat"><small>已用提示</small><b data-k="hints"></b></div>
      </div>
      <div class="diff">难度 <span data-k="diff"></span></div>
      <div class="btns">
        <button class="btn b-hint" data-act="hint"><span class="ic">💡</span><span class="lb">提示</span></button>
        <button class="btn" data-act="undo"><span class="ic">↶</span><span class="lb">撤回</span></button>
        <button class="btn b-laizi" data-act="laizi"><span class="ic"><i class="ic-laizi"></i></span><span class="lb">赖子</span></button>
      </div>
      <div class="msg"></div>
      <div class="foot"><button class="b-new" data-act="new">新局</button><button class="b-rules" data-act="rules">玩法</button></div>
    </aside>
    <div class="ng-mask" hidden>
      <div class="ng-panel">
        <div class="ng-head"><b>新局</b><button class="ng-x" data-act="ngclose">✕</button></div>
        <div class="ng-tiers">${TIERS.map(([n, d]) => `<button data-tier="${d}">${n}</button>`).join('')}<button data-act="ngcustom" class="ng-ctog">自定义</button></div>
        <div class="ng-custom" hidden>
          <input type="range" min="0" max="2" step="0.01" class="ng-range">
          <div class="ng-ticks"><span>简单</span><span>像随机发牌</span></div>
          <div class="ng-marks">${TIERS.map(([n, d]) => `<i style="left:${(d / 2) * 100}%">${n}</i>`).join('')}</div>
        </div>
        <div class="ng-warn">当前这局还没打完，开局就会放弃它</div>
        <button class="ng-go" data-act="nggo">开局</button>
      </div>
    </div>
  </div>`;
  const root = app.firstElementChild as HTMLElement;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  ($('.ic-laizi') as HTMLElement).style.backgroundImage = `url("${tileUrl('Blank')}")`;

  let sel: number[] = [], laiziMode = false, busy = false;
  let choosing: { m: Move; pairs: Pair[] } | null = null; // 牌串已经挪过去、等玩家选一对
  let drag: Drag | null = null;
  let suppress = false; // 拖完以后浏览器补发的那次 click 不算点牌
  let ghostOff: (() => void) | null = null, ghostFor: { h: unknown; key: string } | null = null;
  const note = noter(() => render());
  const board = createBoard($('.boardhost'), { onTap, onLayout: () => render() });

  // 屏幕方向的字和箭头类名
  const scr = (dir: number) => board.screenDir(dir);
  const word = (dir: number) => { const [x, y] = scr(dir).v; return x > 0 ? '右' : x < 0 ? '左' : y > 0 ? '下' : '上'; };
  const arrowCls = (dir: number) => { const [x, y] = scr(dir).v; return x > 0 ? 'tg-r' : x < 0 ? 'tg-l' : y > 0 ? 'tg-d' : 'tg-u'; };
  const offsetOf = (dir: number, n: number): [number, number] => { const { v, pitch } = scr(dir); return [v[0] * pitch * n, v[1] * pitch * n]; };
  const step = (i: number, dir: number, n: number) => i + STEP[dir] * n;

  // 格 i 所在的牌串能挪过去配上的地方：Map(串头到达的格 → 移动)。
  // 标在串头到达的格上（一定是空位）；按住的那张如果在串中间或串尾，它自己的落点可能还被串里的牌占着。
  function targetsOf(i: number, dirs = DIRS): Map<number, Move> {
    const out = new Map<number, Move>();
    for (const dir of dirs) {
      const run = runAt(game.board, i, dir);
      if (!run) continue;
      for (const d of matchDists(run)) out.set(step(run.head, dir, d), { ...run, dist: d });
    }
    return out;
  }

  // ---------- 点牌 ----------
  async function onTap(i: number) {
    if (suppress) { suppress = false; return; }
    if (busy || game.dealing) return;
    if (choosing) return chooseTap(i);
    if (sel.length) {
      const m = targetsOf(sel[0]).get(i);
      if (m) return runMove(m, null);
    }
    if (i < 0 || isEmpty(i)) { sel = []; return render(); }
    touch();
    if (!sel.length) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (!sameKind(game.board, a, i)) { sel = [i]; return render(); } // 不是同牌：选中换到新点的这张
    const p = pathOf(game.board, a, i);
    if (laiziMode && !p) {
      sel = [];
      laiziMode = false;
      busy = true;
      render();
      await board.animate([a, i], 'anim-sparkle', 320);
      busy = false;
      flip(a, i, { laizi: true });
      return;
    }
    if (p) {
      sel = [];
      laiziMode = false;
      busy = true;
      render();
      board.drawPath(p, 'line', 320);
      await sleep(160);
      await board.animate([a, i], 'anim-out', 110);
      busy = false;
      note.clear();
      flip(a, i);
      return;
    }
    sel = [i];
    render();
    board.animate([a, i], 'anim-shake', 300);
    note.say('连不上：连线最多拐一次弯，途经的格必须是空位', 'warn');
  }

  // ---------- 移动 ----------
  // residual：拖动松手时浮层离目标还差的偏移；null 表示从原处滑过去
  async function runMove(m: Move, residual: [number, number] | null) {
    touch();
    sel = [];
    laiziMode = false; // 开始一次移动会退出赖子模式
    note.clear();
    const pairs = pairsFor(m.dirIndex, m.head, m.dist);
    busy = true;
    beginMove(m);
    const [bx, by] = offsetOf(m.dirIndex, -m.dist);
    await board.slideIn(destCells(m), ...(residual ?? [bx, by]), residual ? 90 : 170);
    busy = false;
    if (pairs.length === 1) return finish(pairs[0]);
    choosing = { m, pairs };
    render();
  }

  async function finish(pair: Pair) {
    busy = true;
    choosing = null;
    render();
    const a = pair.to, b = pair.partner;
    board.drawPath([a, b], 'line', 320);
    await sleep(160);
    await board.animate([a, b], 'anim-out', 110);
    busy = false;
    commitMove(pair);
  }

  async function cancelChoose(say = true) {
    const m = choosing!.m;
    choosing = null;
    cancelMove();
    busy = true;
    await board.slideIn(m.cells, ...offsetOf(m.dirIndex, m.dist), 180);
    busy = false;
    if (say) note.say('没选配法，这次移动作废，牌串退回原处');
    else render();
  }

  function chooseTap(i: number) {
    const ps = choosing!.pairs;
    const byTo = ps.filter((p) => p.to === i);
    const p = ps.find((x) => x.partner === i) ?? (byTo.length === 1 ? byTo[0] : null);
    if (p) finish(p);
    else cancelChoose();
  }

  // ---------- 拖动：只停在能配上的格 ----------
  function onDown(e: PointerEvent) {
    suppress = false;
    if (busy || choosing || game.dealing || e.button > 0) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
    if (!t || t.dataset.i == null) return;
    const i = +t.dataset.i;
    if (isEmpty(i)) return;
    drag = { id: e.pointerId, i, x0: e.clientX, y0: e.clientY, axis: null, k: 0, marks: targetsOf(i) };
    render();
  }

  function startDrag(axis: 'x' | 'y') {
    const D = drag!;
    D.axis = axis;
    suppress = true;
    try { board.el.setPointerCapture(D.id); } catch {}
    touch();
    sel = [];
    laiziMode = false;
    note.clear();
    for (const dir of DIRS) {
      const [x, y] = scr(dir).v;
      const sgn = axis === 'x' ? x : y;
      if (sgn > 0) D.pos = runAt(game.board, D.i, dir)!;
      else if (sgn < 0) D.neg = runAt(game.board, D.i, dir)!;
    }
    D.pitch = scr(D.pos!.dirIndex).pitch;
    D.cells = D.pos!.cells;
    if (D.cells.length < 2) {
      D.dead = true;
      board.animate(D.cells, 'anim-shake', 300);
      note.say('单张牌不能移动，点两张能连上的同牌翻掉', 'warn');
      return;
    }
    if (!D.pos!.gap && !D.neg!.gap) {
      D.dead = true;
      board.animate(D.cells, 'anim-shake', 300);
      note.say('这一串前后都没有空位，挪不动', 'warn');
      return;
    }
    D.stopsPos = matchDists(D.pos!);
    D.stopsNeg = matchDists(D.neg!);
    D.marks = targetsOf(D.i, [D.pos!.dirIndex, D.neg!.dirIndex]);
    D.fl = board.float(D.cells);
  }

  const setFloat = (off: number, ms = 0) => drag!.fl!.set(drag!.axis === 'x' ? off : 0, drag!.axis === 'y' ? off : 0, ms);

  function onMove(e: PointerEvent) {
    const D = drag;
    if (!D || e.pointerId !== D.id) return;
    const dx = e.clientX - D.x0, dy = e.clientY - D.y0;
    if (!D.axis) {
      if (Math.hypot(dx, dy) < Math.max(8, board.dims().tw * 0.3)) return;
      startDrag(Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y');
      render();
    }
    if (D.dead) return;
    const raw = D.axis === 'x' ? dx : dy;
    const prevK = D.k, prevRefuse = D.refuse;
    // 吸附：只停在能配上的格；这一边没有能配上的格就拽住
    const stops = raw >= 0 ? D.stopsPos! : D.stopsNeg!, sgn = raw >= 0 ? 1 : -1, u = Math.abs(raw) / D.pitch!;
    let best = 0, bd = u;
    for (const d of stops) if (Math.abs(u - d) < bd) { bd = Math.abs(u - d); best = d; }
    D.k = sgn * best;
    D.refuse = !stops.length && u > 0.5;
    const shown = best ? sgn * best * D.pitch! : stops.length ? 0 : sgn * Math.min(Math.abs(raw) * 0.22, D.pitch! * 0.35);
    if (best !== Math.abs(prevK) || !best) setFloat(shown, best ? 90 : 0);
    D.off = shown;
    if (D.k !== prevK || D.refuse !== prevRefuse) render();
  }

  async function onUp(e: PointerEvent) {
    const D = drag;
    if (!D || e.pointerId !== D.id) return;
    drag = null;
    if (!D.axis || D.dead) return render();
    const k = e.type === 'pointercancel' ? 0 : D.k;
    const side = k > 0 ? D.pos! : D.neg!, dist = Math.abs(k);
    const pairs = k ? pairsFor(side.dirIndex, side.head, dist) : [];
    if (!pairs.length) {
      busy = true;
      render();
      await D.fl!.set(0, 0, 150);
      D.fl!.drop();
      busy = false;
      render();
      return;
    }
    const r = D.off! - k * D.pitch!;
    D.fl!.drop();
    runMove({ ...side, dist }, D.axis === 'x' ? [r, 0] : [0, r]);
  }

  board.el.addEventListener('pointerdown', onDown);
  board.el.addEventListener('pointermove', onMove);
  board.el.addEventListener('pointerup', onUp);
  board.el.addEventListener('pointercancel', onUp);

  // ---------- 侧栏卡片 ----------
  const hintMove = () => (game.hint?.type === 'move' ? game.hint : null);

  function card(): Card {
    if (game.dealing) return { tone: 'info', text: '发牌中…' };
    if (game.won)
      return {
        tone: 'good',
        text: `<b>全部翻完！</b><br>用时 ${fmtTime(elapsed())}<br>步数 ${game.steps}<br>已用赖子 ${game.laiziUsed}<br>已用提示 ${game.hintsUsed}<br>难度 ${tierName(game.diff)}`,
        actions: [['新局', 'new']],
      };
    if (choosing)
      return { tone: 'choose', text: `<b>有 ${choosing.pairs.length} 种配法</b>：点一张亮着的牌，翻掉它那一对。<br>点别处或按「撤回」就作废，牌串退回去。` };
    if (drag?.fl && !drag.dead) {
      const D = drag, side = D.k > 0 ? D.pos! : D.neg!;
      if (D.refuse) return { tone: 'warn', text: '这个方向挪过去配不上同牌。' };
      if (D.k) {
        const n = pairsFor(side.dirIndex, side.head, Math.abs(D.k)).length;
        return { tone: 'good', text: n > 1 ? `松手后有 ${n} 种配法，要选一对。` : '松手就翻掉亮着的这一对。' };
      }
      return { tone: 'idle', text: '拖到亮着的格上松手。' };
    }
    if (game.thinking) return { tone: 'info', text: '正在找提示…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '<b>局面已经无解</b><br>前面有一步走错了。', actions: game.hint.back ? [[`撤回到走错之前（退 ${game.hint.back} 步）`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (laiziMode) return { tone: 'laizi', text: '<b>赖子</b>：点两张同牌，不看连线直接翻掉。<br>再按一次「赖子」取消。' };
    if (game.deadlock) return { tone: 'bad', text: '<b>没有能翻的牌，也没有能配上的移动了</b>', actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    if (game.hint?.type === 'pair')
      return { tone: 'good', text: game.hint.safe ? '提示：▼ 标出的这一对可以翻，翻完仍然有解。' : '提示：▼ 标出的这一对可以翻。' };
    const h = hintMove();
    if (h) return { tone: 'good', text: `提示：照着虚影把这串牌往${word(h.m.dirIndex)}拖 ${h.m.dist} 格（或者点 ▼ 那张、再点箭头），▼ 标出的两张就会对上。` };
    if (sel.length && targetsOf(sel[0]).size) return { tone: 'idle', text: '点亮着的同牌翻掉，或者点空位上的箭头，把这串牌挪过去配上。' };
    return { tone: 'idle', text: '点两张能连上的同牌翻掉。<br>按住一张牌，亮出来的箭头格是整串能挪过去配上同牌的地方，拖过去松手；也可以点一下牌，再点箭头。' };
  }

  // ---------- 画 ----------
  function render() {
    const names = ['sel', 'same', 'hint', 'tg', 'cand', 'tg-r', 'tg-l', 'tg-u', 'tg-d'];
    const deco: Deco = Object.fromEntries(names.map((n) => [n, new Set<number>()]));
    for (const i of sel) deco.sel.add(i);
    const cls: string[] = [];
    if (sel.length) {
      cls.push('has-sel');
      for (let i = 0; i < game.board.length; i++) if (game.board[i] === game.board[sel[0]]) deco.same.add(i);
    }
    if (laiziMode) cls.push('laizi-mode');
    const mark = (cell: number, arrow: string) => {
      deco.tg.add(cell);
      deco[arrow].add(cell);
    };
    board.clearPaths('pv-line');

    // 选中一张时标出它能挪过去配上的格
    if (sel.length && !choosing) for (const [cell, m] of targetsOf(sel[0])) mark(cell, arrowCls(m.dirIndex));

    // 拖动中
    const D = drag;
    if (D && !D.dead) {
      if (D.marks) for (const [cell, m] of D.marks) mark(cell, arrowCls(m.dirIndex));
      if (D.fl) {
        for (const c of D.cells!) D.fl.mark(c, 'cand', false);
        if (D.k) {
          const side = D.k > 0 ? D.pos! : D.neg!;
          for (const p of pairsFor(side.dirIndex, side.head, Math.abs(D.k))) {
            deco.cand.add(p.partner);
            D.fl.mark(p.from, 'cand', true);
            board.drawPath([p.to, p.partner], 'pv-line');
          }
        }
        cls.push('dragging');
        if (D.refuse) cls.push('refuse');
      }
    }

    // 多种配法
    if (choosing) {
      cls.push('choosing');
      for (const p of choosing.pairs) {
        deco.cand.add(p.partner);
        deco.cand.add(p.to);
        board.drawPath([p.to, p.partner], 'pv-line');
      }
    }

    // 提示
    if (game.hint?.type === 'pair') { deco.hint.add(game.hint.a); deco.hint.add(game.hint.b); }
    const h = !choosing && !D?.fl ? hintMove() : null;
    if (h) { deco.hint.add(h.pair.from); deco.hint.add(h.pair.partner); }
    board.update(deco, cls);
    syncGhost(!busy ? h : null);

    // 侧栏
    const put = (k: string, v: string | number) => root.querySelectorAll(`[data-k="${k}"]`).forEach((e) => (e.textContent = String(v)));
    put('time', fmtTime(elapsed()));
    put('steps', game.steps);
    put('laizi', game.laiziUsed);
    put('hints', game.hintsUsed);
    put('diff', tierName(game.diff));
    const m = card();
    $('.msg').innerHTML = `<div class="card tone-${m.tone}"><div>${m.text}</div>${m.actions?.length ? `<div class="acts">${m.actions.map(([l, a]) => `<button data-act="${a}">${l}</button>`).join('')}</div>` : ''}</div>`;
    $('.b-laizi').classList.toggle('on', laiziMode);
    $('.b-hint .lb').textContent = game.thinking ? '思考中' : '提示';
  }

  // 提示给移动时的虚影
  function syncGhost(h: ReturnType<typeof hintMove>) {
    const key = h ? `${board.dims().orient}:${board.dims().tw}` : '';
    if (h === ghostFor?.h && key === ghostFor?.key) return;
    ghostOff?.();
    ghostOff = null;
    ghostFor = h ? { h, key } : null;
    if (h) ghostOff = board.ghost(h.m.cells, ...offsetOf(h.m.dirIndex, h.m.dist));
  }

  // ---------- 新局面板（spec.md 第 7.2 节） ----------
  let ngPick = game.diff;
  function ngSync() {
    root.querySelectorAll<HTMLElement>('[data-tier]').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.tier! - ngPick) < 0.005));
    $('.ng-ctog').classList.toggle('on', tierName(ngPick) === '自定义');
  }
  const range = $<HTMLInputElement>('.ng-range');
  range.addEventListener('input', () => {
    ngPick = snapTier(+range.value);
    ngSync();
  });
  $('.ng-mask').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) $('.ng-mask').hidden = true;
  });
  root.querySelectorAll<HTMLElement>('[data-tier]').forEach((b) =>
    b.addEventListener('click', () => {
      ngPick = +b.dataset.tier!;
      range.value = String(ngPick);
      ngSync();
    }),
  );

  // ---------- 按钮 ----------
  const acts: Record<string, () => unknown> = {
    hint: async () => {
      if (busy) return;
      if (choosing) await cancelChoose(false);
      requestHint();
    },
    undo: async () => {
      if (busy) return;
      if (choosing) return cancelChoose(false); // 选配法时按撤回：这次移动作废
      sel = [];
      laiziMode = false;
      note.clear();
      const h = undo();
      if (!h) return note.say('已经退到开局了');
      if (h.act.t === 'm') {
        busy = true;
        const m = moveOf(h.act);
        await board.slideIn(m.cells, ...offsetOf(m.dirIndex, m.dist), 200);
        busy = false;
        render();
      }
    },
    laizi: async () => {
      if (busy || game.won) return;
      if (choosing) await cancelChoose(false);
      touch();
      laiziMode = !laiziMode;
      note.clear();
      render();
    },
    back: () => game.hint?.type === 'unsolvable' && undoTimes(game.hint.back),
    // 先退掉进行到一半的操作（配法作废、赖子模式、正在想的提示），再打开面板
    new: async () => {
      if (busy) return;
      if (choosing) await cancelChoose(false);
      laiziMode = false;
      sel = [];
      abandonHint();
      ngPick = game.diff;
      $('.ng-custom').hidden = tierName(ngPick) !== '自定义';
      range.value = String(ngPick);
      $('.ng-warn').hidden = !(game.steps > 0 && !game.won);
      ngSync();
      $('.ng-mask').hidden = false;
      render();
    },
    ngclose: () => ($('.ng-mask').hidden = true),
    ngcustom: () => {
      $('.ng-custom').hidden = !$('.ng-custom').hidden;
      range.value = String(ngPick);
    },
    nggo: () => {
      $('.ng-mask').hidden = true;
      note.clear();
      newGame(ngPick);
    },
    rules: () => note.say(RULES, 'info', 20000),
  };
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (b) acts[b.dataset.act!]?.();
  });

  subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    render();
  });
  setInterval(() => {
    root.querySelectorAll('[data-k="time"]').forEach((e) => (e.textContent = fmtTime(elapsed())));
  }, 500);
  if (startNote) note.say(startNote.text, startNote.tone, startNote.ms);
  render();
}
