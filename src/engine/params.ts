import type { Rng } from './rng.js';
import paramsJson from '../../data/params.json';

export interface ParamDef {
  id: string;
  label: string;
  value: number;
  range: [number, number];
  unit: string;
  source: string;
  note?: string;
  assumption: boolean;
}

export const PARAM_DEFS: readonly ParamDef[] = (paramsJson as unknown as { params: ParamDef[] }).params;

const DEF_BY_ID: ReadonlyMap<string, ParamDef> = new Map(PARAM_DEFS.map((p) => [p.id, p]));

export type SampledParams = Record<string, number>;

/** 每局在 range 內以三角分佈抽一次（眾數 = value）。抽樣順序固定（依 params.json 順序），保證決定性。 */
export function sampleParams(rng: Rng): SampledParams {
  const out: SampledParams = {};
  for (const p of PARAM_DEFS) {
    const [lo, hi] = p.range;
    out[p.id] = lo === hi ? lo : rng.triangular(lo, p.value, hi);
  }
  return out;
}

/** 取參數；不存在就丟錯，避免靜默用 undefined。 */
export function P(params: SampledParams, id: string): number {
  const v = params[id];
  if (v === undefined) throw new Error(`參數不存在：${id}`);
  return v;
}

export function paramDef(id: string): ParamDef {
  const d = DEF_BY_ID.get(id);
  if (!d) throw new Error(`參數定義不存在：${id}`);
  return d;
}

/** 檢查某個值是否超出該參數的公開範圍（標紅用）。 */
export function outOfRange(id: string, value: number): boolean {
  const d = paramDef(id);
  return value < d.range[0] || value > d.range[1];
}
