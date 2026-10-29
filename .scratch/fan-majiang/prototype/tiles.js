// 牌面素材（FluffyStuff/riichi-mahjong-tiles，CC0）和三种渲染方式（原型，用完即扔）。
// 一张未翻牌 = 牌面图案叠在 Front.svg 牌身上；Front/Back 带 SVG 模糊滤镜。
//   svg      原样 SVG
//   nofilter 去掉 Front/Back 里的滤镜
//   raster   在浏览器里先把「牌身 + 牌面」画成一张位图，每格只贴一张图
import { KINDS } from '../sim/core.mjs';
import { RED_KINDS, settings, emit } from './game.js';

const NAMES = [];
for (const s of ['Man', 'Pin', 'Sou']) for (let n = 1; n <= 9; n++) NAMES.push(s + n);
NAMES.push('Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun');

const file = (name, dir = 'Regular') => `tiles/${dir}/${name}.svg`;
const faceName = (k, red) => (red ? `${NAMES[k]}-Dora` : NAMES[k]);
const css = (u) => `url("${u}")`;

let faces = new Map();
export const faceCss = (k, red) => faces.get(k * 2 + (red ? 1 : 0));

async function stripped(path) {
  const txt = await (await fetch(path)).text();
  return URL.createObjectURL(new Blob([txt.replace(/;?filter:url\(#[^)]*\)/g, '')], { type: 'image/svg+xml' }));
}

async function loadImg(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

async function raster(layers, w = 180, h = 240) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (const src of layers) g.drawImage(await loadImg(src), 0, 0, w, h);
  return new Promise((r) => c.toBlob((b) => r(URL.createObjectURL(b)), 'image/png'));
}

export async function setRenderMode(mode) {
  const t0 = performance.now();
  const next = new Map();
  const root = document.documentElement.style;
  let front, backRed, backDark;
  if (mode === 'raster') {
    for (let k = 0; k < KINDS; k++) {
      next.set(k * 2, css(await raster([file('Front'), file(faceName(k, false))])));
      if (RED_KINDS.includes(k)) next.set(k * 2 + 1, css(await raster([file('Front'), file(faceName(k, true))])));
    }
    front = 'none';
    backRed = css(await raster([file('Back')]));
    backDark = css(await raster([file('Back', 'Black')]));
  } else {
    for (let k = 0; k < KINDS; k++) {
      next.set(k * 2, css(file(faceName(k, false))));
      if (RED_KINDS.includes(k)) next.set(k * 2 + 1, css(file(faceName(k, true))));
    }
    if (mode === 'nofilter') {
      front = css(await stripped(file('Front')));
      backRed = css(await stripped(file('Back')));
      backDark = css(await stripped(file('Back', 'Black')));
    } else {
      front = css(file('Front'));
      backRed = css(file('Back'));
      backDark = css(file('Back', 'Black'));
    }
  }
  faces = next;
  root.setProperty('--front', front);
  root.setProperty('--back-red', backRed);
  root.setProperty('--back-dark', backDark);
  settings.render = mode;
  emit();
  return performance.now() - t0;
}
