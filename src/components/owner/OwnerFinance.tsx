import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { acceptOwnerFinance, applyOwnerFinance, repayOwnerFinance } from '../../utils/api';
import { Property } from '../../utils/types';
import { formatUsd } from '../../utils/ops';
import { fieldClass } from './ownerForm';

const MAX_LTV = 0.6;

export function OwnerFinance({ properties, onSaved }: { properties: Property[]; onSaved: (property: Property, message: string) => void }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [repay, setRepay] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const selected = properties.find((property) => property.id === propertyId) || null;
  const collateral = selected?.offering?.financing?.collateralValue || selected?.offering?.valuation || selected?.price || 0;
  const outstanding = selected?.offering?.financing?.outstanding || 0;
  const capacity = Math.max(0, collateral * MAX_LTV - outstanding);
  const ltv = collateral > 0 ? outstanding / collateral : 0;
  const payment = selected?.offering?.financing?.monthlyPayment || 0;
  const offer = selected?.offering?.financing?.offer;

  if (!properties.length) return <p className="text-cream-400 text-sm">Add a property before applying for financing.</p>;

  const run = async (key: string, action: () => Promise<{ property: Property }>, message: string) => {
    setError('');
    setBusy(key);
    try {
      const res = await action();
      onSaved(res.property, message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-5">
      <label className="block text-sm text-cream-400 max-w-md">Property
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={fieldClass}>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Collateral value', `$${formatUsd(collateral)}`],
          ['Outstanding loan', `$${formatUsd(outstanding)}`],
          ['Available capacity', `$${formatUsd(capacity)}`],
          ['Current LTV', `${(ltv * 100).toFixed(0)}%`],
          ['Monthly payment', `$${formatUsd(payment)}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-void-700 px-3 py-2">
            <div className="text-cream-400 text-xs">{label}</div>
            <div className="text-cream-100 font-medium mt-0.5">{value}</div>
          </div>
        ))}
      </div>
      <p className="text-cream-400 text-sm">Financing is secured by the property, up to 60% of value, and is separate from investor loans.</p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-cream-400">Apply for
          <input type="number" min="1000" value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} />
        </label>
        <Button
          type="button"
          disabled={busy === 'apply'}
          onClick={() => run('apply', () => applyOwnerFinance(propertyId, Number(amount)), 'A loan offer is ready.')}
        >
          {busy === 'apply' ? 'Reviewing…' : 'Apply'}
        </Button>
      </div>
      {offer && (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
          <div className="text-cream-100 font-medium">Offer: ${formatUsd(offer.amount)} at {(offer.apr * 100).toFixed(1)}% · ${formatUsd(offer.monthlyPayment)} / month · {(offer.ltv * 100).toFixed(0)}% LTV</div>
          <Button
            className="mt-3"
            type="button"
            disabled={busy === 'accept'}
            onClick={() => run('accept', () => acceptOwnerFinance(propertyId), 'Funds are in the owner account.')}
          >
            {busy === 'accept' ? 'Receiving…' : 'Accept and receive funds'}
          </Button>
        </div>
      )}
      {outstanding > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-cream-400">Repay
            <input type="number" min="1" value={repay} onChange={(event) => setRepay(event.target.value)} className={fieldClass} />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={busy === 'repay'}
            onClick={() => run('repay', () => repayOwnerFinance(propertyId, Number(repay)), 'Repayment applied.')}
          >
            {busy === 'repay' ? 'Repaying…' : 'Repay'}
          </Button>
        </div>
      )}
    </div>
  );
}
