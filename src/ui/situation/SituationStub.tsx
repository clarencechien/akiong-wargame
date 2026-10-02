/**
 * 戰情室占位（M4 才做地圖、儀表、時間軸）。M3 先把流程接通：
 * 顯示本局事件流、本局在 N 場中的位置（終止日直方圖）、切換 run。
 */
import { useMemo } from 'preact/hooks';
import { run } from '../../engine/simulate.js';
import { GATE_LABEL } from '../../engine/phases/gates.js';
import { encodeShare } from '../../engine/share.js';
import { batch, runIndex, screen } from '../state.ts';

export function SituationStub() {
  const b = batch.value;
  if (!b) {
    return (
      <div class="situation-stub">
        <div>
          還沒有任何一局。
          <button type="button" class="pill" onClick={() => (screen.value = 'warroom')}>回作戰室</button>
        </div>
      </div>
    );
  }
  const idx = runIndex.value;
  const res = b.results[idx]!;
  // 依 seed 重算這一局（含快照），引擎決定性保證與 worker 的結果一致
  const full = useMemo(() => run(b.assumptions, res.seed), [b, res.seed]);
  const n = b.results.length;
  const days = b.results.map((r) => r.outcome.endedAt.day);
  const minD = Math.min(...days);
  const maxD = Math.max(...days);
  const bins: number[] = Array.from({ length: maxD - minD + 1 }, () => 0);
  for (const d of days) bins[d - minD]!++;
  const maxBin = Math.max(...bins);
  const landed = b.results.filter((r) => r.outcome.beachhead).length;
  const solid = b.results.filter((r) => r.outcome.solidBeachhead).length;
  const obj = b.results.filter((r) => r.outcome.reason === 'objectiveReached').length;
  const o = full.outcome;
  const dl = (d: number) => (d < 0 ? `D${d}` : `D+${d}`);

  return (
    <div class="situation-stub">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div class="serif" style="font-size:19px;font-weight:600">
            第 {idx + 1} 局 / {n} 局　<span class="mono muted" style="font-size:12px">seed {res.seed} · {encodeShare(b.assumptions, res.seed)}</span>
          </div>
          <div class="pills">
            <button type="button" class="pill" disabled={idx === 0} onClick={() => (runIndex.value = idx - 1)}>
              上一局
            </button>
            <button type="button" class="pill" disabled={idx >= n - 1} onClick={() => (runIndex.value = idx + 1)}>
              看另一局
            </button>
            <button type="button" class="pill" onClick={() => (screen.value = 'warroom')}>
              回作戰室
            </button>
          </div>
        </div>
        <div class="muted" style="font-size:12px;margin-bottom:12px">戰情室的地圖、儀表與時間軸在 M4；這裡先顯示事件流。</div>
        <div class="events">
          {full.events.map((e) => (
            <div key={e.id} class={`e ${e.layer}${e.kind === 'gateFailed' || e.kind === 'objectiveReached' || e.kind === 'timeout' ? ' gate' : ''}`}>
              <span class="t mono">
                {dl(e.day)} {String(e.hour).padStart(2, '0')}:00
              </span>
              <span class="x">
                <span class="muted" style="font-size:11px">[{e.layer}] </span>
                {e.text}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div class="col">
        <div class="card soft">
          <div class="lbl">本局結局</div>
          <div class="serif" style="font-size:16px;font-weight:600">
            {o.reason === 'objectiveReached' ? '達成戰略目標' : o.reason === 'gateFailed' ? `止於${GATE_LABEL[o.failedGate!]}` : '停止'}
          </div>
          <div class="kv">
            <div>
              <span>終止</span>
              <span class="mono">
                {dl(o.endedAt.day)} · {o.endedAt.phase}
              </span>
            </div>
            <div>
              <span>最多上岸</span>
              <span class="mono">{o.maxTroopsAshore.toLocaleString('zh-Hant-TW')} 人</span>
            </div>
            <div>
              <span>船團損失</span>
              <span class="mono">{Math.round(o.fleetLoss * 100)}%</span>
            </div>
            <div>
              <span>沿海停工</span>
              <span class="mono">{Math.round(o.coastalShutdown * 100)}%</span>
            </div>
            <div>
              <span>市場最大跌幅</span>
              <span class="mono">{Math.round(-o.marketShockMax * 100)}%</span>
            </div>
            {full.flagged.length > 0 && (
              <div>
                <span class="red">標紅假設</span>
                <span class="mono red">{full.flagged.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
        <div class="card soft">
          <div class="lbl">本局在 {n} 場中的位置</div>
          <div class="hist" aria-label="終止日直方圖">
            {bins.map((c, i) => (
              <div key={i} class={i + minD === o.endedAt.day ? 'me' : ''} style={{ height: `${(100 * c) / maxBin}%` }} title={`${dl(i + minD)}：${c} 局`} />
            ))}
          </div>
          <div class="mono muted" style="font-size:11px;display:flex;justify-content:space-between">
            <span>{dl(minD)}</span>
            <span>{dl(maxD)}</span>
          </div>
          <div class="kv">
            <div>
              <span>登陸成功</span>
              <span class="mono">
                {landed} / {n}
              </span>
            </div>
            <div>
              <span>穩固灘頭堡</span>
              <span class="mono">
                {solid} / {n}
              </span>
            </div>
            <div>
              <span>達成戰略目標</span>
              <span class="mono">
                {obj} / {n}
              </span>
            </div>
            <div>
              <span>運算</span>
              <span class="mono muted">
                {b.workers} 個 worker · {(b.ms / 1000).toFixed(1)} s
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
