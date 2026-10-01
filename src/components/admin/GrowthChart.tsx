import React, { useState } from 'react';
import { AdminPoint } from '../../utils/api';

function compact(value: number, kind: 'usd' | 'count') {
  if (kind === 'count') return Math.round(value).toLocaleString();
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function GrowthChart({ points, kind }: { points: AdminPoint[]; kind: 'usd' | 'count' }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <p className="text-cream-400 text-sm py-8">History will appear after the first session.</p>;
  }
  const width = 720;
  const height = 196;
  const pad = { l: 68, r: 16, t: 16, b: 28 };
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const plotBottom = height - pad.b;
  const yAt = (value: number) => pad.t + (1 - (value - min) / span) * (plotBottom - pad.t);
  const xAt = (index: number) => pad.l + (index / (points.length - 1)) * (width - pad.l - pad.r);
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(point.value).toFixed(1)}`).join(' ');
  const area = `${line} L${xAt(points.length - 1).toFixed(1)},${plotBottom} L${xAt(0).toFixed(1)},${plotBottom} Z`;
  const active = hover == null ? points.length - 1 : hover;
  const ticks = [0, Math.floor(points.length / 2), points.length - 1];
  const yTicks = [max, (max + min) / 2, min];

  return (
    <div>
      <div className="flex justify-between text-xs text-cream-400 mb-1">
        <span>{points[active].t}</span>
        <span className="text-cream-100 font-medium">{compact(points[active].value, kind)}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-28"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          const index = Math.round(ratio * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, index)));
        }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="#2a2a2a" />
            <text x={pad.l - 8} y={yAt(tick) + 4} textAnchor="end" fill="#a8a191" fontSize="11">
              {compact(tick, kind)}
            </text>
          </g>
        ))}
        <path d={area} fill="rgba(14, 165, 233, 0.16)" />
        <path d={line} fill="none" stroke="#38bdf8" strokeWidth="2" />
        <line
          x1={xAt(active)}
          x2={xAt(active)}
          y1={pad.t}
          y2={plotBottom}
          stroke="#a8a191"
          strokeDasharray="3 3"
        />
        <circle cx={xAt(active)} cy={yAt(points[active].value)} r="3.5" fill="#0ea5e9" />
        {ticks.map((index) => (
          <text key={points[index].t} x={xAt(index)} y={height - 8} textAnchor="middle" fill="#a8a191" fontSize="11">
            {points[index].t.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
