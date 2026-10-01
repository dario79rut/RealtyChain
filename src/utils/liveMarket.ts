export type LiveProperty = {
  id: string;
  title: string;
  location: string;
  price: number;
  totalTokens: number;
  tokenPrice?: number;
};

export type LiveQuote = {
  propertyId: string;
  title: string;
  location: string;
  open: number;
  last: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  change: number;
  volume: number;
  flash: 'up' | 'down' | null;
  history: number[];
};

export type LiveTrade = {
  id: string;
  propertyId: string;
  title: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  at: number;
};

export type BookLevel = { price: number; size: number };

function hash(id: string) {
  let n = 0;
  for (const ch of id) n = (n * 33 + ch.charCodeAt(0)) % 997;
  return n;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function basePrice(property: LiveProperty) {
  if (property.totalTokens > 0 && property.price > 0) return property.price / property.totalTokens;
  if (property.tokenPrice && property.tokenPrice > 0) return property.tokenPrice;
  return 1;
}

export function seedQuotes(properties: LiveProperty[]): LiveQuote[] {
  return properties.map((property) => {
    const wobble = 0.96 + (hash(property.id) % 80) / 1000;
    const last = round2(basePrice(property) * wobble);
    const spread = Math.max(0.01, last * 0.006);
    const history = Array.from({ length: 18 }, (_, index) =>
      round2(last * (1 + ((index - 17) * (hash(property.id) % 7 - 3)) / 4000))
    );
    return {
      propertyId: property.id,
      title: property.title,
      location: property.location,
      open: history[0],
      last,
      bid: round2(last - spread / 2),
      ask: round2(last + spread / 2),
      bidSize: 12 + (hash(property.id) % 40),
      askSize: 10 + (hash(property.id + 'a') % 40),
      change: ((last - history[0]) / history[0]) * 100,
      volume: 80 + (hash(property.id) % 420),
      flash: null,
      history,
    };
  });
}

export function tickQuotes(
  quotes: LiveQuote[],
  random: () => number = Math.random,
  now = Date.now()
): { quotes: LiveQuote[]; trades: LiveTrade[] } {
  if (!quotes.length) return { quotes, trades: [] };
  const moves = 1 + Math.floor(random() * Math.min(3, quotes.length));
  const picked = new Set<number>();
  while (picked.size < moves) picked.add(Math.floor(random() * quotes.length));
  const trades: LiveTrade[] = [];
  const next = quotes.map((quote, index) => {
    if (!picked.has(index)) return { ...quote, flash: null };
    const drift = (random() - 0.48) * 0.018;
    const last = round2(Math.max(0.01, quote.last * (1 + drift)));
    const spread = Math.max(0.01, last * (0.003 + random() * 0.008));
    const side: 'buy' | 'sell' = drift >= 0 ? 'buy' : 'sell';
    const size = 1 + Math.floor(random() * 36);
    trades.push({
      id: `${now}-${quote.propertyId}-${index}`,
      propertyId: quote.propertyId,
      title: quote.title,
      price: last,
      size,
      side,
      at: now,
    });
    return {
      ...quote,
      last,
      bid: round2(last - spread / 2),
      ask: round2(last + spread / 2),
      bidSize: 4 + Math.floor(random() * 90),
      askSize: 4 + Math.floor(random() * 90),
      change: ((last - quote.open) / quote.open) * 100,
      volume: quote.volume + size,
      flash: side === 'buy' ? 'up' : 'down',
      history: [...quote.history.slice(-23), last],
    };
  });
  return { quotes: next, trades };
}

export function bookLevels(quote: LiveQuote): { bids: BookLevel[]; asks: BookLevel[] } {
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];
  for (let i = 0; i < 6; i += 1) {
    bids.push({
      price: round2(quote.bid * (1 - 0.0022 * i)),
      size: quote.bidSize + i * 8,
    });
    asks.push({
      price: round2(quote.ask * (1 + 0.0022 * i)),
      size: quote.askSize + i * 7,
    });
  }
  asks.reverse();
  return { bids, asks };
}
