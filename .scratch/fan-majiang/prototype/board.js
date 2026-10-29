// 棋盘渲染（原型，用完即扔）。几个方案共用这一块，只是空位样式、高亮、动画各自传进来。
// 横屏 8 行 × 17 列；竖屏转置成 17 行 × 8 列。规则层一直按 8×17 的下标算，只在显示时转置。
// 移动用到的：float 把几格牌"拿起来"放进浮层跟手走（原格显示成空位），slideIn 让牌从某个偏移滑进它现在的格，
// ghost 画一串半透明虚影反复滑过去（提示用），screenDir 把规则里的上下左右换成屏幕上的方向（竖屏时转置）。
import { N, COLS, UP, DOWN, LEFT, RIGHT } from '../sim/core.mjs';
import { game, orient, HAKU } from './game.js';
import { faceCss } from './tiles.js';

const SVGNS = 'http://www.w3.org/2000/svg';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

// emptyStyle: blank 留空 | dark 深色牌背 | ghost 淡红色牌背
export function createBoard(host, { emptyStyle = 'blank', onTap, onLayout } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const board = document.createElement('div');
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'paths');
  svg.innerHTML = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>`;
  const layer = document.createElement('div');
  layer.className = 'float-layer';
  wrap.append(board);
  host.append(wrap);

  let tiles = [], built = null, ready = false, dims = {};
  let deco = {}, boardCls = [], benching = false;
  const transient = new Map();
  const lifted = new Map(); // 格 → 被拿起来的次数（浮层里有它时原格画成空位）

  function build() {
    built = orient();
    const portrait = built === 'portrait';
    tiles = [];
    for (let i = 0; i < N; i++) {
      const r = (i / COLS) | 0, c = i % COLS;
      const t = document.createElement('div');
      t.dataset.i = i;
      t.style.gridRow = (portrait ? c : r) + 1;
      t.style.gridColumn = (portrait ? r : c) + 1;
      t._face = t._cls = '';
      tiles.push(t);
    }
    board.replaceChildren(...tiles, svg, layer);
    layout();
    paint();
  }

  function layout() {
    const portrait = built === 'portrait';
    const R = portrait ? 17 : 8, C = portrait ? 8 : 17, gr = 0.06;
    const W = wrap.clientWidth - 12, H = wrap.clientHeight - 12;
    const tw = Math.max(8, Math.floor(Math.min(W / (C + (C - 1) * gr), H / ((R * 4) / 3 + (R - 1) * gr))));
    const th = Math.round((tw * 4) / 3), gap = Math.max(1, Math.round(tw * gr));
    dims = { tw, th, gap, R, C };
    const s = board.style;
    s.setProperty('--tw', tw + 'px');
    s.setProperty('--th', th + 'px');
    s.setProperty('--gap', gap + 'px');
    s.setProperty('--cols', C);
    s.setProperty('--rows', R);
    if (ready) onLayout?.();
  }

  function paint() {
    board.className = ['board', `es-${emptyStyle}`, ...boardCls, benching ? 'bench-wiggle' : ''].join(' ');
    for (let i = 0; i < N; i++) {
      const t = tiles[i], k = game.board[i];
      let cls = 'tile';
      if (k < 0 || lifted.has(i)) cls += ' gone';
      else {
        const f = faceCss(k, game.red[i]);
        if (t._face !== f) t.style.setProperty('--face', (t._face = f));
        if (k === HAKU) cls += ' k31';
      }
      for (const name in deco) if (deco[name]?.has(i)) cls += ' ' + name;
      const tr = transient.get(i);
      if (tr) for (const c of tr) cls += ' ' + c;
      if (t._cls !== cls) t.className = t._cls = cls;
    }
  }

  function topLeft(i) {
    const r = (i / COLS) | 0, c = i % COLS, portrait = built === 'portrait';
    const dr = portrait ? c : r, dc = portrait ? r : c;
    return [dc * (dims.tw + dims.gap), dr * (dims.th + dims.gap)];
  }
  function center(i) {
    const [x, y] = topLeft(i);
    return [x + dims.tw / 2, y + dims.th / 2];
  }

  // 规则方向 → 屏幕上的单位向量 [x, y] 和沿这个方向走一格的像素数
  function screenDir(dir) {
    const portrait = built === 'portrait';
    const v = portrait
      ? { [UP]: [-1, 0], [DOWN]: [1, 0], [LEFT]: [0, -1], [RIGHT]: [0, 1] }[dir]
      : { [UP]: [0, -1], [DOWN]: [0, 1], [LEFT]: [-1, 0], [RIGHT]: [1, 0] }[dir];
    return { v, pitch: v[0] ? dims.tw + dims.gap : dims.th + dims.gap };
  }

  // 浮层里的一组牌：照 cells 现在的牌面画，放在各自的格上，整组一起平移
  function makeGroup(cells, cls = '') {
    const g = document.createElement('div');
    g.className = 'float-group ' + cls;
    for (const i of cells) {
      const t = document.createElement('div');
      const k = game.board[i];
      t.className = 'tile floating' + (k === HAKU ? ' k31' : '');
      t.dataset.cell = i;
      t.style.setProperty('--face', faceCss(k, game.red[i]));
      const [x, y] = topLeft(i);
      t.style.left = x + 'px';
      t.style.top = y + 'px';
      g.append(t);
    }
    layer.append(g);
    return g;
  }
  const lift = (cells, d) => {
    for (const i of cells) {
      const n = (lifted.get(i) || 0) + d;
      if (n > 0) lifted.set(i, n);
      else lifted.delete(i);
    }
    paint();
  };
  const moveGroup = (g, x, y, ms = 0, ease = 'ease-out') => {
    g.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
    g.style.transform = `translate(${x}px, ${y}px)`;
    return ms ? sleep(ms) : Promise.resolve();
  };

  const ro = new ResizeObserver(() => (orient() !== built ? build() : layout()));
  ro.observe(wrap);
  wrap.addEventListener('click', (e) => {
    const t = e.target.closest('.tile');
    onTap?.(t ? +t.dataset.i : -1);
  });
  build();
  ready = true;

  return {
    // deco: { 类名: Set(格下标) }；cls: 加在棋盘上的类名
    update(nextDeco = {}, cls = []) {
      deco = nextDeco;
      boardCls = cls;
      if (orient() !== built) build();
      else paint();
    },
    // 给几格临时加一个类（动画），ms 后去掉
    animate(cells, cls, ms) {
      for (const i of cells) {
        if (!transient.has(i)) transient.set(i, new Set());
        transient.get(i).add(cls);
      }
      paint();
      return new Promise((res) =>
        setTimeout(() => {
          for (const i of cells) {
            transient.get(i)?.delete(cls);
            if (!transient.get(i)?.size) transient.delete(i);
          }
          paint();
          res();
        }, ms),
      );
    },
    drawPath(cells, cls, ms) {
      const pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('class', cls);
      pl.setAttribute('points', cells.map((i) => center(i).join(',')).join(' '));
      svg.append(pl);
      if (ms) setTimeout(() => pl.remove(), ms);
      return pl;
    },
    clearPaths(cls) {
      svg.querySelectorAll(cls ? `.${cls}` : 'polyline').forEach((p) => p.remove());
    },
    tileRect: (i) => tiles[i].getBoundingClientRect(),
    dims: () => ({ ...dims, orient: built }),
    el: wrap,
    center,
    screenDir,
    // 把 cells 上的牌拿起来跟手走。返回的 set(x, y, ms) 平移整组，mark 给其中一格加类名，drop 放下（去掉浮层）
    float(cells, cls = 'lifted') {
      const g = makeGroup(cells, cls);
      lift(cells, 1);
      let gone = false;
      return {
        set: (x, y, ms, ease) => moveGroup(g, x, y, ms, ease),
        mark(cell, name, on) {
          g.querySelector(`[data-cell="${cell}"]`)?.classList.toggle(name, on);
        },
        drop() {
          if (gone) return;
          gone = true;
          g.remove();
          lift(cells, -1);
        },
      };
    },
    // cells 上的牌（已经在新位置）从偏移 (x, y) 处滑进来
    async slideIn(cells, x, y, ms = 140, ease = 'ease-out') {
      if (!cells.length) return;
      const g = makeGroup(cells, 'lifted');
      lift(cells, 1);
      moveGroup(g, x, y);
      g.getBoundingClientRect();
      await moveGroup(g, 0, 0, ms, ease);
      g.remove();
      lift(cells, -1);
    },
    // 提示用：cells 上的牌的半透明虚影，反复往 (x, y) 滑过去。返回去掉它的函数
    ghost(cells, x, y) {
      const g = makeGroup(cells, 'ghost');
      g.style.setProperty('--gx', x + 'px');
      g.style.setProperty('--gy', y + 'px');
      return () => g.remove();
    },
    clearFloats() {
      layer.replaceChildren();
      lifted.clear();
      paint();
    },
    drawArrow(fromXY, toXY, cls) {
      const pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('class', cls);
      pl.setAttribute('points', `${fromXY.join(',')} ${toXY.join(',')}`);
      pl.setAttribute('marker-end', 'url(#arrowhead)');
      svg.append(pl);
      return pl;
    },
    // 原型设置里的「测渲染」：重建 5 次各自到下一帧的耗时 + 全部牌一起动 1.5 秒的帧间隔
    async benchRender() {
      const builds = [];
      for (let n = 0; n < 5; n++) {
        const t0 = performance.now();
        build();
        await nextPaint();
        builds.push(performance.now() - t0);
      }
      benching = true;
      paint();
      const frames = [];
      let last = performance.now();
      const end = last + 1500;
      await new Promise((res) => {
        const tick = (now) => {
          frames.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(tick);
          else res();
        };
        requestAnimationFrame(tick);
      });
      benching = false;
      paint();
      frames.shift();
      frames.sort((a, b) => a - b);
      return {
        builds,
        fps: (1000 * frames.length) / frames.reduce((a, b) => a + b, 0),
        p90: frames[Math.floor(frames.length * 0.9)],
        worst: frames[frames.length - 1],
        tw: dims.tw,
      };
    },
    destroy() {
      ro.disconnect();
      wrap.remove();
    },
  };
}
