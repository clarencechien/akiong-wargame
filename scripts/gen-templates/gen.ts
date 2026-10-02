/**
 * 開發期：用 Claude 替每個人物 × stage 產 5–10 句候選，寫進 data/_candidates/。
 * 不准直接寫正式檔（data/voice-templates.json）；人工審過後用 promote.ts 搬。
 *
 *   ANTHROPIC_API_KEY=... npm run voices:gen -- [--persona <id>] [--n 6] [--out data/_candidates/voice-templates.<date>.candidates.json]
 *
 * 規則（寫進 system prompt）：不寫具名真實人物、不寫血腥細節、台灣正體中文、每句 ≤ 60 字；聲音的力量來自平常。
 */
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';

interface Persona {
  id: string;
  stratum: string;
  name: string;
  side: string;
  location: string;
  unit?: string;
  tone: string[];
  triggers: { metric: string; gte?: number; lte?: number }[];
}
interface Candidate {
  personaId: string;
  stage: number;
  tone: string;
  text: string;
  requires: Record<string, [number, number]>;
  approved: boolean;
}

const { values } = parseArgs({
  options: {
    persona: { type: 'string' },
    n: { type: 'string', default: '6' },
    out: { type: 'string' },
    model: { type: 'string', default: 'claude-opus-5-5' },
  },
});

const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: Persona[] }).personas.filter((p) => !values.persona || p.id === values.persona);
const perStage = Number(values.n);
const date = new Date().toISOString().slice(0, 10);
const out = values.out ?? `data/_candidates/voice-templates.${date}.candidates.json`;

const SYSTEM = `你替一個台海兵推教育模擬器寫「聲音」：各階層人物在戰爭不同階段說的一兩句話。
規則：
- 台灣正體中文用語（影片、品質、網路、資訊、軟體）。
- 每句 ≤ 60 字，含標點。
- 不寫具名真實人物、不寫血腥細節、不寫口號。聲音的力量來自平常：算帳、排班、等電話、看天氣。
- stage 1 → 2 → 3 是同一個人三次出場的語氣變化（先算帳、後麻木）。
- 可用槽位：{day}（D+n）、{place}（人物所在地）、{unit}（部隊或船名）、{amount}（沿海停工比例）、{ships}（損失船數）、{troops}（上岸兵力）。
- requires 用引擎指標名稱與區間，例如 {"coastalShutdown":[0.1,0.5]}；可用：phaseIndex(0–4) fleetLoss troopsAshore troopsArrived twCoastalMissiles airControl supplyDays usEngaged japanBases chipOutput shippingReroute marketShock coastalShutdown twBusinessPayroll morale detected reserveActivated requisition seaGood。
只回傳 JSON 陣列，每個元素 {"stage":1|2|3,"tone":"…","text":"…","requires":{…}}，不要其他文字。`;

const client = new Anthropic();
const all: Candidate[] = [];
for (const p of personas) {
  const prompt = `人物：${p.name}（階層 ${p.stratum}、立場 ${p.side}、地點 ${p.location}${p.unit ? `、單位 ${p.unit}` : ''}）
語氣關鍵字：${p.tone.join('、')}
觸發條件：${JSON.stringify(p.triggers)}
請替 stage 1、2、3 各寫 ${perStage} 句候選。`;
  const res = await client.messages.create({
    model: values.model!,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') {
    console.error(`${p.id}：模型拒絕（${res.stop_details?.category ?? '未知'}），略過`);
    continue;
  }
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const m = /\[[\s\S]*\]/.exec(text);
  if (!m) {
    console.error(`${p.id}：回應不是 JSON 陣列，略過`);
    continue;
  }
  let items: Omit<Candidate, 'personaId' | 'approved'>[] = [];
  try {
    items = JSON.parse(m[0]) as typeof items;
  } catch {
    console.error(`${p.id}：JSON 解析失敗，略過`);
    continue;
  }
  for (const it of items) {
    if (typeof it.text !== 'string' || it.text.length > 60 || ![1, 2, 3].includes(it.stage)) continue;
    all.push({ personaId: p.id, stage: it.stage, tone: it.tone ?? '', text: it.text, requires: it.requires ?? {}, approved: false });
  }
  console.log(`${p.id}：${items.length} 句`);
}
mkdirSync('data/_candidates', { recursive: true });
writeFileSync(out, JSON.stringify({ note: `LLM 生成候選（${date}，模型 ${values.model}），未經人工審稿。逐句把 approved 改 true 後 npm run voices:promote -- --in ${out}`, generatedBy: values.model, candidates: all }, null, 2) + '\n');
console.log(`寫入 ${out}：${all.length} 句候選`);
