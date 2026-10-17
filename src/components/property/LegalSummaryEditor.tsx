import React from 'react';
import type { PropertyLegalSummary } from '../../utils/types';

export const LEGAL_SUMMARY_FIELDS: { key: keyof Omit<PropertyLegalSummary, 'updatedAt'>; label: string; placeholder: string; long?: boolean }[] = [
  { key: 'issuerName', label: 'Issuer / investment entity', placeholder: 'Full registered entity name' },
  { key: 'registrationNumber', label: 'Entity registration number', placeholder: 'Registry and entity number' },
  { key: 'jurisdiction', label: 'Entity jurisdiction', placeholder: 'Country and state / province of formation' },
  { key: 'titleHolder', label: 'Registered property title holder', placeholder: 'Name recorded on the property title' },
  { key: 'tenure', label: 'Property tenure', placeholder: 'Freehold, leasehold, or other recorded interest' },
  { key: 'titleReference', label: 'Title / parcel reference', placeholder: 'Recorded title or parcel identifier' },
  { key: 'governingLaw', label: 'Governing law / dispute forum', placeholder: 'As stated in the investment agreement' },
  { key: 'investorRights', label: 'Token-holder rights', placeholder: 'Equity, economic interest, voting rights, and exclusions', long: true },
  { key: 'distributionRights', label: 'Distribution terms', placeholder: 'Entitlement, frequency, fees, and conditions in the agreement', long: true },
  { key: 'transferRestrictions', label: 'Transfer / resale restrictions', placeholder: 'Eligibility, lock-up, approvals, or resale conditions', long: true },
  { key: 'encumbrances', label: 'Liens, debt & encumbrances', placeholder: 'Recorded charges and priority; state unknown when unconfirmed', long: true },
  { key: 'sourceReference', label: 'Source document reference & version', placeholder: 'Document title, version / date, and relevant clauses', long: true },
];

export function LegalSummaryEditor({ value, onChange }: {
  value: PropertyLegalSummary; onChange: (value: PropertyLegalSummary) => void;
}) {
  const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 text-cream-100 rounded-xl py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-accent/40';
  return (
    <details className="mt-5 border-t border-void-700 pt-4">
      <summary className="cursor-pointer font-medium text-cream-100">Legal information summary</summary>
      <p className="mt-2 text-xs text-cream-400">Published on the property page. Enter only information supported by the offering or title records, and include its source reference and version. Leave unknown facts blank. Saving a summary does not verify its legal accuracy.</p>
      <div className="mt-4 space-y-3">
        {LEGAL_SUMMARY_FIELDS.map(({ key, label, placeholder, long }) => <label key={key} className="block text-sm text-cream-400">{label}
          {long ? <textarea rows={3} maxLength={1200} className={fieldClass} placeholder={placeholder} value={value[key] || ''} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />
            : <input maxLength={1200} className={fieldClass} placeholder={placeholder} value={value[key] || ''} onChange={(event) => onChange({ ...value, [key]: event.target.value })} />}
        </label>)}
      </div>
    </details>
  );
}
