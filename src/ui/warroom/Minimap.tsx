import type { Assumptions } from '../../engine/types.js';
import { GEO, beachesOf, portFor, project } from '../../engine/geography.js';

const W = 300;
const H = 300;

function pt(lonlat: [number, number]): [number, number] {
  const [x, y] = project(lonlat);
  return [x * W, y * H];
}
function poly(points: [number, number][]): string {
  return points.map((p) => pt(p).map((v) => v.toFixed(1)).join(',')).join(' ');
}

const AXIS_NAME: Record<Assumptions['mainAxis'], string> = { north: '北部', central: '中部', south: '南部', east: '東岸' };
const AUX_NAME: Record<Assumptions['auxiliary'], string> = { none: '無', penghu: '先取澎湖', eastFeint: '東岸佯攻', blockadeFirst: '封鎖為主' };

/** 攻擊軸小地圖：全部從 geography.json 投影，標籤畫在 SVG 裡。 */
export function Minimap({ a }: { a: Assumptions }) {
  const o = GEO.outlines;
  const port = portFor(a.mainAxis);
  const [px, py] = pt(port.lonlat);
  const targets = beachesOf(a.mainAxis).slice(0, 2);
  const others = (['north', 'central', 'south', 'east'] as const).filter((r) => r !== a.mainAxis);
  const penghu = pt(GEO.penghu.lonlat);
  const hualien = pt(beachesOf('east').find((b) => b.id === 'hualien')?.lonlat ?? [121.62, 24]);
  const flagged = a.mainAxis === 'east';
  const red = '#E0533F';
  const dim = '#5F7C9E';
  return (
    <div class="minimap" aria-label="攻擊軸示意">
      <svg viewBox={`0 0 ${W} ${H}`}>
        <polygon points={poly(o.fujian)} fill="#1E2F47" stroke={dim} />
        <polygon points={poly(o.guangdong)} fill="#1E2F47" stroke={dim} />
        <polygon points={poly(o.taiwan)} fill="#1E2F47" stroke="#8FB3DB" stroke-width="1.5" />
        <polygon points={poly(o.penghu)} fill="#1E2F47" stroke={a.auxiliary === 'penghu' ? red : dim} />
        <polygon points={poly(o.kinmen)} fill="#1E2F47" stroke={dim} />
        <polygon points={poly(o.luzon)} fill="#1E2F47" stroke={dim} />
        {o.ryukyu.map((r) => {
          const [x, y] = pt(r.lonlat);
          return <circle key={r.name} cx={x} cy={y} r="2" fill="#1E2F47" stroke={dim} />;
        })}
        {/* 未選路線：灰色虛線 */}
        {others.map((r) => {
          const b = beachesOf(r)[0];
          if (!b) return null;
          const p0 = pt(portFor(r).lonlat);
          const p1 = pt(b.lonlat);
          return <path key={r} d={`M${p0[0]} ${p0[1]} L${p1[0]} ${p1[1]}`} stroke={dim} stroke-width="1" stroke-dasharray="2 5" fill="none" />;
        })}
        {/* 主攻 */}
        {targets.map((b) => {
          const [bx, by] = pt(b.lonlat);
          return (
            <g key={b.id}>
              <path d={`M${px} ${py} L${bx} ${by}`} stroke={red} stroke-width="2" fill="none" />
              <rect x={bx - 3.5} y={by - 3.5} width="7" height="7" fill="#0F1B2D" stroke="#8FB3DB" stroke-width="2" />
            </g>
          );
        })}
        {/* 輔助 */}
        {a.auxiliary === 'penghu' && (
          <g>
            <path d={`M${px} ${py} L${penghu[0]} ${penghu[1]}`} stroke={red} stroke-width="1.5" stroke-dasharray="4 3" fill="none" />
            <circle cx={penghu[0]} cy={penghu[1]} r="4" fill="#1E2F47" stroke={red} stroke-width="1.5" />
          </g>
        )}
        {a.auxiliary === 'eastFeint' && (
          <path d={`M${px} ${py} Q ${hualien[0] + 30} ${py + 60} ${hualien[0]} ${hualien[1]}`} stroke={red} stroke-width="1.5" stroke-dasharray="4 3" fill="none" />
        )}
        <circle cx={px} cy={py} r="3" fill={red} />
        <text x="10" y="18" font-family="IBM Plex Mono, monospace" font-size="10" fill={red}>
          主攻 {AXIS_NAME[a.mainAxis]}（{targets.map((b) => b.name).join('・')}）{flagged ? ' ⚠ 標紅' : ''}
        </text>
        <text x="10" y="34" font-family="IBM Plex Mono, monospace" font-size="10" fill={a.auxiliary === 'none' ? dim : red}>
          輔助 {AUX_NAME[a.auxiliary]}
        </text>
        <text x="10" y="50" font-family="IBM Plex Mono, monospace" font-size="10" fill={dim}>
          出港 {port.name}
        </text>
      </svg>
    </div>
  );
}
