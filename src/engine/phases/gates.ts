import type { Phase } from '../types.js';

export interface GatePass {
  kind: 'pass';
  next: Phase;
  text: string;
}
export interface GateFail {
  kind: 'fail';
  gate: Phase;
  /** 失敗原因碼 */
  by: string;
  /** 差多少（0..1，相對門檻） */
  shortfall: number;
  text: string;
}
export interface GateObjective {
  kind: 'objective';
  text: string;
}
export interface GateTimeout {
  kind: 'timeout';
  by: string;
  text: string;
}
export type GateResult = GatePass | GateFail | GateObjective | GateTimeout;

export const GATE_LABEL: Record<Phase, string> = {
  mobilize: '船團就位且海況窗口未關',
  strike: '守方岸置飛彈壓制到可渡海的水準',
  crossing: '抵岸兵力達建立灘頭堡所需',
  landing: '灘頭堡存活 48 小時且第二波可卸載',
  inland: '補給線存活 7 天且家前線未崩',
};
