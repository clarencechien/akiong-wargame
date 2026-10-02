import { describe, expect, it } from 'vitest';
import { run } from '../src/engine/simulate.js';
import { BASELINE } from '../src/engine/assumptions.js';
import type { Assumptions, Outcome } from '../src/engine/types.js';
import type { VoiceTemplate } from '../src/engine/voices.js';
import { buildChapter, batchStats, zhNumber } from '../src/narrative/chapter.js';
import { shareTitle, assumptionSummary } from '../src/narrative/sharecard.js';
import { dateLabel, zhDate, annotateDates } from '../src/narrative/dates.js';
import { eventBookCSV, eventBookJSON, eventRows, CSV_COLUMNS } from '../src/narrative/eventbook.js';
import candidates from '../data/_candidates/voice-templates.candidates.json';

const CANDIDATES = (candidates as unknown as { candidates: VoiceTemplate[] }).candidates;

const variants: Assumptions[] = [
  BASELINE,
  { ...BASELINE, us: 'none' },
  { ...BASELINE, us: 'immediate' },
  { ...BASELINE, month: 12 },
  { ...BASELINE, month: 8 },
  { ...BASELINE, scale: 'raid' },
  { ...BASELINE, mainAxis: 'east', auxiliary: 'none' },
  { ...BASELINE, econTolerance: 'low', scale: 'full', auxiliary: 'eastFeint' },
];

function stats(a: Assumptions, mine: Outcome) {
  const outcomes: Outcome[] = [];
  for (let s = 1; s <= 50; s++) outcomes.push(run(a, s, { snapshots: false, voices: false }).outcome);
  return batchStats(outcomes, mine);
}

describe('章節生成（HANDOFF §9）', () => {
  it('字數 1,500–3,000、每節至少一則引文、所有 [n] 都能解析到事件（8 組假設 × 12 seed）', () => {
    const reasons = new Set<string>();
    for (const a of variants) {
      for (let seed = 1; seed <= 12; seed++) {
        const r = run(a, seed, { voiceTemplates: CANDIDATES });
        const ch = buildChapter(r, stats(a, r.outcome));
        reasons.add(r.outcome.failedBy ?? r.outcome.reason);
        const label = `seed ${seed} ${JSON.stringify(a)} → ${r.outcome.failedBy ?? r.outcome.reason} @ ${r.outcome.endedAt.phase}`;
        expect(ch.charCount, `${label} 字數 ${ch.charCount}`).toBeGreaterThanOrEqual(1500);
        expect(ch.charCount, `${label} 字數 ${ch.charCount}`).toBeLessThanOrEqual(3000);
        expect(ch.sections.length).toBeGreaterThanOrEqual(3);
        expect(ch.sections.length).toBeLessThanOrEqual(4);
        for (const sec of ch.sections) {
          expect(sec.paragraphs.length, `${label} ${sec.heading} 沒有段落`).toBeGreaterThan(0);
          expect(sec.quote, `${label} ${sec.heading} 沒有引文`).not.toBeNull();
          for (const p of sec.paragraphs) {
            expect(p, `${label} 有未填槽位：${p}`).not.toMatch(/\{\w+(:\w+)?\}/);
            for (const m of p.matchAll(/\[(\d+)\]/g)) {
              const note = ch.notes.find((x) => x.n === Number(m[1]));
              expect(note, `${label} [${m[1]}] 找不到註釋`).toBeDefined();
              expect(r.events[note!.event.id]).toEqual(note!.event);
            }
          }
        }
        expect(ch.appendix.length, `${label} 沒有附錄`).toBeGreaterThan(0);
        for (const sec of ch.sections) for (const p of sec.paragraphs) expect(p, `${label} 正文不該出現模型字眼：${p}`).not.toMatch(/模型假設|參數|公開資料裡/);
        expect(ch.title.length).toBeGreaterThan(1);
        expect(ch.book.length).toBeGreaterThan(1);
        expect(ch.chapterNo).toBeGreaterThanOrEqual(8);
        expect(ch.chapterNo).toBeLessThanOrEqual(27);
        expect(ch.tail.join('')).toContain(`seed ${r.seed}`);
      }
    }
    // 覆蓋到多種結局
    expect(reasons.size).toBeGreaterThanOrEqual(4);
  });

  it('集結期就結束的局（12 月、D-1 窗口不足）也有 1,500 字以上', () => {
    const a: Assumptions = { ...BASELINE, month: 12 };
    const r = run(a, 24, { voiceTemplates: CANDIDATES });
    expect(r.outcome.endedAt.phase).toBe('mobilize');
    const ch = buildChapter(r, stats(a, r.outcome));
    expect(ch.charCount).toBeGreaterThanOrEqual(1500);
    expect(ch.charCount).toBeLessThanOrEqual(3000);
    for (const sec of ch.sections) expect(sec.quote).not.toBeNull();
  });

  it('章節決定性：同一局兩次相同；不同 seed 書名／標題會變', () => {
    const r = run(BASELINE, 2, { voiceTemplates: CANDIDATES });
    const st = stats(BASELINE, r.outcome);
    expect(buildChapter(r, st)).toEqual(buildChapter(r, st));
    const books = new Set<string>();
    for (let s = 1; s <= 12; s++) books.add(buildChapter(run(BASELINE, s, { voiceTemplates: CANDIDATES }), st).book);
    expect(books.size).toBeGreaterThan(2);
  });

  it('中文數字', () => {
    expect(zhNumber(8)).toBe('八');
    expect(zhNumber(10)).toBe('十');
    expect(zhNumber(14)).toBe('十四');
    expect(zhNumber(27)).toBe('二十七');
    expect(zhNumber(30)).toBe('三十');
  });
});

describe('分享卡標題', () => {
  it('公式：「我以為問題是{X}。問題是{三個名詞}。」', () => {
    const r = run(BASELINE, 1, { snapshots: false, voices: false });
    const st = stats(BASELINE, r.outcome);
    const t = shareTitle(r.outcome, null, st);
    if (r.outcome.reason === 'objectiveReached') expect(t.title).toMatch(/這一局過了/);
    else expect(t.title).toMatch(/^我以為問題是美軍。\n問題是[^、]+、[^、]+、[^。]+。$/);
    expect(shareTitle(r.outcome, 'month', st).title.startsWith('我以為問題是月份') || r.outcome.reason === 'objectiveReached').toBe(true);
    expect(assumptionSummary(BASELINE)).toContain('主攻北部');
  });
});

describe('事件簿', () => {
  it('逐行事件與狀態量；CSV 列數 = 事件數；JSON 可解析且含 seed 與抽樣參數', () => {
    const r = run(BASELINE, 4, { voiceTemplates: CANDIDATES });
    const rows = eventRows(r);
    expect(rows.length).toBe(r.events.length);
    const csv = eventBookCSV(r);
    const lines = csv.split('\n');
    expect(lines[0]!.replace('﻿', '')).toBe(CSV_COLUMNS.join(','));
    expect(lines.length - 1).toBe(r.events.length);
    const j = JSON.parse(eventBookJSON(r)) as { seed: number; sampledParams: Record<string, number>; events: unknown[] };
    expect(j.seed).toBe(4);
    expect(Object.keys(j.sampledParams).length).toBeGreaterThan(50);
    expect(j.events.length).toBe(r.events.length);
    // 東岸主攻：結算事件標紅
    const e = run({ ...BASELINE, mainAxis: 'east' }, 4, { voiceTemplates: CANDIDATES });
    expect(eventRows(e).some((x) => x.flagged)).toBe(true);
  });
});

describe('日期', () => {
  it('D 日 = 該月 10 日；跨月與負數正確；文字裡的 D±n 會換成日期', () => {
    expect(dateLabel(4, 0)).toBe('4/10（D+0）');
    expect(dateLabel(4, 22)).toBe('5/2（D+22）');
    expect(dateLabel(4, -31)).toBe('3/10（D-31）');
    expect(zhDate(4, 3)).toBe('四月十三日');
    expect(zhDate(12, 25)).toBe('一月四日');
    expect(annotateDates('在 D-27 公開辨識，D+4 出港', 4)).toBe('在 3/14（D-27） 公開辨識，4/14（D+4） 出港');
    expect(annotateDates('4/14（D+4） 出港', 4)).toBe('4/14（D+4） 出港');
  });
});
