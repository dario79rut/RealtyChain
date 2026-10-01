import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { tokenizeOwnedProperty } from '../../utils/api';
import { Property } from '../../utils/types';
import { formatUsd } from '../../utils/ops';
import { fieldClass } from './ownerForm';

export function OwnerTokenize({ properties, onSaved }: { properties: Property[]; onSaved: (property: Property, message: string) => void }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id || '');
  const selected = properties.find((property) => property.id === propertyId) || null;
  const startingValue = selected?.offering?.valuation || selected?.price || 0;
  const [value, setValue] = useState(startingValue ? String(startingValue) : '');
  const [ownerPercent, setOwnerPercent] = useState('70');
  const [price, setPrice] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const preview = useMemo(() => {
    const propertyValue = Number(value) || 0;
    const retained = Math.min(100, Math.max(0, Number(ownerPercent) || 0));
    const offered = Math.max(0, 100 - retained);
    const target = propertyValue * offered / 100;
    const tokenPrice = Number(price) || 0;
    const supply = tokenPrice > 0 ? Math.round(target / tokenPrice) : 0;
    return { propertyValue, retained, offered, target, supply };
  }, [value, ownerPercent, price]);

  if (!properties.length) return <p className="text-cream-400 text-sm">Add a property before tokenizing a share of it.</p>;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setBusy(true);
        try {
          const res = await tokenizeOwnedProperty(propertyId, {
            propertyValue: preview.propertyValue,
            ownerPercent: preview.retained,
            price: Number(price),
          });
          onSaved(res.property, `${res.property.title} is tokenized. Investors are offered ${preview.offered}%.`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not tokenize that property.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-cream-400 text-sm">Keep the share you want and offer the rest as tokens.</p>
      <label className="block text-sm text-cream-400 max-w-md">Property
        <select
          value={propertyId}
          onChange={(event) => {
            const next = properties.find((property) => property.id === event.target.value);
            setPropertyId(event.target.value);
            setValue(String(next?.offering?.valuation || next?.price || ''));
          }}
          className={fieldClass}
        >
          {properties.map((property) => <option key={property.id} value={property.id}>{property.title}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="text-sm text-cream-400">Property value
          <input type="number" min="1" value={value} onChange={(event) => setValue(event.target.value)} className={fieldClass} />
        </label>
        <label className="text-sm text-cream-400">Owner retains %
          <input type="number" min="0" max="99" value={ownerPercent} onChange={(event) => setOwnerPercent(event.target.value)} className={fieldClass} />
        </label>
        <label className="text-sm text-cream-400">Initial token price
          <input type="number" min="0.01" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className={fieldClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 rounded-2xl border border-void-700 p-4 text-sm">
        <div><div className="text-cream-400">Offered to investors</div><div className="text-cream-100 font-medium">{preview.offered}%</div></div>
        <div><div className="text-cream-400">Target</div><div className="text-cream-100 font-medium">${formatUsd(preview.target)}</div></div>
        <div><div className="text-cream-400">Token supply</div><div className="text-cream-100 font-medium">{preview.supply.toLocaleString()}</div></div>
        <div><div className="text-cream-400">Price</div><div className="text-cream-100 font-medium">${formatUsd(Number(price) || 0)}</div></div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Tokenize'}</Button>
      </div>
    </form>
  );
}
