import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';
import { PERSONAS, TEMPLATES, type VoiceTemplate } from '../src/engine/voices.js';
import type { Assumptions, Run } from '../src/engine/types.js';
import candidates from '../data/_candidates/voice-templates.candidates.json';

const CANDIDATES = (candidates as unknown as { candidates: (VoiceTemplate & { approved: boolean })[] }).candidates;
const SLOTS = new Set(['day', 'place', 'unit', 'amount', 'ships', 'troops']);
const personaIds = new Set(PERSONAS.map((p) => p.id));

function checkRun(r: Run): void {
  const voices = r.events.filter((e) => e.layer === 'voice');
  expect(voices.length, `seed ${r.seed} 聲音 ${voices.length} 則`).toBeGreaterThanOrEqual(12);
  expect(voices.length, `seed ${r.seed} 聲音 ${voices.length} 則`).toBeLessThanOrEqual(20);
  const perPersona = new Map<string, number[]>();
  for (const v of voices) {
    expect(v.personaId).toBeTruthy();
    const stage = Number(v.data?.['stage']);
    const arr = perPersona.get(v.personaId!) ?? [];
    expect(arr, `${v.personaId} 重複 stage ${stage}`).not.toContain(stage);
    arr.push(stage);
    perPersona.set(v.personaId!, arr);
    expect(v.text).not.toMatch(/\{\w+\}/);
    expect(v.text.length).toBeLessThanOrEqual(70); // 填槽後略長
    const trig = Number(v.data?.['triggerEventId']);
    const te = r.events[trig];
    expect(te, `${v.id} 的 triggerEventId ${trig} 找不到`).toBeDefined();
    expect(te!.layer).not.toBe('voice');
    expect(te!.day * 24 + te!.hour).toBeLessThanOrEqual(v.day * 24 + v.hour);
  }
  for (const [id, stages] of perPersona) {
    expect(stages.length, `${id} 出場 ${stages.length} 次`).toBeLessThanOrEqual(3);
    expect([...stages].sort(), `${id} stage 要從 1 開始連續`).toEqual(stages.map((_, i) => i + 1));
  }
  // 事件 id 連號、時間單調
  r.events.forEach((e, i) => expect(e.id).toBe(i));
  for (let i = 1; i < r.events.length; i++) {
    expect(r.events[i]!.day * 24 + r.events[i]!.hour).toBeGreaterThanOrEqual(r.events[i - 1]!.day * 24 + r.events[i - 1]!.hour);
  }
}

describe('人物庫與模板格式', () => {
  it('30 人、八個階層都有、每人 maxAppearances ≤ 3', () => {
    expect(PERSONAS.length).toBe(30);
    const strata = new Set(PERSONAS.map((p) => p.stratum));
    for (const s of ['frontline', 'homefrontLabor', 'twBusiness', 'party', 'rearFamily', 'regional', 'world', 'taiwan']) expect(strata.has(s as never), s).toBe(true);
    for (const p of PERSONAS) expect(p.maxAppearances).toBeLessThanOrEqual(3);
  });

  it('候選檔：人物存在、stage 1–3 齊、≤ 60 字、槽位合法、不寫具名真實人物', () => {
    const banned = ['習近平', '賴清德', '蔡英文', '川普', '拜登', '馬英九', '柯文哲', '岸田', '石破'];
    const per = new Map<string, Set<number>>();
    for (const c of CANDIDATES) {
      expect(personaIds.has(c.personaId), c.personaId).toBe(true);
      expect([1, 2, 3]).toContain(c.stage);
      expect(c.text.length, c.text).toBeLessThanOrEqual(60);
      for (const m of c.text.matchAll(/\{(\w+)\}/g)) expect(SLOTS.has(m[1]!), `未知槽位 ${m[0]}`).toBe(true);
      for (const b of banned) expect(c.text.includes(b), `${c.text} 含 ${b}`).toBe(false);
      const set = per.get(c.personaId) ?? new Set();
      set.add(c.stage);
      per.set(c.personaId, set);
    }
    for (const p of PERSONAS) expect(per.get(p.id)?.size, `${p.id} 缺 stage`).toBe(3);
  });

  it('正式檔每句也符合同樣規則', () => {
    for (const t of TEMPLATES) {
      expect(personaIds.has(t.personaId)).toBe(true);
      expect(t.text.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('每局聲音（以候選檔全數核准模擬；正式檔核准後同樣適用）', () => {
  const variants: Assumptions[] = [
    BASELINE,
    { ...BASELINE, us: 'none' },
    { ...BASELINE, us: 'immediate' },
    { ...BASELINE, month: 12 },
    { ...BASELINE, month: 8 },
    { ...BASELINE, scale: 'raid' },
    { ...BASELINE, mainAxis: 'east', auxiliary: 'none' },
    { ...BASELINE, econTolerance: 'low', scale: 'full' },
  ];

  it('每局 12–20 則、同人物 ≤ 3 次、無重複 stage、每則指回觸發事件（8 組假設 × 40 seed）', () => {
    for (const a of variants) for (let seed = 1; seed <= 40; seed++) checkRun(run(a, seed, { snapshots: false, voiceTemplates: CANDIDATES }));
  });

  it('聲音跨階層：一局至少 4 個階層出聲', () => {
    const r = run(BASELINE, 3, { snapshots: false, voiceTemplates: CANDIDATES });
    const strata = new Set(r.events.filter((e) => e.layer === 'voice').map((e) => e.data?.['stratum']));
    expect(strata.size).toBeGreaterThanOrEqual(4);
  });

  it('決定性：同 seed 兩次聲音完全相同', () => {
    const a = run(BASELINE, 5, { voiceTemplates: CANDIDATES });
    const b = run(BASELINE, 5, { voiceTemplates: CANDIDATES });
    expect(a.events).toEqual(b.events);
  });

  it.skipIf(TEMPLATES.length === 0)('正式檔：每局 12–20 則（正式檔有內容時才跑）', () => {
    for (let seed = 1; seed <= 40; seed++) checkRun(run(BASELINE, seed, { snapshots: false }));
  });
});
