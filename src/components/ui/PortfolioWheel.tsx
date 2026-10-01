import React, { useState } from 'react';

export type WheelSlice = {
  id: string;
  label: string;
  value: number;
  color: string;
};

function point(cx: number, cy: number, radius: number, angle: number) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function slicePath(cx: number, cy: number, outer: number, inner: number, start: number, end: number) {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(cx, cy, outer, start);
  const [x2, y2] = point(cx, cy, outer, end);
  const [x3, y3] = point(cx, cy, inner, end);
  const [x4, y4] = point(cx, cy, inner, start);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
}

export function PortfolioWheel({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: WheelSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return null;

  const cx = 100;
  const cy = 100;
  const gap = 0.035;
  let angle = -Math.PI / 2;
  const drawn = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      const start = angle + Math.min(gap, sweep / 3);
      const end = angle + sweep - Math.min(gap, sweep / 3);
      angle += sweep;
      return {
        ...slice,
        pct: (slice.value / total) * 100,
        d: slicePath(cx, cy, 86, 52, start, Math.max(start + 0.01, end)),
      };
    });
  const active = drawn.find((slice) => slice.id === activeId) || null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-56 h-56 shrink-0" role="img" aria-label="Portfolio allocation">
        <circle cx={cx} cy={cy} r="92" fill="none" stroke="rgba(244,236,216,0.12)" strokeWidth="1" />
        {drawn.map((slice) => (
          <path
            key={slice.id}
            d={slice.d}
            fill={slice.color}
            opacity={active && active.id !== slice.id ? 0.45 : 1}
            className="cursor-pointer transition-opacity"
            onMouseEnter={() => setActiveId(slice.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <title>{`${slice.label} ${slice.pct.toFixed(0)}%`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r="48" className="fill-void-950" />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-cream-400" fontSize="9">
          {active ? `${active.pct.toFixed(0)}%` : centerLabel}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-cream-100" fontSize="11" fontWeight="600">
          {active ? active.label.split(' ')[0] : centerValue}
        </text>
      </svg>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 min-w-0 flex-1">
        {drawn.map((slice) => (
          <li
            key={slice.id}
            className="flex items-center gap-2 text-sm"
            onMouseEnter={() => setActiveId(slice.id)}
            onMouseLeave={() => setActiveId(null)}
          >
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: slice.color }} />
            <span className="text-cream-100 truncate">{slice.label}</span>
            <span className="text-cream-400 ml-auto">{slice.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
