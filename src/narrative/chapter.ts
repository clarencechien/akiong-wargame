/**
 * 章節拼裝（HANDOFF §9）：固定三到四節，段落依 (phase, outcome.reason, failedGate) 選、依 seed 抽變體，
 * 內嵌 [n] 註釋指向 events[id]；每節至少引用一則該階段的聲音。
 * 章節自己開一個 PRNG（mix32(seed, 0xc4a9)），不碰模擬的隨機流。
 */
import type { Event, Phase, Run } from '../engine/types.js';
import { mulberry32, mix32, fnv1a } from '../engine/rng.js';
import { P } from '../engine/params.js';
import { GATE_LABEL } from '../engine/phases/gates.js';
import { portFor } from '../engine/geography.js';
import { ENGINE_VERSION } from '../engine/simulate.js';
import templatesJson from '../../data/chapter-templates.json';
import booksJson from '../../data/booknames.json';
import { zhDate, dateLabel } from './dates.js';
import { outlook } from './outlook.js';

interface ParagraphTpl {
  when: string;
  variants: string[];
  /** 場景段：依 seed 丟骰，機率 prob 才出現（讓同一組假設的幾局結構不同） */
  prob?: number;
  /** 這段用到的假設與來源，收進附錄，不進正文 */
  appendix?: string;
}
interface SectionTpl {
  heading: string;
  paragraphs: ParagraphTpl[];
}
interface ChapterTemplates {
  titles: Record<string, string[]>;
  sections: Record<'visible' | 'strait' | 'ending' | 'world', SectionTpl>;
  lessons: Record<string, string | string[]>;
}
const T = templatesJson as unknown as ChapterTemplates;
const BOOKS = (booksJson as { books: string[] }).books;

export interface Quote {
  text: string;
  location: string;
  who: string;
  day: number;
  eventId: number;
}
export interface Section {
  heading: string;
  paragraphs: string[]; // 已含 [n]
  quote: Quote | null;
}
export interface Chapter {
  book: string;
  chapterNo: number;
  chapterNoZh: string;
  title: string;
  subtitle: string;
  sections: Section[];
  /** [n] → 事件 */
  notes: { n: number; event: Event }[];
  /** 附錄：這些數字怎麼來的（正文用到的段落所附的假設與來源） */
  appendix: string[];
  tail: string[]; // 來源註釋尾段
  /** 正文字數（段落 + 引文 + 標題，不含附錄與註釋） */
  charCount: number;
}

export interface BatchStats {
  n: number;
  landedN: number;
  solidN: number;
  objectiveN: number;
  medianDay: number;
  /** 本局終止日在分佈裡的百分位 0..1 */
  percentile: number;
}

const PHASE_IDX: Record<Phase, number> = { mobilize: 0, strike: 1, crossing: 2, landing: 3, inland: 4 };
const ZH_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const MONTH_ZH = ['', '一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

export function zhNumber(n: number): string {
  if (n < 0) return `負${zhNumber(-n)}`;
  if (n < 10) return ZH_DIGITS[n]!;
  if (n < 20) return n === 10 ? '十' : `十${ZH_DIGITS[n % 10]}`;
  if (n < 100) return `${ZH_DIGITS[Math.floor(n / 10)]}十${n % 10 ? ZH_DIGITS[n % 10] : ''}`;
  return String(n);
}
export function zhYear(y: number): string {
  return String(y).split('').map((d) => ZH_DIGITS[Number(d)]).join('');
}
const pct = (x: number) => `百分之${Math.round(x * 100)}`;
const fmt = (n: number) => Math.round(n).toLocaleString('zh-Hant-TW');
const wan = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 萬` : fmt(n));

const TYPHOON_COUNT: Record<number, number> = { 4: 1, 5: 9, 6: 25, 7: 98, 8: 108, 9: 91, 10: 33, 11: 12, 12: 1 };

const FAILED_BY_TEXT: Record<string, string> = {
  windowClosed: '海況窗口關閉時上岸的人不夠；灘頭上的部隊在風浪中失去補給與增援。',
  fleetBroken: '船團平均戰力跌破三成，已無法集中運量。',
  tooSlow: '渡海拖過了上限，守方縱深部隊集結完成，兵力無法再集中。',
  secondWaveFailed: '第二波沒有在時限內卸載完成。',
  beachheadCrushed: '灘頭上的部隊在守方砲兵與反擊下被壓回海裡。',
  forcesDepleted: '登陸部隊在守方縱深反擊下耗盡，補給線從未連續存活七天。',
  coastalMissilesIntact: '守方岸置飛彈沒有被壓制到可渡海的水準。',
};

export function buildChapter(run: Run, stats: BatchStats): Chapter {
  const rng = mulberry32(mix32(run.seed, 0xc4a9));
  const a = run.assumptions;
  const o = run.outcome;
  const p = run.sampledParams;
  const ev = run.events;
  const first = (kind: string) => ev.find((e) => e.kind === kind);
  const endIdx = PHASE_IDX[o.endedAt.phase];
  const key = o.reason === 'objectiveReached' ? 'objectiveReached' : (o.failedBy ?? 'day30');
  const h = fnv1a(String(run.seed));
  const book = BOOKS[h % BOOKS.length]!;
  const chapterNo = (h % 20) + 8;
  const detectedEv = first('detected');
  const usEv = first('usEngaged');
  const strikeGate = ev.find((e) => e.kind === 'phaseAdvance' && e.data?.['to'] === 'crossing') ?? (o.failedGate === 'strike' ? first('gateFailed') : undefined);
  const crossingGate = ev.find((e) => e.kind === 'phaseAdvance' && e.data?.['to'] === 'landing');
  const landingEv = first('landingStart');
  const shutdownEv = first('coastalShutdown');
  const required = P(p, 'beach.requiredTroops');
  const monthZh = MONTH_ZH[a.month]!;
  const windowDays = Math.round(P(p, `weather.windowDays.m${a.month}`));
  const taiwanLoss = P(p, 'cross.coastalLossPerTransit') * 0.65 + P(p, 'cross.subLossPerTransit') + P(p, 'cross.airLossPerTransit') * 0.4;
  const usLoss = taiwanLoss * P(p, 'cross.usMultiplier') + P(p, 'cross.usSubLossPerTransit') * P(p, `regional.japanSortieCoef.${a.japan}`);
  const lastSnap = run.snapshots[run.snapshots.length - 1];
  const positionText = stats.percentile < 0.25 ? '前四分之一，比大多數局結束得早' : stats.percentile > 0.75 ? '後四分之一，比大多數局撐得久' : '中段，是一局常態';

  const zd = (day: number | undefined) => (day === undefined ? '' : zhDate(a.month, day));
  const slots: Record<string, string> = {
    yearZh: zhYear(2027),
    monthZh,
    dateD: zd(0),
    dateDetected: zd(detectedEv?.day ?? 0),
    dateEnd: zd(o.endedAt.day),
    dateLanding: zd(landingEv?.day ?? 0),
    dateUs: zd(usEv?.day ?? 0),
    datePenghu: zd(first('penghuTaken')?.day ?? 5),
    dateRequisition: zd(first('requisition')?.day ?? 0),
    dateReserve: zd(first('twReserveActivated')?.day ?? 0),
    dateDeparture: zd(first('fleetDeparture')?.day ?? 4),
    dateCrossingPlan: zd(4),
    dateInland: zd(ev.find((e) => e.kind === 'phaseAdvance' && e.data?.['to'] === 'inland')?.day ?? 0),
    dateTyphoon: zd(first('typhoon')?.day ?? 0),
    dateReroute: zd(first('shippingReroute')?.day ?? 0),
    dateMarket: zd(first('marketShock')?.day ?? 0),
    dateShutdown: zd(shutdownEv?.day ?? 0),
    dateHomefront: zd(shutdownEv?.day ?? 0),
    dateMoraleLow: zd(first('moraleLow')?.day ?? 0),
    endDay: String(o.endedAt.day),
    endDayZh: zhNumber(Math.max(0, o.endedAt.day)),
    leadDays: String(detectedEv ? -detectedEv.day : 0),
    detectedDay: String(detectedEv?.day ?? 0),
    requisitionDay: String(first('requisition')?.day ?? 0),
    reserveDay: String(first('twReserveActivated')?.day ?? 0),
    reservePct: pct(a.twReserve),
    reserveTen: String(Math.round(a.twReserve * 10)),
    portName: portFor(a.mainAxis).name,
    scaleText: { raid: '規模不大，但數得出來', medium: '數十艘規模', full: '含徵用民船的大規模集結' }[a.scale],
    liftWan: wan(Number(first('fleetDeparture')?.data?.['liftCapacity'] ?? first('phaseAdvance')?.text.match(/總運量 ([\d,]+)/)?.[1]?.replace(/,/g, '') ?? 0) || P(p, 'lift.amphibShips.count') * P(p, 'lift.troopsPerAmphib')),
    missiles: fmt(Number(first('strike')?.data?.['missiles'] ?? P(p, 'fire.firstWaveMissiles'))),
    coastalLeftPct: pct(Number(strikeGate?.text.match(/剩 (\d+)%/)?.[1] ?? 0) / 100 || (1 - P(p, 'fire.coastalFixedShare')) * 0.83),
    fixedSurvPct: pct(P(p, 'fire.fixedSiteSurvival')),
    mobileAttrPct: pct(P(p, 'fire.mobileLauncherDailyAttrition')),
    gateMaxPct: pct(P(p, 'gate.strike.coastalMissilesMax')),
    windowDays: String(windowDays),
    goodDayPct: pct(windowDays / 30),
    transitHours: String(Math.round(P(p, 'lift.transitHours'))),
    firstTransitLossPct: pct(taiwanLoss),
    taiwanLossPct: pct(taiwanLoss),
    usLossPct: pct(usLoss),
    penghuCostPct: pct(P(p, 'aux.penghu.liftCost')),
    feintCostPct: pct(P(p, 'aux.eastFeint.liftCost')),
    typhoonDay: String(first('typhoon')?.day ?? 0),
    typhoonHaltDays: String(first('typhoon')?.data?.['haltDays'] ?? 0),
    typhoonCount: String(TYPHOON_COUNT[a.month] ?? 0),
    landingDay: String(landingEv?.day ?? 0),
    regularBrigades: String(Number(landingEv?.text.match(/^(\d+) 個守備旅/)?.[1] ?? 2)),
    defenderStrength: fmt(Number(landingEv?.data?.['defenderStrength'] ?? 0)),
    usEntryDay: String(usEv?.day ?? 0),
    usFrom: a.japan === 'neutral' ? '自關島與航母' : '自沖繩、九州與關島',
    japanText: a.japan === 'neutral' ? '日本中立，美軍只能自關島與航母出擊，架次約降六成。' : a.japan === 'belligerent' ? '自衛隊同時加入對船團的攻擊。' : '日本開放基地，琉球水道同時對解放軍關閉。',
    failedByText: FAILED_BY_TEXT[o.failedBy ?? ''] ?? '',
    maxTroops: fmt(o.maxTroopsAshore),
    troopsAtEnd: fmt(lastSnap?.military.troopsAshore ?? 0),
    requiredTroops: fmt(required * 0.7),
    fleetLossPct: pct(o.fleetLoss),
    shutdownPct: pct(o.coastalShutdown),
    payrollPct: pct(lastSnap?.homefront.twBusinessPayroll ?? 0),
    marketPct: pct(-o.marketShockMax),
    chipPct: pct(Number(first('chipShutdown')?.data?.['chipOutput'] ?? 0)),
    rerouteDay: String(first('shippingReroute')?.day ?? 0),
    marketDay: String(first('marketShock')?.day ?? 0),
    marketShockEventPct: pct(-Number(first('marketShock')?.data?.['marketShock'] ?? 0)),
    shutdownFirstDay: String(shutdownEv?.day ?? 0),
    homefrontDay: String(shutdownEv?.day ?? 0),
    beachheadText: o.beachhead ? '仍在' : '未建立',
    outcomeShort: o.reason === 'gateFailed' ? `止於「${GATE_LABEL[o.failedGate!]}」` : '停止',
    axisName: { north: '北部', central: '中部', south: '南部', east: '東岸' }[a.mainAxis],
    auxText: { none: '不分兵', penghu: '先取澎湖', eastFeint: '東岸佯攻', blockadeFirst: '封鎖為主' }[a.auxiliary],
    groups: String(a.scale === 'raid' ? 3 : a.scale === 'medium' ? 5 : 8),
    n: String(stats.n),
    landedN: String(stats.landedN),
    solidN: String(stats.solidN),
    objectiveN: String(stats.objectiveN),
    medianDay: String(stats.medianDay),
    positionText,
    inlandDay: String(ev.find((e) => e.kind === 'phaseAdvance' && e.data?.['to'] === 'inland')?.day ?? 0),
    troopsAtLanding: fmt(Number(landingEv?.data?.['troopsAshore'] ?? 0)),
    supplyHitPct: pct(P(p, 'inland.supplyHitProbPerDay')),
    moraleLowDay: String(first('moraleLow')?.day ?? 0),
    reroutePct: pct(lastSnap?.world.shippingReroute ?? 0),
    energyPct: `${Math.round(((lastSnap?.world.energyPrice ?? 1) - 1) * 100)}%`,
  };
  slots['outlook'] = (outlook(run)?.text ?? '').replace(/。$/, '');
  const lessonTpl = T.lessons[key] ?? T.lessons['fleetBroken']!;
  slots['lessonText'] = fill(Array.isArray(lessonTpl) ? rng.pick(lessonTpl) : lessonTpl, slots, rng);

  // 條件
  const hasEvent = (kind: string) => ev.some((e) => e.kind === kind);
  const cond = (expr: string): boolean =>
    expr.split('&').every((raw) => {
      const atom = raw.trim();
      if (atom === 'always') return true;
      const neg = atom.startsWith('!');
      const body = neg ? atom.slice(1) : atom;
      let v: boolean;
      let m: RegExpExecArray | null;
      if ((m = /^phase(>=|<=|==)(\d)$/.exec(body))) {
        const k = Number(m[2]);
        v = m[1] === '>=' ? endIdx >= k : m[1] === '<=' ? endIdx <= k : endIdx === k;
      } else if ((m = /^reason=(\w+)$/.exec(body))) v = o.reason === m[1];
      else if ((m = /^failedBy=(\w+)$/.exec(body))) v = o.failedBy === m[1];
      else if ((m = /^aux=(\w+)$/.exec(body))) v = a.auxiliary === m[1];
      else if ((m = /^us=(\w+)$/.exec(body))) v = a.us === m[1];
      else if ((m = /^axis=(\w+)$/.exec(body))) v = a.mainAxis === m[1];
      else if ((m = /^scale=(\w+)$/.exec(body))) v = a.scale === m[1];
      else if ((m = /^event:(\w+)$/.exec(body))) v = hasEvent(m[1]!);
      else v = false;
      return neg ? !v : v;
    });

  // 註釋
  const notes: { n: number; event: Event }[] = [];
  const noteFor = (e: Event): number => {
    const found = notes.find((x) => x.event.id === e.id);
    if (found) return found.n;
    const n = notes.length + 1;
    notes.push({ n, event: e });
    return n;
  };
  const refEvent = (kind: string): Event | undefined => {
    switch (kind) {
      case 'strikeGate':
        return strikeGate;
      case 'crossingGate':
        return crossingGate;
      case 'landingGate':
        return ev.find((e) => e.kind === 'phaseAdvance' && e.data?.['to'] === 'inland');
      case 'gateFailed':
        return ev.find((e) => e.kind === 'gateFailed');
      default:
        return first(kind);
    }
  };
  const resolveRefs = (text: string) =>
    text.replace(/\{ref:(\w+)\}/g, (_s, kind: string) => {
      const e = refEvent(kind);
      return e ? `[${noteFor(e)}]` : '';
    });

  // 聲音：依階段時間範圍
  const phaseStart = (idx: number): number => {
    if (idx <= 0) return -Infinity;
    const adv = ev.find((e) => e.kind === 'phaseAdvance' && PHASE_IDX[String(e.data?.['to']) as Phase] === idx);
    return adv ? adv.day * 24 + adv.hour : Infinity;
  };
  const usedQuotes = new Set<number>();
  const voiceIn = (loIdx: number, hiIdx: number): Event | null => {
    const lo = phaseStart(loIdx);
    const hi = phaseStart(hiIdx + 1);
    const pool = ev.filter((e) => e.layer === 'voice' && !usedQuotes.has(e.id) && e.day * 24 + e.hour >= lo && e.day * 24 + e.hour < hi);
    const pick = pool.length ? rng.pick(pool) : (ev.filter((e) => e.layer === 'voice' && !usedQuotes.has(e.id))[0] ?? null);
    if (pick) usedQuotes.add(pick.id);
    return pick;
  };
  const toQuote = (e: Event | null): Quote | null => {
    if (!e) return null;
    const name = String(e.data?.['personaName'] ?? e.personaId ?? '');
    const parts = name.split(' · ');
    return { text: e.text.replace(/D([+-]\d{1,2})/g, (_m, n: string) => dateLabel(a.month, Number(n))), location: parts[0] ?? '', who: parts.slice(1).join(' · ') || name, day: e.day, eventId: e.id };
  };

  const appendix: string[] = [];
  const buildSection = (tpl: SectionTpl, quote: Event | null): Section => {
    const paragraphs: string[] = [];
    for (const para of tpl.paragraphs) {
      if (!cond(para.when)) continue;
      if (para.prob !== undefined && !rng.chance(para.prob)) continue;
      const v = rng.pick(para.variants);
      paragraphs.push(resolveRefs(fill(v, slots, rng)));
      if (para.appendix) {
        const ap = fill(para.appendix, slots);
        if (!appendix.includes(ap)) appendix.push(ap);
      }
    }
    return { heading: fill(tpl.heading, slots), paragraphs, quote: toQuote(quote) };
  };

  const sections: Section[] = [];
  sections.push(buildSection(T.sections.visible, voiceIn(0, 1)));
  sections.push(buildSection(T.sections.strait, voiceIn(2, 3)));
  sections.push(buildSection(T.sections.ending, voiceIn(4, 4)));
  if (endIdx >= 1 || hasEvent('detected')) sections.push(buildSection(T.sections.world, voiceIn(1, 4)));

  const titleVariants = T.titles[key] ?? T.titles['fleetBroken']!;
  const title = fill(rng.pick(titleVariants), slots, rng);
  const subtitle = `一場在${zd(o.endedAt.day)}${o.reason === 'objectiveReached' ? '達標' : '停止'}的登陸 · 主攻${slots['axisName']}、${slots['auxText']} · 每一句可回溯到數據`;
  const tail = [
    `本局 seed ${run.seed}，引擎 ${ENGINE_VERSION}，同組假設 ${stats.n} 局。`,
    run.flagged.length ? `標紅假設：${run.flagged.join('、')}。超出公開資料範圍的設定，史書與事件簿同步高亮。` : '本局沒有超出公開資料範圍的設定。',
    '數字來自 data/params.json 的抽樣值與本局事件；來源見資料來源頁。本章由模板拼裝，執行期不呼叫任何網路服務。',
  ];
  const charCount = sections.reduce((s, sec) => s + sec.paragraphs.reduce((x, p) => x + p.length, 0) + (sec.quote ? sec.quote.text.length : 0), 0) + title.length;
  return { book, chapterNo, chapterNoZh: `第${zhNumber(chapterNo)}章`, title, subtitle, sections, notes, appendix, tail, charCount };
}

/**
 * 填槽。`{slot}` 換成值；`{{甲|乙|丙}}` 是行內替換，給了 rng 就依 seed 抽一個（沒給 rng 取第一個），
 * 讓同一段變體在不同局長得不一樣。行內替換可巢狀，由內而外解。
 */
export function fill(text: string, slots: Record<string, string>, rng?: { pick<T>(xs: readonly T[]): T }): string {
  let out = text;
  for (let guard = 0; guard < 8 && out.includes('{{'); guard++) {
    out = out.replace(/\{\{([^{}]*)\}\}/g, (_m, body: string) => {
      const opts = body.split('|');
      return rng ? rng.pick(opts) : opts[0]!;
    });
  }
  return out.replace(/\{(\w+)\}/g, (s, k: string) => (k.startsWith('ref') ? s : (slots[k] ?? s)));
}

/** 從一批結果算統計（給章節與分享卡）。 */
export function batchStats(outcomes: { endedAt: { day: number }; beachhead: boolean; solidBeachhead: boolean; reason: string }[], mine: { endedAt: { day: number } }): BatchStats {
  const days = outcomes.map((o) => o.endedAt.day).sort((x, y) => x - y);
  const n = outcomes.length;
  const below = days.filter((d) => d < mine.endedAt.day).length;
  return {
    n,
    landedN: outcomes.filter((o) => o.beachhead).length,
    solidN: outcomes.filter((o) => o.solidBeachhead).length,
    objectiveN: outcomes.filter((o) => o.reason === 'objectiveReached').length,
    medianDay: days[Math.floor(n / 2)] ?? 0,
    percentile: n ? below / n : 0.5,
  };
}
