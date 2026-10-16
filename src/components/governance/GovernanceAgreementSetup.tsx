import React, { useState } from 'react';
import { configureGovernanceAgreement, GovernanceList, GovernanceSetup } from '../../utils/api';
import { Button } from '../ui/Button';

export function GovernanceAgreementSetup({ setup, onSave }: { setup: GovernanceSetup; onSave: (result: GovernanceList) => void }) {
  const [propertyId, setPropertyId] = useState(setup.properties[0]?.id || '');
  const [draft, setDraft] = useState(setup.properties[0]?.agreement || { spvName: '', representativeId: '', reference: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const field = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const result = await configureGovernanceAgreement(propertyId, draft);
      onSave(result);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the agreement record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-2xl border border-void-700 bg-void-800/50 p-5 mb-6">
      <summary className="cursor-pointer font-medium text-cream-100">Admin · SPV and DAO agreement setup</summary>
      <p className="mt-3 text-sm text-cream-400">Record the SPV legal name, agreement reference, and an admin account authorized to represent it. Platform admin access alone does not identify someone as the SPV representative. Authority and agreement terms must be confirmed outside this form. Existing work assignments retain their original agreement and SPV representative.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-sm text-cream-400">Property
          <select required className={field} value={propertyId} onChange={(event) => {
            const id = event.target.value;
            setPropertyId(id);
            setDraft(setup.properties.find((row) => row.id === id)?.agreement || { spvName: '', representativeId: '', reference: '' });
            setSaved(false);
            setError('');
          }}>
            {setup.properties.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block text-sm text-cream-400">SPV legal name
            <input required minLength={2} maxLength={200} className={field} value={draft.spvName} onChange={(event) => { setDraft({ ...draft, spvName: event.target.value }); setSaved(false); }} />
          </label>
          <label className="block text-sm text-cream-400">Authorized SPV representative
            <select required className={field} value={draft.representativeId} onChange={(event) => { setDraft({ ...draft, representativeId: event.target.value }); setSaved(false); }}>
              <option value="">Select authorized representative</option>
              {setup.representatives.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm text-cream-400">DAO agreement reference / document ID and version
          <input required minLength={3} maxLength={300} className={field} value={draft.reference} onChange={(event) => { setDraft({ ...draft, reference: event.target.value }); setSaved(false); }} />
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {saved && <p role="status" className="text-sm text-emerald-300">SPV and agreement record saved.</p>}
        <Button type="submit" disabled={saving || !propertyId}>{saving ? 'Saving…' : 'Save SPV and agreement'}</Button>
      </form>
    </details>
  );
}
