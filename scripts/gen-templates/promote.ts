/**
 * 把人工核准（approved: true）的候選搬進正式檔 data/voice-templates.json。
 *   npm run voices:promote -- [--in data/_candidates/voice-templates.candidates.json] [--all]
 * --all：全部視為核准（審稿人看過整份檔案後使用）。
 * 搬進去前再檢查一次：人物存在、stage 1–3、≤ 60 字、無未知槽位、不重複。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    in: { type: 'string', default: 'data/_candidates/voice-templates.candidates.json' },
    all: { type: 'boolean', default: false },
  },
});

interface Tpl {
  personaId: string;
  stage: number;
  tone: string;
  text: string;
  requires: Record<string, [number, number]>;
  approved?: boolean;
}
const SLOTS = new Set(['day', 'place', 'unit', 'amount', 'ships', 'troops']);
const personas = new Set((JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: { id: string }[] }).personas.map((p) => p.id));
const formalPath = 'data/voice-templates.json';
const formal = JSON.parse(readFileSync(formalPath, 'utf8')) as { note: string; templates: Tpl[] };
const cand = JSON.parse(readFileSync(values.in!, 'utf8')) as { candidates: Tpl[] };

const existing = new Set(formal.templates.map((t) => `${t.personaId}|${t.stage}|${t.text}`));
let added = 0;
const errors: string[] = [];
for (const c of cand.candidates) {
  if (!values.all && !c.approved) continue;
  const key = `${c.personaId}|${c.stage}|${c.text}`;
  if (existing.has(key)) continue;
  if (!personas.has(c.personaId)) errors.push(`人物不存在：${c.personaId}`);
  if (![1, 2, 3].includes(c.stage)) errors.push(`stage 不是 1–3：${key}`);
  if (c.text.length > 60) errors.push(`超過 60 字：${c.text}`);
  for (const m of c.text.matchAll(/\{(\w+)\}/g)) if (!SLOTS.has(m[1]!)) errors.push(`未知槽位 {${m[1]}}：${c.text}`);
  if (errors.length) continue;
  const { approved: _a, ...tpl } = c;
  void _a;
  formal.templates.push({ ...tpl, requires: tpl.requires ?? {} });
  existing.add(key);
  added++;
}
if (errors.length) {
  console.error('不搬，先修：');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
writeFileSync(formalPath, JSON.stringify(formal, null, 2) + '\n');
console.log(`搬進 ${added} 句，正式檔共 ${formal.templates.length} 句。`);
