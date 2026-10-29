// 三种界面方案（原型，用完即扔）。规则和计数都在 game.js 里，这里只管长什么样、怎么点。
//   A 顶栏 + 底栏：信息在顶上一条，三个按钮在底下一排，消息条夹在棋盘和按钮之间；翻掉后留空；
//     先选两张同牌、连不上时再按「赖子」。
//   B 侧栏：棋盘旁边一根竖栏，放大号数字、三个按钮和消息卡片；翻掉后显示深色牌背；
//     先按「赖子」进入赖子模式，再点两张同牌。
//   C 全屏 + 浮动：棋盘尽量大，顶上一行小字，三个圆形图标按钮浮在一侧；翻掉后显示淡红牌背；
//     选中一张时其他牌变暗、只有同牌亮着；连不上时就地弹出「用赖子翻掉」。
//   D 定稿：用户选的组合。B 的侧栏、赖子模式、▼ 提示、死局卡片和深色牌背；A 的麻将桌背景；
//     A/C 的点错处理（选中换到新点的牌，同牌连不上时抖一下）和 C 的同牌高亮；画连线；不写素材来源。
//   E/F/G 在 D 上加「移动」的三种操作方式，H 是用户选定的组合，见 move-variants.js。
// A–D 不会移动：提示只给翻牌，死局只看有没有能翻的对（main.js 按 moves 标记切换）。
import { game, ui, subscribe, flip, undo, undoTimes, requestHint, newGame, pathOf, sameKind, isEmpty, elapsed, fmtTime } from './game.js';
import { createBoard, sleep } from './board.js';
import { mountE, mountF, mountG, mountH } from './move-variants.js';

function fillStats(root) {
  const put = (k, v) => root.querySelectorAll(`[data-k="${k}"]`).forEach((e) => (e.textContent = v));
  put('time', fmtTime(elapsed()));
  put('steps', game.steps);
  put('laizi', game.laiziUsed);
  put('hints', game.hintsUsed);
}
const buttons = (actions = []) => actions.map(([label, act]) => `<button data-act="${act}">${label}</button>`).join('');
const wonText = () => `全部翻完！用时 ${fmtTime(elapsed())} · ${game.steps} 步 · 赖子 ${game.laiziUsed} · 提示 ${game.hintsUsed}`;
const hintSet = () => (game.hint?.type === 'pair' ? new Set([game.hint.a, game.hint.b]) : new Set());

// 临时消息：显示 ms 毫秒后自动消失
function noter(render) {
  let note = null, timer = 0;
  return {
    say(text, tone = 'info', ms = 2200) {
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

function wire(root, acts) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && acts[b.dataset.act]) acts[b.dataset.act]();
  });
}

// ---------------------------------------------------------------- A
export function mountA(app) {
  app.innerHTML = `
  <div class="vA">
    <header class="a-top">
      <div class="a-stats"><span>⏱ <b data-k="time"></b></span><span>步数 <b data-k="steps"></b></span></div>
      <div class="a-stats"><span>赖子 <b data-k="laizi"></b></span><span>提示 <b data-k="hints"></b></span><button class="a-about" data-act="about" aria-label="关于">i</button></div>
    </header>
    <main class="a-boardhost"></main>
    <div class="a-strip"></div>
    <nav class="a-tools">
      <button data-act="hint" class="a-hint">提示</button><button data-act="undo">撤回</button><button data-act="laizi" class="a-laizi">赖子</button>
    </nav>
    <div class="a-modal" hidden><div class="a-card"><p>翻麻将（原型）</p><p>牌面素材：FluffyStuff/riichi-mahjong-tiles（CC0 公有领域）</p><button data-act="closeAbout">好</button></div></div>
  </div>`;
  const root = app.firstElementChild;
  const $ = (s) => root.querySelector(s);
  let sel = [], blocked = false, busy = false;
  const note = noter(() => render());
  const board = createBoard($('.a-boardhost'), { emptyStyle: 'blank', onTap, onLayout: () => render() });
  ui.board = board;

  async function onTap(i) {
    if (busy) return;
    if (i < 0 || isEmpty(i)) { sel = []; blocked = false; return render(); }
    if (sel.length === 2) {
      sel = sel.includes(i) ? sel.filter((x) => x !== i) : [i];
      blocked = false;
      return render();
    }
    if (sel.length === 0) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (!sameKind(a, i)) { sel = [i]; return render(); } // 不是同牌：选中改到新点的这张
    const p = pathOf(a, i);
    if (p) {
      sel = [];
      busy = true;
      render();
      board.drawPath(p, 'a-line', 300);
      await sleep(150);
      await board.animate([a, i], 'anim-fade', 160);
      busy = false;
      note.clear();
      flip(a, i);
      return;
    }
    sel = [a, i];
    blocked = true;
    render();
    board.animate([a, i], 'anim-shake', 300);
    note.say('这两张连不上 · 想直接翻掉可以按「赖子」', 'warn', 3500);
  }

  async function onLaizi() {
    if (busy) return;
    if (sel.length === 2 && sameKind(sel[0], sel[1])) {
      const [a, b] = sel;
      sel = [];
      blocked = false;
      busy = true;
      note.clear();
      render();
      await board.animate([a, b], 'anim-sparkle', 320);
      busy = false;
      flip(a, b, { laizi: true });
      return;
    }
    note.say(sel.length === 1 ? '再点一张同牌；连不上时再按「赖子」' : '先点两张同牌，再按「赖子」');
  }

  function strip() {
    if (game.won) return { tone: 'good', text: wonText(), actions: [['再来一局', 'new']] };
    if (game.thinking) return { tone: 'info', text: '正在找提示…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '局面已经无解', actions: game.hint.back ? [[`撤回到走错之前（退 ${game.hint.back} 步）`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (game.deadlock) return { tone: 'bad', text: '没有能翻的牌了', actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    if (game.hint?.type === 'pair') return { tone: 'good', text: '提示：亮绿框的这一对可以翻' };
    return null;
  }

  function render() {
    const s = new Set(sel);
    board.update({ sel: s, hint: hintSet(), blocked: blocked ? s : null });
    board.clearPaths('a-hintline');
    if (game.hint?.type === 'pair') {
      const p = pathOf(game.hint.a, game.hint.b);
      if (p) board.drawPath(p, 'a-hintline');
    }
    fillStats(root);
    const m = strip();
    const el = $('.a-strip');
    el.className = 'a-strip' + (m ? ` tone-${m.tone}` : '');
    el.innerHTML = m ? `<span>${m.text}</span>${buttons(m.actions)}` : '';
    $('.a-laizi').classList.toggle('pulse', blocked);
    $('.a-hint').textContent = game.thinking ? '提示…' : '提示';
  }

  wire(root, {
    hint: () => !busy && requestHint(),
    undo: () => {
      if (busy) return;
      sel = [];
      blocked = false;
      note.clear();
      if (!undo()) note.say('已经退到开局了');
    },
    laizi: onLaizi,
    back: () => undoTimes(game.hint.back),
    new: () => newGame(),
    about: () => ($('.a-modal').hidden = false),
    closeAbout: () => ($('.a-modal').hidden = true),
  });
  const unsub = subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    if (sel.length < 2) blocked = false;
    render();
  });
  const tick = setInterval(() => fillStats(root), 1000);
  render();
  return () => { unsub(); clearInterval(tick); note.stop(); board.destroy(); };
}

// ---------------------------------------------------------------- B
export function mountB(app) {
  app.innerHTML = `
  <div class="vB">
    <main class="b-boardhost"></main>
    <aside class="b-rail">
      <div class="b-stats">
        <div class="b-stat"><small>用时</small><b data-k="time"></b></div>
        <div class="b-stat"><small>步数</small><b data-k="steps"></b></div>
        <div class="b-stat"><small>已用赖子</small><b data-k="laizi"></b></div>
        <div class="b-stat"><small>已用提示</small><b data-k="hints"></b></div>
      </div>
      <div class="b-btns">
        <button class="b-btn b-hint" data-act="hint"><span class="ic">💡</span><span class="lb">提示</span></button>
        <button class="b-btn" data-act="undo"><span class="ic">↶</span><span class="lb">撤回</span></button>
        <button class="b-btn b-laizi" data-act="laizi"><span class="ic"><i class="ic-laizi"></i></span><span class="lb">赖子</span></button>
      </div>
      <div class="b-msg"></div>
      <footer class="b-credit">牌面：FluffyStuff · CC0</footer>
    </aside>
  </div>`;
  const root = app.firstElementChild;
  const $ = (s) => root.querySelector(s);
  let sel = [], laiziMode = false, busy = false;
  const note = noter(() => render());
  const board = createBoard($('.b-boardhost'), { emptyStyle: 'dark', onTap, onLayout: () => render() });
  ui.board = board;

  async function onTap(i) {
    if (busy) return;
    if (i < 0 || isEmpty(i)) { sel = []; return render(); }
    if (!sel.length) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (laiziMode) {
      if (sameKind(a, i)) {
        sel = [];
        laiziMode = false;
        busy = true;
        render();
        await board.animate([a, i], 'anim-sparkle', 320);
        busy = false;
        flip(a, i, { laizi: true });
        return;
      }
      sel = [];
      render();
      board.animate([a, i], 'anim-red', 360);
      return note.say('赖子也只能翻同牌', 'warn');
    }
    const p = pathOf(a, i);
    if (p) {
      sel = [];
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
    sel = [];
    render();
    board.animate([a, i], 'anim-red', 360);
    note.say(sameKind(a, i) ? '连不上：连线最多拐一次弯，途经的格必须是空位' : '不是同牌', 'warn');
  }

  function card() {
    if (game.won) return { tone: 'good', text: wonText(), actions: [['再来一局', 'new']] };
    if (game.thinking) return { tone: 'info', text: '正在找提示…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '<b>局面已经无解</b><br>前面有一步走错了。', actions: game.hint.back ? [[`撤回到走错之前（退 ${game.hint.back} 步）`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (laiziMode) return { tone: 'laizi', text: '<b>赖子</b>：点两张同牌，不看连线直接翻掉。<br>再按一次「赖子」取消。' };
    if (game.deadlock) return { tone: 'bad', text: '<b>没有能翻的牌了</b>', actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    if (game.hint?.type === 'pair') return { tone: 'good', text: '提示：▼ 标出的这一对可以翻，翻完仍然有解。' };
    return { tone: 'idle', text: '点两张能连上的同牌翻掉。连线横竖走，最多拐一次弯。' };
  }

  function render() {
    board.update({ sel: new Set(sel), hint: hintSet() }, laiziMode ? ['laizi-mode'] : []);
    fillStats(root);
    const m = card();
    $('.b-msg').innerHTML = `<div class="b-card tone-${m.tone}"><div>${m.text}</div>${m.actions ? `<div class="b-acts">${buttons(m.actions)}</div>` : ''}</div>`;
    $('.b-laizi').classList.toggle('on', laiziMode);
    $('.b-hint .lb').textContent = game.thinking ? '思考中' : '提示';
  }

  wire(root, {
    hint: () => !busy && requestHint(),
    undo: () => {
      if (busy) return;
      sel = [];
      laiziMode = false;
      note.clear();
      if (!undo()) note.say('已经退到开局了');
    },
    laizi: () => {
      if (busy) return;
      laiziMode = !laiziMode;
      sel = [];
      note.clear();
      render();
    },
    back: () => undoTimes(game.hint.back),
    new: () => newGame(),
  });
  const unsub = subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    render();
  });
  const tick = setInterval(() => fillStats(root), 1000);
  render();
  return () => { unsub(); clearInterval(tick); note.stop(); board.destroy(); };
}

// ---------------------------------------------------------------- C
export function mountC(app) {
  app.innerHTML = `
  <div class="vC">
    <div class="c-top"></div>
    <main class="c-boardhost"></main>
    <nav class="c-dock">
      <button data-act="hint" class="c-hint" aria-label="提示">💡</button>
      <button data-act="undo" aria-label="撤回">↶</button>
      <button data-act="laizi" aria-label="赖子"><i class="ic-laizi"></i></button>
    </nav>
    <div class="c-pop" hidden>连不上 <button data-act="popLaizi" class="c-pop-main">用赖子翻掉</button><button data-act="popCancel">算了</button></div>
  </div>`;
  const root = app.firstElementChild;
  const $ = (s) => root.querySelector(s);
  let sel = [], blocked = false, busy = false, spot = false, lastHint = null;
  const note = noter(() => render());
  const board = createBoard($('.c-boardhost'), { emptyStyle: 'ghost', onTap, onLayout: () => render() });
  ui.board = board;

  async function onTap(i) {
    if (busy) return;
    if (i < 0 || isEmpty(i)) { sel = []; blocked = false; return render(); }
    if (blocked) {
      sel = sel.includes(i) ? [] : [i];
      blocked = false;
      return render();
    }
    if (!sel.length) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (!sameKind(a, i)) { sel = [i]; return render(); }
    const p = pathOf(a, i);
    if (p) {
      sel = [];
      busy = true;
      render();
      await board.animate([a, i], 'anim-pop', 170);
      busy = false;
      note.clear();
      flip(a, i);
      return;
    }
    sel = [a, i];
    blocked = true;
    render();
  }

  async function laiziFlip() {
    const [a, b] = sel;
    sel = [];
    blocked = false;
    busy = true;
    render();
    await board.animate([a, b], 'anim-sparkle', 320);
    busy = false;
    flip(a, b, { laizi: true });
  }

  function top() {
    if (game.won) return { tone: 'good', text: wonText(), actions: [['再来一局', 'new']] };
    if (game.thinking) return { tone: 'info', text: '找提示中…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '已经无解', actions: game.hint.back ? [[`撤回到走错之前 · 退 ${game.hint.back} 步`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (game.deadlock) return { tone: 'bad', text: '没有能翻的牌了', actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    return null;
  }

  function placePop() {
    const pop = $('.c-pop');
    pop.hidden = !blocked;
    if (!blocked) return;
    const R = root.getBoundingClientRect();
    const [ra, rb] = sel.map((i) => board.tileRect(i));
    const cx = (ra.left + ra.right + rb.left + rb.right) / 4 - R.left;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let y = Math.min(ra.top, rb.top) - R.top - h - 8;
    if (y < 4) y = Math.max(ra.bottom, rb.bottom) - R.top + 8;
    pop.style.left = Math.max(4, Math.min(R.width - w - 4, cx - w / 2)) + 'px';
    pop.style.top = y + 'px';
  }

  function render() {
    const same = new Set();
    if (sel.length) for (let i = 0; i < game.board.length; i++) if (game.board[i] === game.board[sel[0]]) same.add(i);
    const cls = [];
    if (sel.length) cls.push('has-sel');
    if (spot) cls.push('spot');
    board.update({ sel: new Set(sel), same, hint: hintSet() }, cls);
    const m = top();
    $('.c-top').innerHTML = m
      ? `<div class="c-card tone-${m.tone}"><span>${m.text}</span>${buttons(m.actions)}</div>`
      : `<div class="c-hud">⏱ ${fmtTime(elapsed())} · ${game.steps} 步 · 赖子 ${game.laiziUsed} · 提示 ${game.hintsUsed}</div>`;
    $('.c-hint').classList.toggle('spin', game.thinking);
    placePop();
  }

  wire(root, {
    hint: () => !busy && requestHint(),
    undo: () => {
      if (busy) return;
      sel = [];
      blocked = false;
      note.clear();
      if (!undo()) note.say('已经退到开局了');
    },
    laizi: () => {
      if (busy) return;
      if (blocked) return laiziFlip();
      note.say('点两张连不上的同牌，就能用赖子翻掉');
    },
    popLaizi: () => !busy && laiziFlip(),
    popCancel: () => { sel = []; blocked = false; render(); },
    back: () => undoTimes(game.hint.back),
    new: () => newGame(),
  });
  const unsub = subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    if (sel.length < 2) blocked = false;
    if (game.hint !== lastHint && game.hint?.type === 'pair') {
      spot = true;
      setTimeout(() => { spot = false; render(); }, 1400);
    }
    lastHint = game.hint;
    render();
  });
  const tick = setInterval(() => !top() && render(), 1000);
  render();
  return () => { unsub(); clearInterval(tick); note.stop(); board.destroy(); };
}

// ---------------------------------------------------------------- D 定稿
export function mountD(app) {
  app.innerHTML = `
  <div class="vB vD">
    <main class="b-boardhost"></main>
    <aside class="b-rail">
      <div class="b-stats">
        <div class="b-stat"><small>用时</small><b data-k="time"></b></div>
        <div class="b-stat"><small>步数</small><b data-k="steps"></b></div>
        <div class="b-stat"><small>已用赖子</small><b data-k="laizi"></b></div>
        <div class="b-stat"><small>已用提示</small><b data-k="hints"></b></div>
      </div>
      <div class="b-btns">
        <button class="b-btn b-hint" data-act="hint"><span class="ic">💡</span><span class="lb">提示</span></button>
        <button class="b-btn" data-act="undo"><span class="ic">↶</span><span class="lb">撤回</span></button>
        <button class="b-btn b-laizi" data-act="laizi"><span class="ic"><i class="ic-laizi"></i></span><span class="lb">赖子</span></button>
      </div>
      <div class="b-msg"></div>
    </aside>
  </div>`;
  const root = app.firstElementChild;
  const $ = (s) => root.querySelector(s);
  let sel = [], laiziMode = false, busy = false;
  const note = noter(() => render());
  const board = createBoard($('.b-boardhost'), { emptyStyle: 'dark', onTap, onLayout: () => render() });
  ui.board = board;

  async function onTap(i) {
    if (busy) return;
    if (i < 0 || isEmpty(i)) { sel = []; return render(); }
    if (!sel.length) { sel = [i]; return render(); }
    const a = sel[0];
    if (a === i) { sel = []; return render(); }
    if (!sameKind(a, i)) { sel = [i]; return render(); } // 不是同牌：选中换到新点的这张
    const p = pathOf(a, i);
    // 赖子模式里连不上的同牌用赖子翻；本来就能连上的走下面的普通翻牌，不记赖子
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
    // 同牌连不上：两张一起抖，选中换到新点的这张
    sel = [i];
    render();
    board.animate([a, i], 'anim-shake', 300);
    note.say('连不上：连线最多拐一次弯，途经的格必须是空位', 'warn');
  }

  function card() {
    if (game.won) return { tone: 'good', text: wonText(), actions: [['再来一局', 'new']] };
    if (game.thinking) return { tone: 'info', text: '正在找提示…' };
    if (game.hint?.type === 'unsolvable')
      return { tone: 'warn', text: '<b>局面已经无解</b><br>前面有一步走错了。', actions: game.hint.back ? [[`撤回到走错之前（退 ${game.hint.back} 步）`, 'back']] : [] };
    const n = note.get();
    if (n) return n;
    if (laiziMode) return { tone: 'laizi', text: '<b>赖子</b>：点两张同牌，不看连线直接翻掉。<br>再按一次「赖子」取消。' };
    if (game.deadlock) return { tone: 'bad', text: '<b>没有能翻的牌了</b>', actions: [['撤回', 'undo'], ['赖子', 'laizi'], ['提示', 'hint']] };
    if (game.hint?.type === 'pair') return { tone: 'good', text: '提示：▼ 标出的这一对可以翻，翻完仍然有解。' };
    return { tone: 'idle', text: '点两张能连上的同牌翻掉。连线横竖走，最多拐一次弯。' };
  }

  function render() {
    const same = new Set();
    if (sel.length) for (let i = 0; i < game.board.length; i++) if (game.board[i] === game.board[sel[0]]) same.add(i);
    const cls = [];
    if (sel.length) cls.push('has-sel');
    if (laiziMode) cls.push('laizi-mode');
    board.update({ sel: new Set(sel), same, hint: hintSet() }, cls);
    fillStats(root);
    const m = card();
    $('.b-msg').innerHTML = `<div class="b-card tone-${m.tone}"><div>${m.text}</div>${m.actions ? `<div class="b-acts">${buttons(m.actions)}</div>` : ''}</div>`;
    $('.b-laizi').classList.toggle('on', laiziMode);
    $('.b-hint .lb').textContent = game.thinking ? '思考中' : '提示';
  }

  wire(root, {
    hint: () => !busy && requestHint(),
    undo: () => {
      if (busy) return;
      sel = [];
      laiziMode = false;
      note.clear();
      if (!undo()) note.say('已经退到开局了');
    },
    laizi: () => {
      if (busy) return;
      laiziMode = !laiziMode;
      note.clear();
      render();
    },
    back: () => undoTimes(game.hint.back),
    new: () => newGame(),
  });
  const unsub = subscribe(() => {
    sel = sel.filter((i) => !isEmpty(i));
    render();
  });
  const tick = setInterval(() => fillStats(root), 1000);
  render();
  return () => { unsub(); clearInterval(tick); note.stop(); board.destroy(); };
}

// hidden：浮条的 ◀ ▶ 不经过它，只能用 ?variant= 打开
export const VARIANTS = [
  { key: 'A', name: '顶栏+底栏', mount: mountA, hidden: true },
  { key: 'B', name: '侧栏', mount: mountB, hidden: true },
  { key: 'C', name: '全屏+浮动', mount: mountC, hidden: true },
  { key: 'D', name: '定稿（不会移动）', mount: mountD },
  { key: 'E', name: '移动·拖动', mount: mountE, moves: true },
  { key: 'F', name: '移动·点选', mount: mountF, moves: true },
  { key: 'G', name: '移动·吸附', mount: mountG, moves: true },
  { key: 'H', name: '移动定稿', mount: mountH, moves: true },
];
