// 核心型別，對照 docs/HANDOFF.md §4。

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface Assumptions {
  month: Month; // ①
  scale: 'raid' | 'medium' | 'full'; // ② 偷襲型／中型／全面
  us: 'none' | 'delayed' | 'immediate'; // ③
  japan: 'neutral' | 'bases' | 'belligerent'; // ④
  twReserve: 0.3 | 0.55 | 0.8; // ⑤
  econTolerance: 'low' | 'high'; // ⑥
  mainAxis: 'north' | 'central' | 'south' | 'east'; // ⑦ east 標紅
  auxiliary: 'none' | 'penghu' | 'eastFeint' | 'blockadeFirst'; // ⑧
  greyZone?: 'low' | 'mid' | 'high'; // ⑨ 1.x 才開放
}

export type Phase = 'mobilize' | 'strike' | 'crossing' | 'landing' | 'inland';

export const PHASES: readonly Phase[] = ['mobilize', 'strike', 'crossing', 'landing', 'inland'];

export type FleetStatus = 'staging' | 'enroute' | 'arrived' | 'returning' | 'scattered';

export interface FleetGroup {
  id: number;
  strength: number; // 0..1
  position: [number, number]; // lonlat
  status: FleetStatus;
  /** 本段航程已進行的小時數 */
  legHours: number;
  /** 本船團已完成的往返趟數 */
  trips: number;
  /** 每趟滿載可運兵力（人） */
  capacity: number;
}

export interface MilitaryState {
  fleetGroups: FleetGroup[];
  airControl: number; // 0..1 紅方海峽制空
  twCoastalMissiles: number; // 0..1 守方岸置飛彈剩餘
  troopsAshore: number; // 人
  troopsArrived: number; // 累計運抵灘頭（含已傷亡）
  supplyDays: number; // 補給線存活天數（累計）
  beachhead: boolean;
  weatherWindowDays: number; // 本月剩餘可用海況天數（好天預算）
  seaGood: boolean; // 今日海況是否允許小艇與駁船作業
  fleetLoss: number; // 0..1 累計船團損失比例
  defenderStrength: number; // 灘頭守方有效戰力（人員當量）
  defenderLosses: number; // 守方累計損失（人員當量）
  secondWaveDelivered: number; // 灘頭堡建立後再卸載的兵力
  arrivedAtLandingStart: number; // 進入 landing 時的累計抵岸兵力（算第二波用）
}

export interface RegionalState {
  usEntryDay: number | null; // D+n，null = 不介入
  usEngaged: boolean;
  japanBases: boolean;
  ryukyuClosed: boolean;
}

export interface WorldState {
  chipOutput: number; // 0..1 台灣晶片產能
  shippingReroute: number; // 0..1 航線改道比例
  energyPrice: number; // 相對基準 1.0
  marketShock: number; // 相對基準 0 = 無，負值為跌幅
  twEnergyDays: number; // 台灣能源庫存天數（1.1 封鎖用）
}

export interface HomefrontState {
  coastalShutdown: number; // 0..1 沿海停工比例
  twBusinessPayroll: number; // 0..1 台商薪資發放能力
  morale: number; // 0..100
  priceIndex: number; // 相對基準 1.0
}

export interface State {
  day: number; // D 日為 0，集結期為負
  hour: number; // 0..23
  phase: Phase;
  military: MilitaryState;
  regional: RegionalState;
  world: WorldState;
  homefront: HomefrontState;
  flags: Set<string>;
}

export type EventLayer = 'military' | 'regional' | 'world' | 'homefront' | 'voice';

export interface Event {
  id: number;
  day: number;
  hour: number;
  layer: EventLayer;
  kind: string;
  text: string;
  data?: Record<string, number | string>;
  personaId?: string;
  flaggedParams?: string[];
}

export type EndReason = 'gateFailed' | 'objectiveReached' | 'timeout';

export interface Outcome {
  endedAt: { day: number; phase: Phase };
  reason: EndReason;
  failedGate?: Phase;
  /** 門檻差多少（0..1，相對於門檻值），章節用 */
  gateShortfall?: number;
  /** 失敗的具體原因碼，例如 'windowClosed' | 'fleetBroken' | 'coastalMissilesIntact' */
  failedBy?: string;
  maxTroopsAshore: number;
  fleetLoss: number;
  coastalShutdown: number;
  marketShockMax: number;
  /** 本局是否建立過灘頭堡（landing 門檻通過：存活 48 小時且第二波卸載） */
  beachhead: boolean;
  /** 穩固灘頭堡：進入縱深階段後，曾同時達到補給線存活 ≥ 3 天且上岸兵力 ≥ 所需（對應 CSIS「solid beachhead」） */
  solidBeachhead: boolean;
}

export interface Run {
  engineVersion: string;
  assumptions: Assumptions;
  seed: number;
  /** 本局抽樣後的參數值（id → value），事件簿用 */
  sampledParams: Record<string, number>;
  /** 本局標紅的假設與參數 id */
  flagged: string[];
  events: Event[];
  snapshots: State[]; // 每 6 小時一張
  outcome: Outcome;
}
