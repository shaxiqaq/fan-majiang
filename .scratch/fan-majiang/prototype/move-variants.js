// 「移动」的三个界面方案（原型，用完即扔）。都搭在定稿 D 上：侧栏、麻将桌、选中、同牌高亮、赖子模式、▼ 提示照旧，
// 只加移动。规则照「定移动机制」：牌串沿横或竖方向滑进前方空位，可以停在任意一格；移完必须让串里一张牌和一张
// 没动的同牌直线对上，只翻这一对；有多种配法时玩家选，不选就作废、弹回。
//
//   E 拖动：按住一张牌横着或竖着拖，整串跟手走，空位上的小点是能停的格。拖到能配上的格，那一对先亮起来、
//     连一条虚线；松手配上就画线翻掉，配不上就弹回去。多种配法：牌串先停在那里，点一张亮着的牌选一对。
//     提示一次移动：虚线框出牌串要去的格，画一个箭头，▼ 标出会配上的一对。
//   F 点选：点一张牌（和 D 一样选中、同牌高亮），空位上同时出现箭头，标出这张牌能挪过去配上同牌的格；
//     点箭头，整串滑过去、画线翻掉。只标能配上的格，所以不会弹回。多种配法：侧栏卡片里点按钮选一对。
//     提示一次移动：▼ 标出先点哪张，闪着的箭头标出再点哪格，圈出会配上的那张。
//   G 吸附：一按住牌，能配上的格就亮出来；拖动时牌串只停在这些格上（跳着走），往配不上的方向拖会被拽住。
//     配上不画线，那一对闪一下就翻掉。多种配法：牌串旁边弹出气泡，点编号选一对。
//     提示一次移动：牌串的虚影反复滑到要去的地方，圈出会配上的那张。
//   H 定稿（用户在「移动的界面原型」里选的组合）：G 的吸附拖动，加上 F 的"选中出箭头、点箭头移动"；
//     配上画直线（同 E/F）；多种配法直接点亮着的牌（同 E）；提示是 G 的虚影加 ▼ 标出那一对，默认优先给翻牌；
//     死局卡片用 E 的文字。
import {
  game, ui, subscribe, flip, undo, undoTimes, requestHint, newGame, pathOf, sameKind, isEmpty, elapsed, fmtTime,
  UP, DOWN, LEFT, RIGHT, STEP, runAt, pairsFor, matchDists, destCells, beginMove, commitMove, cancelMove,
} from './game.js';
import { createBoard, sleep } from './board.js';
import { faceCss } from './tiles.js';

const NUMS = ['①', '②', '③', '④', '⑤', '⑥'];
const DIRS = [UP, DOWN, LEFT, RIGHT];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mini = (i) => `<i class="mini" style='--face:${faceCss(game.board[i], game.red[i])}'></i>`;

const CFG = {
  E: {
    drag: 'free', choose: 'board', hint: 'arrow', fx: 'line',
    idle: '点两张能连上的同牌翻掉。<br>也可以按住一张牌横着或竖着拖，整串牌一起滑；滑到一对同牌直线对上的地方松手，就翻掉这一对。',
    dead: '<b>没有能翻的牌，也没有能配上的移动了</b>',
    hintText: (w, n, len) => `提示：把框住的这串牌（${len} 张）往${w}拖 ${n} 格，拖到虚线格，▼ 标出的两张就会直线对上、翻掉。`,
  },
  F: {
    targets: true, choose: 'rail', hint: 'taps', fx: 'line',
    idle: '点两张能连上的同牌翻掉。<br>点一张牌时，空位上的箭头是它能挪过去、和同牌直线对上的格；点箭头，整串牌一起挪过去并翻掉那一对。',
    dead: '<b>走不动了</b><br>没有能直接翻的对，也没有能挪过去配上的牌。',
    hintText: (w, n, len) => `提示：先点 ▼ 这张，再点闪着的箭头。${len > 1 ? `它和身后的牌（共 ${len} 张）` : '它'}往${w}挪 ${n} 格后，会和圈出的那张对上。`,
  },
  H: {
    drag: 'snap', targets: true, choose: 'board', hint: 'ghost', hintTri: true, fx: 'line',
    idle: '点两张能连上的同牌翻掉。<br>按住一张牌，亮出来的箭头格是整串能挪过去配上同牌的地方，拖过去松手；也可以点一下牌，再点箭头。',
    dead: '<b>没有能翻的牌，也没有能配上的移动了</b>',
    hintText: (w, n) => `提示：照着虚影把这串牌往${w}拖 ${n} 格（或者点 ▼ 那张、再点箭头），▼ 标出的两张就会对上。`,
  },
  G: {
    drag: 'snap', choose: 'pop', hint: 'ghost', fx: 'flash',
    idle: '点两张能连上的同牌翻掉。<br>按住一张牌，亮出来的格是它能挪过去配上同牌的地方；拖过去松手，整串牌一起走，翻掉那一对。',
    dead: '<b>没有能翻的牌了</b><br>拖哪一串都配不上同牌。',
    hintText: (w, n) => `提示：照着虚影把这串牌往${w}拖 ${n} 格，它会和圈出的那张对上。`,
  },
};

function noter(render) {
  let note = null, timer = 0;
  return {
    say(text, tone = 'info', ms = 2400) {
      note = { text, tone, until: Date.now() + ms };
      clearTimeout(timer);
      timer = setTimeout(render, ms + 20);
      render();
    },
    get: () => (note && note.until > Date.now() ? note : null),
    clear() { note = null; },
    stop: () => clearTimeout(timer),
  };
}

// 「定开局与结束流程」：三档难度和自定义（不显示数值），吸附到刻度
const TIERS = [['简单', 0.75], ['普通', 1], ['困难', 1 + 16 / 68]];
const tierName = (d) => TIERS.find(([, x]) => Math.abs(x - d) < 0.005)?.[0] ?? '自定义';
const snapTier = (d) => TIERS.find(([, x]) => Math.abs(x - d) < 0.06)?.[1] ?? d;
const RULES = '<b>玩法</b><br>点两张同牌，中间能用最多拐一次弯的线连上（只能经过空位），就翻掉它们。<br>' +
  '也可以把一串牌横着或竖着拖过去，让串里一张牌和同牌直线对上，翻掉这一对。<br>' +
  '卡住了用「赖子」直接翻掉一对同牌，或者按「提示」。翻完全部就赢。';

function mountMove(app, key) {
  const V = CFG[key];
  app.innerHTML = `
  <div class="vB vD vM v${key}">
    <main class="b-boardhost"></main>
    <aside class="b-rail">
      <div class="b-stats">
        <div class="b-stat"><small>用时</small><b data-k="time"></b></div>
        <div class="b-stat"><small>步数</small><b data-k="steps"></b></div>
        <div class="b-stat"><small>已用赖子</small><b data-k="laizi"></b></div>
        <div class="b-stat"><small>已用提示</small><b data-k="hints"></b></div>
      </div>
      <div class="b-diff">难度 <span data-k="diff"></span></div>
      <div class="b-btns">
        <button class="b-btn b-hint" data-act="hint"><span class="ic">💡</span><span class="lb">提示</span></button>
        <button class="b-btn" data-act="undo"><span class="ic">↶</span><span class="lb">撤回</span></button>
        <button class="b-btn b-laizi" data-act="laizi"><span class="ic"><i class="ic-laizi"></i></span><span class="lb">赖子</span></button>
      </div>
      <div class="b-msg"></div>
      <div class="b-foot"><button class="b-new" data-act="new">新局</button><button class="b-rules" data-act="rules">玩法</button></div>
    </aside>
    <div class="g-pop" hidden></div>
    <div class="ng-mask" hidden>
      <div class="ng-panel">
        <div class="ng-head"><b>新局</b><button class="ng-x" data-act="ngclose">✕</button></div>
        <div class="ng-tiers">${TIERS.map(([n, d]) => `<button data-act="tier" data-d="${d}">${n}</button>`).join('')}<button data-act="ngcustom" class="ng-ctog">自定义</button></div>
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
  const root = app.firstElementChild;
  const $ = (s) => root.querySelector(s);
  let sel = [], laiziMode = false, busy = false;
  let choosing = null; // { m, pairs }：牌串已经挪过去、等玩家选一对
  let drag = null; // 正在拖的牌串
  let suppress = false; // 拖完以后浏览器补发的那次 click 不算点牌
  let ghostOff = null, ghostFor = null;
  const note = noter(() => render());
  const board = createBoard($('.b-boardhost'), { emptyStyle: 'dark', onTap, onLayout: () => render() });
  ui.board = board;

  // 屏幕方向的字和箭头类名
  const scr = (dir) => board.screenDir(dir);
  const word = (dir) => { const [x, y] = scr(dir).v; return x > 0 ? '右' : x < 0 ? '左' : y > 0 ? '下' : '上'; };
  const arrowCls = (dir) => { const [x, y] = scr(dir).v; return x > 0 ? 'tg-r' : x < 0 ? 'tg-l' : y > 0 ? 'tg-d' : 'tg-u'; };
  const offsetOf = (dir, cells) => { const { v, pitch } = scr(dir); return [v[0] * pitch * cells, v[1] * pitch * cells]; };
  const step = (i, dir, n) => i + STEP[dir] * n;

  // 格 i 所在的牌串能挪过去配上的地方：Map(串头到达的格 → 移动)，只看 dirs 里的方向。
  // 标在串头到达的格上（一定是空位）；按住的那张如果在串中间或串尾，它自己的落点可能还被串里的牌占着。
  function targetsOf(i, dirs = DIRS) {
    const out = new Map();
    for (const dir of dirs) {
      const run = runAt(i, dir);
      for (const d of matchDists(run)) out.set(step(run.head, dir, d), { ...run, dist: d });
    }
    return out;
  }

  // ---------- 点牌 ----------
  async function onTap(i) {
    if (suppress) { suppress = false; return; }
    if (busy) return;
    if (choosing) return chooseTap(i);
    if (V.targets && sel.length) {
      const m = targetsOf(sel[0]).get(i);
      if (m) return runMove(m, null);
    }
    if (i < 0 || isEmpty(i)) { sel = []; return render(); }
    if (!sel.length) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (!sameKind(a, i)) { sel = [i]; return render(); } // 不是同牌：选中换到新点的这张
    const p = pathOf(a, i);
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
      board.drawPath(p, 'b-line', 320);
      await sleep(160);
      await board.animate([a, i], 'anim-flip1', 110);
      busy = false;
      note.clear();
      flip(a, i);
      board.animate([a, i], 'anim-flip2', 120);
      return;
    }
    sel = [i];
    render();
    board.animate([a, i], 'anim-shake', 300);
    note.say('连不上：连线最多拐一次弯，途经的格必须是空位', 'warn');
  }

  // ---------- 移动 ----------
  // m = { dirIndex, head, len, cells, dist }。residual：拖动松手时浮层离目标还差的偏移；null 表示从原处滑过去
  async function runMove(m, residual) {
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

  async function finish(pair) {
    busy = true;
    choosing = null;
    render();
    const a = pair.to, b = pair.partner;
    if (V.fx === 'line') {
      board.drawPath([a, b], 'b-line', 320);
      await sleep(160);
    } else await board.animate([a, b], 'anim-match', 260);
    await board.animate([a, b], 'anim-flip1', 110);
    busy = false;
    commitMove(pair);
    board.animate([a, b], 'anim-flip2', 120);
  }

  async function cancelChoose(say = true) {
    const m = choosing.m;
    choosing = null;
    cancelMove();
    busy = true;
    await board.slideIn(m.cells, ...offsetOf(m.dirIndex, m.dist), 180);
    busy = false;
    if (say) note.say('没选配法，这次移动作废，牌串退回原处');
  }

  function chooseTap(i) {
    const ps = choosing.pairs;
    const byTo = ps.filter((p) => p.to === i);
    const p = ps.find((x) => x.partner === i) ?? (byTo.length === 1 ? byTo[0] : null);
    if (p) finish(p);
    else cancelChoose();
  }

  // ---------- 拖动（E、G） ----------
  function onDown(e) {
    suppress = false;
    if (!V.drag || busy || choosing || e.button > 0) return;
    const t = e.target.closest('.tile');
    if (!t || t.dataset.i == null) return;
    const i = +t.dataset.i;
    if (isEmpty(i)) return;
    drag = { id: e.pointerId, i, x0: e.clientX, y0: e.clientY, axis: null, k: 0 };
    if (V.drag === 'snap') {
      drag.marks = targetsOf(i);
      render();
    }
  }

  function startDrag(axis) {
    const D = drag;
    D.axis = axis;
    suppress = true;
    try { board.el.setPointerCapture(D.id); } catch {}
    sel = [];
    laiziMode = false;
    note.clear();
    for (const dir of DIRS) {
      const [x, y] = scr(dir).v;
      const sgn = axis === 'x' ? x : y;
      if (sgn > 0) D.pos = runAt(D.i, dir);
      else if (sgn < 0) D.neg = runAt(D.i, dir);
    }
    D.pitch = scr(D.pos.dirIndex).pitch;
    D.cells = D.pos.cells;
    if (!D.pos.gap && !D.neg.gap) {
      D.dead = true;
      board.animate(D.cells, 'anim-shake', 300);
      note.say('这一串前后都没有空位，挪不动', 'warn');
      return;
    }
    D.stopsPos = matchDists(D.pos);
    D.stopsNeg = matchDists(D.neg);
    if (V.drag === 'snap') D.marks = targetsOf(D.i, [D.pos.dirIndex, D.neg.dirIndex]);
    D.fl = board.float(D.cells);
    render();
  }

  const setFloat = (off, ms = 0, ease) => drag.fl.set(drag.axis === 'x' ? off : 0, drag.axis === 'y' ? off : 0, ms, ease);

  function onMove(e) {
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
    if (V.drag === 'free') {
      D.off = clamp(raw, -D.neg.gap * D.pitch, D.pos.gap * D.pitch);
      D.k = Math.round(D.off / D.pitch);
      setFloat(D.off);
    } else {
      // 吸附：只停在能配上的格；这一边没有能配上的格就拽住
      const stops = raw >= 0 ? D.stopsPos : D.stopsNeg, sgn = raw >= 0 ? 1 : -1, u = Math.abs(raw) / D.pitch;
      let best = 0, bd = u;
      for (const d of stops) if (Math.abs(u - d) < bd) { bd = Math.abs(u - d); best = d; }
      D.k = sgn * best;
      D.refuse = !stops.length && u > 0.5;
      const shown = best ? sgn * best * D.pitch : stops.length ? 0 : sgn * Math.min(Math.abs(raw) * 0.22, D.pitch * 0.35);
      if (best !== Math.abs(prevK) || !best) setFloat(shown, best ? 90 : 0);
      D.off = shown;
    }
    if (D.k !== prevK || D.refuse !== prevRefuse) render();
  }

  async function onUp(e) {
    const D = drag;
    if (!D || e.pointerId !== D.id) return;
    drag = null;
    if (!D.axis || D.dead) return render();
    const k = e.type === 'pointercancel' ? 0 : D.k;
    const side = k > 0 ? D.pos : D.neg, dist = Math.abs(k);
    const pairs = k ? pairsFor(side.dirIndex, side.head, dist) : [];
    if (!pairs.length) {
      busy = true;
      render();
      await D.fl.set(0, 0, k ? 280 : 150, k ? 'cubic-bezier(.3,1.7,.5,1)' : 'ease-out');
      D.fl.drop();
      busy = false;
      if (k) note.say('没配上，弹回去了：移完要让串里一张牌和一张没动的同牌直线对上，中间不能隔着牌', 'warn', 3200);
      else render();
      return;
    }
    const r = D.off - k * D.pitch;
    D.fl.drop();
    runMove({ ...side, dist }, D.axis === 'x' ? [r, 0] : [0, r]);
  }

  board.el.addEventListener('pointerdown', onDown);
  board.el.addEventListener('pointermove', onMove);
  board.el.addEventListener('pointerup', onUp);
  board.el.addEventListener('pointercancel', onUp);

  // ---------- 侧栏卡片 ----------
  const hintMove = () => (game.hint?.type === 'move' ? game.hint : null);

  function card() {
    if (game.won) return { tone: 'good', text: `<b>全部翻完！</b><br>用时 ${fmtTime(elapsed())}<br>步数 ${game.steps}<br>已用赖子 ${game.laiziUsed}<br>已用提示 ${game.hintsUsed}<br>难度 ${tierName(game.diff)}`, actions: [['新局', 'new']] };
    if (choosing) {
      const n = choosing.pairs.length;
      if (V.choose === 'board') return { tone: 'choose', text: `<b>有 ${n} 种配法</b>：点一张亮着的牌，翻掉它那一对。<br>点别处或按「撤回」就作废，牌串退回去。` };
      if (V.choose === 'rail')
        return {
          tone: 'choose', text: `<b>有 ${n} 种配法</b>，选一对翻掉（编号和棋盘上的对应）：`,
          actions: [...choosing.pairs.map((p, j) => [`${NUMS[j]} ${mini(p.partner)}`, `pick${j}`]), ['取消', 'cancel']],
        };
      return { tone: 'choose', text: `<b>有 ${n} 种配法</b>：在牌旁边的气泡里点一个编号。<br>点别处作废，牌串退回去。` };
    }
    if (drag?.fl && !drag.dead) {
      const D = drag, side = D.k > 0 ? D.pos : D.neg;
      if (D.refuse) return { tone: 'warn', text: '这个方向挪过去配不上同牌。' };
      if (D.k) {
        const ps = pairsFor(side.dirIndex, side.head, Math.abs(D.k));
        if (ps.length > 1) return { tone: 'good', text: `松手后有 ${ps.length} 种配法，要选一对。` };
        if (ps.length) return { tone: 'good', text: '松手就翻掉亮着的这一对。' };
        return { tone: 'warn', text: '停在这里配不上，松手会弹回去。' };
      }
      return { tone: 'idle', text: V.drag === 'snap' ? '拖到亮着的格上松手。' : '横着或竖着拖，整串牌一起走。' };
    }
    if (game.thinking) return { tone: 'info', text: '正在找提示…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '<b>局面已经无解</b><br>前面有一步走错了。', actions: game.hint.back ? [[`撤回到走错之前（退 ${game.hint.back} 步）`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (laiziMode) return { tone: 'laizi', text: '<b>赖子</b>：点两张同牌，不看连线直接翻掉。<br>再按一次「赖子」取消。' };
    if (game.deadlock) return { tone: 'bad', text: V.dead, actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    if (game.hint?.type === 'pair') return { tone: 'good', text: '提示：▼ 标出的这一对可以翻，翻完仍然有解。' };
    const h = hintMove();
    if (h) return { tone: 'good', text: V.hintText(word(h.m.dirIndex), h.m.dist, h.m.len) };
    if (V.targets && sel.length && targetsOf(sel[0]).size) return { tone: 'idle', text: '点亮着的同牌翻掉，或者点空位上的箭头，把这串牌挪过去配上。' };
    return { tone: 'idle', text: V.idle };
  }

  // ---------- 画 ----------
  function render() {
    const deco = { sel: new Set(sel), same: new Set(), hint: new Set(), stop: new Set(), tg: new Set(), cand: new Set(), dest: new Set(), 'hint-ring': new Set(), 'hint-tg': new Set(), 'hint-run': new Set() };
    for (const c of ['tg-r', 'tg-l', 'tg-u', 'tg-d', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']) deco[c] = new Set();
    const cls = [];
    if (sel.length) {
      cls.push('has-sel');
      for (let i = 0; i < game.board.length; i++) if (game.board[i] === game.board[sel[0]]) deco.same.add(i);
    }
    if (laiziMode) cls.push('laizi-mode');
    const mark = (cell, arrow, extra) => {
      deco.tg.add(cell);
      deco[arrow].add(cell);
      if (extra) deco[extra].add(cell);
    };
    board.clearPaths('pv-line');
    board.clearPaths('hint-arrow');

    // F：选中一张时标出它能挪过去配上的格
    if (V.targets && sel.length && !choosing) for (const [cell, m] of targetsOf(sel[0])) mark(cell, arrowCls(m.dirIndex));

    // 拖动中
    const D = drag;
    if (D && !D.dead) {
      if (V.drag === 'free' && D.fl) {
        for (const side of [D.pos, D.neg]) for (let d = 1; d <= side.gap; d++) deco.stop.add(step(side.head, side.dirIndex, d));
      }
      if (D.marks) for (const [cell, m] of D.marks) mark(cell, arrowCls(m.dirIndex));
      if (D.fl) {
        for (const c of D.cells) D.fl.mark(c, 'cand', false);
        if (D.k) {
          const side = D.k > 0 ? D.pos : D.neg;
          for (const p of pairsFor(side.dirIndex, side.head, Math.abs(D.k))) {
            deco.cand.add(p.partner);
            D.fl.mark(p.from, 'cand', true);
            if (V.fx === 'line') board.drawPath([p.to, p.partner], 'pv-line');
          }
        }
        cls.push('dragging');
        if (D.refuse) cls.push('refuse');
      }
    }

    // 多种配法
    if (choosing) {
      cls.push('choosing');
      choosing.pairs.forEach((p, j) => {
        deco.cand.add(p.partner);
        deco.cand.add(p.to);
        if (V.choose !== 'board') deco['n' + (j + 1)]?.add(p.partner);
        board.drawPath([p.to, p.partner], 'pv-line');
      });
    }

    // 提示
    if (game.hint?.type === 'pair') { deco.hint.add(game.hint.a); deco.hint.add(game.hint.b); }
    const h = !choosing && !D?.fl ? hintMove() : null;
    if (h) {
      const { m, pair } = h;
      if (V.hint === 'arrow') {
        deco.hint.add(pair.from);
        deco.hint.add(pair.partner);
        for (const c of m.cells) deco['hint-run'].add(c);
        for (const c of destCells(m)) deco.dest.add(c);
        board.drawArrow(board.center(pair.from), board.center(pair.to), 'hint-arrow');
      } else if (V.hint === 'taps') {
        deco.hint.add(pair.from);
        deco['hint-ring'].add(pair.partner);
        mark(step(m.head, m.dirIndex, m.dist), arrowCls(m.dirIndex), 'hint-tg');
      } else if (V.hintTri) {
        deco.hint.add(pair.from);
        deco.hint.add(pair.partner);
      } else deco['hint-ring'].add(pair.partner);
    }
    board.update(deco, cls);
    syncGhost(V.hint === 'ghost' && !busy ? h : null);

    // 侧栏
    const put = (k, v) => root.querySelectorAll(`[data-k="${k}"]`).forEach((e) => (e.textContent = v));
    put('time', fmtTime(elapsed()));
    put('steps', game.steps);
    put('laizi', game.laiziUsed);
    put('hints', game.hintsUsed);
    put('diff', tierName(game.diff));
    const m = card();
    $('.b-msg').innerHTML = `<div class="b-card tone-${m.tone}"><div>${m.text}</div>${m.actions ? `<div class="b-acts">${m.actions.map(([l, a]) => `<button data-act="${a}">${l}</button>`).join('')}</div>` : ''}</div>`;
    $('.b-laizi').classList.toggle('on', laiziMode);
    $('.b-hint .lb').textContent = game.thinking ? '思考中' : '提示';
    placePop();
  }

  // G：提示的虚影
  function syncGhost(h) {
    const key = h ? `${board.dims().orient}:${board.dims().tw}` : null;
    if (h === ghostFor?.h && key === ghostFor?.key) return;
    ghostOff?.();
    ghostOff = null;
    ghostFor = h ? { h, key } : null;
    if (h) ghostOff = board.ghost(h.m.cells, ...offsetOf(h.m.dirIndex, h.m.dist));
  }

  // G：多种配法的气泡，放在牌串旁边
  function placePop() {
    const pop = $('.g-pop');
    const show = choosing && V.choose === 'pop';
    pop.hidden = !show;
    if (!show) return;
    pop.innerHTML = choosing.pairs.map((p, j) => `<button data-act="pick${j}">${NUMS[j]} ${mini(p.partner)}</button>`).join('') + `<button class="x" data-act="cancel">✕</button>`;
    const R = root.getBoundingClientRect();
    const rs = destCells(choosing.m).map((c) => board.tileRect(c));
    const l = Math.min(...rs.map((r) => r.left)), r = Math.max(...rs.map((r) => r.right));
    const t = Math.min(...rs.map((r) => r.top)), b = Math.max(...rs.map((r) => r.bottom));
    const w = pop.offsetWidth, ph = pop.offsetHeight;
    let y = t - R.top - ph - 10;
    if (y < 4) y = b - R.top + 10;
    pop.style.left = clamp((l + r) / 2 - R.left - w / 2, 4, R.width - w - 4) + 'px';
    pop.style.top = y + 'px';
  }

  // ---------- 按钮 ----------
  const acts = {
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
      if (h.type === 'move') {
        busy = true;
        await board.slideIn(h.move.cells, ...offsetOf(h.move.dirIndex, h.move.dist), 180);
        busy = false;
      }
    },
    laizi: async () => {
      if (busy) return;
      if (choosing) await cancelChoose(false);
      laiziMode = !laiziMode;
      note.clear();
      render();
    },
    cancel: () => !busy && choosing && cancelChoose(),
    back: () => undoTimes(game.hint.back),
    // 新局面板：先退掉进行到一半的操作（配法作废、赖子模式、正在想的提示），再打开
    new: async () => {
      if (busy) return;
      if (choosing) await cancelChoose(false);
      laiziMode = false;
      sel = [];
      if (game.thinking) { game.thinking = false; game.version++; }
      ngPick = game.diff;
      $('.ng-custom').hidden = tierName(ngPick) !== '自定义';
      $('.ng-range').value = ngPick;
      $('.ng-warn').hidden = !(game.steps > 0 && !game.won);
      ngSync();
      $('.ng-mask').hidden = false;
      render();
    },
    ngclose: () => ($('.ng-mask').hidden = true),
    tier: () => {},
    ngcustom: () => {
      $('.ng-custom').hidden = !$('.ng-custom').hidden;
      $('.ng-range').value = ngPick;
    },
    nggo: () => {
      $('.ng-mask').hidden = true;
      newGame({ diff: ngPick });
    },
    rules: () => note.say(RULES, 'info', 20000),
  };
  let ngPick = 1;
  function ngSync() {
    root.querySelectorAll('[data-act="tier"]').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.d - ngPick) < 0.005));
    $('.ng-ctog').classList.toggle('on', tierName(ngPick) === '自定义');
  }
  $('.ng-range').addEventListener('input', () => {
    ngPick = snapTier(+$('.ng-range').value);
    ngSync();
  });
  $('.ng-mask').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) $('.ng-mask').hidden = true;
  });
  root.querySelectorAll('[data-act="tier"]').forEach((b) => b.addEventListener('click', () => {
    ngPick = +b.dataset.d;
    $('.ng-range').value = ngPick;
    ngSync();
  }));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a.startsWith('pick')) {
      if (!busy && choosing) finish(choosing.pairs[+a.slice(4)]);
    } else acts[a]?.();
  });

  const unsub = subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    render();
  });
  const tick = setInterval(() => {
    const put = (k, v) => root.querySelectorAll(`[data-k="${k}"]`).forEach((e) => (e.textContent = v));
    put('time', fmtTime(elapsed()));
  }, 1000);
  render();
  return () => {
    unsub();
    clearInterval(tick);
    note.stop();
    ghostOff?.();
    if (game.pending) cancelMove();
    board.destroy();
  };
}

export const mountE = (app) => mountMove(app, 'E');
export const mountF = (app) => mountMove(app, 'F');
export const mountG = (app) => mountMove(app, 'G');
export const mountH = (app) => mountMove(app, 'H');
