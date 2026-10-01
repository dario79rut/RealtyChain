import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { saveOwnedCampaign } from '../../utils/api';
import { Property } from '../../utils/types';
import { fieldClass } from './ownerForm';

export function OwnerFunding({ properties, onSaved }: { properties: Property[]; onSaved: (property: Property, message: string) => void }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const [form, setForm] = useState({ target: '400000', minimum: '1000', deadline: '', structure: '', distributions: '', useOfFunds: '', projections: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = properties.find((property) => property.id === propertyId) || null;

  if (!properties.length) return <p className="text-cream-400 text-sm">Add a property before opening a campaign.</p>;

  return (
    <form
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
          const res = await saveOwnedCampaign(propertyId, {
            target: Number(form.target),
            minimum: Number(form.minimum),
            deadline: form.deadline,
            structure: form.structure,
            expectedDistributions: form.distributions,
            useOfFunds: form.useOfFunds,
            projections: form.projections,
          });
          onSaved(res.property, `${res.property.title} is open to investors.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not open that campaign.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="md:col-span-2 text-cream-400 text-sm">Tell investors how much you need, what it buys, and what they earn.</p>
      <label className="text-sm text-cream-400 md:col-span-2">Property
        <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className={fieldClass}>
          {properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
        </select>
      </label>
      {selected?.offering?.campaign && (
        <p className="md:col-span-2 text-sm text-cream-300">
          Current campaign: ${selected.offering.campaign.raised.toLocaleString()} of ${selected.offering.campaign.target.toLocaleString()} · {selected.offering.campaign.status}
        </p>
      )}
      <label className="text-sm text-cream-400">Funding target
        <input type="number" min="1000" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value })} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400">Minimum investment
        <input type="number" min="1" value={form.minimum} onChange={(event) => setForm({ ...form, minimum: event.target.value })} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400">Deadline
        <input type="date" required value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400">Expected distributions
        <input required value={form.distributions} onChange={(event) => setForm({ ...form, distributions: event.target.value })} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400 md:col-span-2">Ownership structure
        <textarea required value={form.structure} onChange={(event) => setForm({ ...form, structure: event.target.value })} rows={2} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400 md:col-span-2">Use of funds
        <textarea required value={form.useOfFunds} onChange={(event) => setForm({ ...form, useOfFunds: event.target.value })} rows={2} className={fieldClass} />
      </label>
      <label className="text-sm text-cream-400 md:col-span-2">Financial projections
        <textarea required value={form.projections} onChange={(event) => setForm({ ...form, projections: event.target.value })} rows={2} className={fieldClass} />
      </label>
      {error && <p className="md:col-span-2 text-red-400 text-sm">{error}</p>}
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open campaign'}</Button>
      </div>
    </form>
  );
}
