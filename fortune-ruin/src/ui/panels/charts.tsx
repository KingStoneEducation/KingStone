import { formatG } from '../../core/money';

export interface Series {
  name: string;
  color: string;
  data: number[];
}

/** Minimal multi-series line chart (values in minor currency units). */
export function LineChart(props: { series: Series[]; height?: number; zero?: boolean; labels?: string[] }): JSX.Element {
  const W = 640;
  const H = props.height ?? 170;
  const pad = { l: 64, r: 10, t: 10, b: 20 };
  const all = props.series.flatMap((s) => s.data);
  if (all.length < 2) return <div className="muted" style={{ fontSize: 12 }}>数据还不够（每天结束时记录一次）。</div>;
  let min = Math.min(...all);
  let max = Math.max(...all);
  if (props.zero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (max === min) {
    max += 100;
    min -= 100;
  }
  const n = Math.max(...props.series.map((s) => s.data.length));
  const x = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [min, (min + max) / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ height: H }}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
          <text x={pad.l - 6} y={y(t) + 4} fill="#a99fb8" fontSize={10} textAnchor="end">
            {formatG(Math.round(t), { compact: true })}
          </text>
        </g>
      ))}
      {props.zero && min < 0 && max > 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />}
      {props.series.map((s) => (
        <polyline key={s.name} points={s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={1.8} />
      ))}
      {props.labels && props.labels.length > 1 && (
        <>
          <text x={pad.l} y={H - 4} fill="#6f6582" fontSize={10}>
            {props.labels[0]}
          </text>
          <text x={W - pad.r} y={H - 4} fill="#6f6582" fontSize={10} textAnchor="end">
            {props.labels[props.labels.length - 1]}
          </text>
        </>
      )}
      <g>
        {props.series.map((s, i) => (
          <g key={s.name} transform={`translate(${pad.l + 8 + i * 110}, ${pad.t + 4})`}>
            <rect width={10} height={3} y={4} fill={s.color} />
            <text x={14} y={9} fill="#f1eadb" fontSize={10}>
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Daily bars around zero (e.g. casino results or net cash flow). */
export function BarChart(props: { data: number[]; height?: number; labels?: string[] }): JSX.Element {
  const W = 640;
  const H = props.height ?? 120;
  const pad = { l: 64, r: 10, t: 8, b: 16 };
  const d = props.data;
  if (d.length === 0) return <div className="muted" style={{ fontSize: 12 }}>还没有数据。</div>;
  const max = Math.max(1, ...d.map((v) => Math.abs(v)));
  const bw = (W - pad.l - pad.r) / d.length;
  const mid = pad.t + (H - pad.t - pad.b) / 2;
  const half = (H - pad.t - pad.b) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" style={{ height: H }}>
      <line x1={pad.l} x2={W - pad.r} y1={mid} y2={mid} stroke="rgba(255,255,255,0.25)" />
      <text x={pad.l - 6} y={pad.t + 8} fill="#a99fb8" fontSize={10} textAnchor="end">
        +{formatG(max, { compact: true })}
      </text>
      <text x={pad.l - 6} y={H - pad.b} fill="#a99fb8" fontSize={10} textAnchor="end">
        -{formatG(max, { compact: true })}
      </text>
      {d.map((v, i) => {
        const h = (Math.abs(v) / max) * half;
        return <rect key={i} x={pad.l + i * bw + 1} width={Math.max(1, bw - 2)} y={v >= 0 ? mid - h : mid} height={Math.max(v === 0 ? 0 : 1, h)} fill={v >= 0 ? '#58d68d' : '#ff6b6b'} />;
      })}
    </svg>
  );
}
