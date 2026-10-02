import type { Assumptions, FleetGroup, State } from './types.js';
import type { SampledParams } from './params.js';
import { P } from './params.js';
import { GEO, beachesOf, portFor } from './geography.js';
import type { Derived } from './context.js';
import type { Rng } from './rng.js';
import { fnv1a } from './rng.js';

export const BASELINE: Assumptions = {
  month: 4,
  scale: 'medium',
  us: 'delayed',
  japan: 'bases',
  twReserve: 0.55,
  econTolerance: 'high',
  mainAxis: 'north',
  auxiliary: 'penghu',
};

/** 第一版每區代表灘頭數 */
const BEACHES_PER_REGION = 2;

const SCALE_CODE = { raid: 0, medium: 1, full: 2 } as const;
const US_CODE = { none: 0, delayed: 1, immediate: 2 } as const;
const JP_CODE = { neutral: 0, bases: 1, belligerent: 2 } as const;
const RES_CODE = { 0.3: 0, 0.55: 1, 0.8: 2 } as const;
const ECON_CODE = { low: 0, high: 1 } as const;
const AXIS_CODE = { north: 0, central: 1, south: 2, east: 3 } as const;
const AUX_CODE = { none: 0, penghu: 1, eastFeint: 2, blockadeFirst: 3 } as const;
const GREY_CODE = { low: 1, mid: 2, high: 3 } as const;

/** 假設 → 固定 4 bytes（HANDOFF §7）。 */
export function packAssumptions(a: Assumptions): Uint8Array {
  const b0 = (a.month - 1) | (SCALE_CODE[a.scale] << 4) | (US_CODE[a.us] << 6);
  const b1 = JP_CODE[a.japan] | (RES_CODE[a.twReserve] << 2) | (ECON_CODE[a.econTolerance] << 4) | (AXIS_CODE[a.mainAxis] << 5);
  const b2 = AUX_CODE[a.auxiliary] | ((a.greyZone ? GREY_CODE[a.greyZone] : 0) << 2);
  return new Uint8Array([b0, b1, b2, 0]);
}

export function hashAssumptions(a: Assumptions): number {
  return fnv1a(Array.from(packAssumptions(a)).join(','));
}

/** 標紅的假設（超出公開分析的合理範圍）。 */
export function flaggedAssumptions(a: Assumptions): string[] {
  const out: string[] = [];
  if (a.mainAxis === 'east') out.push('assumption.mainAxis.east');
  if (a.auxiliary === 'blockadeFirst') out.push('assumption.auxiliary.blockadeFirst');
  return out;
}

/** 由假設與抽樣參數算本局常數。 */
export function derive(a: Assumptions, p: SampledParams, rng: Rng): Derived {
  const assemblyDays = Math.round(P(p, `detect.assemblyWeeks.${a.scale}`) * 7);
  const detectedDay = -Math.round(P(p, `detect.leadDays.${a.scale}`));
  const windowDays = Math.round(P(p, `weather.windowDays.m${a.month}`));
  const typhoonProb = P(p, `weather.typhoonProb.m${a.month}`);
  const typhoonDay = rng.chance(typhoonProb) ? rng.int(0, 20) : null;
  const typhoonHaltDays = Math.round(P(p, 'weather.typhoonHaltDays'));

  const usEntryDay = a.us === 'none' ? null : Math.round(P(p, `regional.usEntryDay.${a.us}`));
  const sortieCoef = P(p, `regional.japanSortieCoef.${a.japan}`);

  const amphib = P(p, 'lift.amphibShips.count') * P(p, `lift.scaleAmphibFraction.${a.scale}`) * P(p, 'lift.troopsPerAmphib');
  const roro =
    P(p, 'lift.roro.count') *
    P(p, 'lift.roro.availability') *
    P(p, `lift.scaleRoroFraction.${a.scale}`) *
    P(p, 'lift.troopsPerRoro') *
    P(p, 'lift.roroBeachFactor');
  let auxLiftCost = 0;
  if (a.auxiliary === 'penghu') auxLiftCost = P(p, 'aux.penghu.liftCost');
  if (a.auxiliary === 'eastFeint') auxLiftCost = P(p, 'aux.eastFeint.liftCost');
  const liftCapacity = Math.round((amphib + roro) * (1 - auxLiftCost));

  const beaches = beachesOf(a.mainAxis);
  const region = GEO.regions[a.mainAxis];
  // 第一版每區用 1–2 處代表灘頭
  const beachCount = Math.min(BEACHES_PER_REGION, beaches.length);
  const regularBrigades = beaches.slice(0, beachCount).reduce((s, b) => s + b.defBrigades, 0);
  const supplyable = beaches.slice(0, beachCount).every((b) => b.supplyable);

  return {
    assemblyDays,
    detectedDay,
    windowDays,
    typhoonDay,
    typhoonHaltDays,
    usEntryDay,
    sortieCoef,
    requiredTroops: Math.round(P(p, 'beach.requiredTroops')),
    liftCapacity,
    auxLiftCost,
    beachCount,
    beachThroughputPerDay: P(p, 'lift.beachThroughputPerDay') * beachCount,
    regularBrigades,
    regionalBrigades: Math.max(0, region.regularBrigades - regularBrigades),
    reserveBrigades: Math.min(region.reserveBrigades, P(p, 'beach.reserveDepthCoef')),
    supplyable,
    crossingStartDay: 4,
  };
}

/** 假設 → 初始狀態（D-assemblyDays，00:00）。 */
export function initialState(a: Assumptions, p: SampledParams, k: Derived): State {
  const port = portFor(a.mainAxis);
  const groupCount = a.scale === 'raid' ? 3 : a.scale === 'medium' ? 5 : 8;
  const fleetGroups: FleetGroup[] = [];
  for (let i = 0; i < groupCount; i++) {
    fleetGroups.push({
      id: i,
      strength: 1,
      position: [port.lonlat[0], port.lonlat[1]],
      status: 'staging',
      legHours: 0,
      trips: 0,
      capacity: Math.round(k.liftCapacity / groupCount),
    });
  }
  const twEnergyDays = P(p, 'world.twEnergyDays');
  return {
    day: -k.assemblyDays,
    hour: 0,
    phase: 'mobilize',
    military: {
      fleetGroups,
      airControl: 0,
      twCoastalMissiles: 1,
      troopsAshore: 0,
      troopsArrived: 0,
      supplyDays: 0,
      beachhead: false,
      weatherWindowDays: k.windowDays,
      seaGood: true,
      fleetLoss: 0,
      defenderStrength: 0,
      defenderLosses: 0,
      secondWaveDelivered: 0,
      arrivedAtLandingStart: 0,
    },
    regional: {
      usEntryDay: k.usEntryDay,
      usEngaged: false,
      japanBases: a.japan !== 'neutral',
      ryukyuClosed: false,
    },
    world: {
      chipOutput: 1,
      shippingReroute: 0,
      energyPrice: 1,
      marketShock: 0,
      twEnergyDays,
    },
    homefront: {
      coastalShutdown: 0,
      twBusinessPayroll: 1,
      morale: P(p, 'home.moraleStart'),
      priceIndex: 1,
    },
    flags: new Set<string>(),
  };
}

/** 深拷貝狀態（快照用）。 */
export function cloneState(s: State): State {
  return {
    ...s,
    military: { ...s.military, fleetGroups: s.military.fleetGroups.map((g) => ({ ...g, position: [g.position[0], g.position[1]] })) },
    regional: { ...s.regional },
    world: { ...s.world },
    homefront: { ...s.homefront },
    flags: new Set(s.flags),
  };
}
