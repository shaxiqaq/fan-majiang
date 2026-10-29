// 把加入移动以后的 results/*.json 汇总成报告里的表格，并和 02 号报告（没有移动）对照：node summarize-move.mjs
// 耗时表优先用单线程跑的 *-timing.json（node run.mjs genMove 500 '{"spread":1,"workers":1,"tag":"timing"}'）。
import { readFileSync, existsSync } from 'node:fs';
const path = (n) => new URL(`./results/${n}.json`, import.meta.url);
const load = (n) => JSON.parse(readFileSync(path(n), 'utf8'));
const has = (n) => existsSync(path(n));
const pct = (x) => `${Math.round(x * 100)}%`;
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
const SPREADS = ['0', '0.25', '0.5', '0.75', '1'];
const BUDGETS = ['2000', '10000', '50000', '200000'];
const share = (res, k) => { const n = Object.values(res).reduce((s, x) => s + x, 0); return (res[k] || 0) / n; };

const sr = load('solveRandomMove');
console.log(`## 随机发牌的有解率（${sr.count} 局；02 号报告没有移动时是 2 / 20000）`);
console.log('| 节点预算 | 有解 | 证明无解 | 超时 | 其中第一轮认为无解 |');
console.log('|---|---|---|---|---|');
for (const b of BUDGETS) {
  const x = sr.solve[b];
  console.log(`| ${b} | ${x.result.solvable || 0}（${pct1(share(x.result, 'solvable'))}） | ${x.result.unsolvable || 0} | ${x.result.timeout || 0} | ${x.likelyUnsolvable} |`);
}

const pr = load('playRandomMove'), old = load('playRandom');
console.log(`\n## 随机发牌上的玩家（${pr.count} 局，遇到死局就用赖子）`);
console.log('| 玩家 | 遇死局 没有移动 → 有移动 | 第一次死局剩余 P10/P50/P90 | 赖子 均值/P50/P90/P99/最多 | 没有移动时的赖子均值 | ≤0/≤1/≤2/≤3/≤5 个赖子 | 每局移动次数 均值 |');
console.log('|---|---|---|---|---|---|---|');
for (const s of ['random', 'steady']) {
  const x = pr[s], o = old[`${s}/joker`], f = x.firstDeadLeft;
  console.log(`| ${s === 'random' ? '随手型' : '稳健型'} | ${pct(o.deadRate)} → ${pct(x.deadRate)} | ${f ? `${f.p10}/${f.p50}/${f.p90}` : '-'} | ${x.rescues.mean}/${x.rescues.p50}/${x.rescues.p90}/${x.rescues.p99}/${x.rescues.max} | ${o.rescues.mean} | ${Object.values(x.rescuesCdf).slice(0, 5).map(pct).join(' / ')} | ${x.movesUsed.mean} |`);
}

console.log('\n## 正推法各档：会移动的玩家（每档局数见 count；括号里是 02 号报告没有移动时的数）');
console.log('| spread | 相邻同牌 | 随手型 遇死局 | 随手型 赖子 均值/P90/P99 | 稳健型 遇死局 | 稳健型 赖子 均值/P90/P99/最多 | 稳健型 ≤0/≤1/≤2/≤3/≤5 个赖子 | 每局移动次数 随手/稳健 |');
console.log('|---|---|---|---|---|---|---|---|');
for (const sp of SPREADS) {
  if (!has(`genMove-spread${sp}`)) continue;
  const g = load(`genMove-spread${sp}`), o = load(`gen-spread${sp}`);
  const r = g.random, t = g.steady;
  console.log(`| ${sp} | ${g.adj.mean} | ${pct(r.deadRate)}（${pct(o.random.deadRate)}） | ${r.rescues.mean}/${r.rescues.p90}/${r.rescues.p99}（${o.random.rescues.mean}/${o.random.rescues.p90}/${o.random.rescues.p99}） | ${pct(t.deadRate)}（${pct(o.steady.deadRate)}） | ${t.rescues.mean}/${t.rescues.p90}/${t.rescues.p99}/${t.rescues.max}（${o.steady.rescues.mean}/${o.steady.rescues.p90}/${o.steady.rescues.p99}/${o.steady.rescues.max}） | ${Object.values(t.rescuesCdf).slice(0, 5).map(pct).join(' / ')} | ${r.movesUsed.mean} / ${t.movesUsed.mean} |`);
}

console.log('\n## 稳健型翻到第 N 对时仍然有解的比例（预算 20 万；括号里是没有移动时）');
console.log('| spread | 第 10 对 | 第 25 对 | 第 40 对 | 第 55 对 |');
console.log('|---|---|---|---|---|');
for (const sp of SPREADS) {
  if (!has(`genMove-spread${sp}`)) continue;
  const g = load(`genMove-spread${sp}`), o = load(`gen-spread${sp}`);
  const cell = (at) => {
    const x = g.steadyMid[`flip${at}`].solve['200000'].result, y = o.steadyMid[`flip${at}`];
    const un = x.unsolvable || 0, to = x.timeout || 0;
    return `${pct1(share(x, 'solvable'))}${un ? `，证明无解 ${un}` : ''}${to ? `，超时 ${to}` : ''}（${pct((y.result.solvable || 0) / y.n)}）`;
  };
  console.log(`| ${sp} | ${cell(10)} | ${cell(25)} | ${cell(40)} | ${cell(55)} |`);
}

console.log('\n## 局面上能做的事（稳健型对局中途，均值）：能直接翻的对数 / 能配上的移动次数 / 其中有多种配法的 / 没有能翻的牌、只能移动的局数');
for (const sp of SPREADS) {
  if (!has(`genMove-spread${sp}`)) continue;
  const g = load(`genMove-spread${sp}`);
  console.log(`spread ${sp}: ` + Object.entries(g.steadyMid).map(([k, v]) => `${k}: ${v.options.flips} / ${v.options.moves} / ${v.options.multi} / ${v.options.noFlipButMove}`).join(' | '));
}

function timingTable(name, label) {
  const g = load(name);
  console.log(`\n## 求解耗时：${label}（${g.count} 局，workers=${g.opts.workers || '多线程'}，Node）`);
  console.log('| 局面 | 节点预算 | 有解 / 证明无解 / 超时 | 毫秒 P50 / P90 / P99 / 最多 | 提示是一次移动 |');
  console.log('|---|---|---|---|---|');
  const rows = [['刚发好', g.solve0], ...Object.entries(g.steadyMid).map(([k, v]) => [`稳健型第 ${k.slice(4)} 对`, v.solve])];
  for (const [pos, s] of rows)
    for (const b of BUDGETS) {
      const x = s[b], n = Object.values(x.result).reduce((a, c) => a + c, 0);
      console.log(`| ${pos} | ${b} | ${x.result.solvable || 0} / ${x.result.unsolvable || 0} / ${x.result.timeout || 0}（超时 ${pct1((x.result.timeout || 0) / n)}） | ${x.ms.p50} / ${x.ms.p90} / ${x.ms.p99} / ${x.ms.max} | ${pct((x.firstIsMove || 0) / Math.max(1, x.result.solvable || 0))} |`);
    }
}
for (const sp of SPREADS) if (has(`genMove-spread${sp}-timing`)) timingTable(`genMove-spread${sp}-timing`, `spread ${sp}`);
if (has('solveRandomMove-timing')) {
  const t = load('solveRandomMove-timing');
  console.log(`\n## 求解耗时：随机发牌（${t.count} 局，workers=${t.opts.workers}）`);
  for (const b of BUDGETS) console.log(`预算 ${b}: ${JSON.stringify(t.solve[b].result)} 毫秒 P50/P90/P99/最多 ${t.solve[b].ms.p50}/${t.solve[b].ms.p90}/${t.solve[b].ms.p99}/${t.solve[b].ms.max}`);
}
