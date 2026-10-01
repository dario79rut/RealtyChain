import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { pledgeCampaign } from '../../utils/api';
import { Property } from '../../utils/types';
import { formatUsd } from '../../utils/ops';

export function CampaignCard({ property, pledge = false }: { property: Property; pledge?: boolean }) {
  const campaign = property.offering?.campaign;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(campaign ? String(campaign.minimum) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  if (!campaign || (campaign.status !== 'open' && campaign.status !== 'funded')) return null;
  const pct = Math.min(100, Math.round((campaign.raised / Math.max(1, campaign.target)) * 100));
  const investor = user && user.role !== 'owner' && user.role !== 'admin';

  return (
    <article className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-accent">Funding campaign</div>
          <h3 className="font-display text-xl font-semibold text-cream-100 mt-1">{property.title}</h3>
          <p className="text-cream-400 text-sm mt-1">{property.location}</p>
        </div>
        <div className="text-right">
          <div className="text-cream-100 font-medium">${formatUsd(campaign.raised)} raised</div>
          <div className="text-cream-400 text-sm">of ${formatUsd(campaign.target)}</div>
        </div>
      </div>
      <div className="h-2 bg-void-700 rounded-full overflow-hidden my-4">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        <div><dt className="text-cream-400">Minimum</dt><dd className="text-cream-100">${formatUsd(campaign.minimum)}</dd></div>
        <div><dt className="text-cream-400">Deadline</dt><dd className="text-cream-100">{campaign.deadline}</dd></div>
        <div className="col-span-2"><dt className="text-cream-400">Use of funds</dt><dd className="text-cream-100">{campaign.useOfFunds}</dd></div>
        <div className="col-span-2"><dt className="text-cream-400">Structure</dt><dd className="text-cream-100">{campaign.structure}</dd></div>
        <div className="col-span-2"><dt className="text-cream-400">Distributions</dt><dd className="text-cream-100">{campaign.expectedDistributions}</dd></div>
        <div className="col-span-2"><dt className="text-cream-400">Projections</dt><dd className="text-cream-100">{campaign.projections}</dd></div>
      </dl>
      {campaign.status === 'funded' ? (
        <p className="text-emerald-300 text-sm">This campaign is fully funded.</p>
      ) : pledge && investor ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError('');
            setNotice('');
            setBusy(true);
            try {
              await pledgeCampaign(property.id, Number(amount));
              await queryClient.invalidateQueries({ queryKey: ['properties'] });
              setNotice('Your investment is recorded on this campaign.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not join this campaign.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="text-sm text-cream-400">Amount (USDC)
            <input
              type="number"
              min={campaign.minimum}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-1 block bg-void-700 border border-void-600 rounded-xl px-3 py-2 text-cream-100"
            />
          </label>
          <Button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Invest'}</Button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {notice && <p className="text-emerald-300 text-sm">{notice}</p>}
        </form>
      ) : pledge ? (
        <p className="text-cream-400 text-sm">Investors join this campaign from their own accounts.</p>
      ) : (
        <Link to={`/property/${property.id}`} className="text-sm text-accent">View campaign</Link>
      )}
    </article>
  );
}
