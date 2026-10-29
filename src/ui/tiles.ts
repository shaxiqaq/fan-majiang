// 牌面素材：FluffyStuff/riichi-mahjong-tiles 的 Regular/ SVG（CC0），放在 public/tiles/。
// 牌面文件只有图案、背景透明；牌身用 CSS 画（spec.md 第 12 节），不用 Front.svg。
import { RED_KINDS } from '../game/rules';

const NAMES: string[] = [];
for (const s of ['Man', 'Pin', 'Sou']) for (let n = 1; n <= 9; n++) NAMES.push(s + n);
NAMES.push('Ton', 'Nan', 'Shaa', 'Pei', 'Haku', 'Hatsu', 'Chun');

export const tileUrl = (name: string) => `${import.meta.env.BASE_URL}tiles/${name}.svg`;

const faces = new Map<number, string>();
for (let k = 0; k < NAMES.length; k++) {
  faces.set(k * 2, `url("${tileUrl(NAMES[k])}")`);
  if (RED_KINDS.includes(k)) faces.set(k * 2 + 1, `url("${tileUrl(NAMES[k] + '-Dora')}")`);
}
// 赤五用 -Dora 那张
export const faceCss = (k: number, red: number | boolean): string => faces.get(k * 2 + (red && RED_KINDS.includes(k) ? 1 : 0))!;
