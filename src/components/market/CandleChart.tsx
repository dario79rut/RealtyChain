import React, { useState } from 'react';
import { MarketCandle } from '../../utils/api';

function money(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CandleChart({ candles }: { candles: MarketCandle[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 360;
  const pad = { l: 58, r: 12, t: 16, b: 28 };
  const volumeHeight = 56;
  const plotBottom = height - pad.b - volumeHeight;
  if (candles.length < 2) {
    return <p className="text-cream-400 text-sm p-6">Price history will appear after the first session.</p>;
  }
  const highs = candles.map((bar) => bar.high);
  const lows = candles.map((bar) => bar.low);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const yAt = (value: number) => pad.t + (1 - (value - min) / span) * (plotBottom - pad.t);
  const slot = (width - pad.l - pad.r) / candles.length;
  const bodyWidth = Math.max(3, slot * 0.62);
  const maxVolume = Math.max(...candles.map((bar) => bar.volume), 1);
  const active = hover != null ? candles[hover] : candles[candles.length - 1];
  const up = active.close >= active.open;

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-3 text-xs font-mono text-cream-300">
        <span className="text-cream-400">{active.t}</span>
        <span>O {money(active.open)}</span>
        <span>H {money(active.high)}</span>
        <span>L {money(active.low)}</span>
        <span className={up ? 'text-emerald-300' : 'text-red-300'}>C {money(active.close)}</span>
        <span>Vol {active.volume}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-80"
        role="img"
        aria-label="Daily candlestick chart"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((step) => {
          const value = min + span * step;
          const y = yAt(value);
          return (
            <g key={step}>
              <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} stroke="rgba(244,236,216,0.1)" />
              <text x={4} y={y + 4} fill="#a8a29e" fontSize="11">
                {money(value)}
              </text>
            </g>
          );
        })}
        {candles.map((bar, index) => {
          const x = pad.l + index * slot + slot / 2;
          const rising = bar.close >= bar.open;
          const color = rising ? '#34d399' : '#fb7185';
          const top = yAt(Math.max(bar.open, bar.close));
          const bottom = yAt(Math.min(bar.open, bar.close));
          const volY = height - pad.b - (bar.volume / maxVolume) * (volumeHeight - 8);
          return (
            <g key={bar.t} onMouseEnter={() => setHover(index)}>
              <rect
                x={pad.l + index * slot}
                y={pad.t}
                width={slot}
                height={height - pad.t - pad.b}
                fill={hover === index ? 'rgba(244,236,216,0.04)' : 'transparent'}
              />
              <line x1={x} x2={x} y1={yAt(bar.high)} y2={yAt(bar.low)} stroke={color} strokeWidth="1.2" />
              <rect
                x={x - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={Math.max(1.5, bottom - top)}
                fill={color}
              />
              <rect
                x={x - bodyWidth / 2}
                y={volY}
                width={bodyWidth}
                height={height - pad.b - volY}
                fill={color}
                opacity="0.45"
              />
            </g>
          );
        })}
        {[0, Math.floor(candles.length / 2), candles.length - 1].map((index) => (
          <text
            key={candles[index].t}
            x={pad.l + index * slot + slot / 2}
            y={height - 8}
            textAnchor="middle"
            fill="#a8a29e"
            fontSize="11"
          >
            {candles[index].t.slice(5)}
          </text>
        ))}
      </svg>
    </div>
  );
}
