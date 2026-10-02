/**
 * 聲音系統（HANDOFF §8）。
 * 聲音是一種事件，和軍事事件在同一條流裡交錯出現。執行期不呼叫任何 API：
 * 觸發時以 seed 從人物庫抽人、從該人的模板抽句、填入當前狀態量。
 *
 * 實作為模擬結束後的「事後抽樣」：用主迴圈每 6 小時留下的指標紀錄（metricLog）當狀態，
 * 從同一個 rng 接著抽，保證決定性，且每局聲音數可控制在 12–20 則。
 * 流程：
 *   1. 觸發點 = 非聲音事件 + 每日 06:00（讓安靜的日子也有人說話）
 *   2. N = rng.int(12, 20)；在時間軸上等距挑 N 個觸發點，每個有事件的階段至少一個
 *   3. 每個觸發點：找 triggers 成立、還沒出場滿 3 次、下一個 stage 有可用模板的人物，
 *      加權抽一個（出場少、階層還沒出現過的優先），再從符合 requires 的模板抽一句
 *   4. 填槽、排進事件流、重新編號，data.triggerEventId 指向觸發事件
 */
import type { Assumptions, Event, EventLayer, State } from './types.js';
import type { Rng } from './rng.js';
import type { SampledParams } from './params.js';
import { P } from './params.js';
import personasJson from '../../data/personas.json';
import templatesJson from '../../data/voice-templates.json';

export type Stratum = 'frontline' | 'homefrontLabor' | 'twBusiness' | 'party' | 'rearFamily' | 'regional' | 'world' | 'taiwan';

export interface PersonaTrigger {
  layer: string;
  metric: string;
  gte?: number;
  lte?: number;
}
export interface Persona {
  id: string;
  stratum: Stratum;
  name: string;
  side: string;
  location: string;
  unit?: string;
  maxAppearances: number;
  listens: EventLayer[];
  triggers: PersonaTrigger[];
  triggerMode?: 'any' | 'all';
  tone: string[];
}
export interface VoiceTemplate {
  personaId: string;
  stage: number;
  tone: string;
  text: string;
  slots?: Record<string, string>;
  requires: Record<string, [number, number]>;
}

export const PERSONAS: readonly Persona[] = (personasJson as unknown as { personas: Persona[] }).personas;
export const TEMPLATES: readonly VoiceTemplate[] = (templatesJson as unknown as { templates: VoiceTemplate[] }).templates;

export const VOICES_PER_RUN: [number, number] = [12, 20];

/** 每 6 小時一筆的指標紀錄（主迴圈不管有沒有保留快照都會記）。 */
export interface MetricRecord {
  t: number; // 小時數 = day*24+hour
  m: Record<string, number>;
}

export const PHASE_INDEX = { mobilize: 0, strike: 1, crossing: 2, landing: 3, inland: 4 } as const;

/** 把 State 壓成扁平指標，給 triggers 與 requires 比對。 */
export function flattenMetrics(s: State): Record<string, number> {
  const g = s.military.fleetGroups;
  const fleetStrength = g.length ? g.reduce((a, x) => a + x.strength, 0) / g.length : 0;
  const f = (name: string) => (s.flags.has(name) ? 1 : 0);
  return {
    day: s.day,
    hour: s.hour,
    phaseIndex: PHASE_INDEX[s.phase],
    fleetStrength,
    fleetLoss: s.military.fleetLoss,
    troopsAshore: s.military.troopsAshore,
    troopsArrived: s.military.troopsArrived,
    twCoastalMissiles: s.military.twCoastalMissiles,
    airControl: s.military.airControl,
    supplyDays: s.military.supplyDays,
    beachhead: s.military.beachhead ? 1 : 0,
    seaGood: s.military.seaGood ? 1 : 0,
    weatherWindowDays: s.military.weatherWindowDays,
    usEngaged: s.regional.usEngaged ? 1 : 0,
    japanBases: s.regional.japanBases ? 1 : 0,
    ryukyuClosed: s.regional.ryukyuClosed ? 1 : 0,
    chipOutput: s.world.chipOutput,
    shippingReroute: s.world.shippingReroute,
    energyPrice: s.world.energyPrice,
    marketShock: s.world.marketShock,
    coastalShutdown: s.homefront.coastalShutdown,
    twBusinessPayroll: s.homefront.twBusinessPayroll,
    morale: s.homefront.morale,
    priceIndex: s.homefront.priceIndex,
    detected: f('detected'),
    reserveActivated: f('twReserveActivated'),
    requisition: f('requisition'),
    penghuTaken: f('penghuTaken'),
    seaClosed: f('seaClosed'),
    solidBeachhead: f('solidBeachhead'),
  };
}

function triggered(p: Persona, m: Record<string, number>): boolean {
  const ok = (t: PersonaTrigger) => {
    const v = m[t.metric];
    if (v === undefined) return false;
    if (t.gte !== undefined && v < t.gte) return false;
    if (t.lte !== undefined && v > t.lte) return false;
    return true;
  };
  return (p.triggerMode ?? 'any') === 'all' ? p.triggers.every(ok) : p.triggers.some(ok);
}

function requiresOk(tpl: VoiceTemplate, m: Record<string, number>): boolean {
  for (const [k, [lo, hi]] of Object.entries(tpl.requires)) {
    const v = m[k];
    if (v === undefined || v < lo || v > hi) return false;
  }
  return true;
}

export interface VoiceContext {
  a: Assumptions;
  p: SampledParams;
  events: Event[]; // 非聲音事件，已依時間排序、id 連號
  metricLog: MetricRecord[];
  endTime: number; // 小時數
  rng: Rng;
  templates?: readonly VoiceTemplate[];
  personas?: readonly Persona[];
}

interface TriggerPoint {
  t: number;
  eventIdx: number; // 觸發事件在 events 的索引
  layer: EventLayer | 'daily';
  phaseIndex: number;
}

const dl = (d: number) => (d < 0 ? `D${d}` : `D+${d}`);

export function fillVoiceSlots(text: string, persona: Persona, m: Record<string, number>, p: SampledParams, a: Assumptions): string {
  const totalShips =
    P(p, 'lift.amphibShips.count') * P(p, `lift.scaleAmphibFraction.${a.scale}`) +
    P(p, 'lift.roro.count') * P(p, 'lift.roro.availability') * P(p, `lift.scaleRoroFraction.${a.scale}`);
  const slots: Record<string, string> = {
    day: dl(m['day'] ?? 0),
    place: persona.location,
    unit: persona.unit ?? '部隊',
    amount: `${Math.round((m['coastalShutdown'] ?? 0) * 100)}%`,
    ships: String(Math.max(1, Math.round((m['fleetLoss'] ?? 0) * totalShips))),
    troops: Math.round(m['troopsAshore'] ?? 0).toLocaleString('zh-Hant-TW'),
  };
  return text.replace(/\{(\w+)\}/g, (s, k: string) => slots[k] ?? s);
}

/** 回傳插入聲音後、重新編號的完整事件流。 */
export function applyVoices(ctx: VoiceContext): Event[] {
  const templates = ctx.templates ?? TEMPLATES;
  const personas = ctx.personas ?? PERSONAS;
  const { events, metricLog, rng } = ctx;
  if (templates.length === 0 || metricLog.length === 0) return events;

  const metricsAt = (t: number): Record<string, number> => {
    let best = metricLog[0]!;
    for (const r of metricLog) {
      if (r.t <= t) best = r;
      else break;
    }
    return best.m;
  };

  // 1. 觸發點
  const points: TriggerPoint[] = [];
  events.forEach((e, i) => {
    if (e.layer === 'voice' || e.kind === 'start') return;
    points.push({ t: e.day * 24 + e.hour, eventIdx: i, layer: e.layer, phaseIndex: metricsAt(e.day * 24 + e.hour)['phaseIndex'] ?? 0 });
  });
  const firstDay = Math.floor(metricLog[0]!.t / 24);
  const lastDay = Math.floor(ctx.endTime / 24);
  for (let d = firstDay + 1; d < lastDay; d++) {
    const t = d * 24 + 6;
    let idx = 0;
    for (let i = 0; i < events.length; i++) if (events[i]!.day * 24 + events[i]!.hour <= t) idx = i;
    points.push({ t, eventIdx: idx, layer: 'daily', phaseIndex: metricsAt(t)['phaseIndex'] ?? 0 });
  }
  points.sort((x, y) => x.t - y.t || (x.layer === 'daily' ? 1 : -1));
  if (points.length === 0) return events;

  // 2. 先保證每個有觸發點的階段至少一個（取該階段中間的點），再等距補到 N 個，優先真實事件
  const N = Math.min(points.length, rng.int(VOICES_PER_RUN[0], VOICES_PER_RUN[1]));
  const chosen = new Set<number>();
  const phasesPresent = [...new Set(points.map((p) => p.phaseIndex))].sort();
  for (const ph of phasesPresent) {
    const idxs = points.map((p, i) => (p.phaseIndex === ph ? i : -1)).filter((i) => i >= 0);
    const real = idxs.filter((i) => points[i]!.layer !== 'daily');
    const pool = real.length ? real : idxs;
    if (pool.length && chosen.size < N) chosen.add(pool[Math.floor(pool.length / 2)]!);
  }
  for (let k = 0; k < N && chosen.size < N; k++) {
    const target = Math.floor(((k + 0.5) * points.length) / N);
    let pick = -1;
    for (let w = 0; w < points.length && pick < 0; w++) {
      for (const cand of [target - w, target + w]) {
        if (cand < 0 || cand >= points.length || chosen.has(cand)) continue;
        if (w === 0 && points[cand]!.layer === 'daily') {
          const alt = [cand - 1, cand + 1].find((c) => c >= 0 && c < points.length && !chosen.has(c) && points[c]!.layer !== 'daily');
          if (alt !== undefined) {
            pick = alt;
            break;
          }
        }
        pick = cand;
        break;
      }
    }
    if (pick >= 0) chosen.add(pick);
  }

  // 3. 逐點抽人、抽句；不足 N 則時從沒選到的點依時間補位
  const appearances = new Map<string, number>();
  const lastTime = new Map<string, number>();
  const strataUsed = new Set<Stratum>();
  const voices: { t: number; e: Event; triggerIdx: number }[] = [];
  const tryPoint = (pt: TriggerPoint): boolean => {
    const m = metricsAt(pt.t);
    const eligible = (strict: boolean) =>
      personas.filter((p) => {
        const n = appearances.get(p.id) ?? 0;
        if (n >= p.maxAppearances) return false;
        if ((lastTime.get(p.id) ?? -Infinity) >= pt.t) return false; // 補位時不讓 stage 時間倒置
        if (strict && pt.layer !== 'daily' && !p.listens.includes(pt.layer)) return false;
        if (!triggered(p, m)) return false;
        return templates.some((tpl) => tpl.personaId === p.id && tpl.stage === n + 1 && requiresOk(tpl, m));
      });
    let pool = eligible(true);
    if (pool.length === 0) pool = eligible(false);
    if (pool.length === 0) return false;
    const weights = pool.map((p) => (1 / (1 + (appearances.get(p.id) ?? 0))) * (strataUsed.has(p.stratum) ? 1 : 1.8));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    let persona = pool[pool.length - 1]!;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        persona = pool[i]!;
        break;
      }
    }
    const stage = (appearances.get(persona.id) ?? 0) + 1;
    const tpls = templates.filter((tpl) => tpl.personaId === persona.id && tpl.stage === stage && requiresOk(tpl, m));
    const tpl = rng.pick(tpls);
    appearances.set(persona.id, stage);
    const t = Math.min(ctx.endTime, pt.t + rng.int(1, 6));
    lastTime.set(persona.id, t);
    strataUsed.add(persona.stratum);
    const mAt = metricsAt(t);
    const text = fillVoiceSlots(tpl.text, persona, { ...mAt, day: Math.floor(t / 24) }, ctx.p, ctx.a);
    voices.push({
      t,
      triggerIdx: pt.eventIdx,
      e: {
        id: -1,
        day: Math.floor(t / 24),
        hour: ((t % 24) + 24) % 24,
        layer: 'voice',
        kind: 'voice',
        text,
        personaId: persona.id,
        data: { triggerEventId: pt.eventIdx, personaName: persona.name, stratum: persona.stratum, location: persona.location, stage, tone: tpl.tone },
      },
    });
    return true;
  };
  const tried = new Set<number>();
  for (const idx of [...chosen].sort((x, y) => points[x]!.t - points[y]!.t)) {
    tried.add(idx);
    tryPoint(points[idx]!);
  }
  if (voices.length < N) {
    const rest = points.map((_, i) => i).filter((i) => !tried.has(i));
    // 等距補位，從剩下的點裡挑，依時間處理
    const need = N - voices.length;
    const picks: number[] = [];
    for (let k = 0; k < need && rest.length > 0; k++) picks.push(rest[Math.floor(((k + 0.5) * rest.length) / need)]!);
    for (const idx of [...new Set(picks)].sort((x, y) => points[x]!.t - points[y]!.t)) {
      tried.add(idx);
      tryPoint(points[idx]!);
    }
    // 還不夠就逐點掃
    for (const idx of rest.filter((i) => !tried.has(i)).sort((x, y) => points[x]!.t - points[y]!.t)) {
      if (voices.length >= N) break;
      tryPoint(points[idx]!);
    }
  }

  // 4. 合併、重新編號、修正 triggerEventId
  type Row = { t: number; order: number; e: Event; triggerIdx: number | null; oldIdx: number | null };
  const rows: Row[] = events.map((e, i) => ({ t: e.day * 24 + e.hour, order: 0, e, triggerIdx: null, oldIdx: i }));
  for (const v of voices) rows.push({ t: v.t, order: 1, e: v.e, triggerIdx: v.triggerIdx, oldIdx: null });
  rows.sort((x, y) => x.t - y.t || x.order - y.order || (x.oldIdx ?? 1e9) - (y.oldIdx ?? 1e9));
  const newIdOfOld = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.oldIdx !== null) newIdOfOld.set(r.oldIdx, i);
  });
  return rows.map((r, i) => {
    const e: Event = { ...r.e, id: i };
    if (r.triggerIdx !== null && e.data) e.data = { ...e.data, triggerEventId: newIdOfOld.get(r.triggerIdx) ?? 0 };
    return e;
  });
}
