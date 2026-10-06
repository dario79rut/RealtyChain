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

  const load = () => fetchLending().then(setDesk).catch((err) => {
    setError(err instanceof Error ? err.message : 'Could not load lending.');
  });

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
        <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Lending</h1>
        <p className="text-cream-400 mt-2 max-w-2xl">
          Lock property tokens as collateral and borrow USDC, or supply USDC to the pool. A $20,000 token position can borrow up to $10,000 at the 50% loan-to-value limit.
        </p>

        {desk && (
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {[
              ['Max LTV', pct(desk.terms.maxLtv)],
              ['Liquidation', pct(desk.terms.liquidationLtv)],
              ['Borrow APR', pct(desk.terms.borrowApr)],
              ['Supply APR', pct(desk.terms.supplyApr)],
              ['Penalty', pct(desk.terms.penalty)],
              ['Pool', `$${formatUsd(desk.poolUsdc)}`],
            ].map(([label, value]) => (
              <span key={label} className="rounded-full border border-void-600 px-3 py-1.5 text-cream-300">
                {label} <span className="text-cream-100">{value}</span>
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
        {notice && <p className="text-emerald-300 text-sm mt-4">{notice}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
            <h2 className="font-display text-xl font-semibold text-cream-100">Borrow</h2>
            <p className="text-cream-400 text-sm mt-1 mb-4">
              Locked shares cannot be sold. Interest accrues on the balance at {desk ? pct(desk.terms.borrowApr) : '8%'} APR.
            </p>
            {loan && (
              <div className="mb-5 rounded-xl border border-void-700 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-cream-400">Debt</span>
                  <span className="text-cream-100">${formatUsd(loan.debt)}</span>
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
                <div className="h-2 bg-void-700 rounded-full overflow-hidden mt-3">
                  <div className={`h-full ${loan.health === 'liquidatable' ? 'bg-red-400' : 'bg-accent'}`} style={{ width: `${ltvWidth}%` }} />
                </div>
                <p className="text-cream-400 text-xs mt-2">
                  ${formatUsd(loan.interest)} interest · ${formatUsd(loan.maxBorrow)} still available to borrow
                </p>
                <div className="mt-3 space-y-2">
                  {loan.collateral.map((line) => (
                    <div key={line.propertyId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-cream-200">{line.shares} {line.title}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === 'release'}
                        onClick={() => run('release', () => releaseCollateral({ propertyId: line.propertyId, shares: line.shares }), 'Collateral released.')}
                      >
                        Release
                      </Button>
                    </div>
                  ))}
                </div>
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run('repay', () => repayUsdc(Number(repayAmount)), 'Repayment posted.');
                  }}
                >
                  <input value={repayAmount} onChange={(event) => setRepayAmount(event.target.value)} placeholder="Repay USDC" className={fieldClass} />
                  <Button type="submit" disabled={busy === 'repay'}>{busy === 'repay' ? 'Repaying…' : 'Repay'}</Button>
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
              <label className="block text-sm text-cream-400">Collateral
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
                  <input value={shares} onChange={(event) => setShares(event.target.value)} className={fieldClass} />
                </label>
                <label className="text-sm text-cream-400">USDC to borrow
                  <input value={borrowAmount} onChange={(event) => setBorrowAmount(event.target.value)} className={fieldClass} />
                </label>
              </div>
              {preview && selected && (
                <p className="text-cream-400 text-sm">
                  {preview.lock} shares add ${formatUsd(preview.lock * selected.mark)} of collateral.
                  New loan-to-value {pct(preview.ltv)}. Up to ${formatUsd(preview.room)} can be borrowed on the position after this lock.
                </p>
              )}
              <Button type="submit" disabled={busy === 'borrow' || !selected}>
                {busy === 'borrow' ? 'Borrowing…' : 'Borrow USDC'}
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
            <h2 className="font-display text-xl font-semibold text-cream-100">Lend USDC</h2>
            <p className="text-cream-400 text-sm mt-1 mb-4">
              Supply cash to the pool and earn {desk ? pct(desk.terms.supplyApr) : '4%'} APR. Available cash ${desk ? formatUsd(desk.cashUsdc) : '0'}.
            </p>
            {desk?.supply && (
              <div className="mb-4 rounded-xl border border-void-700 p-4 text-sm">
                <div className="flex justify-between"><span className="text-cream-400">Supplied</span><span className="text-cream-100">${formatUsd(desk.supply.principal)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-cream-400">Interest</span><span className="text-emerald-300">${formatUsd(desk.supply.interest)}</span></div>
                <div className="flex justify-between mt-1"><span className="text-cream-400">Balance</span><span className="text-cream-100">${formatUsd(desk.supply.total)}</span></div>
              </div>
            )}
            <form
              className="flex gap-2 mb-3"
              onSubmit={(event) => {
                event.preventDefault();
                run('supply', () => supplyUsdc(Number(supplyAmount)), 'USDC supplied to the pool.');
              }}
            >
              <input value={supplyAmount} onChange={(event) => setSupplyAmount(event.target.value)} placeholder="Supply USDC" className={fieldClass} />
              <Button type="submit" disabled={busy === 'supply'}>{busy === 'supply' ? 'Supplying…' : 'Supply'}</Button>
            </form>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                run('withdraw', () => withdrawUsdc(Number(withdrawAmount)), 'USDC withdrawn.');
              }}
            >
              <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="Withdraw USDC" className={fieldClass} />
              <Button type="submit" variant="outline" disabled={busy === 'withdraw' || !desk?.supply}>
                {busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}
              </Button>
            </form>

            <h3 className="font-display text-lg font-semibold text-cream-100 mt-8 mb-2">Liquidations</h3>
            <p className="text-cream-400 text-sm mb-3">
              A loan at or above {desk ? pct(desk.terms.liquidationLtv) : '65%'} loan-to-value can be repaid by another account. The liquidator receives collateral worth the debt plus a {desk ? pct(desk.terms.penalty) : '8%'} penalty.
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
                  disabled={busy === row.id}
                  onClick={() => run(row.id, () => liquidateLoan(row.id), 'Loan liquidated. Collateral shares are in your account.')}
                >
                  {busy === row.id ? 'Liquidating…' : 'Liquidate'}
                </Button>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
