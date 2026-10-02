/**
 * 台海戰區地圖：全部從 geography.json 投影、從 state 讀。標籤畫在 SVG 裡。
 * 不追求精細：真實輪廓、網格、符號，到此為止。
 */
import type { Run, State } from '../../engine/types.js';
import { GEO, beachesOf, portFor, project } from '../../engine/geography.js';

const W = 760;
const H = 620;
const pt = (lonlat: [number, number]): [number, number] => {
  const [x, y] = project(lonlat);
  return [x * W, y * H];
};
const poly = (pts: [number, number][]) => pts.map((p) => pt(p).map((v) => v.toFixed(1)).join(',')).join(' ');
const RED = '#E0533F';
const BLUE = '#4C8DD8';
const DIM = '#5F7C9E';
const LIGHT = '#8FB3DB';
const TXT = '#9DB4D0';
const MONO = 'IBM Plex Mono, ui-monospace, monospace';

// 中央山脈示意（極簡）
const RANGE: [number, number][] = [[121.3, 24.9], [121.5, 24.5], [121.35, 23.9], [121.05, 23.1], [120.85, 22.5], [120.68, 22.6], [120.85, 23.2], [121.0, 23.9], [121.15, 24.6]];

export function Map({ run, s }: { run: Run; s: State }) {
  const a = run.assumptions;
  const o = GEO.outlines;
  const port = portFor(a.mainAxis);
  const [px, py] = pt(port.lonlat);
  const mainBeaches = beachesOf(a.mainAxis).slice(0, 2);
  const detected = s.flags.has('detected');
  const taiwanC = pt([121.0, 23.7]);
  // 100 km 比例尺：1° 經度在 24°N 約 101 km
  const kmPx = (W / (GEO.map.lon[1] - GEO.map.lon[0])) / 101;
  const satX = ((s.hour % 12) / 12) * W; // 衛星過境帶隨小時移動
  const satPassing = s.hour % 12 < 2;
  const penghu = pt(GEO.penghu.lonlat);
  const usEntry = s.regional.usEntryDay;
  const usPos = pt([125.2, 22.2]);
  const troopsAshore = s.military.troopsAshore;
  const beachPt = mainBeaches[0] ? pt(mainBeaches[0].lonlat) : taiwanC;
  const seaOpen = s.military.seaGood && s.military.weatherWindowDays > 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-label="台海戰區地圖" style="display:block;width:100%;height:100%">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#1B2B42" stroke-width="1" />
        </pattern>
        <pattern id="mtn" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#2E4A6B" stroke-width="2" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {/* 衛星過境帶（裝飾，從 hour 讀） */}
      <line x1={satX - 200} y1={H} x2={satX + 200} y2={0} stroke={BLUE} stroke-width="18" opacity={satPassing ? 0.14 : 0.06} />

      <polygon points={poly(o.fujian)} fill="#1E2F47" stroke={DIM} />
      <polygon points={poly(o.guangdong)} fill="#1E2F47" stroke={DIM} />
      <polygon points={poly(o.luzon)} fill="#1E2F47" stroke={DIM} />
      <polygon points={poly(o.kinmen)} fill="#1E2F47" stroke={DIM} />
      <polygon points={poly(o.taiwan)} fill="#1E2F47" stroke={LIGHT} stroke-width="1.5" />
      <polygon points={poly(RANGE)} fill="url(#mtn)" stroke="none" />
      <polygon points={poly(o.penghu)} fill="#1E2F47" stroke={s.flags.has('penghuTaken') ? RED : a.auxiliary === 'penghu' ? RED : DIM} stroke-width="1.5" />
      {o.ryukyu.map((r) => {
        const [x, y] = pt(r.lonlat);
        return (
          <g key={r.name}>
            <circle cx={x} cy={y} r="5" fill="#1E2F47" stroke={s.regional.ryukyuClosed ? BLUE : DIM} />
            <text x={x + 8} y={y + 4} font-family={MONO} font-size="10" fill={TXT}>
              {r.name}
            </text>
          </g>
        );
      })}
      {s.regional.ryukyuClosed && (
        <path d={`M${pt([122.2, 24.3]).join(' ')} L${pt([126, 25.1]).join(' ')}`} stroke={BLUE} stroke-width="1.5" stroke-dasharray="6 4" fill="none" />
      )}

      {/* 守方偵測圈：被辨識後擴大 */}
      <ellipse cx={taiwanC[0]} cy={taiwanC[1]} rx={detected ? 230 : 120} ry={detected ? 235 : 125} fill="none" stroke={BLUE} stroke-dasharray="4 5" opacity=".5" />

      {/* 未選路線 */}
      {(['north', 'central', 'south', 'east'] as const)
        .filter((r) => r !== a.mainAxis)
        .map((r) => {
          const b = beachesOf(r)[0];
          if (!b) return null;
          const p0 = pt(portFor(r).lonlat);
          const p1 = pt(b.lonlat);
          return <path key={r} d={`M${p0[0]} ${p0[1]} L${p1[0]} ${p1[1]}`} stroke={DIM} stroke-width="1" stroke-dasharray="2 6" fill="none" opacity=".6" />;
        })}
      {/* 主攻軸 */}
      {mainBeaches.map((b) => {
        const [bx, by] = pt(b.lonlat);
        return <path key={b.id} d={`M${px} ${py} L${bx} ${by}`} stroke={RED} stroke-width="1.5" stroke-dasharray="6 4" fill="none" />;
      })}
      {a.auxiliary === 'penghu' && <path d={`M${px} ${py} L${penghu[0]} ${penghu[1]}`} stroke={RED} stroke-width="1.5" fill="none" />}
      {a.auxiliary === 'eastFeint' && (
        <path d={`M${px} ${py} Q ${beachPt[0] + 120} ${py + 160} ${pt([121.7, 24.0])[0]} ${pt([121.7, 24.0])[1]}`} stroke={RED} stroke-width="1" stroke-dasharray="2 6" fill="none" opacity=".8" />
      )}

      {/* 灘頭 */}
      {GEO.beaches.map((b) => {
        const [x, y] = pt(b.lonlat);
        const main = b.region === a.mainAxis;
        // 標籤只給主攻代表灘頭與幾個地標，避免北部六處疊在一起
        const labeled = mainBeaches.some((m) => m.id === b.id) || ['hualien', 'taitung', 'taichung', 'tainan'].includes(b.id) || (b.region !== a.mainAxis && beachesOf(b.region)[0]?.id === b.id);
        return (
          <g key={b.id}>
            <rect x={x - 4} y={y - 4} width="8" height="8" fill="#0F1B2D" stroke={main ? LIGHT : DIM} stroke-width="2" />
            {labeled && (
              <text x={x + (b.coast === 'east' ? 10 : -10)} y={y + 4} text-anchor={b.coast === 'east' ? 'start' : 'end'} font-family={MONO} font-size="10" fill={main ? LIGHT : DIM}>
                {b.name} · 守備 {b.defBrigades} 旅{b.supplyable ? '' : ' · 不可補給'}
              </text>
            )}
          </g>
        );
      })}

      {/* 船團 */}
      {s.military.fleetGroups.map((g, i) => {
        let [x, y] = pt(g.position);
        if (g.status === 'staging' || g.status === 'scattered') {
          x += (i % 3) * 12 - 12;
          y += Math.floor(i / 3) * 12 - 6;
        } else if (g.status === 'arrived') {
          x -= 18 + (i % 2) * 12;
          y += i * 11 - 20;
        }
        const op = g.status === 'scattered' ? 0.35 : 0.35 + 0.65 * g.strength;
        return (
          <g key={g.id} opacity={op}>
            <rect x={x - 6} y={y - 6} width="12" height="12" fill={RED} transform={`rotate(45 ${x} ${y})`} />
            {(g.status === 'enroute' || g.status === 'returning' || g.status === 'arrived' || g.status === 'scattered') && (
              <text x={x + 10} y={y - 6} font-family={MONO} font-size="10" fill={g.status === 'scattered' ? DIM : RED}>
                第 {g.id + 1} 船團 {g.status === 'scattered' ? '潰散' : `${Math.round(g.strength * 100)}%`}
              </text>
            )}
          </g>
        );
      })}

      {/* 上岸兵力 */}
      {troopsAshore > 0 && (
        <g>
          <circle cx={beachPt[0]} cy={beachPt[1]} r={4 + Math.sqrt(troopsAshore) / 8} fill={RED} opacity={s.military.beachhead ? 0.55 : 0.3} stroke={RED} />
          <text x={beachPt[0] + 14} y={beachPt[1] + 30} font-family={MONO} font-size="10" fill={RED}>
            上岸 {Math.round(troopsAshore).toLocaleString('zh-Hant-TW')} 人{s.military.beachhead ? ' · 灘頭堡' : ''}
          </text>
        </g>
      )}

      {/* 美軍 */}
      {usEntry !== null && (
        <g>
          <circle cx={usPos[0]} cy={usPos[1]} r="9" fill="none" stroke={BLUE} stroke-width="2" />
          <circle cx={usPos[0]} cy={usPos[1]} r="2.5" fill={BLUE} />
          {s.regional.usEngaged && <path d={`M${usPos[0]} ${usPos[1]} L${pt([120.3, 24.6]).join(' ')}`} stroke={BLUE} stroke-width="1.5" stroke-dasharray="6 4" fill="none" />}
          <text x={usPos[0] + 14} y={usPos[1] + 4} font-family={MONO} font-size="10" fill={BLUE}>
            {s.regional.usEngaged ? '美軍 · 打擊中' : `美軍 CSG · D+${usEntry} 介入`}
          </text>
        </g>
      )}
      {s.regional.japanBases && (
        <text x={W - 12} y="24" text-anchor="end" font-family={MONO} font-size="10" fill={BLUE}>
          ← 沖繩 · 九州 基地{s.regional.usEngaged ? ' 出擊中' : ' 開放'}
        </text>
      )}

      {/* 地名 */}
      <text x="24" y="30" font-family={MONO} font-size="12" fill={TXT}>福建</text>
      <text x={pt([121.3, 23.5])[0] + 40} y={pt([121.3, 23.5])[1]} font-family={MONO} font-size="12" fill={TXT}>台灣</text>
      <text x={pt([121.1, 23.4])[0]} y={pt([121.1, 23.4])[1]} font-family={MONO} font-size="9" fill={DIM}>中央山脈 · 東西不通</text>
      <text x={pt([121.9, 20.75])[0] + 10} y={pt([121.9, 20.75])[1]} font-family={MONO} font-size="10" fill={TXT}>呂宋</text>
      <text x={px - 8} y={py - 10} text-anchor="end" font-family={MONO} font-size="10" fill={RED}>
        {port.name} · 船團 {s.military.fleetGroups.length} 群
      </text>
      <text x={penghu[0] - 10} y={penghu[1] + 18} text-anchor="end" font-family={MONO} font-size="10" fill={s.flags.has('penghuTaken') ? RED : DIM}>
        澎湖{s.flags.has('penghuTaken') ? ' · 已下' : ''}
      </text>
      <text x={W - 12} y={H - 16} text-anchor="end" font-family={MONO} font-size="10" fill={DIM}>關島 → 2,700 km</text>

      {/* 比例尺 */}
      <line x1="40" y1={H - 40} x2={40 + 100 * kmPx} y2={H - 40} stroke={TXT} stroke-width="1" />
      <text x="40" y={H - 24} font-family={MONO} font-size="10" fill={TXT}>100 km</text>

      {/* 海況 */}
      <g transform="translate(12 52)">
        <rect width="250" height="22" fill="#15243A" stroke="#1E2F47" />
        <text x="8" y="15" font-family={MONO} font-size="11" fill="#E8EEF5">
          海況 {seaOpen ? '可作業' : '惡劣'} · 好天剩 {s.military.weatherWindowDays} 天{satPassing ? ' · 衛星過境中' : ''}
        </text>
      </g>
    </svg>
  );
}
