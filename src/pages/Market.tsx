import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PropertyThumb } from '../components/ui/PropertyThumb';
import { CandleChart } from '../components/market/CandleChart';
import { FillAskModal } from '../components/modals/FillAskModal';
import { useAsks, ShareAsk } from '../hooks/useAsks';
import { useProperties } from '../hooks/useProperties';
import { useAuth } from '../context/AuthContext';
import {
  SHARE_MARKET_ADDRESS,
  isMarketConfigured,
  shareMarketAbi,
} from '../contracts/config';
import {
  MarketBook,
  MarketQuote,
  cancelMarketOrder,
  fetchMarket,
  placeMarketOrder,
} from '../utils/api';

function shortAddr(value: string) {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function money(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function stamp(at: string) {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return `${month}-${day} ${time}`;
}

const fieldClass =
  'w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100 focus:outline-none focus:ring-2 focus:ring-accent/40';

export default function Market() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: properties = [] } = useProperties();
  const { asks, refetch } = useAsks();
  const [fillAsk, setFillAsk] = useState<ShareAsk | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [chainError, setChainError] = useState('');
  const [book, setBook] = useState<MarketBook | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [shares, setShares] = useState('1');
  const [ticketSide, setTicketSide] = useState<'buy' | 'sell'>('buy');
  const [range, setRange] = useState<30 | 60>(60);
  const [bookTab, setBookTab] = useState<'orders' | 'history' | 'trades'>('trades');
  const [propertyQuery, setPropertyQuery] = useState('');
  const [propertyMenu, setPropertyMenu] = useState(false);
  const propertyMenuRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const requestedId = params.get('property');
  const appliedQuery = useRef(false);

  const { data: paused } = useReadContract({
    address: isMarketConfigured ? (SHARE_MARKET_ADDRESS as `0x${string}`) : undefined,
    abi: shareMarketAbi,
    functionName: 'paused',
    query: { enabled: isMarketConfigured },
  });

  useEffect(() => {
    let cancelled = false;
    const load = (first: boolean) => {
      fetchMarket()
        .then((next) => {
          if (cancelled) return;
          setBook(next);
          setSelectedId((current) => {
            if (requestedId && !appliedQuery.current) {
              appliedQuery.current = true;
              return requestedId;
            }
            return current || next.quotes[0]?.propertyId || null;
          });
          if (first) setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          if (first) {
            setError(err instanceof Error ? err.message : 'Could not load the market.');
            setLoading(false);
          }
        });
    };
    load(true);
    const timer = window.setInterval(() => load(false), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!propertyMenu) return undefined;
    const close = (event: PointerEvent) => {
      if (!propertyMenuRef.current?.contains(event.target as Node)) setPropertyMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPropertyMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [propertyMenu]);

  const quote = book?.quotes.find((row) => row.propertyId === selectedId) || book?.quotes[0];
  const position = book?.positions.find((row) => row.propertyId === quote?.propertyId);
  const titleById = new Map(properties.map((property) => [String(property.id), property.title]));
  const imageById = new Map(properties.map((property) => [String(property.id), property.imageUrl]));

  const shareCount = () => {
    const size = Math.floor(Number(shares));
    if (!Number.isFinite(size) || size < 1) {
      setError('Enter a share quantity.');
      return null;
    }
    return size;
  };

  const trade = async (row: MarketQuote, side: 'buy' | 'sell') => {
    const size = shareCount();
    if (size == null) return;
    const held = book?.positions.find((item) => item.propertyId === row.propertyId);
    if (side === 'buy') {
      if (row.ask == null) {
        setError('No buy price is available.');
        return;
      }
    } else {
      if ((held?.available ?? 0) < 1) {
        setError('You have no shares to sell.');
        return;
      }
      if (row.bid == null) {
        setError('No sell price is available.');
        return;
      }
      if (size > (held?.available ?? 0)) {
        setError(`You can sell ${held?.available ?? 0} shares.`);
        return;
      }
    }
    const limit = side === 'buy' ? row.ask! : row.bid!;
    setSelectedId(row.propertyId);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await placeMarketOrder({
        propertyId: row.propertyId,
        side: side === 'buy' ? 'bid' : 'ask',
        price: limit,
        shares: size,
        open: true,
      });
      setBook(next);
      setBookTab('orders');
      setNotice(side === 'buy'
        ? `Buy order open for ${size} ${row.title} at $${limit.toFixed(2)}.`
        : `Sell order open for ${size} ${row.title} at $${limit.toFixed(2)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The trade was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      setBook(await cancelMarketOrder(id));
      setNotice('Order cancelled.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel that order.');
    } finally {
      setBusy(false);
    }
  };

  const handleChainCancel = async (id: bigint) => {
    if (!isMarketConfigured) return;
    setChainError('');
    setCancellingId(id.toString());
    try {
      const hash = await writeContractAsync({
        address: SHARE_MARKET_ADDRESS as `0x${string}`,
        abi: shareMarketAbi,
        functionName: 'cancel',
        args: [id],
      } as never);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await refetch();
    } catch (err) {
      const anyErr = err as { shortMessage?: string; message?: string };
      setChainError(anyErr.shortMessage || anyErr.message || 'Could not cancel ask.');
    } finally {
      setCancellingId(null);
    }
  };

  if (user?.role === 'owner') {
    return (
      <div className="min-h-screen w-full">
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-cream-100 mb-3">Exchange</h1>
          <p className="text-cream-400 mb-6">Buying and selling tokens is for investors. Owners raise capital, tokenize a share, and finance the property from the owner desk.</p>
          <Button onClick={() => navigate('/user')}>Open owner desk</Button>
        </div>
      </div>
    );
  }

  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen w-full">
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-cream-100 mb-3">Exchange</h1>
          <p className="text-cream-400 mb-6">Buying and selling tokens is for investors. The admin console is where orders, trades, and trading controls are reviewed.</p>
          <Button onClick={() => navigate('/admin')}>Open admin</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
          <div className="flex items-center gap-3 mb-6">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Exchange</h1>
            {paused === true && <Badge color="yellow">Chain paused</Badge>}
          </div>

          {loading && !book ? (
            <p className="text-cream-400">Loading the market…</p>
          ) : !book || !quote ? (
            <div className="p-8 rounded-2xl border border-void-700 bg-void-800/40 text-cream-400">
              {error || 'No listings to trade.'}
            </div>
          ) : (
            <>
              {(() => {
                const series = (book.candles?.[quote.propertyId] || []).slice(-range);
                const size = Math.max(1, Math.floor(Number(shares) || 1));
                const tradePrice = ticketSide === 'buy' ? quote.ask : quote.bid;
                const openOrders = book.orders;
                const orderHistory = book.orderHistory || [];
                const tape = book.trades;
                const needle = propertyQuery.trim().toLowerCase();
                const propertyMatches = book.quotes.filter((row) => (
                  !needle
                  || row.title.toLowerCase().includes(needle)
                  || row.location.toLowerCase().includes(needle)
                ));
                return (
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-4 items-start">
                    <section className="rounded-2xl border border-void-700 bg-void-900/50 min-w-0">
                      <div className="px-4 py-4 border-b border-void-700 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                        <div ref={propertyMenuRef} className="relative w-full sm:max-w-md">
                          <label className="text-xs uppercase tracking-wider text-cream-400" htmlFor="property-search">Property</label>
                          <div className="flex items-center gap-3 mt-1">
                            <PropertyThumb title={quote.title} imageUrl={imageById.get(quote.propertyId)} className="h-12 w-16" />
                            <div className="relative flex-1 min-w-0">
                            <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400 pointer-events-none" />
                            <input
                              id="property-search"
                              type="text"
                              role="combobox"
                              aria-expanded={propertyMenu}
                              aria-autocomplete="list"
                              aria-controls="property-options"
                              placeholder="Search by name or city"
                              value={propertyMenu ? propertyQuery : quote.title}
                              onFocus={() => {
                                setPropertyMenu(true);
                                setPropertyQuery('');
                              }}
                              onChange={(event) => {
                                setPropertyQuery(event.target.value);
                                setPropertyMenu(true);
                              }}
                              className={`${fieldClass} pl-9 pr-9`}
                            />
                            <ChevronDownIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 pointer-events-none" />
                            </div>
                          </div>
                          {propertyMenu && (
                            <ul
                              id="property-options"
                              role="listbox"
                              className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-void-600 bg-void-800 shadow-glow"
                            >
                              {propertyMatches.length === 0 ? (
                                <li className="px-3 py-3 text-sm text-cream-400">No matching properties.</li>
                              ) : propertyMatches.map((row) => {
                                const held = book.positions.find((item) => item.propertyId === row.propertyId);
                                const active = row.propertyId === quote.propertyId;
                                return (
                                  <li key={row.propertyId}>
                                    <button
                                      type="button"
                                      role="option"
                                      aria-selected={active}
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => {
                                        setSelectedId(row.propertyId);
                                        setPropertyQuery('');
                                        setPropertyMenu(false);
                                      }}
                                      className={`w-full text-left px-3 py-2.5 border-b border-void-700/80 last:border-b-0 ${active ? 'bg-void-700' : 'hover:bg-void-700/70'}`}
                                    >
                                      <span className="flex items-center gap-3">
                                        <PropertyThumb title={row.title} imageUrl={imageById.get(row.propertyId)} className="h-10 w-14" />
                                        <span className="min-w-0 flex-1">
                                          <span className="flex items-start justify-between gap-2">
                                            <span className="text-cream-100 text-sm font-medium">{row.title}</span>
                                            <span className={`font-mono text-xs ${row.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signed(row.change)}</span>
                                          </span>
                                          <span className="flex justify-between text-xs text-cream-400 mt-0.5">
                                            <span>{row.location}</span>
                                            <span>${money(row.last)}{held?.shares ? ` · ${held.shares} held` : ''}</span>
                                          </span>
                                        </span>
                                      </span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          <p className="text-cream-400 text-sm mt-2">{quote.location}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className={`font-mono text-3xl ${quote.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                            ${money(quote.last)}
                          </p>
                          <p className={`text-sm ${quote.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{signed(quote.change)} today</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between px-4 pt-3">
                        <p className="text-xs uppercase tracking-wider text-cream-400">Daily candles</p>
                        <div className="flex gap-1">
                          {([30, 60] as const).map((days) => (
                            <button
                              key={days}
                              type="button"
                              onClick={() => setRange(days)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium ${range === days ? 'bg-void-600 text-cream-100' : 'text-cream-400 hover:text-cream-100'}`}
                            >
                              {days}D
                            </button>
                          ))}
                        </div>
                      </div>
                      <CandleChart candles={series} />
                      <div className="border-t border-void-700">
                        <div className="flex gap-1 px-3 pt-3">
                          {([
                            ['orders', `Open orders (${openOrders.length})`],
                            ['history', 'Order history'],
                            ['trades', 'Trade history'],
                          ] as const).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setBookTab(id)}
                              className={`px-3 py-1.5 rounded-md text-sm font-medium ${bookTab === id ? 'bg-void-700 text-cream-100' : 'text-cream-400 hover:text-cream-100'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              {bookTab === 'trades' ? (
                                <tr className="text-[11px] uppercase tracking-wider text-cream-400">
                                  <th className="px-4 py-2 text-left font-medium">Time</th>
                                  <th className="px-4 py-2 text-left font-medium">Property</th>
                                  <th className="px-4 py-2 text-right font-medium">Price</th>
                                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                                  <th className="px-4 py-2 text-right font-medium">Total</th>
                                </tr>
                              ) : (
                                <tr className="text-[11px] uppercase tracking-wider text-cream-400">
                                  <th className="px-4 py-2 text-left font-medium">Time</th>
                                  <th className="px-4 py-2 text-left font-medium">Property</th>
                                  <th className="px-4 py-2 text-left font-medium">Side</th>
                                  <th className="px-4 py-2 text-right font-medium">Price</th>
                                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                                  <th className="px-4 py-2 text-right font-medium">Filled</th>
                                  <th className="px-4 py-2 text-right font-medium">{bookTab === 'orders' ? '' : 'Status'}</th>
                                </tr>
                              )}
                            </thead>
                            <tbody>
                              {bookTab === 'trades' && tape.length === 0 && (
                                <tr><td colSpan={5} className="px-4 py-6 text-cream-400">No trades yet.</td></tr>
                              )}
                              {bookTab === 'trades' && tape.map((row) => (
                                <tr key={row.id} className="border-t border-void-700/70 font-mono">
                                  <td className="px-4 py-2 text-cream-400 font-sans text-xs whitespace-nowrap">{stamp(row.at)}</td>
                                  <td className="px-4 py-2 text-left font-sans text-cream-100">{row.title}</td>
                                  <td className={`px-4 py-2 text-right ${row.side === 'sell' ? 'text-red-300' : 'text-emerald-300'}`}>{money(row.price)}</td>
                                  <td className="px-4 py-2 text-right text-cream-100">{row.shares}</td>
                                  <td className="px-4 py-2 text-right text-cream-100">{money(row.price * row.shares)}</td>
                                </tr>
                              ))}
                              {bookTab === 'orders' && openOrders.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-6 text-cream-400">No open orders.</td></tr>
                              )}
                              {bookTab === 'orders' && openOrders.map((order) => (
                                <tr key={order.id} className="border-t border-void-700/70">
                                  <td className="px-4 py-2 text-cream-400 text-xs whitespace-nowrap">{stamp(order.createdAt)}</td>
                                  <td className="px-4 py-2 text-cream-100">{order.title}</td>
                                  <td className={`px-4 py-2 ${order.side === 'ask' ? 'text-red-300' : 'text-emerald-300'}`}>{order.side === 'ask' ? 'Sell' : 'Buy'}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{money(order.price)}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{order.amount ?? order.shares}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{order.filled ?? 0}</td>
                                  <td className="px-4 py-2 text-right">
                                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cancelOrder(order.id)}>
                                      Cancel
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                              {bookTab === 'history' && orderHistory.length === 0 && (
                                <tr><td colSpan={7} className="px-4 py-6 text-cream-400">No filled or canceled orders.</td></tr>
                              )}
                              {bookTab === 'history' && orderHistory.map((order) => (
                                <tr key={order.id} className="border-t border-void-700/70">
                                  <td className="px-4 py-2 text-cream-400 text-xs whitespace-nowrap">{stamp(order.createdAt)}</td>
                                  <td className="px-4 py-2 text-cream-100">{order.title}</td>
                                  <td className={`px-4 py-2 ${order.side === 'ask' ? 'text-red-300' : 'text-emerald-300'}`}>{order.side === 'ask' ? 'Sell' : 'Buy'}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{money(order.price)}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{order.amount ?? order.shares}</td>
                                  <td className="px-4 py-2 text-right font-mono text-cream-100">{order.filled ?? order.amount ?? order.shares}</td>
                                  <td className="px-4 py-2 text-right text-cream-300">
                                    {order.status === 'cancelled' ? 'Canceled' : order.status === 'filled' ? 'Filled' : 'Partial'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </section>

                    <aside className="rounded-2xl border border-void-700 bg-void-800/60 p-4">
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <button
                          type="button"
                          onClick={() => setTicketSide('buy')}
                          className={`rounded-lg py-2 text-sm font-semibold ${ticketSide === 'buy' ? 'bg-emerald-500 text-void-950' : 'bg-void-700 text-cream-300'}`}
                        >
                          Buy
                        </button>
                        <button
                          type="button"
                          onClick={() => setTicketSide('sell')}
                          className={`rounded-lg py-2 text-sm font-semibold ${ticketSide === 'sell' ? 'bg-red-500 text-white' : 'bg-void-700 text-cream-300'}`}
                        >
                          Sell
                        </button>
                      </div>
                      <p className="text-cream-400 text-xs uppercase tracking-wider">
                        {ticketSide === 'buy' ? 'You pay' : 'You receive'}
                      </p>
                      <p className="font-mono text-2xl text-cream-100 mt-1">
                        {tradePrice != null ? `$${money(tradePrice)}` : '—'}
                      </p>
                      <p className="text-cream-400 text-sm mt-1">
                        {ticketSide === 'buy'
                          ? (quote.ask != null ? `${quote.askSize} shares offered` : 'No shares offered')
                          : (quote.bid != null ? `Buyer wants ${quote.bidSize}` : 'No buyer right now')}
                      </p>
                      <label className="block text-sm text-cream-400 mt-4">
                        Shares
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={shares}
                          onChange={(event) => setShares(event.target.value)}
                          className={`${fieldClass} mt-1`}
                          aria-label="Shares to trade"
                        />
                      </label>
                      <div className="flex justify-between text-sm text-cream-300 mt-3">
                        <span>Total</span>
                        <span className="font-mono">{tradePrice != null ? `$${money(tradePrice * size)}` : '—'}</span>
                      </div>
                      <div className="text-sm text-cream-400 mt-2 space-y-1">
                        <p>{position?.shares ?? 0} shares held · {position?.available ?? 0} available</p>
                        <p>Cash ${money(book.cashUsdc)}</p>
                      </div>
                      <Button
                        type="button"
                        fullWidth
                        className="mt-4"
                        variant={ticketSide === 'sell' ? 'danger' : 'primary'}
                        disabled={busy || tradePrice == null || (ticketSide === 'sell' && (position?.available ?? 0) < 1)}
                        onClick={() => trade(quote, ticketSide)}
                      >
                        {ticketSide === 'buy' ? 'Buy' : 'Sell'}
                      </Button>
                      {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
                      {notice && <p className="text-emerald-300 text-sm mt-3">{notice}</p>}
                    </aside>
                  </div>
                );
              })()}

            </>
          )}

          {chainError && <p className="text-red-400 text-sm mt-6">{chainError}</p>}
          {asks.length > 0 && (
            <div className="mt-10">
              <h2 className="font-display text-xl font-semibold text-cream-100 mb-4">Open wallet asks</h2>
              <div className="overflow-x-auto rounded-2xl border border-void-700 bg-void-800/40">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-void-700">
                      <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Ask</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Property</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Seller</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Shares</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-void-700">
                    {asks.map((ask) => {
                      const mine = Boolean(address && ask.seller.toLowerCase() === address.toLowerCase());
                      const title = titleById.get(ask.propertyId) || `Property ${ask.propertyId}`;
                      return (
                        <tr key={ask.id.toString()}>
                          <td className="px-6 py-4 text-cream-400 font-mono text-sm">#{ask.id.toString()}</td>
                          <td className="px-6 py-4 text-cream-100 font-medium">{title}</td>
                          <td className="px-6 py-4 text-accent font-mono text-sm">{shortAddr(ask.seller)}</td>
                          <td className="px-6 py-4 text-cream-100">{ask.amount.toString()}</td>
                          <td className="px-6 py-4 text-accent">{formatUnits(ask.price, 6)} USDC</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {mine ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!isConnected || cancellingId === ask.id.toString()}
                                  onClick={() => handleChainCancel(ask.id)}
                                >
                                  {cancellingId === ask.id.toString() ? 'Cancelling…' : 'Cancel'}
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  disabled={paused === true || user?.kycStatus !== 'approved'}
                                  onClick={() => setFillAsk(ask)}
                                >
                                  Fill
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <FillAskModal
        isOpen={Boolean(fillAsk)}
        ask={fillAsk}
        propertyTitle={fillAsk ? titleById.get(fillAsk.propertyId) || `Property ${fillAsk.propertyId}` : ''}
        onClose={() => setFillAsk(null)}
        onFilled={async () => {
          setFillAsk(null);
          await refetch();
        }}
      />
    </div>
  );
}
