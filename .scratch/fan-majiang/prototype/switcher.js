// 原型浮条和原型设置面板（不属于要评估的界面，用完即扔）。
// 浮条：◀ ▶ 或键盘 ← → 切换方案，网址里的 ?variant= 跟着变，刷新后还在同一个方案。
// 浮条挡住东西时，按住 ⠿ 拖到别处，或者按 ▾ 收起。
// 设置面板：难度滑条、牌身渲染方式、白板加框、横竖屏、求解器测速、调试按钮、当前状态。
// ◀ ▶ 只在没标 hidden 的方案之间切（D 和 E/F/G）；A/B/C 要用 ?variant= 打开。
import { game, settings, ui, emit, subscribe, newGame, diffLabel, onPath, playToDeadlock, fastForward, demoMoveHint, runBench, fmtTime, elapsed } from './game.js';
import { setRenderMode } from './tiles.js';

export function mountProtoBar({ variants, current, onSwitch }) {
  const bar = document.getElementById('proto-bar');
  bar.innerHTML = `
    <span class="pb-drag" title="拖动">⠿</span>
    <button class="pb-prev" title="上一个方案（←）">◀</button>
    <span class="pb-label"></span>
    <button class="pb-next" title="下一个方案（→）">▶</button>
    <select class="pb-skin" title="皮肤（↑ ↓）"></select>
    <button class="pb-gear" title="原型设置">⚙</button>
    <span class="pb-fps"></span>
    <button class="pb-min" title="收起 / 展开">▾</button>`;
  const panel = document.createElement('div');
  panel.className = 'proto-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <h4>原型设置 <small>（不属于游戏界面）</small></h4>
    <section>
      <div>难度 <b class="pp-spread-val"></b> <small>（左半段调 spread 0→1；右半段 spread = 1 再互换 0→68 对牌，最右端约等于随机发牌）</small></div>
      <input type="range" min="0" max="2" step="0.01" class="pp-spread" style="width:100%">
      <div class="row"><small>预设（括号里是 09 号报告里会移动的稳健型模拟玩家遇到死局的比例）：</small></div>
      <div class="row">
        <button data-p="0.75">简单 spread 0.75（6%）</button>
        <button data-p="1">普通 spread 1（15%）</button>
        <button data-p="1.2353">困难 互换 16 对（51%）</button>
      </div>
      <div class="row"><small>对照：</small>
        <button data-p="0">spread 0（1%）</button>
      </div>
      <div class="row">
        <button data-p="1.0588">互换 4 对（26%）</button>
        <button data-p="1.1176">互换 8 对（36%）</button>
        <button data-p="1.4706">互换 32 对（66%）</button>
        <button data-p="2">互换 68 对（77%）</button>
      </div>
      <div class="row">种子 <input class="pp-seed" placeholder="留空随机" size="11"><button class="pp-new primary">按这个难度新开一局</button></div>
    </section>
    <section>
      <div>牌身渲染（看手机卡不卡）</div>
      <label><input type="radio" name="pp-render" value="svg"> SVG 原样（带模糊滤镜）</label>
      <label><input type="radio" name="pp-render" value="nofilter"> SVG 去掉滤镜</label>
      <label><input type="radio" name="pp-render" value="raster"> 先画成位图</label>
      <div class="row"><button class="pp-rbench">测渲染</button></div>
      <pre class="pp-rbench-out"></pre>
    </section>
    <section>
      <label><input type="checkbox" class="pp-haku"> 白板加蓝框</label>
      <div class="row">方向
        <label><input type="radio" name="pp-orient" value="auto"> 自动</label>
        <label><input type="radio" name="pp-orient" value="landscape"> 横 8×17</label>
        <label><input type="radio" name="pp-orient" value="portrait"> 竖 17×8</label>
      </div>
    </section>
    <section>
      <div class="row">求解预算 <input type="number" class="pp-budget" step="10000" min="1000"> 个节点</div>
      <label><input type="checkbox" class="pp-flipfirst"> 提示优先给翻牌（求解器先试所有翻牌，都不行才给移动）</label>
      <div class="row">每档局数 <select class="pp-perk"><option>5</option><option selected>10</option><option>20</option><option>50</option></select><button class="pp-bench">求解器测速</button></div>
      <pre class="pp-bench-out">按当前难度发牌，测「刚发好」和会移动的稳健型玩家走到第 10 / 25 / 40 步时的求解耗时（求解器算上移动）。在后台线程里跑，不卡界面。</pre>
    </section>
    <section>
      <div class="row"><button class="pp-ff20">沿存下的解快进 20 步</button><button class="pp-ff">沿存下的解快进到剩 4 张</button><button class="pp-dead">随机走到卡死（会移动）</button></div>
      <div class="row"><button class="pp-demo">演示：提示一次移动</button><button class="pp-multi">演示：提示一个有多种配法的移动</button></div>
      <pre class="pp-demo-out">演示按钮直接亮出一次移动当提示，不算已用提示，用来看提示画成什么样、多种配法怎么选。</pre>
    </section>
    <section><div>当前状态</div><pre class="pp-state"></pre></section>`;
  document.body.append(panel);
  const $ = (s) => panel.querySelector(s);
  const cycle = variants.filter((v) => !v.hidden);
  const go = (d) => {
    const i = cycle.findIndex((v) => v.key === current());
    onSwitch(cycle[(Math.max(i, 0) + d + cycle.length) % cycle.length].key);
  };

  // 皮肤（「视觉设计」那张票）：body 上挂 skin-xxx，?skin= 跟着变
  const SKINS = [['classic', '经典 绿桌'], ['night', '夜雀'], ['paper', '和纸'], ['candy', '糖果']];
  const skinSel = bar.querySelector('.pb-skin');
  skinSel.innerHTML = SKINS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  function setSkin(k) {
    if (!SKINS.some(([x]) => x === k)) k = 'night'; // 「视觉设计」选定夜雀
    for (const [x] of SKINS) document.body.classList.toggle(`skin-${x}`, x === k);
    skinSel.value = k;
    const url = new URL(location.href);
    url.searchParams.set('skin', k);
    history.replaceState(null, '', url);
    emit();
  }
  skinSel.onchange = () => setSkin(skinSel.value);
  const goSkin = (d) => setSkin(SKINS[(SKINS.findIndex(([x]) => x === skinSel.value) + d + SKINS.length) % SKINS.length][0]);
  setSkin(new URL(location.href).searchParams.get('skin'));

  function label() {
    const v = variants.find((x) => x.key === current());
    bar.querySelector('.pb-label').textContent = `${v.key} ${v.name}`;
    bar.querySelector('.pb-min').textContent = bar.classList.contains('min') ? `${v.key} ▴` : '▾';
  }

  bar.querySelector('.pb-prev').onclick = () => go(-1);
  bar.querySelector('.pb-next').onclick = () => go(1);
  bar.querySelector('.pb-gear').onclick = () => (panel.hidden = !panel.hidden);
  bar.querySelector('.pb-min').onclick = () => {
    bar.classList.toggle('min');
    bar.style.left = bar.style.top = bar.style.transform = '';
    if (bar.classList.contains('min')) panel.hidden = true;
    label();
  };
  if (innerWidth < 700) bar.classList.add('min');
  bar.querySelector('.pb-drag').onpointerdown = (e) => {
    const r = bar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      bar.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx)) + 'px';
      bar.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - dy)) + 'px';
      bar.style.transform = 'none';
    };
    const up = () => removeEventListener('pointermove', move);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  };
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowUp') goSkin(-1);
    if (e.key === 'ArrowDown') goSkin(1);
  });

  // 难度
  const spreadVal = () => +$('.pp-spread').value;
  $('.pp-spread').value = game.diff;
  $('.pp-spread').oninput = () => ($('.pp-spread-val').textContent = diffLabel(spreadVal()));
  panel.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    $('.pp-spread').value = b.dataset.p;
    $('.pp-spread').oninput();
  }));
  $('.pp-spread').oninput();
  $('.pp-new').onclick = () => {
    const s = $('.pp-seed').value.trim();
    newGame({ diff: spreadVal(), ...(s ? { seed: +s | 0 } : {}) });
  };

  // 渲染
  panel.querySelectorAll('[name=pp-render]').forEach((r) => {
    r.checked = r.value === settings.render;
    r.onchange = async () => {
      const ms = await setRenderMode(r.value);
      $('.pp-rbench-out').textContent = `切换到 ${r.value}：准备素材 ${ms.toFixed(0)} ms`;
    };
  });
  $('.pp-rbench').onclick = async () => {
    $('.pp-rbench-out').textContent = '测量中…';
    const r = await ui.board.benchRender();
    $('.pp-rbench-out').textContent =
      `渲染方式 ${settings.render} · 牌宽 ${r.tw}px\n` +
      `重建棋盘到出图：${r.builds.map((x) => x.toFixed(0)).join(' / ')} ms\n` +
      `136 张一起动 1.5 秒：${r.fps.toFixed(0)} fps，P90 帧 ${r.p90.toFixed(1)} ms，最慢帧 ${r.worst.toFixed(1)} ms`;
  };

  $('.pp-haku').checked = settings.hakuFrame;
  $('.pp-haku').onchange = () => {
    settings.hakuFrame = $('.pp-haku').checked;
    emit();
  };
  panel.querySelectorAll('[name=pp-orient]').forEach((r) => {
    r.checked = r.value === settings.orient;
    r.onchange = () => {
      settings.orient = r.value;
      emit();
    };
  });

  // 求解器
  $('.pp-flipfirst').checked = settings.hintFlipFirst;
  $('.pp-flipfirst').onchange = () => (settings.hintFlipFirst = $('.pp-flipfirst').checked);
  $('.pp-budget').value = settings.budget;
  $('.pp-budget').onchange = () => (settings.budget = Math.max(1000, +$('.pp-budget').value || 100000));
  $('.pp-bench').onclick = async () => {
    const out = $('.pp-bench-out');
    $('.pp-bench').disabled = true;
    const perK = +$('.pp-perk').value;
    const r = await runBench({
      perK,
      onProgress: (p) => (out.textContent = `测速中 ${p.done}/${p.total}（第 ${p.k} 对：${p.ms.toFixed(0)} ms，${p.result}）`),
    });
    const f = (x) => x.toFixed(x < 10 ? 1 : 0).padStart(6);
    out.textContent =
      `${diffLabel(game.diff)} · 预算 ${settings.budget} 节点 · 每档 ${perK} 局 · ${settings.hintFlipFirst ? '优先翻牌' : '求解器原样'} · ${r.cores} 核\n` +
      `发牌：平均 ${r.gen.mean.toFixed(1)} ms，最慢 ${r.gen.max.toFixed(1)} ms\n` +
      `局面        平均    P50    P90   最慢 (ms)  有解/无解/超时  第一步是移动\n` +
      r.rows
        .map((x) => `${x.k ? `走到第${String(x.k).padStart(2)}步` : '刚发好　　'}${f(x.mean)} ${f(x.p50)} ${f(x.p90)} ${f(x.max)}    ${x.solvable}/${x.unsolvable}/${x.timeout}         ${x.moveFirst}/${x.n}`)
        .join('\n') +
      `\n${r.ua}`;
    $('.pp-bench').disabled = false;
  };

  // 调试
  $('.pp-dead').onclick = () => {
    if (playToDeadlock() < 0) alert('试了 300 次都通关了，换个更难的牌阵再试');
  };
  const ffFail = () => alert('已经偏离存下的解了，没法快进（先撤回到开局）');
  $('.pp-ff').onclick = () => fastForward({ leave: 4 }) || ffFail();
  $('.pp-ff20').onclick = () => fastForward({ pairs: 20 }) || ffFail();
  const demo = async (multi) => {
    const out = $('.pp-demo-out');
    out.textContent = '找一次移动…';
    const r = await demoMoveHint({ multi });
    out.textContent = r === 'ok' ? `亮出来了：${multi ? '照着做，会出现选配法的界面' : '看侧栏卡片和棋盘'}`
      : r === 'busy' ? '正在移动或局面变了，再按一次'
      : multi ? '这个局面没有多种配法的移动，先多走几步（或快进 20 对）' : '没找到做完仍然有解的移动，先多走几步';
  };
  $('.pp-demo').onclick = () => demo(false);
  $('.pp-multi').onclick = () => demo(true);

  function state() {
    const h = game.hint;
    const dirs = ['上', '下', '左', '右'];
    const hint = !h ? '无' : h.type === 'pair' ? `翻 ${h.a} 和 ${h.b}（${h.source}）`
      : h.type === 'move' ? `移动：串头 ${h.m.head}、${h.m.len} 张，按横屏方向往${dirs[h.m.dirIndex]}走 ${h.m.dist} 格，${h.pair.from}→${h.pair.to} 配 ${h.pair.partner}（${h.source}）`
      : `已经无解，往回 ${h.back} 步有解`;
    $('.pp-state').textContent =
      `方案 ${current()} · 种子 ${game.seed} · ${diffLabel(game.diff)} · 发牌 ${game.genMs.toFixed(1)} ms（发了 ${game.genTries} 次）· 存下的解 ${game.solution.length} 步，其中移动 ${game.solution.filter((x) => x.type === 'move').length} 步\n` +
      `已翻 ${(136 - game.left) / 2}/68 对 · 剩 ${game.left} 张 · 能翻的对 ${game.moveCount} · 能配上的移动 ${game.slideCount} 种（两张以上的串）\n` +
      `用时 ${fmtTime(elapsed())} · 步数 ${game.steps} · 已用赖子 ${game.laiziUsed} · 已用提示 ${game.hintsUsed}\n` +
      `撤回栈 ${game.history.length}（其中移动 ${game.history.filter((x) => x.type === 'move').length}）· 在存下的解上 ${onPath() ? '是' : '否'} · 死局 ${game.deadlock ? '是' : '否'}${ui.moves ? '' : '（只看翻牌）'} · 胜利 ${game.won ? '是' : '否'}\n` +
      `提示：${game.thinking ? '求解中…' : hint}\n` +
      `渲染 ${settings.render} · 方向 ${settings.orient} · 白板加框 ${settings.hakuFrame ? '是' : '否'} · 牌宽 ${ui.board?.dims().tw ?? '?'}px\n` +
      `最近求解：\n` +
      (game.solveLog.map((s) => `  ${s.purpose.padEnd(4, '　')} 剩 ${String(s.left).padStart(3)} 张  ${s.result.padEnd(10)} ${s.ms.toFixed(0).padStart(5)} ms  ${s.nodes} 节点`).join('\n') || '  （还没有）');
  }
  subscribe(() => {
    label();
    if (!panel.hidden) state();
  });
  setInterval(() => !panel.hidden && state(), 1000);

  // 帧率：最近 2 秒的平均帧率和最慢一帧
  const frames = [];
  let last = performance.now();
  const loop = (now) => {
    frames.push([now, now - last]);
    last = now;
    while (frames.length && frames[0][0] < now - 2000) frames.shift();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setInterval(() => {
    if (!frames.length) return;
    const worst = Math.max(...frames.map((f) => f[1]));
    bar.querySelector('.pb-fps').textContent = `${Math.round(frames.length / 2)}fps 慢帧${worst.toFixed(0)}ms`;
  }, 500);

  label();
  return { label };
}
