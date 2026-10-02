/**
 * 聲音重複度量測：隨機 1,000 個 seed，算
 *   - 全部用到的不同句數 / 模板總數
 *   - 連玩 k 局時，第 k 局有幾成句子在前 k−1 局看過（k = 2…10，取 100 組隨機序列平均）
 *   - 每個人物出場次數分佈
 *   npm run voices:stats [-- --candidates <file>]
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { run } from '../src/engine/simulate.ts';
import { BASELINE } from '../src/engine/assumptions.ts';
import { TEMPLATES, PERSONAS, type VoiceTemplate } from '../src/engine/voices.ts';
import { mulberry32 } from '../src/engine/rng.ts';
import type { Assumptions } from '../src/engine/types.ts';

const { values } = parseArgs({ options: { candidates: { type: 'string', multiple: true }, n: { type: 'string', default: '1000' } } });
let templates: VoiceTemplate[] = [...TEMPLATES];
for (const f of values.candidates ?? []) templates = templates.concat((JSON.parse(readFileSync(f, 'utf8')) as { candidates: VoiceTemplate[] }).candidates);
const N = Number(values.n);
const rng = mulberry32(2026);
const variants: Assumptions[] = [BASELINE, { ...BASELINE, us: 'none' }, { ...BASELINE, us: 'immediate' }, { ...BASELINE, month: 10 }, { ...BASELINE, scale: 'raid' }, { ...BASELINE, scale: 'full', auxiliary: 'none' }, { ...BASELINE, mainAxis: 'south' }, { ...BASELINE, econTolerance: 'low' }];

const runs: string[][] = [];
const lineCount = new Map<string, number>();
const personaCount = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const a = variants[i % variants.length]!;
  const seed = Math.floor(rng.next() * 0xffffffff) >>> 0;
  const r = run(a, seed, { snapshots: false, voiceTemplates: templates });
  const lines = r.events.filter((e) => e.layer === 'voice').map((e) => `${e.personaId}#${e.data?.['stage']}:${e.text.slice(0, 12)}`);
  runs.push(lines);
  for (const l of lines) lineCount.set(l, (lineCount.get(l) ?? 0) + 1);
  for (const e of r.events) if (e.layer === 'voice') personaCount.set(e.personaId!, (personaCount.get(e.personaId!) ?? 0) + 1);
}
const avgPerRun = runs.reduce((s, r) => s + r.length, 0) / runs.length;
console.log(`模板 ${templates.length} 句、人物 ${PERSONAS.length} 人；${N} 局平均每局 ${avgPerRun.toFixed(1)} 則，用到 ${lineCount.size} 句不同的`);
// 連玩 k 局的重複率
const K = 10;
const seenFrac = new Array<number>(K + 1).fill(0);
const trials = 100;
for (let t = 0; t < trials; t++) {
  const start = Math.floor(rng.next() * (runs.length - K));
  const seen = new Set<string>();
  for (let k = 1; k <= K; k++) {
    const lines = runs[start + k - 1]!;
    const rep = lines.filter((l) => seen.has(l)).length / lines.length;
    seenFrac[k]! += rep / trials;
    for (const l of lines) seen.add(l);
  }
}
console.log('連玩第 k 局時，看過的句子比例：' + Array.from({ length: K - 1 }, (_, i) => `第${i + 2}局 ${(seenFrac[i + 2]! * 100).toFixed(0)}%`).join('、'));
const top = [...lineCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('最常出現的句子（出現局數）：');
for (const [l, c] of top) console.log(`  ${c}  ${l}`);
const unused = PERSONAS.filter((p) => !personaCount.has(p.id)).map((p) => p.id);
console.log(`沒出過場的人物：${unused.length ? unused.join('、') : '無'}`);
