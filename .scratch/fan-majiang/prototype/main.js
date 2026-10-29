// 原型入口（用完即扔）：几个界面方案挂在同一个页面上，用 ?variant= 切换。D 是界面定稿，E/F/G 是在 D 上加移动的三种做法。
// 切换方案时对局状态不变，只换界面。
import * as G from './game.js';
import { newGame, ui, applyOrient, emit } from './game.js';
import { setRenderMode } from './tiles.js';
import { VARIANTS } from './variants.js';
import { mountProtoBar } from './switcher.js';

const app = document.getElementById('app');
let cleanup = null;
let bar = null;

function show(key) {
  const v = VARIANTS.find((x) => x.key === key) || VARIANTS[0];
  cleanup?.();
  app.replaceChildren();
  ui.variant = v.key;
  ui.moves = !!v.moves;
  cleanup = v.mount(app);
  emit();
  const url = new URL(location.href);
  url.searchParams.set('variant', v.key);
  history.replaceState(null, '', url);
  bar?.label();
}

applyOrient();
addEventListener('resize', () => emit());
await setRenderMode('svg');
newGame({ diff: 1 }); // 默认普通（「定难度三档」）
show(new URL(location.href).searchParams.get('variant') || 'H');
bar = mountProtoBar({ variants: VARIANTS, current: () => ui.variant, onSwitch: show });
window.__proto = G; // 调试用
