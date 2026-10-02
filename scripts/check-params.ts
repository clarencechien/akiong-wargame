/**
 * 參數庫檢查（M2 驗收：無 assumption:true 以外的空 source）。
 *   npm run check:params
 * 檢查：id 格式與唯一、range 合法、value 在 range 內、source 非空且不是「同上」、
 *       assumption:false 的 source 必須含可追的出處（年份或頁碼或法條），列出 assumption:true 的統計。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '../data/params.json');
const data = JSON.parse(readFileSync(file, 'utf8')) as {
  params: { id: string; label: string; value: number; range: [number, number]; unit: string; source: string; note?: string; assumption: boolean }[];
};

const GROUPS = new Set(['weather', 'lift', 'detect', 'fire', 'gate', 'cross', 'beach', 'regional', 'world', 'home', 'inland', 'aux']);
const errors: string[] = [];
const ids = new Set<string>();
let assumed = 0;
for (const p of data.params) {
  if (ids.has(p.id)) errors.push(`重複 id：${p.id}`);
  ids.add(p.id);
  const group = p.id.split('.')[0] ?? '';
  if (!GROUPS.has(group)) errors.push(`未知參數群：${p.id}`);
  if (!Array.isArray(p.range) || p.range.length !== 2 || p.range[0] > p.range[1]) errors.push(`range 不合法：${p.id}`);
  else if (p.value < p.range[0] || p.value > p.range[1]) errors.push(`value 超出 range：${p.id}`);
  const src = (p.source ?? '').trim();
  if (src.length < 4 || src === '同上') errors.push(`source 空或寫「同上」：${p.id}`);
  if (p.assumption) assumed++;
  else if (!/\d{4}|p\.\s?\d|§|第 ?\d+ ?[章條]/.test(src)) errors.push(`assumption:false 但 source 沒有年份／頁碼／法條可追：${p.id}`);
  if (typeof p.assumption !== 'boolean') errors.push(`assumption 不是布林：${p.id}`);
}

const byGroup = new Map<string, { n: number; assumed: number }>();
for (const p of data.params) {
  const g = p.id.split('.')[0] ?? '';
  const e = byGroup.get(g) ?? { n: 0, assumed: 0 };
  e.n++;
  if (p.assumption) e.assumed++;
  byGroup.set(g, e);
}
console.log(`參數 ${data.params.length} 筆，有直接出處 ${data.params.length - assumed} 筆，模型假設 ${assumed} 筆`);
for (const [g, e] of byGroup) console.log(`  ${g.padEnd(9)} ${String(e.n).padStart(3)} 筆，模型假設 ${String(e.assumed).padStart(3)} 筆`);
if (errors.length) {
  console.error('\n不過：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('\n參數庫格式通過。');
