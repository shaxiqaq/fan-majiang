// 把 results/*.json 汇总成报告里的表格：node summarize.mjs
import { readFileSync } from 'node:fs';
const load = (n) => JSON.parse(readFileSync(new URL(`./results/${n}.json`, import.meta.url), 'utf8'));
const pct = (x) => `${Math.round(x * 100)}%`;
const s = load('solveRandom');
console.log(`## 随机发牌有解率（${s.count} 局，预算 10 万节点，用时 ${s.wallSec}s）`);
console.log(JSON.stringify(s.result), '开局即证明无解:', s.provedAtRoot, '节点 p99:', s.nodes.p99, 'max:', s.nodes.max, '耗时ms', JSON.stringify(s.ms));
const p = load('playRandom');
console.log(`\n## 随机发牌上的玩家（${p.count} 局）  相邻同牌 ${JSON.stringify(p.adj)}  开局无可翻: ${p.noMoveAtStart}`);
console.log('| 玩家/救法 | 遇死局 | 第一次死局剩余 P10/P50/P90 | 救场次数 均值/P50/P90/P99/max | ≤0/≤1/≤2/≤3/≤5/≤10 次就够 |');
for (const k of Object.keys(p).filter((k) => k.includes('/'))) {
  const x = p[k];
  console.log(`| ${k} | ${pct(x.deadRate)} | ${x.firstDeadLeft.p10}/${x.firstDeadLeft.p50}/${x.firstDeadLeft.p90} | ${x.rescues.mean}/${x.rescues.p50}/${x.rescues.p90}/${x.rescues.p99}/${x.rescues.max} | ${Object.values(x.rescuesCdf).map(pct).join(' / ')} |`);
}
console.log('\n## 正推法生成（每档 3000 局）');
console.log('| spread | 生成ms 均值/P99/max | 相邻同牌 均值(P10–P90) | 求解器: 有解/超时 | 求解ms P50/P99/max | 随手型 遇死局 | 随手型 赖子 均值/P90/P99 | 稳健型 遇死局 | 稳健型 赖子 均值/P90/P99/max | 稳健型 ≤0/≤1/≤2/≤3/≤5 个赖子就够 |');
for (const sp of ['0', '0.25', '0.5', '0.75', '1']) {
  const g = load(`gen-spread${sp}`);
  const r = g.random, t = g.steady;
  console.log(`| ${sp} | ${g.genMs.mean}/${g.genMs.p99}/${g.genMs.max} | ${g.adj.mean} (${g.adj.p10}–${g.adj.p90}) | ${g.solve.solvable || 0}/${g.solve.timeout || 0} | ${g.solveMs.p50}/${g.solveMs.p99}/${g.solveMs.max} | ${pct(r.deadRate)} | ${r.rescues.mean}/${r.rescues.p90}/${r.rescues.p99} | ${pct(t.deadRate)} | ${t.rescues.mean}/${t.rescues.p90}/${t.rescues.p99}/${t.rescues.max} | ${Object.values(t.rescuesCdf).slice(0, 5).map(pct).join(' / ')} |`);
}
console.log('\n## 稳健型中途局面（翻到第 N 对时）：仍有解比例 / 求解ms P50/P99/max / 超时');
for (const sp of ['0', '0.25', '0.5', '0.75', '1']) {
  const g = load(`gen-spread${sp}`);
  console.log(`spread ${sp}: ` + Object.entries(g.steadyMid).map(([k, v]) => `${k}: 有解${pct((v.result.solvable || 0) / v.n)} ${v.ms.p50}/${v.ms.p99}/${v.ms.max}ms 超时${v.result.timeout || 0}`).join(' | '));
}
