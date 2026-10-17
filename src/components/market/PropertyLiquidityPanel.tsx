import React, { useEffect, useState } from 'react';
import { CheckIcon, ClockIcon, RefreshCwIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  PropertyLiquidity, ExitRequest, fetchPropertyLiquidity, placeFundedBid, cancelFundedBid,
  requestPropertyExit, cancelPropertyExit, processPropertyExit,
} from '../../utils/api';
import { Button } from '../ui/Button';

const fieldClass = 'mt-1 w-full rounded-xl border border-void-600 bg-void-700 px-3 py-2.5 text-cream-100 focus:outline-none focus:ring-2 focus:ring-accent/40';
const money = (value: number | null) => value == null ? '—' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const time = (at: string) => new Date(at).toLocaleString();
const activeRequest = (row: ExitRequest) => ['queued', 'awaiting_liquidity', 'partially_filled'].includes(row.status);
const REQUEST_LABELS: Record<ExitRequest['status'], string> = {
  queued: 'Window pending', awaiting_liquidity: 'Awaiting matching bids', partially_filled: 'Partially settled', completed: 'Settled', cancelled: 'Cancelled',
};

export function ExitRequestProgress({ request }: { request: ExitRequest }) {
  const current = request.status === 'completed' ? 3 : request.filled > 0 ? 2 : request.eligible ? 1 : 0;
  const cancelled = request.status === 'cancelled';
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-cream-100">{request.id}</p>
        <span className={`rounded-full border px-2 py-1 text-xs ${request.status === 'completed' ? 'border-emerald-400/30 text-emerald-300' : cancelled ? 'border-void-500 text-cream-400' : 'border-accent/30 text-accent'}`}>{REQUEST_LABELS[request.status]}</span>
      </div>
      <ol aria-label="Exit request pipeline" className="mt-4 grid grid-cols-4">
        {['Requested', 'Window opens', 'Matching', 'Settled'].map((label, index) => <li key={label} aria-current={!cancelled && index === current ? 'step' : undefined} className="relative text-center">
          {index < 3 && <span aria-hidden="true" className={`absolute left-[calc(50%+12px)] right-[-50%] top-3 h-0.5 ${index < current ? 'bg-emerald-400/70' : 'bg-void-600'}`} />}
          <span aria-hidden="true" className={`relative mx-auto flex h-6 w-6 items-center justify-center rounded-full border text-xs ${cancelled ? 'border-void-500 bg-void-800 text-cream-400' : index < current || request.status === 'completed' ? 'border-emerald-400 bg-emerald-400 text-void-950' : index === current ? 'border-accent bg-void-800 text-accent' : 'border-void-500 bg-void-800 text-cream-400'}`}>{index < current || request.status === 'completed' ? <CheckIcon size={13} /> : index + 1}</span>
          <span className="relative mt-2 block text-[11px] text-cream-400">{label}</span>
        </li>)}
      </ol>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-cream-400">Shares settled / requested</dt><dd className="mt-1 text-cream-100">{request.filled} / {request.shares}</dd></div>
        <div><dt className="text-xs text-cream-400">Proceeds settled</dt><dd className="mt-1 text-cream-100">{money(request.proceedsUsdc)} USDC</dd></div>
        <div><dt className="text-xs text-cream-400">Minimum sale price</dt><dd className="mt-1 text-cream-100">{money(request.minimumPrice)} USDC / share</dd></div>
        <div><dt className="text-xs text-cream-400">Processing eligibility</dt><dd className="mt-1 text-cream-100">{time(request.windowAt)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-cream-400">{cancelled ? `${request.remaining} unfilled shares released; completed fills remain settled.` : request.status === 'completed' ? 'All requested shares settled to account bids in the application ledger.' : `${request.remaining} shares reserved · queue position ${request.queuePosition ?? '—'} · earlier eligible requests with matching bids have priority.`}</p>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-void-700 bg-void-900/40 p-3"><dt className="text-xs text-cream-400">{label}</dt><dd className="mt-1 font-mono text-lg text-cream-100">{children}</dd></div>;
}

export function PropertyLiquidityPanel({ propertyId }: { propertyId: string }) {
  const { user } = useAuth();
  const investor = Boolean(user && (!user.role || user.role === 'user'));
  const [desk, setDesk] = useState<PropertyLiquidity | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [bidShares, setBidShares] = useState('');
  const [bidPrice, setBidPrice] = useState('');
  const [exitShares, setExitShares] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [windowWeeks, setWindowWeeks] = useState('1');
  const [estimateShares, setEstimateShares] = useState('10');

  useEffect(() => {
    let cancelled = false;
    setBusy('load');
    fetchPropertyLiquidity(propertyId).then((data) => { if (!cancelled) { setDesk(data); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load liquidity.'); })
      .finally(() => { if (!cancelled) setBusy(''); });
    return () => { cancelled = true; };
  }, [propertyId]);

  async function run(key: string, action: () => Promise<PropertyLiquidity>, message: string) {
    if (busy) return;
    setBusy(key); setError(''); setNotice('');
    try { setDesk(await action()); setNotice(message); }
    catch (err) { setError(err instanceof Error ? err.message : 'Request failed.'); }
    finally { setBusy(''); }
  }
  const positive = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
  const whole = (value: string) => Number.isSafeInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5000;
  const bidCost = Math.round(Number(bidPrice) * 100) * Number(bidShares) / 100;
  const canBid = desk && whole(bidShares) && positive(bidPrice) && Number(bidPrice) >= .01 && bidCost <= desk.cashAvailable;
  const canExit = desk && whole(exitShares) && positive(exitPrice) && Number(exitPrice) >= .01 && Number(exitShares) <= desk.availableShares;
  const requested = whole(estimateShares) ? Number(estimateShares) : 0;
  let unfilled = requested;
  let estimateCents = 0;
  for (const level of desk?.sellableBids || []) {
    const take = Math.min(unfilled, level.shares);
    estimateCents += take * Math.round(level.price * 100);
    unfilled -= take;
  }
  const windowAt = desk ? new Date(Date.parse(desk.nextWindowAt) + (Number(windowWeeks) - 1) * 7 * 86400000).toISOString() : '';

  return (
    <section aria-label="Property liquidity and exits" className="my-8 rounded-2xl border border-void-600 bg-void-800/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-accent">Secondary liquidity</p><h2 className="mt-1 font-display text-xl font-semibold text-cream-100">Liquidity &amp; exit requests</h2></div>
        <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => run('refresh', () => fetchPropertyLiquidity(propertyId), 'Liquidity and exit status refreshed.')}><RefreshCwIcon size={14} className="mr-2" />Refresh</Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>}
      {!desk ? <p className="mt-4 text-sm text-cream-400">{busy ? 'Loading account-backed liquidity…' : 'Liquidity is unavailable. Use Refresh to retry.'}</p> : <>
        <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-cream-300">
          <span className="font-semibold text-amber-200">{desk.demoMode ? 'Demo account balances · application ledger' : 'Account balances · application ledger'}</span>
          <p className="mt-1">These metrics count investor orders backed by reserved ledger balances. Synthetic book orders and illustrative trade prints are excluded. No wallet escrow or on-chain settlement is established by these features.</p>
        </div>
        <dl className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
          <Stat label="Reserved buying depth · USDC">{money(desk.bidDepthUsdc)}</Stat>
          <Stat label="Active buyer accounts">{desk.activeBuyers}</Stat>
          <Stat label="24h recorded account volume · USDC">{money(desk.volume24hUsdc)}</Stat>
          <Stat label="Best account bid / ask · USDC">{money(desk.bestBid)} / {money(desk.bestAsk)}</Stat>
          <Stat label="Last account trade · USDC">{money(desk.lastAccountPrice)}</Stat>
          <Stat label="Last account price vs appraised NAV">{desk.premiumToNav == null ? '—' : `${desk.premiumToNav >= 0 ? '+' : ''}${(desk.premiumToNav * 100).toFixed(2)}%`}</Stat>
        </dl>
        <p className="mt-2 text-xs text-cream-400">Snapshot {time(desk.asOf)} · {desk.trades24h} recorded account trades / {desk.volume24hShares} shares in 24h.{desk.appraisalDate ? ` NAV appraisal: ${desk.appraisalDate.slice(0, 10)}.` : ' No appraisal-backed NAV recorded.'} {desk.crossedBook ? 'Resting orders cross; matching occurs when a trade is submitted.' : desk.spread != null ? ` Account spread: ${money(desk.spread)} USDC.` : 'Two-sided account pricing is not yet available.'}</p>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-void-700 p-4">
            <h3 className="text-sm font-semibold text-cream-100">Account-backed depth</h3>
            <div className="mt-3 grid grid-cols-2 gap-4">
              {[{label:'Buy bids',rows:desk.bids,color:'text-emerald-300'},{label:'Sell asks',rows:desk.asks,color:'text-red-300'}].map((side) => <div key={side.label}>
                <p className={`text-xs font-medium ${side.color}`}>{side.label} · USDC × shares</p>
                {side.rows.length === 0 ? <p className="mt-2 text-xs text-cream-400">No reserved orders</p> : <ul className="mt-2 space-y-2 text-xs font-mono">{side.rows.slice(0, 5).map((level) => <li key={level.price} className="flex justify-between gap-2 text-cream-300"><span>{money(level.price)}</span><span>{level.shares}</span></li>)}</ul>}
              </div>)}
            </div>
          </div>
          <div className="rounded-xl border border-void-700 p-4">
            <h3 className="text-sm font-semibold text-cream-100">Estimate selling into current bids</h3>
            <label className="mt-3 block text-xs text-cream-400">Shares to quote<input type="number" min="1" max="5000" step="1" value={estimateShares} onChange={(event) => setEstimateShares(event.target.value)} className={fieldClass} /></label>
            <p className="mt-3 text-sm text-cream-100">{requested - unfilled} shares matched · {money(estimateCents / 100)} USDC estimated proceeds</p>
            <p className="mt-1 text-xs text-cream-400">{unfilled} shares without matching bids. Your own bids are excluded. No platform trading fee is currently charged. This is a quote at current depth, not a promise for a future exit window.</p>
          </div>
        </div>
        {investor && <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <form className="rounded-xl border border-void-700 p-4 space-y-3" onSubmit={(event) => {event.preventDefault(); if (canBid) run('bid', () => placeFundedBid(propertyId,{shares:Number(bidShares),price:Number(bidPrice)}), 'Buy bid posted. Its full value is reserved until filled or cancelled.');}}>
            <h3 className="text-sm font-semibold text-cream-100">Provide buying liquidity</h3>
            <p className="text-xs text-cream-400">Post a standing buy bid backed by your available account balance: {money(desk.cashAvailable)} USDC.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-cream-400">Shares<input required type="number" min="1" max="5000" step="1" value={bidShares} onChange={(event) => setBidShares(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs text-cream-400">Bid price · USDC/share<input required type="number" min="0.01" step="0.01" value={bidPrice} onChange={(event) => setBidPrice(event.target.value)} className={fieldClass} /></label>
            </div>
            <p className="text-xs text-cream-300">Reserve {Number.isFinite(bidCost) ? money(bidCost) : '—'} USDC. Unfilled bids can be cancelled to release the reservation.</p>
            <Button type="submit" disabled={Boolean(busy) || !desk.tradingAvailable || !canBid}>Post reserved buy bid</Button>
          </form>
          <form className="rounded-xl border border-void-700 p-4 space-y-3" onSubmit={(event) => {event.preventDefault(); if (canExit) run('exit', () => requestPropertyExit(propertyId,{shares:Number(exitShares),price:Number(exitPrice),windowWeeks:Number(windowWeeks)}), 'Exit requested. Shares are reserved; settlement depends on matching account bids.');}}>
            <h3 className="text-sm font-semibold text-cream-100">Schedule an exit request</h3>
            <p className="text-xs text-cream-400">{desk.availableShares} shares available after orders, exit reservations, and lending collateral.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-cream-400">Shares to exit<input required type="number" min="1" max={Math.min(5000,desk.availableShares)} step="1" value={exitShares} onChange={(event) => setExitShares(event.target.value)} className={fieldClass} /></label>
              <label className="text-xs text-cream-400">Minimum · USDC/share<input required type="number" min="0.01" step="0.01" value={exitPrice} onChange={(event) => setExitPrice(event.target.value)} className={fieldClass} /></label>
            </div>
            <label className="block text-xs text-cream-400">Processing window · Fridays, 16:00 UTC<select className={fieldClass} value={windowWeeks} onChange={(event) => setWindowWeeks(event.target.value)}><option value="1">Next window</option><option value="2">Second window</option><option value="4">Fourth window</option></select></label>
            <p className="text-xs text-cream-400">Eligible from {time(windowAt)}. Once eligible, your request authorizes matching at or above your minimum when this property’s queue is processed. Processing is triggered manually; earlier eligible requests run first. Execution may be partial or delayed, with no guaranteed redemption or automatic payout.</p>
            <Button type="submit" variant="outline" disabled={Boolean(busy) || !desk.tradingAvailable || !canExit}>Reserve shares &amp; request exit</Button>
          </form>
        </div>}
        {!desk.tradingAvailable && investor && <p className="mt-3 text-sm text-amber-200">Trading or transfers are unavailable for this account or property. Existing reservations can still be cancelled.</p>}
        {desk.ownBids.length > 0 && <div className="mt-5 border-t border-void-700 pt-4"><h3 className="text-sm font-semibold text-cream-100">Your reserved buy bids</h3><ul className="mt-3 space-y-2">{desk.ownBids.map((bid) => <li key={bid.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-void-900/50 p-3 text-sm"><span className="text-cream-300">{bid.shares} shares × {money(bid.price)} USDC · {money(bid.reservedUsdc)} reserved</span><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run(bid.id, () => cancelFundedBid(propertyId,bid.id), 'Bid cancelled and its cash reservation released.')}>Cancel bid</Button></li>)}</ul></div>}
        {investor && <div className="mt-5 border-t border-void-700 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-cream-100"><ClockIcon size={16} />Your exit requests</h3>
          {desk.exitRequests.length === 0 ? <p className="mt-2 text-sm text-cream-400">No exit requests for this property.</p> : <div className="mt-3 space-y-4">{desk.exitRequests.map((request) => <article key={request.id} className="rounded-xl border border-void-700 bg-void-900/40 p-4">
            <ExitRequestProgress request={request} />
            {activeRequest(request) && <div className="mt-4 flex flex-wrap gap-2"><Button type="button" size="sm" disabled={Boolean(busy) || !request.eligible || !desk.tradingAvailable} onClick={() => run(request.id, () => processPropertyExit(propertyId,request.id), 'Eligible queue processed. Earlier requests may have used available bids; review your own settled shares and proceeds below.')}>Match eligible bids</Button><Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run(`cancel-${request.id}`, () => cancelPropertyExit(propertyId,request.id), 'Exit cancelled. Unfilled shares are available again.')}>Cancel unfilled shares</Button></div>}
            <details className="mt-3 text-xs"><summary className="cursor-pointer text-cream-300">Request history ({request.events.length})</summary><ol className="mt-2 space-y-2">{request.events.map((entry,index) => <li key={`${entry.at}-${index}`} className="border-l border-void-500 pl-3"><time dateTime={entry.at} className="text-cream-400">{time(entry.at)}</time><p className="mt-1 text-cream-300">{entry.note}</p></li>)}</ol></details>
          </article>)}</div>}
        </div>}
        <details className="mt-5 border-t border-void-700 pt-4 text-sm"><summary className="cursor-pointer text-cream-300">Recent account-to-account settlements ({desk.recentTrades.length})</summary>{desk.recentTrades.length === 0 ? <p className="mt-3 text-xs text-cream-400">No recorded settlements between funded investor accounts.</p> : <ul className="mt-3 divide-y divide-void-700">{desk.recentTrades.map((trade) => <li key={trade.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs text-cream-300"><span>{trade.shares} shares × {money(trade.price)} USDC</span><time dateTime={trade.at} className="text-cream-400">{time(trade.at)}</time></li>)}</ul>}</details>
      </>}
    </section>
  );
}
