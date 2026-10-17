import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LendingDesk,
  borrowUsdc,
  fetchLending,
  liquidateLoan,
  releaseCollateral,
  repayUsdc,
  supplyUsdc,
  withdrawUsdc,
} from '../utils/api';
import { Button } from '../components/ui/Button';
import { formatUsd } from '../utils/ops';
import { LendingOverview, LoanRiskDetails, LendingBook, LendingRateModel } from '../components/lending/LendingDetails';

const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100';

function pct(value: number) {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 2 : 1)}%`;
}

export default function Lend() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [desk, setDesk] = useState<LendingDesk | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [shares, setShares] = useState('1');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [supplyAmount, setSupplyAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    setError('');
    try { setDesk(await fetchLending()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load lending.'); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!propertyId && desk?.collateral[0]) setPropertyId(desk.collateral[0].propertyId);
  }, [desk, propertyId]);

  const selected = desk?.collateral.find((row) => row.propertyId === propertyId) || null;
  const preview = useMemo(() => {
    if (!desk || !selected) return null;
    const lock = Math.max(0, Math.floor(Number(shares) || 0));
    const borrow = Math.max(0, Number(borrowAmount) || 0);
    const added = lock * selected.mark;
    const collateral = (desk.loan?.collateralValue || 0) + added;
    const debt = (desk.loan?.debt || 0) + borrow;
    const ltv = collateral > 0 ? debt / collateral : 0;
    const maxDebt = collateral * desk.terms.maxLtv;
    return { lock, borrow, collateral, debt, ltv, maxDebt, room: Math.max(0, maxDebt - (desk.loan?.debt || 0)) };
  }, [desk, selected, shares, borrowAmount]);

  const run = async (key: string, action: () => Promise<LendingDesk>, message: string) => {
    if (busy || refreshing) return;
    setError('');
    setNotice('');
    setBusy(key);
    try {
      setDesk(await action());
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  const loan = desk?.loan;
  const validBorrow = Boolean(desk && selected && preview && Number.isInteger(Number(shares))
    && Number(shares) > 0 && Number(shares) <= selected.available
    && Number.isFinite(Number(borrowAmount)) && Number(borrowAmount) > 0
    && preview.borrow <= preview.room && preview.borrow <= desk.poolUsdc);
  const positiveAmount = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;
  const ltvWidth = Math.min(100, ((loan?.ltv || 0) / (desk?.terms.liquidationLtv || 0.65)) * 100);

  if (user?.role === 'institution') {
    return (
      <div className="min-h-screen w-full">
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-cream-100 mb-3">Investor lending</h1>
          <p className="text-cream-400 mb-6">This pool is for retail investors. Institutional exposure stays on Corda and settles to Solana from the desk.</p>
          <Button onClick={() => navigate('/institution')}>Open Corda desk</Button>
        </div>
      </div>
    );
  }

  if (user?.role === 'owner') {
    return (
      <div className="min-h-screen w-full">
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-cream-100 mb-3">Investor lending</h1>
          <p className="text-cream-400 mb-6">This pool is for investors borrowing against tokens. Property financing is a separate application on the owner desk.</p>
          <Button onClick={() => navigate('/user?tab=financing')}>Open property financing</Button>
        </div>
      </div>
    );
  }

  if (user?.role === 'admin') {
    return (
      <div className="min-h-screen w-full">
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-cream-100 mb-3">Lending</h1>
          <p className="text-cream-400 mb-6">Borrowing and supplying are investor actions. Loan books are reviewed from the admin console.</p>
          <Button onClick={() => navigate('/admin')}>Open admin</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <p className="font-display text-accent text-sm uppercase tracking-widest mb-1">Real-world assets</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Lending &amp; borrowing</h1>
          <Button type="button" variant="outline" disabled={refreshing || Boolean(busy)} onClick={load}>{refreshing ? 'Refreshing…' : 'Refresh positions'}</Button>
        </div>
        <p className="text-cream-400 mt-2 max-w-2xl">
          Review pool exposure, pledge property-token shares as margin, and track your borrowing costs and liquidation headroom.
        </p>

        {desk && <p className="mt-3 text-xs text-cream-400">Snapshot {new Date(desk.asOf).toLocaleString()} · refresh to recalculate interest and read stored marks</p>}
        {desk && <LendingOverview desk={desk} account={user?.name || 'Your investor account'} />}
        {desk && <LendingRateModel desk={desk} />}
        {desk && (
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {[
              ['Max LTV', pct(desk.terms.maxLtv)],
              ['Liquidation', pct(desk.terms.liquidationLtv)],
              ['Borrow APR', pct(desk.terms.borrowApr)],
              ['Supply APR', pct(desk.terms.supplyApr)],
              ['Penalty', pct(desk.terms.penalty)],
              ['Pool liquidity', `${formatUsd(desk.poolUsdc)} USDC`],
            ].map(([label, value]) => (
              <span key={label} className="rounded-full border border-void-600 px-3 py-1.5 text-cream-300">
                {label} <span className="text-cream-100">{value}</span>
              </span>
            ))}
          </div>
        )}

        {error && <p role="alert" className="text-red-400 text-sm mt-4">{error}</p>}
        {notice && <p role="status" className="text-emerald-300 text-sm mt-4">{notice}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
            <h2 className="font-display text-xl font-semibold text-cream-100">Borrow</h2>
            <p className="text-cream-400 text-sm mt-1 mb-4">
              Locked shares cannot be sold. Interest accrues on principal at {desk ? pct(desk.terms.borrowApr) : '—'} APR.
            </p>
            {desk && !loan && <p className="text-sm text-cream-400 mb-4">No open borrowing position. Choose the exact shares to pledge and review the terms below before borrowing.</p>}
            {loan && (
              <div className="mb-5 rounded-xl border border-void-700 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-cream-400">Debt</span>
                  <span className="text-cream-100">{formatUsd(loan.debt)} USDC</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-cream-400">Collateral</span>
                  <span className="text-cream-100">${formatUsd(loan.collateralValue)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-cream-400">Loan-to-value</span>
                  <span className={loan.health === 'liquidatable' ? 'text-red-300' : loan.health === 'limited' ? 'text-amber-200' : 'text-emerald-300'}>
                    {pct(loan.ltv)}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-cream-400">Collateral ratio</span>
                  <span className="text-cream-100">{loan.debt > 0 ? `${(loan.collateralValue / loan.debt).toFixed(2)}×` : '—'}</span>
                </div>
                <div role="progressbar" aria-label="LTV relative to liquidation threshold" aria-valuenow={Math.round(ltvWidth)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${pct(loan.ltv)} LTV; liquidation at ${desk ? pct(desk.terms.liquidationLtv) : '—'}`} className="h-2 bg-void-700 rounded-full overflow-hidden mt-3">
                  <div className={`h-full ${loan.health === 'liquidatable' ? 'bg-red-400' : 'bg-accent'}`} style={{ width: `${ltvWidth}%` }} />
                </div>
                <p className="text-cream-400 text-xs mt-2">
                  {formatUsd(loan.interest)} USDC interest · {formatUsd(loan.maxBorrow)} USDC still available to borrow
                </p>
                {desk && <LoanRiskDetails loan={loan} desk={desk} />}
                <div className="mt-3 space-y-2">
                  {loan.collateral.map((line) => (
                    <div key={line.propertyId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-cream-200">{line.shares} {line.title}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(busy) || refreshing || (loan.debt > 0 && (loan.collateralValue - line.value <= 0 || loan.debt / (loan.collateralValue - line.value) > (desk?.terms.maxLtv || 0.5)))}
                        onClick={() => run('release', () => releaseCollateral({ propertyId: line.propertyId, shares: line.shares }), 'Collateral released.')}
                      >
                        Release
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-cream-400">Release returns all shares in that asset line and is available when the remaining margin keeps LTV within the borrowing limit. Repay debt to free more margin.</p>
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run('repay', () => repayUsdc(Number(repayAmount)), 'Repayment posted.');
                  }}
                >
                  <input aria-label="Repayment amount in USDC" required type="number" min="0.01" step="0.01" value={repayAmount} onChange={(event) => setRepayAmount(event.target.value)} placeholder="Repay USDC" className={fieldClass} />
                  <Button type="submit" disabled={Boolean(busy) || refreshing || !positiveAmount(repayAmount) || !desk || Math.min(Number(repayAmount), loan.debt) > desk.cashUsdc}>{busy === 'repay' ? 'Repaying…' : 'Repay'}</Button>
                </form>
              </div>
            )}
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                run('borrow', () => borrowUsdc({
                  propertyId,
                  shares: Math.floor(Number(shares)),
                  usdc: Number(borrowAmount),
                }), 'USDC borrowed against your tokens.');
              }}
            >
              <label className="block text-sm text-cream-400">Property tokens to pledge as margin
                <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={fieldClass}>
                  {(desk?.collateral || []).map((row) => (
                    <option key={row.propertyId} value={row.propertyId}>
                      {row.title} · {row.available} free · ${formatUsd(row.mark)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-cream-400">Shares to lock
                  <input required type="number" min="1" step="1" max={selected?.available || 0} value={shares} onChange={(event) => setShares(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-sm text-cream-400">USDC to borrow
                  <input required type="number" min="0.01" step="0.01" value={borrowAmount} onChange={(event) => setBorrowAmount(event.target.value)} className={fieldClass} />
                </label>
              </div>
              {preview && selected && (
                <div className="rounded-xl border border-void-600 bg-void-900/40 p-4 text-sm space-y-2">
                  <h3 className="text-cream-100 font-semibold">Review borrowing terms</h3>
                  <p className="text-cream-300">Borrower: {user?.name || 'You'} · lender: {desk?.pool.name}</p>
                  <p className="text-cream-300">Pledge {preview.lock} shares of {selected.title} at ${formatUsd(selected.mark)} per share = ${formatUsd(preview.lock * selected.mark)} additional margin.</p>
                  <p className="text-cream-300">Receive {formatUsd(preview.borrow)} USDC · total debt after borrowing {formatUsd(preview.debt)} USDC · total margin ${formatUsd(preview.collateral)}.</p>
                  <p className={preview.ltv > (desk?.terms.maxLtv || 0.5) ? 'text-red-300' : 'text-cream-300'}>Resulting LTV {pct(preview.ltv)} · maximum {desk ? pct(desk.terms.maxLtv) : '—'} · liquidation at {desk ? pct(desk.terms.liquidationLtv) : '—'}.</p>
                  {desk && preview.debt > 0 && <p className="text-cream-300">Estimated liquidation margin value: ${formatUsd(preview.debt / desk.terms.liquidationLtv)} · uniform mark decline to threshold: {pct(Math.max(0, 1 - preview.debt / desk.terms.liquidationLtv / preview.collateral))}, holding debt constant. Interest accrual reduces this buffer.</p>}
                  <p className="text-cream-400">Additional interest: approximately {formatUsd(preview.borrow * (desk?.terms.borrowApr || 0) / 365)} USDC/day or {formatUsd(preview.borrow * (desk?.terms.borrowApr || 0))} USDC/year at {desk ? pct(desk.terms.borrowApr) : '—'} APR, if rates stay unchanged and before repayments. No origination fee is charged by this service.</p>
                  <p className="text-cream-400">Remaining capacity before this draw: {formatUsd(preview.room)} USDC, subject to {desk ? formatUsd(desk.poolUsdc) : '—'} USDC of pool liquidity.</p>
                  {!validBorrow && <p className="text-amber-200">Enter a positive amount within the borrowing limit and pool liquidity, and a whole number of available shares.</p>}
                </div>
              )}
              <Button type="submit" disabled={Boolean(busy) || refreshing || !validBorrow}>
                {busy === 'borrow' ? 'Borrowing…' : 'Borrow USDC'}
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
            <h2 className="font-display text-xl font-semibold text-cream-100">Lend USDC</h2>
            <p className="text-cream-400 text-sm mt-1 mb-4">
              Supply USDC to the shared pool at {desk ? pct(desk.terms.supplyApr) : '—'} APR on supplied principal. Available cash {desk ? formatUsd(desk.cashUsdc) : '0'} USDC.
            </p>
            {desk && <div className="text-sm text-cream-300 rounded-xl border border-void-700 p-4 mb-4 space-y-2">
              <p>Lender: {user?.name || 'You'} · recipient: {desk.pool.name}</p>
              <p>Borrower exposure: {desk.pool.borrowerCount} active investor accounts. Your deposit is pooled across the facility.</p>
              <p className="text-cream-400">No fixed maturity. Withdrawals depend on available liquidity. Interest is simple, on a 365-day basis.</p>
            </div>}
            {desk?.supply && (
              <div className="mb-4 rounded-xl border border-void-700 p-4 text-sm">
                <div className="flex justify-between"><span className="text-cream-400">Supplied</span><span className="text-cream-100">{formatUsd(desk.supply.principal)} USDC</span></div>
                <div className="flex justify-between mt-1"><span className="text-cream-400">Interest</span><span className="text-emerald-300">{formatUsd(desk.supply.interest)} USDC</span></div>
                <div className="flex justify-between mt-1"><span className="text-cream-400">Balance</span><span className="text-cream-100">{formatUsd(desk.supply.total)} USDC</span></div>
              </div>
            )}
            {desk && positiveAmount(supplyAmount) && <p className="text-xs text-cream-400 mb-3">Supply preview: {formatUsd(Number(supplyAmount))} USDC to {desk.pool.name}; estimated interest {formatUsd(Number(supplyAmount) * desk.terms.supplyApr / 365)} USDC/day · {formatUsd(Number(supplyAmount) * desk.terms.supplyApr)} USDC/year if the current rate stays unchanged and before withdrawals.</p>}
            <form
              className="flex gap-2 mb-3"
              onSubmit={(event) => {
                event.preventDefault();
                run('supply', () => supplyUsdc(Number(supplyAmount)), 'USDC supplied to the pool.');
              }}
            >
              <input aria-label="Supply amount in USDC" required type="number" min="0.01" step="0.01" value={supplyAmount} onChange={(event) => setSupplyAmount(event.target.value)} placeholder="Supply USDC" className={fieldClass} />
              <Button type="submit" disabled={Boolean(busy) || refreshing || !desk || !positiveAmount(supplyAmount) || Number(supplyAmount) > desk.cashUsdc}>{busy === 'supply' ? 'Supplying…' : 'Supply'}</Button>
            </form>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run('withdraw', () => withdrawUsdc(Number(withdrawAmount)), 'USDC withdrawn.');
              }}
            >
              <input aria-label="Withdrawal amount in USDC" required type="number" min="0.01" step="0.01" value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="Withdraw USDC" className={fieldClass} />
              <Button type="submit" variant="outline" disabled={Boolean(busy) || refreshing || !desk?.supply || !positiveAmount(withdrawAmount) || desk.poolUsdc <= 0}>
                {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
              </Button>
            </form>

            {desk?.supply && positiveAmount(withdrawAmount) && <p className="text-xs text-cream-400 mt-3">Available to fulfill this request now: {formatUsd(Math.min(Number(withdrawAmount), desk.supply.total, desk.poolUsdc))} USDC. The service caps the withdrawal at your balance and pool liquidity.</p>}
            <h3 className="font-display text-lg font-semibold text-cream-100 mt-8 mb-2">Liquidations</h3>
            <p className="text-cream-400 text-sm mb-3">
              A loan at or above {desk ? pct(desk.terms.liquidationLtv) : '65%'} loan-to-value can be repaid by another account. The liquidator receives pledged shares targeting the debt plus a {desk ? pct(desk.terms.penalty) : '8%'} penalty, rounded up to whole shares and capped by pledged holdings.
            </p>
            {(desk?.liquidations.length || 0) === 0 ? (
              <p className="text-cream-400 text-sm">No loans are at the liquidation threshold.</p>
            ) : desk?.liquidations.map((row) => (
              <article key={row.id} className="rounded-xl border border-red-500/30 p-4 mb-3">
                <div className="text-cream-100">{row.borrower}</div>
                <p className="text-cream-400 text-sm mt-1">
                  ${formatUsd(row.debt)} debt · ${formatUsd(row.collateralValue)} collateral · {pct(row.ltv)} LTV
                </p>
                <Button
                  className="mt-3"
                  variant="danger"
                  disabled={Boolean(busy) || refreshing || !desk || desk.cashUsdc < row.debt}
                  onClick={() => run(row.id, () => liquidateLoan(row.id), 'Loan liquidated. Collateral shares are in your account.')}
                >
                  {busy === row.id ? 'Liquidating…' : 'Liquidate'}
                </Button>
              </article>
            ))}
          </section>
        </div>
        {desk && <LendingBook desk={desk} />}
      </div>
    </div>
  );
}
