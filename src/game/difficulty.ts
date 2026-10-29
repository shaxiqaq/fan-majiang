// 难度（spec.md 第 4.1 节）：d 取 0~2，分两段。
// 0 ≤ d ≤ 1：正推法 spread = d；1 < d ≤ 2：spread = 1 再互换 round((d − 1) × 68) 对牌。
// 对玩家只显示「简单 / 普通 / 困难 / 自定义」，不显示数值。

export const TIERS: [name: string, d: number][] = [
  ['简单', 0.75],
  ['普通', 1],
  ['困难', 1 + 16 / 68],
];
export const DEFAULT_DIFF = 1;

export function dealOf(d: number): { spread: number; swaps: number; swap: boolean } {
  return d <= 1 ? { spread: d, swaps: 0, swap: false } : { spread: 1, swaps: Math.round((d - 1) * 68), swap: true };
}

export const tierName = (d: number): string => TIERS.find(([, x]) => Math.abs(x - d) < 0.005)?.[0] ?? '自定义';

// 滑块停在刻度附近就吸附成那一档
export const snapTier = (d: number): number => TIERS.find(([, x]) => Math.abs(x - d) < 0.06)?.[1] ?? d;

export const validDiff = (d: unknown): d is number => typeof d === 'number' && d >= 0 && d <= 2;
