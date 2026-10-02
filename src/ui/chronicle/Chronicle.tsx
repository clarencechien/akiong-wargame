/**
 * 03 史書：最上面是分享圖 + 結局 TL;DR（馬上可下載），接著數字儀表板，再來戰局小說；事件簿與短影音在分頁。
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Assumptions } from '../../engine/types.js';
import { encodeShare } from '../../engine/share.js';
import { P } from '../../engine/params.js';
import { buildChapter, batchStats } from '../../narrative/chapter.js';
import { drawShareCard, downloadCanvas, assumptionSummary } from '../../narrative/sharecard.js';
import { eventRows, eventBookCSV, eventBookJSON, downloadText } from '../../narrative/eventbook.js';
import { verdict } from '../../narrative/verdict.js';
import { dateLabel, annotateDates } from '../../narrative/dates.js';
import { avgStrength } from '../../engine/gateinfo.js';
import { batch, runIndex, screen, assumptions, lastChanged, setAssumption } from '../state.ts';
import { currentRun } from '../situation/playback.ts';

type Tab = 'chapter' | 'book' | 'reel';

export function Chronicle() {
  const b = batch.value;
  const r = currentRun.value;
  const [tab, setTab] = useState<Tab>('chapter');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  if (!b || !r) {
    return (
      <div style="padding:22px 40px">
        還沒有任何一局。
        <button type="button" class="pill" onClick={() => (screen.value = 'warroom')}>
          回作戰室
        </button>
      </div>
    );
  }
  const idx = runIndex.value;
  const n = b.results.length;
  const stats = useMemo(() => batchStats(b.results.map((x) => x.outcome), r.outcome), [b, r]);
  const chapter = useMemo(() => buildChapter(r, stats), [r, stats]);
  const days = b.results.map((x) => x.outcome.endedAt.day);
  const minD = Math.min(...days);
  const maxD = Math.max(...days);
  const histogram = useMemo(() => {
    const bins = Array.from({ length: maxD - minD + 1 }, (_, i) => ({ day: minD + i, count: 0 }));
    for (const d of days) bins[d - minD]!.count++;
    return bins;
  }, [b]);
  const maxBin = Math.max(...histogram.map((h) => h.count));
  const o = r.outcome;
  const a = r.assumptions;
  const code = encodeShare(a, r.seed);
  const v = verdict(r);
  const dd = (d: number) => dateLabel(a.month, d);
  const last = r.snapshots[r.snapshots.length - 1];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  useEffect(() => {
    if (canvasRef.current) drawShareCard(canvasRef.current, { run: r, stats, histogram, lastChanged: lastChanged.value, runIndex: idx });
  }, [r, stats, histogram, idx, lastChanged.value]);

  // 如果重來：五顆按鈕，每顆只改一個假設
  const replays: { label: string; key: keyof Assumptions; value: Assumptions[keyof Assumptions] }[] = [
    { label: a.month === 4 ? '改成十月' : '改成四月', key: 'month', value: a.month === 4 ? 10 : 4 },
    { label: a.scale === 'medium' ? '改成全面動員' : a.scale === 'full' ? '改成偷襲型' : '改成中型動員', key: 'scale', value: a.scale === 'medium' ? 'full' : a.scale === 'full' ? 'raid' : 'medium' },
    { label: a.us === 'delayed' ? '假設美軍不介入' : a.us === 'none' ? '假設美軍立即介入' : '假設美軍延遲介入', key: 'us', value: a.us === 'delayed' ? 'none' : a.us === 'none' ? 'immediate' : 'delayed' },
    { label: a.auxiliary === 'penghu' ? '不先取澎湖' : '先取澎湖', key: 'auxiliary', value: a.auxiliary === 'penghu' ? 'none' : 'penghu' },
    { label: a.mainAxis === 'north' ? '改攻南部' : '改攻北部', key: 'mainAxis', value: a.mainAxis === 'north' ? 'south' : 'north' },
  ];
  const replay = (key: keyof Assumptions, value: Assumptions[keyof Assumptions]) => {
    assumptions.value = { ...a };
    setAssumption(key, value as never);
    lastChanged.value = key;
    screen.value = 'warroom';
  };
  const suggested = replays.find((x) => x.key === v.suggest);

  const tiles: { label: string; value: string; red?: boolean }[] = [
    { label: o.reason === 'objectiveReached' ? '達成目標' : '終止', value: dd(o.endedAt.day), red: true },
    { label: '最多上岸', value: `${o.maxTroopsAshore.toLocaleString('zh-Hant-TW')} 人` },
    { label: '船團剩餘', value: pct(last ? avgStrength(last) : 1 - o.fleetLoss) },
    { label: '守方岸置飛彈', value: pct(last?.military.twCoastalMissiles ?? 1) },
    { label: '沿海停工', value: pct(o.coastalShutdown) },
    { label: '士氣終值', value: String(Math.round(last?.homefront.morale ?? 0)) },
    { label: '市場最大跌幅', value: pct(-o.marketShockMax) },
    { label: '補給線存活', value: `${Math.round(last?.military.supplyDays ?? 0)} / ${P(r.sampledParams, 'inland.supplyDaysRequired')} 天` },
  ];

  return (
    <div class="chronicle">
      <div class="sit-meta mono">
        案號 TW-2027-{String(a.month).padStart(2, '0')} · seed {r.seed} · {code} · 第 {idx + 1} / {n} 局 · 結算
        <span class="sit-meta-actions">
          <button type="button" class="pill" disabled={idx === 0} onClick={() => (runIndex.value = idx - 1)}>
            上一局
          </button>
          <button type="button" class="pill" disabled={idx >= n - 1} onClick={() => (runIndex.value = idx + 1)}>
            看另一局
          </button>
          <button type="button" class="pill" onClick={() => (screen.value = 'situation')}>
            回戰情室
          </button>
        </span>
      </div>

      {/* 一、分享圖為主體；右側是補充說明 + 儀表板 */}
      <section class="hero">
        <canvas ref={canvasRef} class="sharecard" aria-label="頭版分享卡 1080×1920" />
        <div class="hero-side">
          <div class="hero-text" data-testid="verdict">
            <div class="lbl" style="color:var(--red)">結局 · {dd(o.endedAt.day)}</div>
            <div class="serif verdict-h">{annotateDates(v.headline, a.month)}</div>
            <div class="verdict-d">{annotateDates(v.detail, a.month)}</div>
            <div class="verdict-l">{v.lesson}</div>
            <div class="muted" style="font-size:12px">{assumptionSummary(a)}</div>
            <div class="pills" style="margin-top:4px">
              <button type="button" class="tbtn solid" style="height:38px" onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, `akiong-${code}.png`)} data-testid="dl-png">
                下載分享圖
              </button>
              <button type="button" class="tbtn" style="height:38px" onClick={() => void navigator.clipboard?.writeText(code)}>
                複製分享編碼
              </button>
              {suggested && (
                <button type="button" class="tbtn outline" style="height:38px" onClick={() => replay(suggested.key, suggested.value)} data-testid="replay-suggested">
                  重來：{suggested.label}
                </button>
              )}
            </div>
          </div>

          <div class="dash">
            <div class="lbl">本局數字 · 圖上的六個數字加兩個</div>
            <div class="tiles">
              {tiles.map((t) => (
                <div key={t.label} class="tile">
                  <div class="lbl">{t.label}</div>
                  <div class={`mono tile-v${t.red ? ' red' : ''}`}>{t.value}</div>
                </div>
              ))}
            </div>
            <div class="dash-dist">
              <div class="lbl">同組假設 {n} 局 · 終止日分佈（紅色是本局）</div>
              <div class="hist tall" aria-label="終止日直方圖" role="img">
                {histogram.map((h) => (
                  <div key={h.day} class={h.day === o.endedAt.day ? 'me' : ''} style={{ height: `${(100 * h.count) / maxBin}%` }} title={`${dd(h.day)}：${h.count} 局`} />
                ))}
              </div>
              <div class="mono muted" style="font-size:10px;display:flex;justify-content:space-between">
                <span>{dd(minD)}</span>
                <span class="red">{dd(o.endedAt.day)} 本局</span>
                <span>{dd(maxD)}</span>
              </div>
              <div class="tiles small">
                <div class="tile">
                  <div class="lbl">登陸成功</div>
                  <div class="mono tile-v">
                    {stats.landedN} / {n}
                  </div>
                </div>
                <div class="tile">
                  <div class="lbl">穩固灘頭堡</div>
                  <div class="mono tile-v">
                    {stats.solidN} / {n}
                  </div>
                </div>
                <div class="tile">
                  <div class="lbl">達成目標</div>
                  <div class="mono tile-v">
                    {stats.objectiveN} / {n}
                  </div>
                </div>
                <div class="tile">
                  <div class="lbl">中位終止日</div>
                  <div class="mono tile-v">{dd(stats.medianDay)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 三、戰局小說 / 事件簿 / 短影音 */}
      <div class="tabs">
        <div class="pills">
          {(
            [
              ['chapter', '戰局小說（教科書章節）'],
              ['book', '事件簿（原始資料）'],
              ['reel', '短影音（分階段）'],
            ] as [Tab, string][]
          ).map(([t, label]) => (
            <button key={t} type="button" class={`tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)} data-testid={`tab-${t}`}>
              {label}
            </button>
          ))}
        </div>
        <div class="muted" style="font-size:12px">同一份事件流，三種讀法。全部在本機產生。</div>
      </div>

      {tab === 'chapter' && (
        <div class="chapter-grid single">
          <article class="paper">
            <header>
              <div class="lbl">《{chapter.book}》 {chapter.chapterNoZh} · 本局生成</div>
              <h1>{chapter.title}</h1>
              <div class="muted" style="font-size:13px">{chapter.subtitle}</div>
            </header>
            <div class="chapter-body">
              <div class="prose">
                {chapter.sections.map((sec) => (
                  <section key={sec.heading}>
                    <h2>{sec.heading}</h2>
                    {sec.paragraphs.map((p, i) => (
                      <p key={i} dangerouslySetInnerHTML={{ __html: escapeHtml(p).replace(/\[(\d+)\]/g, '<sup class="fn"><a href="#note-$1">[$1]</a></sup>') }} />
                    ))}
                    {sec.quote && (
                      <blockquote class="q">
                        「{sec.quote.text}」—— {sec.quote.location}，{sec.quote.who}，{dd(sec.quote.day)}
                      </blockquote>
                    )}
                  </section>
                ))}
                {chapter.appendix.length > 0 && (
                  <section class="appendix">
                    <h2>附錄：這些數字怎麼來的</h2>
                    <ol>
                      {chapter.appendix.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ol>
                  </section>
                )}
                <section class="tail">
                  {chapter.tail.map((t, i) => (
                    <p key={i} class="muted" style="font-size:12px">
                      {t}
                    </p>
                  ))}
                </section>
              </div>
              <aside class="chapter-aside">
                <div class="lbl">註釋</div>
                <ol class="notes mono">
                  {chapter.notes.map((nt) => (
                    <li key={nt.n} id={`note-${nt.n}`}>
                      [{nt.n}] 事件 #{nt.event.id} · {dd(nt.event.day)} {String(nt.event.hour).padStart(2, '0')}:00 · {nt.event.kind}
                    </li>
                  ))}
                </ol>
                <div class="lbl" style="margin-top:10px">字數</div>
                <div class="mono muted" style="font-size:12px">正文 {chapter.charCount.toLocaleString('zh-Hant-TW')} 字 · 附錄 {chapter.appendix.length} 條</div>
              </aside>
            </div>
          </article>
        </div>
      )}

      {tab === 'book' && (
        <div style="padding:0 40px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <div class="muted" style="font-size:12px">逐行事件與當時的狀態量。超出公開資料範圍的設定以紅色高亮。{r.flagged.length ? `本局標紅：${r.flagged.join('、')}` : ''}</div>
            <div class="pills">
              <button type="button" class="pill" onClick={() => downloadText(eventBookJSON(r), `akiong-${code}.json`, 'application/json')} data-testid="dl-json">
                下載 JSON
              </button>
              <button type="button" class="pill" onClick={() => downloadText(eventBookCSV(r), `akiong-${code}.csv`, 'text/csv')} data-testid="dl-csv">
                下載 CSV
              </button>
            </div>
          </div>
          <div class="book-wrap">
            <table class="book">
              <thead>
                <tr>
                  <th>#</th>
                  <th>時間</th>
                  <th>層</th>
                  <th>事件</th>
                  <th>階段</th>
                  <th>船團</th>
                  <th>上岸</th>
                  <th>岸置</th>
                  <th>士氣</th>
                  <th>停工</th>
                  <th>內容</th>
                </tr>
              </thead>
              <tbody>
                {eventRows(r).map((row) => (
                  <tr key={row.id} class={row.flagged ? 'flag' : row.layer === 'voice' ? 'voice' : ''}>
                    <td class="mono">{row.id}</td>
                    <td class="mono">
                      {dd(row.day)} {String(row.hour).padStart(2, '0')}
                    </td>
                    <td>{row.layer}</td>
                    <td class="mono">{row.kind}</td>
                    <td>{row.phase}</td>
                    <td class="mono">{Math.round(row.fleetStrength * 100)}%</td>
                    <td class="mono">{row.troopsAshore.toLocaleString('zh-Hant-TW')}</td>
                    <td class="mono">{Math.round(row.twCoastalMissiles * 100)}%</td>
                    <td class="mono">{row.morale}</td>
                    <td class="mono">{Math.round(row.coastalShutdown * 100)}%</td>
                    <td>{row.layer === 'voice' ? `「${annotateDates(row.text, a.month)}」` : annotateDates(row.text, a.month)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'reel' && (
        <div style="padding:0 40px">
          <div class="card soft" style="gap:12px">
            <div class="lbl">短影音 · 直式 9:16 · 每階段一幕，約 45 秒</div>
            <div style="font-size:14px">1.1 推出。每一幕 = 地圖動態 + 一個數字 + 一句聲音；同時提供 template 與素材包給想二創的人。下面是本局的分鏡草稿。</div>
            <div class="reel">
              {reelFrames(r).map((f) => (
                <div key={f.title} class="ph">
                  <div class="scr">
                    <span class="mono" style="position:absolute;left:8px;top:8px;font-size:10px;color:#9DB4D0">{f.when}</span>
                    <span style="position:absolute;left:8px;bottom:8px;font-size:12px;color:#E8EEF5;line-height:16px;white-space:pre-line">{f.number}</span>
                  </div>
                  <span style="font-size:12px;font-weight:500">{f.title}</span>
                  <span class="muted" style="font-size:11px">{f.voice}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div class="replay">
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="lbl">如果重來</span>
          <span style="font-size:13px">改一個假設再跑一次。看看哪一個變數真的改變了結局，哪一個只是改變了代價。</span>
        </div>
        <div class="pills">
          {replays.map((rp) => (
            <button key={rp.label} type="button" class={`pill${rp.key === v.suggest ? ' on' : ''}`} onClick={() => replay(rp.key, rp.value)} data-testid="replay" title={rp.key === v.suggest ? '這一局最相關的假設' : ''}>
              {rp.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function reelFrames(r: NonNullable<ReturnType<typeof currentRun.peek>>) {
  const ev = r.events;
  const first = (kind: string) => ev.find((e) => e.kind === kind);
  const voiceNear = (day: number) => ev.filter((e) => e.layer === 'voice').sort((x, y) => Math.abs(x.day - day) - Math.abs(y.day - day))[0];
  const m = r.assumptions.month;
  const frames = [
    { title: '1 動員', when: dateLabel(m, first('detected')?.day ?? r.snapshots[0]?.day ?? 0), number: `${first('fleetDeparture')?.data?.['liftCapacity'] ? Number(first('fleetDeparture')!.data!['liftCapacity']).toLocaleString('zh-Hant-TW') + ' 人運量' : '船團集結'}\n任何人都看得見`, voice: voiceNear(first('detected')?.day ?? -30)?.data?.['personaName'] },
    { title: '2 火力打擊', when: dateLabel(m, 0), number: `${Number(first('strike')?.data?.['missiles'] ?? 0).toLocaleString('zh-Hant-TW')} 枚飛彈\n機動發射車找不到`, voice: voiceNear(1)?.data?.['personaName'] },
    { title: '3 渡海', when: dateLabel(m, 4), number: `${first('fleetScattered') ? '船團被打散' : '第一波出港'}\n好天剩 ${r.snapshots.find((s) => s.day === 4)?.military.weatherWindowDays ?? '—'} 天`, voice: voiceNear(5)?.data?.['personaName'] },
    { title: '4 搶灘', when: dateLabel(m, first('landingStart')?.day ?? r.outcome.endedAt.day), number: `${r.outcome.maxTroopsAshore.toLocaleString('zh-Hant-TW')} 人上岸\n${r.outcome.beachhead ? '灘頭堡建立' : '灘頭堡未建立'}`, voice: voiceNear(first('landingStart')?.day ?? 7)?.data?.['personaName'] },
    { title: '5 結局', when: dateLabel(m, r.outcome.endedAt.day), number: `${r.outcome.reason === 'objectiveReached' ? '達成戰略目標' : '登陸停止'}\n船團損失 ${Math.round(r.outcome.fleetLoss * 100)}%`, voice: voiceNear(r.outcome.endedAt.day)?.data?.['personaName'] },
  ];
  return frames.map((f) => ({ ...f, voice: f.voice ? `聲音：${String(f.voice)}` : '聲音：（正式模板待核准）' }));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
