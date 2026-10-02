/**
 * 把寫手交來的批次（{personas, candidates}）合併：
 *   - 人物 → data/personas.json（結構設定，直接進）
 *   - 句子 → data/_candidates/voice-templates.<tag>.candidates.json（approved:false，等人工 promote）
 * 合併前驗：JSON 可解析、人物欄位齊、id 不重、triggers 的 metric 在引擎指標表裡、句子 ≤ 60 字、槽位已知、personaId 對得到人、stage 1–3、不與既有句重複。
 *   npx tsx scripts/merge-voice-batches.ts --tag 2026-10-02 <batch.json>...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({ options: { tag: { type: 'string', default: 'batch' }, dry: { type: 'boolean', default: false } }, allowPositionals: true });

const METRICS = new Set(['day', 'hour', 'phaseIndex', 'fleetStrength', 'fleetLoss', 'troopsAshore', 'troopsArrived', 'twCoastalMissiles', 'airControl', 'supplyDays', 'beachhead', 'seaGood', 'weatherWindowDays', 'usEngaged', 'japanBases', 'ryukyuClosed', 'chipOutput', 'shippingReroute', 'energyPrice', 'marketShock', 'coastalShutdown', 'twBusinessPayroll', 'morale', 'priceIndex', 'detected', 'reserveActivated', 'requisition', 'penghuTaken', 'seaClosed', 'solidBeachhead']);
const STRATA = new Set(['frontline', 'homefrontLabor', 'twBusiness', 'party', 'rearFamily', 'regional', 'world', 'taiwan']);
const LAYERS = new Set(['military', 'regional', 'world', 'homefront']);
const SLOTS = new Set(['day', 'place', 'unit', 'amount', 'ships', 'troops']);

interface Persona { id: string; stratum: string; name: string; side: string; location: string; unit?: string; maxAppearances: number; listens: string[]; triggers: { layer: string; metric: string; gte?: number; lte?: number }[]; triggerMode?: string; tone: string[] }
interface Tpl { personaId: string; stage: number; tone: string; text: string; requires: Record<string, [number, number]>; approved?: boolean }

const personasPath = 'data/personas.json';
const personasFile = JSON.parse(readFileSync(personasPath, 'utf8')) as { note: string; personas: Persona[] };
const formal = JSON.parse(readFileSync('data/voice-templates.json', 'utf8')) as { templates: Tpl[] };
const ids = new Set(personasFile.personas.map((p) => p.id));
const existingText = new Set(formal.templates.map((t) => t.text));
const errors: string[] = [];
const newPersonas: Persona[] = [];
const newTpls: Tpl[] = [];

for (const f of positionals) {
  const b = JSON.parse(readFileSync(f, 'utf8')) as { personas: Persona[]; candidates: Tpl[] };
  for (const p of b.personas ?? []) {
    const where = `${f} 人物 ${p.id}`;
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) errors.push(`${where}：id 格式`);
    if (ids.has(p.id)) errors.push(`${where}：id 重複`);
    if (!STRATA.has(p.stratum)) errors.push(`${where}：stratum ${p.stratum}`);
    if (!p.name || !p.side || !p.location) errors.push(`${where}：缺 name/side/location`);
    if (!Array.isArray(p.listens) || p.listens.some((l) => !LAYERS.has(l))) errors.push(`${where}：listens ${JSON.stringify(p.listens)}`);
    if (!Array.isArray(p.triggers) || p.triggers.length === 0) errors.push(`${where}：沒有 triggers`);
    for (const t of p.triggers ?? []) if (!METRICS.has(t.metric)) errors.push(`${where}：未知指標 ${t.metric}`);
    if (p.triggerMode && !['any', 'all'].includes(p.triggerMode)) errors.push(`${where}：triggerMode`);
    p.maxAppearances = p.maxAppearances || 3;
    if (!Array.isArray(p.tone)) p.tone = [];
    ids.add(p.id);
    newPersonas.push(p);
  }
  const perStage = new Map<string, number>();
  for (const c of b.candidates ?? []) {
    const where = `${f} ${c.personaId}#${c.stage}`;
    if (!ids.has(c.personaId)) errors.push(`${where}：人物不存在`);
    if (![1, 2, 3].includes(c.stage)) errors.push(`${where}：stage`);
    if (typeof c.text !== 'string' || c.text.length === 0) errors.push(`${where}：沒有 text`);
    else {
      if (c.text.length > 60) errors.push(`${where}：${c.text.length} 字 > 60：${c.text}`);
      for (const m of c.text.matchAll(/\{(\w+)\}/g)) if (!SLOTS.has(m[1]!)) errors.push(`${where}：未知槽位 {${m[1]}}`);
      if (/AI|模型|模擬|兵推|參數/.test(c.text)) errors.push(`${where}：出戲字眼：${c.text}`);
      if (existingText.has(c.text)) errors.push(`${where}：與既有句重複`);
      existingText.add(c.text);
    }
    c.requires = c.requires ?? {};
    for (const [k, v] of Object.entries(c.requires)) {
      if (!METRICS.has(k)) errors.push(`${where}：requires 未知指標 ${k}`);
      if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') errors.push(`${where}：requires ${k} 不是 [lo, hi]`);
    }
    perStage.set(`${c.personaId}#${c.stage}`, (perStage.get(`${c.personaId}#${c.stage}`) ?? 0) + 1);
    newTpls.push({ personaId: c.personaId, stage: c.stage, tone: c.tone ?? '', text: c.text, requires: c.requires, approved: false });
  }
  // 每個新人物三個 stage 都要有句子，且 stage 1 至少一句 requires 空
  for (const p of b.personas ?? []) {
    for (const st of [1, 2, 3]) if (!perStage.get(`${p.id}#${st}`)) errors.push(`${f} 人物 ${p.id}：stage ${st} 沒有句子`);
    if (!(b.candidates ?? []).some((c) => c.personaId === p.id && c.stage === 1 && Object.keys(c.requires ?? {}).length === 0)) errors.push(`${f} 人物 ${p.id}：stage 1 沒有 requires 為空的句子`);
  }
}

console.log(`新人物 ${newPersonas.length}、新句子 ${newTpls.length}、問題 ${errors.length} 個`);
for (const e of errors) console.log('  ✗ ' + e);
if (errors.length || values.dry) process.exit(errors.length ? 1 : 0);

personasFile.personas.push(...newPersonas);
personasFile.note = personasFile.note.replace(/^人物庫（[^）]*）/, `人物庫（第一版 30 人；1.1 擴到 ${personasFile.personas.length} 人，新句子先進 data/_candidates 審過再 promote）`);
writeFileSync(personasPath, JSON.stringify(personasFile, null, 2) + '\n');
const out = `data/_candidates/voice-templates.${values.tag}.candidates.json`;
writeFileSync(out, JSON.stringify({ note: `寫手批次 ${values.tag}，${newTpls.length} 句，全部 approved:false；審過後 npm run voices:promote -- --in ${out} --all`, candidates: newTpls }, null, 2) + '\n');
console.log(`寫入 ${personasPath}（${personasFile.personas.length} 人）與 ${out}`);
