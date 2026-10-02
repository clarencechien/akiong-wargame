/**
 * 事件簿：逐行事件與當時的狀態量；JSON / CSV 下載。超出公開資料的設定高亮（flagged）。
 */
import type { Run, State } from '../engine/types.js';
import { flattenMetrics } from '../engine/voices.js';

export interface EventRow {
  id: number;
  day: number;
  hour: number;
  layer: string;
  kind: string;
  text: string;
  personaId?: string | undefined;
  triggerEventId?: number | undefined;
  flagged: boolean;
  phase: string;
  fleetStrength: number;
  troopsAshore: number;
  twCoastalMissiles: number;
  morale: number;
  coastalShutdown: number;
  marketShock: number;
}

function stateAt(run: Run, t: number): State | null {
  let best: State | null = null;
  for (const s of run.snapshots) {
    if (s.day * 24 + s.hour <= t) best = s;
    else break;
  }
  return best ?? run.snapshots[0] ?? null;
}

export function eventRows(run: Run): EventRow[] {
  return run.events.map((e) => {
    const s = stateAt(run, e.day * 24 + e.hour);
    const m = s ? flattenMetrics(s) : {};
    return {
      id: e.id,
      day: e.day,
      hour: e.hour,
      layer: e.layer,
      kind: e.kind,
      text: e.text,
      personaId: e.personaId,
      triggerEventId: e.data?.['triggerEventId'] !== undefined ? Number(e.data['triggerEventId']) : undefined,
      flagged: (e.flaggedParams?.length ?? 0) > 0 || (run.flagged.length > 0 && (e.kind === 'gateFailed' || e.kind === 'objectiveReached' || e.kind === 'timeout')),
      phase: s?.phase ?? '',
      fleetStrength: round(m['fleetStrength'] ?? 1),
      troopsAshore: Math.round(m['troopsAshore'] ?? 0),
      twCoastalMissiles: round(m['twCoastalMissiles'] ?? 1),
      morale: Math.round(m['morale'] ?? 0),
      coastalShutdown: round(m['coastalShutdown'] ?? 0),
      marketShock: round(m['marketShock'] ?? 0),
    };
  });
}

const round = (x: number) => Math.round(x * 1000) / 1000;

export function eventBookJSON(run: Run): string {
  return JSON.stringify(
    {
      engineVersion: run.engineVersion,
      seed: run.seed,
      assumptions: run.assumptions,
      flagged: run.flagged,
      outcome: run.outcome,
      sampledParams: run.sampledParams,
      events: eventRows(run),
    },
    null,
    2,
  );
}

export const CSV_COLUMNS: (keyof EventRow)[] = ['id', 'day', 'hour', 'layer', 'kind', 'phase', 'fleetStrength', 'troopsAshore', 'twCoastalMissiles', 'morale', 'coastalShutdown', 'marketShock', 'flagged', 'personaId', 'triggerEventId', 'text'];

export function eventBookCSV(run: Run): string {
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of eventRows(run)) lines.push(CSV_COLUMNS.map((c) => esc(r[c])).join(','));
  return '﻿' + lines.join('\n');
}

export function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
