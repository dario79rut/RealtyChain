import React, { useMemo, useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { formatUsd } from '../../utils/ops';
import {
  GrowthPoint,
  OptimizeHolding,
  projectGrowth,
  recommendations,
} from '../../utils/portfolioOptimize';

const COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'];

const NOTE_BADGE: Record<string, { label: string; color: 'yellow' | 'orange' | 'green' | 'blue' }> = {
  cash: { label: 'Cash', color: 'yellow' },
  trim: { label: 'Trim', color: 'orange' },
  add: { label: 'Add', color: 'green' },
  lift: { label: '12 months', color: 'blue' },
  balanced: { label: 'In range', color: 'green' },
};

function pathFrom(points: { x: number; y: number }[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

function GrowthChart({
  series,
  rows,
  activeId,
}: {
  series: GrowthPoint[];
  rows: { propertyId: string; title: string; color: string }[];
  activeId: string | null;
}) {
  const width = 640;
  const height = 240;
  const pad = { l: 48, r: 12, t: 16, b: 28 };
  const values = series.flatMap((point) => [
    point.total,
    point.optimized,
    ...Object.values(point.byProperty),
  ]);
  const min = Math.min(...values) * 0.96;
  const max = Math.max(...values) * 1.04 || 1;
  const xAt = (month: number) => pad.l + (month / Math.max(series.length - 1, 1)) * (width - pad.l - pad.r);
  const yAt = (value: number) => pad.t + (1 - (value - min) / (max - min)) * (height - pad.t - pad.b);
  const line = (pick: (point: GrowthPoint) => number) => pathFrom(series.map((point) => ({
    x: xAt(point.month),
    y: yAt(pick(point)),
  })));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64" role="img" aria-label="Property growth over 12 months">
      {[0, 0.5, 1].map((step) => {
        const value = min + (max - min) * step;
        const y = yAt(value);
        return (
          <g key={step}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="rgba(244,236,216,0.12)" />
            <text x={4} y={y + 4} fill="#a8a29e" fontSize="11">
              ${Math.round(value / 1000)}k
            </text>
          </g>
        );
      })}
      {rows.map((row) => (
        <path
          key={row.propertyId}
          d={line((point) => point.byProperty[row.propertyId] || 0)}
          fill="none"
          stroke={row.color}
          strokeWidth={activeId === row.propertyId ? 2.6 : 1.4}
          opacity={!activeId || activeId === row.propertyId ? 1 : 0.25}
        />
      ))}
      <path d={line((point) => point.total)} fill="none" stroke="#f5f5f4" strokeWidth="2.4" />
      <path d={line((point) => point.optimized)} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeDasharray="6 4" />
      {[0, 6, 12].map((month) => (
        <text key={month} x={xAt(month)} y={height - 6} textAnchor="middle" fill="#a8a29e" fontSize="11">
          {month === 0 ? 'Now' : `${month}m`}
        </text>
      ))}
    </svg>
  );
}

export function OptimizeChannel({
  holdings,
  cash,
  onTrade,
}: {
  holdings: OptimizeHolding[];
  cash: number;
  onTrade: (propertyId: string) => void;
}) {
  const colored = useMemo(
    () => holdings.map((row, index) => ({ ...row, color: COLORS[index % COLORS.length] })),
    [holdings]
  );
  const series = useMemo(() => projectGrowth(holdings, cash), [holdings, cash]);
  const notes = useMemo(() => recommendations(holdings, cash), [holdings, cash]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const end = series[series.length - 1];
  const start = series[0];

  if (!holdings.length || !end || !start) {
    return <p className="text-cream-400">Buy shares to see a growth path and a suggested mix.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className="font-display text-lg font-semibold text-cream-100">Portfolio optimization</h3>
        <p className="text-cream-400 text-sm mt-1 max-w-3xl">
          Each line is that holding grown at its stated yield. The solid line is the portfolio as it stands.
          The dashed line is the same money after a yield-weighted mix with a 25% cap per property and an 8% cash floor.
        </p>
      </div>
      <div className="rounded-2xl border border-void-700 bg-void-900/40 p-4 mb-4">
        <GrowthChart series={series} rows={colored} activeId={activeId} />
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-cream-400">
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-cream-100" /> Current book</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-sky-400" /> Suggested mix</span>
          <span>Now ${formatUsd(start.total)} → ${formatUsd(end.total)} in 12 months, or ${formatUsd(end.optimized)} if rebalanced</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-8">
        {colored.map((row) => (
          <button
            key={row.propertyId}
            type="button"
            onClick={() => setActiveId((current) => (current === row.propertyId ? null : row.propertyId))}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              activeId === row.propertyId ? 'border-cream-100 text-cream-100' : 'border-void-600 text-cream-300'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
            {row.title.split(' ').slice(0, 2).join(' ')}
          </button>
        ))}
      </div>
      <h3 className="font-display text-lg font-semibold text-cream-100 mb-3">Recommendations</h3>
      <div className="space-y-3">
        {notes.map((note) => (
          <article key={note.id} className="rounded-2xl border border-void-700 bg-void-800/50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={NOTE_BADGE[note.kind]?.color || 'accent'} variant="subtle">
                  {NOTE_BADGE[note.kind]?.label || 'Note'}
                </Badge>
                <h4 className="text-cream-100 font-medium">{note.title}</h4>
              </div>
              <p className="text-cream-400 text-sm mt-1">{note.detail}</p>
            </div>
            {note.propertyId && (
              <Button type="button" variant="outline" size="sm" onClick={() => onTrade(note.propertyId as string)}>
                Trade
              </Button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
