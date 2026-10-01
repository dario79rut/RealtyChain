export type OptimizeHolding = {
  propertyId: string;
  title: string;
  marketValue: number;
  yieldRate: number;
};

export type MixRow = OptimizeHolding & {
  currentWeight: number;
  targetWeight: number;
  targetValue: number;
  delta: number;
};

export type GrowthPoint = {
  month: number;
  total: number;
  optimized: number;
  byProperty: Record<string, number>;
};

const MAX_WEIGHT = 0.25;
const CASH_FLOOR = 0.08;

export function projectGrowth(holdings: OptimizeHolding[], cash: number, months = 12): GrowthPoint[] {
  const mix = targetMix(holdings, cash);
  const investable = Math.max(0, mix.portfolio - mix.cash);
  const optYield = investable > 0
    ? mix.rows.reduce((sum, row) => sum + row.targetValue * (row.yieldRate / 100), 0) / investable
    : 0;
  return Array.from({ length: months + 1 }, (_, month) => {
    const factor = month / 12;
    const byProperty: Record<string, number> = {};
    let invested = 0;
    for (const row of holdings) {
      const value = row.marketValue * Math.pow(1 + row.yieldRate / 100, factor);
      byProperty[row.propertyId] = value;
      invested += value;
    }
    return {
      month,
      total: invested + cash,
      optimized: investable * Math.pow(1 + optYield, factor) + mix.cash,
      byProperty,
    };
  });
}

export function targetMix(holdings: OptimizeHolding[], cash: number) {
  const invested = holdings.reduce((sum, row) => sum + row.marketValue, 0);
  const portfolio = invested + cash;
  if (portfolio <= 0) return { portfolio: 0, cash: 0, rows: [] as MixRow[] };
  const cashTarget = cash / portfolio < CASH_FLOOR ? cash : portfolio * CASH_FLOOR;
  const investable = portfolio - cashTarget;
  const yieldSum = holdings.reduce((sum, row) => sum + Math.max(row.yieldRate, 0.1), 0);
  const weights = holdings.map((row) => ({
    ...row,
    weight: Math.max(row.yieldRate, 0.1) / yieldSum,
  }));
  for (let pass = 0; pass < 6; pass += 1) {
    const over = weights.filter((row) => row.weight > MAX_WEIGHT + 0.0001);
    if (!over.length) break;
    const excess = over.reduce((sum, row) => sum + (row.weight - MAX_WEIGHT), 0);
    over.forEach((row) => {
      row.weight = MAX_WEIGHT;
    });
    const room = weights.filter((row) => row.weight < MAX_WEIGHT - 0.0001);
    const roomSum = room.reduce((sum, row) => sum + row.weight, 0);
    if (!room.length || roomSum <= 0) break;
    room.forEach((row) => {
      row.weight += excess * (row.weight / roomSum);
    });
  }
  const rows: MixRow[] = weights.map((row) => {
    const targetValue = investable * row.weight;
    return {
      propertyId: row.propertyId,
      title: row.title,
      marketValue: row.marketValue,
      yieldRate: row.yieldRate,
      currentWeight: portfolio > 0 ? row.marketValue / portfolio : 0,
      targetWeight: portfolio > 0 ? targetValue / portfolio : 0,
      targetValue,
      delta: targetValue - row.marketValue,
    };
  });
  return { portfolio, cash: cashTarget, rows };
}

export type Recommendation = {
  id: string;
  kind: 'cash' | 'trim' | 'add' | 'lift' | 'balanced';
  title: string;
  detail: string;
  propertyId?: string;
};

export function recommendations(holdings: OptimizeHolding[], cash: number): Recommendation[] {
  const mix = targetMix(holdings, cash);
  if (mix.portfolio <= 0) return [];
  const notes: Recommendation[] = [];
  const cashWeight = cash / mix.portfolio;
  const targetCashWeight = mix.cash / mix.portfolio;
  if (cashWeight - targetCashWeight > 0.04) {
    const deploy = cash - mix.cash;
    const best = [...mix.rows].sort((a, b) => b.delta - a.delta)[0];
    notes.push({
      id: 'cash',
      kind: 'cash',
      title: 'Put idle cash to work',
      detail: `Cash is ${(cashWeight * 100).toFixed(0)}% of the portfolio and earns nothing. Move about $${Math.round(deploy).toLocaleString()} into higher-yield property, starting with ${best?.title || 'the underweight names'}.`,
      propertyId: best?.propertyId,
    });
  }
  for (const row of mix.rows) {
    if (row.currentWeight > MAX_WEIGHT + 0.02 && row.delta < -500) {
      notes.push({
        id: `trim-${row.propertyId}`,
        kind: 'trim',
        title: `Trim ${row.title}`,
        detail: `It is ${(row.currentWeight * 100).toFixed(0)}% of the portfolio. The target cap is 25%, which means selling about $${Math.round(Math.abs(row.delta)).toLocaleString()} of this position.`,
        propertyId: row.propertyId,
      });
    } else if (row.delta > 1500 && row.currentWeight < row.targetWeight - 0.02) {
      notes.push({
        id: `add-${row.propertyId}`,
        kind: 'add',
        title: `Add ${row.title}`,
        detail: `${row.yieldRate.toFixed(1)}% yield and only ${(row.currentWeight * 100).toFixed(0)}% of the book. Buying about $${Math.round(row.delta).toLocaleString()} brings it in line with the yield-weighted mix.`,
        propertyId: row.propertyId,
      });
    }
  }
  const end = projectGrowth(holdings, cash).at(-1);
  if (end && end.optimized > end.total + 100) {
    notes.push({
      id: 'lift',
      kind: 'lift',
      title: 'The suggested mix earns more over 12 months',
      detail: `Leaving the book as it is reaches about $${Math.round(end.total).toLocaleString()}. The rebalanced mix, at the same yields, reaches about $${Math.round(end.optimized).toLocaleString()}.`,
    });
  }
  if (!notes.length) {
    notes.push({
      id: 'balanced',
      kind: 'balanced',
      title: 'The mix is already inside the target bands',
      detail: 'No holding is above 25%, and cash is not sitting idle. Keep new buys aimed at the highest yield that is still under its cap.',
    });
  }
  return notes;
}
