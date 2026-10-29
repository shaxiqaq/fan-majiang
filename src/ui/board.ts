// 棋盘渲染。横屏 8 行 × 17 列；竖屏转置成 17 行 × 8 列。规则层一直按 8×17 的下标算，只在显示时转置。
// 移动用到的：float 把几格牌"拿起来"放进浮层跟手走（原格显示成空位），slideIn 让牌从某个偏移滑进它现在的格，
// ghost 画一串半透明虚影反复滑过去（提示用），screenDir 把规则里的上下左右换成屏幕上的方向（竖屏时转置）。
import { N, COLS, UP, DOWN, LEFT, RIGHT } from '../core/core';
import { game } from '../game/state';
import { HAKU } from '../game/rules';
import { faceCss } from './tiles';

const SVGNS = 'http://www.w3.org/2000/svg';
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type Orient = 'portrait' | 'landscape';
export const orient = (): Orient => (innerWidth < innerHeight ? 'portrait' : 'landscape');

export type Deco = Record<string, Set<number>>;
export type Float = {
  set: (x: number, y: number, ms?: number, ease?: string) => Promise<void>;
  mark: (cell: number, name: string, on: boolean) => void;
  drop: () => void;
};
type TileEl = HTMLDivElement & { _face?: string; _cls?: string };
export type Board = ReturnType<typeof createBoard>;

export function createBoard(host: HTMLElement, { onTap, onLayout }: { onTap: (i: number) => void; onLayout: () => void }) {
  const wrap = document.createElement('div');
  wrap.className = 'board-wrap';
  const board = document.createElement('div');
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'paths');
  const layer = document.createElement('div');
  layer.className = 'float-layer';
  wrap.append(board);
  host.append(wrap);

  let tiles: TileEl[] = [], built: Orient = orient(), ready = false;
  let dims = { tw: 0, th: 0, gap: 0, R: 8, C: 17 };
  let deco: Deco = {}, boardCls: string[] = [];
  const transient = new Map<number, Set<string>>();
  const lifted = new Map<number, number>(); // 格 → 被拿起来的次数（浮层里有它时原格画成空位）

  function build() {
    built = orient();
    const portrait = built === 'portrait';
    tiles = [];
    for (let i = 0; i < N; i++) {
      const r = (i / COLS) | 0, c = i % COLS;
      const t: TileEl = document.createElement('div');
      t.dataset.i = String(i);
      t.style.gridRow = String((portrait ? c : r) + 1);
      t.style.gridColumn = String((portrait ? r : c) + 1);
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
    // 牌底下的厚边要占一点高度，按每行多 8% 牌宽算
    const tw = Math.max(8, Math.floor(Math.min(W / (C + (C - 1) * gr), H / ((R * 4) / 3 + R * 0.08 + (R - 1) * gr))));
    const th = Math.round((tw * 4) / 3), gap = Math.max(1, Math.round(tw * gr));
    dims = { tw, th, gap, R, C };
    const s = board.style;
    s.setProperty('--tw', tw + 'px');
    s.setProperty('--th', th + 'px');
    s.setProperty('--gap', gap + 'px');
    s.setProperty('--cols', String(C));
    s.setProperty('--rows', String(R));
    if (ready) onLayout();
  }

  function paint() {
    board.className = ['board', ...boardCls].join(' ');
    for (let i = 0; i < N; i++) {
      const t = tiles[i], k = game.board[i];
      let cls = 'tile';
      if (k < 0 || lifted.has(i)) cls += ' gone';
      else {
        const f = faceCss(k, game.red[i]);
        if (t._face !== f) t.style.setProperty('--face', (t._face = f));
        if (k === HAKU) cls += ' haku';
      }
      for (const name in deco) if (deco[name].has(i)) cls += ' ' + name;
      const tr = transient.get(i);
      if (tr) for (const c of tr) cls += ' ' + c;
      if (t._cls !== cls) t.className = t._cls = cls;
    }
  }

  function topLeft(i: number): [number, number] {
    const r = (i / COLS) | 0, c = i % COLS, portrait = built === 'portrait';
    const dr = portrait ? c : r, dc = portrait ? r : c;
    return [dc * (dims.tw + dims.gap), dr * (dims.th + dims.gap)];
  }
  function center(i: number): [number, number] {
    const [x, y] = topLeft(i);
    return [x + dims.tw / 2, y + dims.th / 2];
  }

  // 规则方向 → 屏幕上的单位向量 [x, y] 和沿这个方向走一格的像素数
  function screenDir(dir: number): { v: [number, number]; pitch: number } {
    const portrait = built === 'portrait';
    const v: [number, number] = portrait
      ? ({ [UP]: [-1, 0], [DOWN]: [1, 0], [LEFT]: [0, -1], [RIGHT]: [0, 1] } as Record<number, [number, number]>)[dir]
      : ({ [UP]: [0, -1], [DOWN]: [0, 1], [LEFT]: [-1, 0], [RIGHT]: [1, 0] } as Record<number, [number, number]>)[dir];
    return { v, pitch: v[0] ? dims.tw + dims.gap : dims.th + dims.gap };
  }

  // 浮层里的一组牌：照 cells 现在的牌面画，放在各自的格上，整组一起平移
  function makeGroup(cells: number[], cls = '') {
    const g = document.createElement('div');
    g.className = 'float-group ' + cls;
    for (const i of cells) {
      const t = document.createElement('div');
      const k = game.board[i];
      t.className = 'tile floating' + (k === HAKU ? ' haku' : '');
      t.dataset.cell = String(i);
      t.style.setProperty('--face', faceCss(k, game.red[i]));
      const [x, y] = topLeft(i);
      t.style.left = x + 'px';
      t.style.top = y + 'px';
      g.append(t);
    }
    layer.append(g);
    return g;
  }
  const lift = (cells: number[], d: number) => {
    for (const i of cells) {
      const n = (lifted.get(i) || 0) + d;
      if (n > 0) lifted.set(i, n);
      else lifted.delete(i);
    }
    paint();
  };
  const moveGroup = (g: HTMLElement, x: number, y: number, ms = 0, ease = 'ease-out') => {
    g.style.transition = ms ? `transform ${ms}ms ${ease}` : 'none';
    g.style.transform = `translate(${x}px, ${y}px)`;
    return ms ? sleep(ms) : Promise.resolve();
  };

  const ro = new ResizeObserver(() => (orient() !== built ? build() : layout()));
  ro.observe(wrap);
  wrap.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tile');
    onTap(t?.dataset.i != null ? +t.dataset.i : -1);
  });
  build();
  ready = true;

  return {
    // deco: { 类名: 格下标集合 }；cls: 加在棋盘上的类名
    update(nextDeco: Deco = {}, cls: string[] = []) {
      deco = nextDeco;
      boardCls = cls;
      if (orient() !== built) build();
      else paint();
    },
    // 给几格临时加一个类（动画），ms 后去掉
    animate(cells: number[], cls: string, ms: number) {
      for (const i of cells) {
        if (!transient.has(i)) transient.set(i, new Set());
        transient.get(i)!.add(cls);
      }
      paint();
      return new Promise<void>((res) =>
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
    drawPath(cells: number[], cls: string, ms = 0) {
      const pl = document.createElementNS(SVGNS, 'polyline');
      pl.setAttribute('class', cls);
      pl.setAttribute('points', cells.map((i) => center(i).join(',')).join(' '));
      svg.append(pl);
      if (ms) setTimeout(() => pl.remove(), ms);
    },
    clearPaths(cls: string) {
      svg.querySelectorAll(`.${cls}`).forEach((p) => p.remove());
    },
    dims: () => ({ ...dims, orient: built }),
    el: wrap,
    tileEl: (i: number) => tiles[i],
    screenDir,
    // 把 cells 上的牌拿起来跟手走
    float(cells: number[], cls = 'lifted'): Float {
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
    async slideIn(cells: number[], x: number, y: number, ms = 140, ease = 'ease-out') {
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
    ghost(cells: number[], x: number, y: number) {
      const g = makeGroup(cells, 'ghost');
      g.style.setProperty('--gx', x + 'px');
      g.style.setProperty('--gy', y + 'px');
      return () => g.remove();
    },
    destroy() {
      ro.disconnect();
      wrap.remove();
    },
  };
}
