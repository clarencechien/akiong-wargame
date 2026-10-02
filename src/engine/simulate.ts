import type { Assumptions, Outcome, Run, State } from './types.js';
import { mulberry32, mix32 } from './rng.js';
import { sampleParams } from './params.js';
import { cloneState, derive, flaggedAssumptions, hashAssumptions, initialState } from './assumptions.js';
import { makeEmitter, type Ctx } from './context.js';
import { tickRegional } from './layers/regional.js';
import { tickWorld } from './layers/world.js';
import { tickHomefront } from './layers/homefront.js';
import { dailyMilitary, tickBeachCombat, tickFleet } from './layers/military.js';
import { gateMobilize, tickMobilize } from './phases/mobilize.js';
import { gateStrike, tickStrike } from './phases/strike.js';
import { gateCrossing, tickCrossing } from './phases/crossing.js';
import { enterLanding, gateLanding, landingStartHour, tickLanding } from './phases/landing.js';
import { MAX_DAY, gateInland, tickInland } from './phases/inland.js';
import { GATE_LABEL, type GateResult } from './phases/gates.js';
import { dayLabel } from './context.js';
import { applyVoices, flattenMetrics, type MetricRecord, type VoiceTemplate } from './voices.js';

export const ENGINE_VERSION = 'v0.1.0';

export interface RunOptions {
  /** 是否保留每 6 小時快照（CLI 跑分佈時關掉省記憶體） */
  snapshots?: boolean;
  /** 覆寫聲音模板（測試候選檔用）；省略 = data/voice-templates.json */
  voiceTemplates?: readonly VoiceTemplate[];
  /** 關掉聲音（CLI 跑分佈時省時間） */
  voices?: boolean;
}

/** run(assumptions, seed) → Run。決定性：同假設 + 同 seed → 同一局。 */
export function run(assumptions: Assumptions, seed: number, opts: RunOptions = {}): Run {
  const keepSnapshots = opts.snapshots ?? true;
  const rng = mulberry32(mix32(hashAssumptions(assumptions), seed >>> 0));
  const p = sampleParams(rng);
  const k = derive(assumptions, p, rng);
  const s = initialState(assumptions, p, k);
  const flagged = flaggedAssumptions(assumptions);
  const base = { a: assumptions, p, rng, s, events: [], flagged, k } as Omit<Ctx, 'emit' | 'param'>;
  const ctx: Ctx = { ...base, ...makeEmitter(base) };

  const snapshots: State[] = [];
  const metricLog: MetricRecord[] = [];
  let maxTroopsAshore = 0;
  let marketShockMax = 0;
  let fleetLossToday = 0;
  let outcome: Outcome | null = null;

  ctx.emit('military', 'start', `${dayLabel(s.day)}：聯合作戰指揮中心下達集結令。主攻軸${axisName(assumptions.mainAxis)}，${scaleName(assumptions.scale)}。`, {
    assemblyDays: k.assemblyDays,
  });

  while (outcome === null) {
    // 日界
    if (s.hour === 0) {
      dailyMilitary(ctx);
      tickHomefront(ctx, fleetLossToday);
      fleetLossToday = 0;
    }
    tickRegional(ctx);
    tickWorld(ctx);

    switch (s.phase) {
      case 'mobilize':
        tickMobilize(ctx);
        break;
      case 'strike':
        tickStrike(ctx);
        break;
      case 'crossing':
        tickCrossing(ctx);
        fleetLossToday += tickFleet(ctx, true);
        tickBeachCombatIfAny(ctx);
        break;
      case 'landing':
        tickLanding(ctx);
        fleetLossToday += tickFleet(ctx, true);
        tickBeachCombat(ctx, s.day * 24 + s.hour - landingStartHour(ctx));
        break;
      case 'inland':
        tickInland(ctx);
        fleetLossToday += tickFleet(ctx, true);
        tickBeachCombat(ctx, s.day * 24 + s.hour - landingStartHour(ctx));
        break;
    }

    maxTroopsAshore = Math.max(maxTroopsAshore, s.military.troopsAshore);
    if (s.phase === 'inland' && !s.flags.has('solidBeachhead') && s.military.supplyDays >= 3 && s.military.troopsAshore >= k.requiredTroops) {
      s.flags.add('solidBeachhead');
      ctx.emit('military', 'solidBeachhead', `灘頭堡穩固：補給線連續 ${Math.round(s.military.supplyDays)} 天未斷，上岸兵力 ${Math.round(s.military.troopsAshore)} 人，守方轉入縱深防禦。`, {
        troopsAshore: Math.round(s.military.troopsAshore),
      });
    }
    marketShockMax = Math.min(marketShockMax, s.world.marketShock);

    // 家前線 → 直接結算
    if (s.phase !== 'mobilize' && s.homefront.morale < ctx.param('inland.moraleFloor')) {
      ctx.emit('homefront', 'stopped', `士氣跌破 ${ctx.param('inland.moraleFloor')}，中央宣布「階段性目標已達成」，行動停止。`, {
        morale: s.homefront.morale,
      });
      outcome = finish(ctx, { kind: 'timeout', by: 'moraleCollapse', text: '' }, maxTroopsAshore, marketShockMax);
      break;
    }

    const g = gate(ctx);
    if (g) {
      if (g.kind === 'pass') {
        ctx.emit('military', 'phaseAdvance', g.text, { from: s.phase, to: g.next });
        s.phase = g.next;
        if (g.next === 'landing') enterLanding(ctx);
        if (g.next === 'inland') s.military.beachhead = true;
      } else {
        if (g.kind === 'fail') {
          ctx.emit('military', 'gateFailed', g.text, { gate: g.gate, by: g.by, shortfall: Math.round(g.shortfall * 100) / 100, label: GATE_LABEL[g.gate] });
        } else if (g.kind === 'objective') {
          ctx.emit('military', 'objectiveReached', g.text);
        } else {
          ctx.emit('military', 'timeout', g.text, { by: g.by });
        }
        outcome = finish(ctx, g, maxTroopsAshore, marketShockMax);
        break;
      }
    }

    // 時間上限
    if (s.day >= MAX_DAY && s.hour === 23) {
      ctx.emit('military', 'timeout', `D+${MAX_DAY}：戰事膠著，灘頭堡${s.military.beachhead ? '仍在' : '未建立'}，上岸兵力 ${Math.round(s.military.troopsAshore)} 人。`, { by: 'day30' });
      outcome = finish(ctx, { kind: 'timeout', by: 'day30', text: '' }, maxTroopsAshore, marketShockMax);
      break;
    }

    // 快照（每 6 小時）；指標紀錄給聲音系統用，一律記
    if (s.hour % 6 === 0) {
      if (keepSnapshots) snapshots.push(cloneState(s));
      metricLog.push({ t: s.day * 24 + s.hour, m: flattenMetrics(s) });
    }

    // 推進 1 小時
    s.hour++;
    if (s.hour === 24) {
      s.hour = 0;
      s.day++;
    }
  }
  if (keepSnapshots) snapshots.push(cloneState(s));
  metricLog.push({ t: s.day * 24 + s.hour, m: flattenMetrics(s) });

  const voiceOpts: Parameters<typeof applyVoices>[0] = { a: assumptions, p, events: ctx.events, metricLog, endTime: s.day * 24 + s.hour, rng };
  if (opts.voiceTemplates) voiceOpts.templates = opts.voiceTemplates;
  const events = opts.voices === false ? ctx.events : applyVoices(voiceOpts);

  return {
    engineVersion: ENGINE_VERSION,
    assumptions,
    seed: seed >>> 0,
    sampledParams: p,
    flagged,
    events,
    snapshots,
    outcome,
  };
}

function tickBeachCombatIfAny(ctx: Ctx): void {
  // 渡海期間已上岸的先頭部隊也會接戰（守方戰力尚未正式展開，用一半）
  if (ctx.s.military.troopsAshore > 0 && ctx.s.military.defenderStrength === 0) {
    // 尚未進入 landing：只受零星砲擊
    ctx.s.military.troopsAshore *= 1 - ctx.param('beach.hourlyExchangeRate') * 0.25;
  }
}

function gate(ctx: Ctx): GateResult | null {
  switch (ctx.s.phase) {
    case 'mobilize':
      return gateMobilize(ctx);
    case 'strike':
      return gateStrike(ctx);
    case 'crossing':
      return gateCrossing(ctx);
    case 'landing':
      return gateLanding(ctx);
    case 'inland':
      return gateInland(ctx);
  }
}

function finish(ctx: Ctx, g: GateResult, maxTroopsAshore: number, marketShockMax: number): Outcome {
  const s = ctx.s;
  const o: Outcome = {
    endedAt: { day: s.day, phase: s.phase },
    reason: g.kind === 'fail' ? 'gateFailed' : g.kind === 'objective' ? 'objectiveReached' : 'timeout',
    maxTroopsAshore: Math.round(maxTroopsAshore),
    fleetLoss: Math.round(s.military.fleetLoss * 1000) / 1000,
    coastalShutdown: Math.round(s.homefront.coastalShutdown * 1000) / 1000,
    marketShockMax: Math.round(marketShockMax * 1000) / 1000,
    beachhead: s.military.beachhead,
    solidBeachhead: s.flags.has('solidBeachhead'),
  };
  if (g.kind === 'fail') {
    o.failedGate = g.gate;
    o.gateShortfall = Math.round(g.shortfall * 1000) / 1000;
    o.failedBy = g.by;
  } else if (g.kind === 'timeout') {
    o.failedBy = g.by;
  }
  return o;
}

function axisName(axis: Assumptions['mainAxis']): string {
  return { north: '北部', central: '中部', south: '南部', east: '東岸' }[axis];
}
function scaleName(scale: Assumptions['scale']): string {
  return { raid: '偷襲型動員', medium: '中型動員', full: '全面動員並徵用民船' }[scale];
}
