import type { Rng } from './rng.js';
import type { Assumptions, Event, EventLayer, State } from './types.js';
import { P, type SampledParams } from './params.js';

/** 一局模擬期間共用的上下文；所有階段與層都透過它讀參數、發事件。 */
export interface Ctx {
  a: Assumptions;
  p: SampledParams;
  rng: Rng;
  s: State;
  events: Event[];
  flagged: string[];
  /** 本局常數（由假設 + 抽樣參數推得，開局算一次） */
  k: Derived;
  emit(layer: EventLayer, kind: string, text: string, data?: Record<string, number | string>): Event;
  param(id: string): number;
}

export interface Derived {
  assemblyDays: number;
  detectedDay: number;
  windowDays: number; // 本月可用海況天數（抽樣後）
  typhoonDay: number | null; // 颱風開始日（D+n），null = 無
  typhoonHaltDays: number;
  usEntryDay: number | null;
  sortieCoef: number; // 日本態度 → 美軍出擊架次係數
  requiredTroops: number;
  liftCapacity: number; // 每波滿載可運兵力（已扣輔助作戰）
  auxLiftCost: number;
  beachCount: number;
  beachThroughputPerDay: number; // 主攻區每日可卸載兵力
  regularBrigades: number; // 主攻灘頭守備旅（即時在位）
  regionalBrigades: number; // 主攻區其餘常備旅（陸續到位）
  reserveBrigades: number; // 主攻區可投入後備旅
  supplyable: boolean;
  crossingStartDay: number;
}

export function makeEmitter(ctx: Omit<Ctx, 'emit' | 'param'>): Pick<Ctx, 'emit' | 'param'> {
  return {
    emit(layer, kind, text, data) {
      const ev: Event = {
        id: ctx.events.length,
        day: ctx.s.day,
        hour: ctx.s.hour,
        layer,
        kind,
        text,
      };
      if (data) ev.data = data;
      if (ctx.flagged.length > 0 && (kind === 'gateFailed' || kind === 'phaseAdvance' || kind === 'landingStart')) {
        ev.flaggedParams = [...ctx.flagged];
      }
      ctx.events.push(ev);
      return ev;
    },
    param(id) {
      return P(ctx.p, id);
    },
  };
}

export function dayLabel(day: number): string {
  if (day < 0) return `D${day}`;
  return `D+${day}`;
}

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('zh-Hant-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
