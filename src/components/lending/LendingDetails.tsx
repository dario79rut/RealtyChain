import React from 'react';
import { Link } from 'react-router-dom';
import type { LendingDesk, LendingLoan } from '../../utils/api';
import { formatUsd } from '../../utils/ops';

export const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const usd = (value: number) => `$${formatUsd(value)}`;
const usdc = (value: number) => `${formatUsd(value)} USDC`;

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-cream-400">{label}</dt><dd className="mt-1 text-sm text-cream-100 break-words">{children}</dd></div>;
}

export function LendingOverview({ desk, account }: { desk: LendingDesk; account: string }) {
  const deployed = desk.positions.reduce((sum, loan) => sum + loan.principal, 0);
  const utilization = deployed + desk.poolUsdc > 0 ? deployed / (deployed + desk.poolUsdc) : 0;
  return (
    <section aria-label="Pool and counterparties" className="mt-6 rounded-2xl border border-void-700 bg-void-800/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest text-accent">Pooled credit facility</p><h2 className="font-display text-xl text-cream-100 mt-1">{desk.pool.name}</h2></div>
        <span className="rounded-full border border-void-600 px-3 py-1 text-xs text-cream-300">{desk.pool.settlement}</span>
      </div>
      <dl className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
        <Metric label="Available pool liquidity">{usdc(desk.poolUsdc)}</Metric>
        <Metric label="Outstanding debt incl. interest">{usdc(desk.pool.outstandingDebt)}</Metric>
        <Metric label="Capital utilization">{percent(utilization)}</Metric>
        <Metric label="Participants">{desk.pool.supplierCount} suppliers · {desk.pool.borrowerCount} borrowers</Metric>
        <Metric label="Your account">{account}</Metric>
        <Metric label="Lending counterparty">Shared pool · funded by suppliers and initial application liquidity</Metric>
        <Metric label="Borrowing counterparties">Investor accounts pledging property tokens</Metric>
        <Metric label="Supplier principal recorded">{usdc(desk.pool.suppliedPrincipal)}</Metric>
      </dl>
      <p className="mt-4 text-xs text-cream-400">Funds are pooled; a supply is not matched to one named borrower. Initial liquidity is seeded by the application without a named funding account. Borrower references below identify positions while keeping other account identities private.</p>
    </section>
  );
}

export function LoanRiskDetails({ loan, desk }: { loan: LendingLoan; desk: LendingDesk }) {
  const thresholdValue = loan.debt / desk.terms.liquidationLtv;
  const priceBuffer = loan.collateralValue > 0 ? Math.max(0, 1 - thresholdValue / loan.collateralValue) : 0;
  const healthFactor = loan.debt > 0 ? loan.collateralValue * desk.terms.liquidationLtv / loan.debt : null;
  const repayToLimit = Math.max(0, loan.debt - loan.collateralValue * desk.terms.maxLtv);
  return (
    <div className="mt-4 border-t border-void-700 pt-4">
      <dl className="grid grid-cols-2 gap-4">
        <Metric label="Borrower">{loan.borrower}</Metric>
        <Metric label="Lender / funding source">{desk.pool.name}</Metric>
        <Metric label="Loan reference">{loan.id}</Metric>
        <Metric label="Borrow APR / basis">{percent(desk.terms.borrowApr)} · simple interest on principal</Metric>
        <Metric label="Outstanding principal">{usdc(loan.principal)}</Metric>
        <Metric label="Accrued interest">{usdc(loan.interest)}</Metric>
        <Metric label="Estimated interest per day">{usdc(loan.principal * desk.terms.borrowApr / 365)}</Metric>
        <Metric label="Health factor · liquidation at ≤ 1">{healthFactor == null ? '—' : healthFactor.toFixed(3)}</Metric>
      </dl>
      <h3 className="mt-5 text-sm font-semibold text-cream-100">Pledged margin · property-token shares</h3>
      <div className="overflow-x-auto mt-2">
        <table className="w-full min-w-[440px] text-sm text-left">
          <thead className="text-xs text-cream-400 border-b border-void-700"><tr><th className="py-2 pr-3">Asset</th><th className="py-2 px-2 text-right">Locked</th><th className="py-2 px-2 text-right">Mark / share</th><th className="py-2 pl-2 text-right">Margin value</th></tr></thead>
          <tbody>{loan.collateral.map((line) => <tr key={line.propertyId} className="border-b border-void-700/60 text-cream-200">
            <td className="py-3 pr-3"><Link to={`/property/${line.propertyId}`} className="text-accent hover:underline">{line.title}</Link><span className="block text-xs text-cream-400">Property #{line.propertyId}</span></td>
            <td className="py-3 px-2 text-right">{line.shares.toLocaleString()}</td><td className="py-3 px-2 text-right">{usd(line.mark)}</td><td className="py-3 pl-2 text-right">{usd(line.value)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-cream-400">Margin is the locked token position. Valuation = locked shares × stored market mark, without a collateral haircut. The underlying property itself is not pledged by this transaction.</p>
      <div className={`mt-4 rounded-xl border p-4 text-sm ${loan.health === 'liquidatable' ? 'border-red-500/40 bg-red-500/5' : 'border-amber-400/30 bg-amber-400/5'}`}>
        <h3 className="font-semibold text-cream-100">{loan.health === 'liquidatable' ? 'Eligible for liquidation' : 'Liquidation conditions'}</h3>
        <p className="mt-2 text-cream-300">Total debt ÷ margin value ≥ {percent(desk.terms.liquidationLtv)}. Debt includes accrued interest, so interest growth can also trigger eligibility.</p>
        <dl className="grid grid-cols-2 gap-4 mt-3">
          <Metric label="Approx. margin value at threshold">{usd(thresholdValue)}</Metric>
          <Metric label="Uniform mark decline to threshold">{loan.health === 'liquidatable' ? 'Threshold reached' : percent(priceBuffer)}</Metric>
          <Metric label="Repay to return to borrowing limit">{usdc(repayToLimit)}</Metric>
          <Metric label="Liquidation collateral target">{usd(loan.debt * (1 + desk.terms.penalty))}</Metric>
        </dl>
        <p className="mt-3 text-xs text-cream-400">Estimates hold debt constant. The service rounds LTV to 0.01 percentage points before testing eligibility. Another account must repay the entire debt to liquidate; shares are transferred for debt plus {percent(desk.terms.penalty)}, rounded up to whole shares and limited to available pledged holdings. Remaining collateral is unlocked.</p>
      </div>
    </div>
  );
}

export function LendingBook({ desk }: { desk: LendingDesk }) {
  const actions: Record<string, string> = { supply: 'Supplied', withdraw: 'Withdrawn', borrow: 'Borrowed', repay: 'Repaid', release: 'Collateral released', liquidate: 'Liquidation paid', liquidated: 'Your loan liquidated' };
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
        <h2 className="font-display text-xl text-cream-100">Pool loan book</h2>
        <p className="mt-1 text-sm text-cream-400">Exposure funded by the shared pool. Each position uses the displayed pool borrow APR; supplies earn the pool supply APR.</p>
        {desk.positions.length === 0 ? <p className="mt-4 text-sm text-cream-400">No outstanding borrower positions. Supplied funds remain in pool liquidity.</p> : (
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-sm text-left">
            <thead className="text-xs text-cream-400 border-b border-void-700"><tr>{['Borrower / loan', 'Pledged assets', 'Debt · USDC', 'Margin · USD', 'LTV', 'Borrow APR', 'Status'].map((label) => <th key={label} className="py-2 pr-4">{label}</th>)}</tr></thead>
            <tbody>{desk.positions.map((position) => <tr key={position.id} className="border-b border-void-700 text-cream-200">
              <td className="py-3 pr-4">{position.borrower}<span className="block text-xs text-cream-400">{position.id}</span></td>
              <td className="py-3 pr-4">{position.collateral.map((line) => <span className="block" key={line.propertyId}>{line.shares} × {line.title}</span>)}</td>
              <td className="py-3 pr-4">{formatUsd(position.debt)}</td><td className="py-3 pr-4">{formatUsd(position.collateralValue)}</td><td className="py-3 pr-4">{percent(position.ltv)}</td><td className="py-3 pr-4">{percent(desk.terms.borrowApr)}</td>
              <td className={`py-3 ${position.health === 'liquidatable' ? 'text-red-300' : position.health === 'limited' ? 'text-amber-200' : 'text-emerald-300'}`}>{position.health === 'limited' ? 'Borrow limit reached' : position.health === 'liquidatable' ? 'Liquidatable' : 'Healthy'}</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <section className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
        <h2 className="font-display text-xl text-cream-100">Your lending activity</h2>
        <p className="mt-1 text-xs text-cream-400">Latest 50 recorded actions. Earlier transactions without history are not reconstructed.</p>
        {desk.activity.length === 0 ? <p className="mt-4 text-sm text-cream-400">No recorded activity yet. New supplies, withdrawals, loans, repayments, releases, and liquidations will appear here.</p> : (
          <ol className="mt-4 divide-y divide-void-700">{desk.activity.map((entry) => <li key={entry.id} className="py-3 flex flex-wrap justify-between gap-2 text-sm">
            <div><p className="text-cream-100">{actions[entry.action] || entry.action}{entry.usdc > 0 ? ` · ${usdc(entry.usdc)}` : ''}</p>
              <p className="text-xs text-cream-400 mt-1">{entry.loanId || entry.id}{entry.shares ? ` · ${entry.shares} shares · property #${entry.propertyId}` : ''}</p></div>
            <time dateTime={entry.at} className="text-xs text-cream-400">{new Date(entry.at).toLocaleString()}</time>
          </li>)}</ol>
        )}
      </section>
      <details className="rounded-2xl border border-void-700 p-5 text-sm text-cream-400">
        <summary className="cursor-pointer text-cream-100 font-medium">Rate, valuation &amp; settlement methodology</summary>
        <dl className="grid sm:grid-cols-2 gap-5 mt-4">
          <Metric label="Interest convention">Current configured APR · 365-day year · simple interest on principal, calculated when the desk is accessed or a transaction occurs.</Metric>
          <Metric label="Term / repayment">Open-ended; no scheduled maturity or installments. Repayments cover accrued interest first, then principal. Full repayment unlocks collateral.</Metric>
          <Metric label="Collateral pricing">{desk.pool.valuationMethod} No independent oracle or appraisal verification is recorded by this lending service.</Metric>
          <Metric label="Supply withdrawals">Limited by your balance and available pool cash. A request may be partially filled; the actual withdrawn amount is recorded in activity.</Metric>
          <Metric label="Execution">Balances, collateral locks, and liquidations are recorded in the application ledger. No on-chain loan address or wallet settlement is provided by this service.</Metric>
          <Metric label="Lender exposure">Suppliers share pool liquidity and borrower exposure. Interest is credited by the application; it is not a guarantee of available withdrawal cash.</Metric>
        </dl>
      </details>
    </div>
  );
}
