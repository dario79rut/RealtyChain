import React from 'react';
import { ScaleIcon } from 'lucide-react';
import type { Property } from '../../utils/types';

function LegalFact({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0"><dt className="text-xs text-cream-400">{label}</dt><dd className={`mt-1 text-sm whitespace-pre-wrap break-words ${value ? 'text-cream-100' : 'text-amber-200/80'}`}>{value || 'Not provided'}</dd></div>;
}

export function PropertyLegalSummary({ property }: { property: Property }) {
  const legal = property.legalSummary;
  const agreement = property.governanceAgreement;
  const sharedSamples = (property.documents || []).some((doc) => doc.url?.startsWith('/api/vault/seed/'));
  const hasSummary = Boolean(legal && Object.entries(legal).some(([key, value]) => key !== 'updatedAt' && value?.trim()));
  return (
    <section aria-label="Legal information summary" className="mb-8 rounded-2xl border border-void-600 bg-void-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2"><ScaleIcon size={20} aria-hidden="true" className="text-accent" /><h2 className="font-display text-lg font-semibold text-cream-100">Legal information</h2></div>
        <span className="rounded-full border border-amber-400/30 bg-amber-400/5 px-2.5 py-1 text-xs text-amber-200">{hasSummary ? 'Recorded · unverified' : 'Summary pending'}</span>
      </div>
      <p className="mt-2 text-sm text-cream-400">Key ownership and investment terms for {property.title}. This summary reflects recorded information; the governing documents define the rights and obligations.</p>
      <div className="mt-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-cream-200 mb-3">Entity &amp; property title</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LegalFact label="Issuer / investment entity" value={legal?.issuerName} />
            <LegalFact label="Entity registration number" value={legal?.registrationNumber} />
            <LegalFact label="Entity jurisdiction" value={legal?.jurisdiction} />
            <LegalFact label="Registered property title holder" value={legal?.titleHolder} />
            <LegalFact label="Property tenure" value={legal?.tenure} />
            <LegalFact label="Title / parcel reference" value={legal?.titleReference} />
          </dl>
        </div>
        <div className="border-t border-void-700 pt-4">
          <h3 className="text-sm font-semibold text-cream-200 mb-3">Investor rights &amp; restrictions</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LegalFact label="Ownership structure (as recorded)" value={property.offering?.ownership?.structure} />
            <LegalFact label="Token-holder rights" value={legal?.investorRights} />
            <LegalFact label="Distribution terms" value={legal?.distributionRights} />
            <LegalFact label="Transfer / resale restrictions" value={legal?.transferRestrictions} />
            <LegalFact label="Liens, debt & encumbrances" value={legal?.encumbrances} />
            <LegalFact label="Governing law / dispute forum" value={legal?.governingLaw} />
          </dl>
        </div>
        <div className="border-t border-void-700 pt-4">
          <h3 className="text-sm font-semibold text-cream-200 mb-3">Governance &amp; record references</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LegalFact label="Accountable SPV (DAO record)" value={agreement?.spvName} />
            <LegalFact label="DAO agreement reference (unverified)" value={agreement?.reference} />
            <LegalFact label="Summary source / document version" value={legal?.sourceReference} />
            <LegalFact label="Summary last updated" value={legal?.updatedAt && Number.isFinite(Date.parse(legal.updatedAt)) ? new Date(legal.updatedAt).toLocaleString() : undefined} />
          </dl>
        </div>
      </div>
      <div className="mt-5 rounded-xl bg-void-800/80 p-3 text-xs text-cream-400 space-y-2">
        {!hasSummary && <p className="text-amber-200">A property-specific legal summary has not been provided. Missing information does not mean there are no restrictions, charges, or obligations.</p>}
        {sharedSamples && <p>The document list includes shared demonstration files. These do not establish this property’s ownership, title, or investment terms.</p>}
        <p>Document availability and file-checklist completion are separate from legal due diligence. No independent legal verification is recorded for this summary.</p>
      </div>
    </section>
  );
}
