import React, { useMemo, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { registerOwnedProperty, uploadOwnedDocument, uploadOwnedPhoto, verifyOwnedDocuments } from '../../utils/api';
import { Property } from '../../utils/types';
import { formatUsd } from '../../utils/ops';
import { OWNER_DOCUMENTS, PROPERTY_TYPES, fieldClass, readFile } from './ownerForm';

const STEPS = [
  { label: 'Property', detail: 'Address, type, price, valuation, units, occupancy, and rent' },
  { label: 'Photos', detail: 'Listing photos and a description investors will read' },
  { label: 'Financials', detail: 'Revenue, expenses, mortgage, tax, insurance, and NOI' },
  { label: 'Documents', detail: 'Deed, appraisal, inspection, insurance, and tax documents' },
  { label: 'Ownership', detail: 'Share you keep and the economic structure' },
  { label: 'Funding', detail: 'A capital campaign, tokenization, or both' },
  { label: 'Submit', detail: 'Review the listing and send it in' },
] as const;

type Draft = {
  name: string;
  address: string;
  propertyType: string;
  purchasePrice: string;
  valuation: string;
  units: string;
  occupancy: string;
  monthlyRent: string;
  description: string;
  annualRevenue: string;
  operatingExpenses: string;
  mortgage: string;
  propertyTax: string;
  insurance: string;
  ownerPercent: string;
  structure: string;
  raise: boolean;
  tokenize: boolean;
  target: string;
  minimum: string;
  deadline: string;
  distributions: string;
  useOfFunds: string;
  projections: string;
  tokenPrice: string;
};

const EMPTY: Draft = {
  name: '',
  address: '',
  propertyType: 'Multifamily',
  purchasePrice: '',
  valuation: '',
  units: '',
  occupancy: '',
  monthlyRent: '',
  description: '',
  annualRevenue: '',
  operatingExpenses: '',
  mortgage: '',
  propertyTax: '',
  insurance: '',
  ownerPercent: '70',
  structure: '',
  raise: true,
  tokenize: false,
  target: '',
  minimum: '',
  deadline: '',
  distributions: '',
  useOfFunds: '',
  projections: '',
  tokenPrice: '10',
};

function num(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function AddProperty({ onCreated }: { onCreated: (property: Property) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const noi = Math.max(0, num(draft.annualRevenue) - num(draft.operatingExpenses) - num(draft.propertyTax) - num(draft.insurance));
  const retained = Math.min(100, Math.max(0, num(draft.ownerPercent)));
  const offered = Math.max(0, 100 - retained);
  const tokenTarget = num(draft.valuation) * offered / 100;
  const tokenSupply = num(draft.tokenPrice) > 0 ? Math.round(tokenTarget / num(draft.tokenPrice)) : 0;

  const preview = useMemo(() => ({ noi, retained, offered, tokenTarget, tokenSupply }), [noi, retained, offered, tokenTarget, tokenSupply]);

  const next = () => {
    setError('');
    const missing = validate(step, draft, files, preview.offered, photos.length);
    if (missing) {
      setError(missing);
      return;
    }
    setStep((current) => Math.min(STEPS.length - 1, current + 1));
  };

  const submit = async () => {
    setError('');
    const missing = validate(5, draft, files, preview.offered, photos.length);
    if (missing) {
      setError(missing);
      return;
    }
    setBusy(true);
    try {
      const created = await registerOwnedProperty({
        name: draft.name,
        address: draft.address,
        propertyType: draft.propertyType,
        purchasePrice: num(draft.purchasePrice),
        valuation: num(draft.valuation),
        units: num(draft.units),
        occupancy: num(draft.occupancy),
        monthlyRent: num(draft.monthlyRent),
        description: draft.description,
        ownerPercent: retained,
        structure: draft.structure,
        financials: {
          annualRevenue: num(draft.annualRevenue),
          operatingExpenses: num(draft.operatingExpenses),
          mortgage: num(draft.mortgage),
          propertyTax: num(draft.propertyTax),
          insurance: num(draft.insurance),
        },
        campaign: draft.raise ? {
          target: num(draft.target),
          minimum: num(draft.minimum),
          deadline: draft.deadline,
          structure: draft.structure,
          expectedDistributions: draft.distributions,
          useOfFunds: draft.useOfFunds,
          projections: draft.projections,
        } : null,
        tokenization: draft.tokenize ? {
          propertyValue: num(draft.valuation),
          ownerPercent: retained,
          price: num(draft.tokenPrice),
        } : null,
      });
      let property = created.property;
      for (const photo of photos) {
        const data = await readFile(photo.file);
        const uploaded = await uploadOwnedPhoto(property.id, { filename: photo.file.name, data });
        property = uploaded.property;
      }
      for (const doc of OWNER_DOCUMENTS) {
        const file = files[doc.kind];
        if (!file) continue;
        const data = await readFile(file);
        const uploaded = await uploadOwnedDocument(property.id, { kind: doc.kind, filename: file.name, data });
        property = uploaded.property;
      }
      const verified = await verifyOwnedDocuments(property.id);
      onCreated(verified.property);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this property.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[17rem_minmax(0,1fr)] gap-8">
      <ol className="space-y-0">
        {STEPS.map((item, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <li key={item.label} className="relative flex gap-3 pb-5 last:pb-0">
              {index < STEPS.length - 1 && (
                <span className={`absolute left-4 top-8 bottom-0 w-px ${done ? 'bg-emerald-400/70' : 'bg-void-600'}`} />
              )}
              <button
                type="button"
                disabled={index > step}
                onClick={() => {
                  if (index < step) {
                    setError('');
                    setStep(index);
                  }
                }}
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold disabled:cursor-default ${
                  current ? 'border-accent bg-accent/15 text-accent-light' : done ? 'border-emerald-400 text-emerald-300' : 'border-void-600 text-cream-400'
                }`}
              >
                {done ? <CheckIcon size={14} /> : index + 1}
              </button>
              <div className="pt-0.5">
                <div className={`text-sm font-medium ${current ? 'text-cream-100' : done ? 'text-emerald-200' : 'text-cream-400'}`}>{item.label}</div>
                <p className="text-cream-400 text-xs mt-0.5 leading-snug">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
      <h2 className="font-display text-xl font-semibold text-cream-100 mb-4">
        Step {step + 1} of {STEPS.length} · {STEPS[step].label}
      </h2>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {step === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Property name"><input required value={draft.name} onChange={(event) => set({ name: event.target.value })} className={fieldClass} /></Field>
          <Field label="Address"><input value={draft.address} onChange={(event) => set({ address: event.target.value })} className={fieldClass} /></Field>
          <Field label="Property type">
            <select value={draft.propertyType} onChange={(event) => set({ propertyType: event.target.value })} className={fieldClass}>
              {PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
          </Field>
          <Field label="Units"><input type="number" min="1" value={draft.units} onChange={(event) => set({ units: event.target.value })} className={fieldClass} /></Field>
          <Field label="Purchase price"><input type="number" min="1" value={draft.purchasePrice} onChange={(event) => set({ purchasePrice: event.target.value })} className={fieldClass} /></Field>
          <Field label="Current valuation"><input type="number" min="1" value={draft.valuation} onChange={(event) => set({ valuation: event.target.value })} className={fieldClass} /></Field>
          <Field label="Occupancy %"><input type="number" min="0" max="100" value={draft.occupancy} onChange={(event) => set({ occupancy: event.target.value })} className={fieldClass} /></Field>
          <Field label="Monthly rent"><input type="number" min="0" value={draft.monthlyRent} onChange={(event) => set({ monthlyRent: event.target.value })} className={fieldClass} /></Field>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(event) => set({ description: event.target.value })}
              rows={5}
              className={fieldClass}
              placeholder="The building, the location, and what an investor is buying into."
            />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-cream-400 text-sm">The first photo is the cover. Add up to 6.</p>
            <label className="inline-flex items-center px-3 py-2 rounded-xl border border-void-600 text-sm text-cream-100 cursor-pointer">
              Upload photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const list = event.target.files;
                  event.target.value = '';
                  if (!list) return;
                  setPhotos((current) => {
                    const next = current.slice();
                    for (const file of Array.from(list)) {
                      if (next.length >= 6) {
                        setError('Upload up to 6 photos.');
                        break;
                      }
                      if (file.size > 1_500_000) {
                        setError('Each photo must be 1.5 MB or smaller.');
                        continue;
                      }
                      next.push({ file, preview: URL.createObjectURL(file) });
                    }
                    return next;
                  });
                }}
              />
            </label>
          </div>
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map((photo, index) => (
                <figure key={photo.preview} className="relative rounded-xl overflow-hidden border border-void-700">
                  <img src={photo.preview} alt="" className="h-28 w-full object-cover" />
                  <figcaption className="absolute top-2 left-2 rounded bg-void-950/80 px-2 py-0.5 text-xs text-cream-100">
                    {index === 0 ? 'Cover' : `Photo ${index + 1}`}
                  </figcaption>
                  <button
                    type="button"
                    className="absolute top-2 right-2 rounded bg-void-950/80 px-2 py-0.5 text-xs text-cream-100"
                    onClick={() => setPhotos((current) => {
                      const copy = current.slice();
                      URL.revokeObjectURL(copy[index].preview);
                      copy.splice(index, 1);
                      return copy;
                    })}
                  >
                    Remove
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Annual revenue"><input type="number" min="0" value={draft.annualRevenue} onChange={(event) => set({ annualRevenue: event.target.value })} className={fieldClass} /></Field>
          <Field label="Operating expenses"><input type="number" min="0" value={draft.operatingExpenses} onChange={(event) => set({ operatingExpenses: event.target.value })} className={fieldClass} /></Field>
          <Field label="Mortgage"><input type="number" min="0" value={draft.mortgage} onChange={(event) => set({ mortgage: event.target.value })} className={fieldClass} /></Field>
          <Field label="Property tax"><input type="number" min="0" value={draft.propertyTax} onChange={(event) => set({ propertyTax: event.target.value })} className={fieldClass} /></Field>
          <Field label="Insurance"><input type="number" min="0" value={draft.insurance} onChange={(event) => set({ insurance: event.target.value })} className={fieldClass} /></Field>
          <div className="rounded-xl border border-void-700 px-4 py-3">
            <div className="text-cream-400 text-sm">Net operating income</div>
            <div className="text-cream-100 text-xl font-semibold mt-1">${formatUsd(preview.noi)}</div>
            <p className="text-cream-400 text-xs mt-1">Revenue minus operating expenses, tax, and insurance. Mortgage is debt service, not NOI.</p>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {OWNER_DOCUMENTS.map((doc) => (
            <label key={doc.kind} className="flex items-center justify-between gap-3 rounded-xl border border-void-700 px-4 py-3 cursor-pointer">
              <span className="flex items-center gap-2 text-cream-100">
                <CheckIcon size={16} className={files[doc.kind] ? 'text-emerald-300' : 'text-void-500'} />
                {doc.label}
              </span>
              <span className="text-sm text-cream-400 truncate">{files[doc.kind]?.name || 'Upload PDF or image'}</span>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  if (file && file.size > 1_500_000) {
                    setError('Each file must be 1.5 MB or smaller.');
                    return;
                  }
                  setError('');
                  setFiles((current) => ({ ...current, [doc.kind]: file }));
                }}
              />
            </label>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Owner retains %"><input type="number" min="0" max="99" value={draft.ownerPercent} onChange={(event) => set({ ownerPercent: event.target.value })} className={fieldClass} /></Field>
          <div className="rounded-xl border border-void-700 px-4 py-3">
            <div className="text-cream-400 text-sm">Offered to investors</div>
            <div className="text-cream-100 text-xl font-semibold mt-1">{preview.offered}%</div>
          </div>
          <Field label="Ownership structure" className="md:col-span-2">
            <textarea value={draft.structure} onChange={(event) => set({ structure: event.target.value })} rows={3} className={fieldClass} placeholder="How ownership and economics are split." />
          </Field>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Toggle on={draft.raise} label="Funding campaign" onClick={() => set({ raise: !draft.raise })} />
            <Toggle on={draft.tokenize} label="Tokenize a portion" onClick={() => set({ tokenize: !draft.tokenize })} />
          </div>
          {draft.raise && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Funding target"><input type="number" min="1000" value={draft.target} onChange={(event) => set({ target: event.target.value })} className={fieldClass} /></Field>
              <Field label="Minimum investment"><input type="number" min="1" value={draft.minimum} onChange={(event) => set({ minimum: event.target.value })} className={fieldClass} /></Field>
              <Field label="Funding deadline"><input type="date" value={draft.deadline} onChange={(event) => set({ deadline: event.target.value })} className={fieldClass} /></Field>
              <Field label="Expected distributions"><input value={draft.distributions} onChange={(event) => set({ distributions: event.target.value })} className={fieldClass} /></Field>
              <Field label="Use of funds" className="md:col-span-2"><textarea value={draft.useOfFunds} onChange={(event) => set({ useOfFunds: event.target.value })} rows={2} className={fieldClass} /></Field>
              <Field label="Financial projections" className="md:col-span-2"><textarea value={draft.projections} onChange={(event) => set({ projections: event.target.value })} rows={2} className={fieldClass} /></Field>
            </div>
          )}
          {draft.tokenize && (
            <div className="rounded-2xl border border-void-700 p-4 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <Stat label="Property value" value={`$${formatUsd(num(draft.valuation))}`} />
              <Stat label="Owner retains" value={`${preview.retained}%`} />
              <Stat label="Offered to investors" value={`${preview.offered}%`} />
              <Stat label="Target" value={`$${formatUsd(preview.tokenTarget)}`} />
              <Field label="Initial token price">
                <input type="number" min="0.01" step="0.01" value={draft.tokenPrice} onChange={(event) => set({ tokenPrice: event.target.value })} className={fieldClass} />
              </Field>
              <Stat label="Token supply" value={preview.tokenSupply.toLocaleString()} />
            </div>
          )}
        </div>
      )}

      {step === 6 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Stat label="Property" value={`${draft.name} · ${draft.propertyType}`} />
          <Stat label="Address" value={draft.address} />
          <Stat label="Valuation" value={`$${formatUsd(num(draft.valuation))}`} />
          <Stat label="NOI" value={`$${formatUsd(preview.noi)}`} />
          <Stat label="Documents" value={`${OWNER_DOCUMENTS.filter((doc) => files[doc.kind]).length} of ${OWNER_DOCUMENTS.length}`} />
          <Stat label="Owner / investors" value={`${preview.retained}% / ${preview.offered}%`} />
          {draft.raise && <Stat label="Campaign" value={`$${formatUsd(num(draft.target))} by ${draft.deadline}`} />}
          {draft.tokenize && <Stat label="Tokens" value={`${preview.tokenSupply.toLocaleString()} at $${formatUsd(num(draft.tokenPrice))}`} />}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <Button type="button" variant="outline" disabled={step === 0 || busy} onClick={() => setStep((current) => current - 1)}>Back</Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={next}>Continue</Button>
        ) : (
          <Button type="button" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit property'}</Button>
        )}
      </div>
      </div>
    </div>
  );
}

function validate(step: number, draft: Draft, files: Record<string, File | null>, offered: number) {
  if (step === 0) {
    if (draft.name.trim().length < 2) return 'Enter a property name.';
    if (draft.address.trim().length < 4) return 'Enter the address.';
    if (num(draft.purchasePrice) < 1 || num(draft.valuation) < 1) return 'Enter the purchase price and current valuation.';
    if (!Number.isInteger(num(draft.units)) || num(draft.units) < 1) return 'Enter the number of units.';
    if (num(draft.occupancy) < 0 || num(draft.occupancy) > 100) return 'Occupancy is a percent from 0 to 100.';
  }
  if (step === 1 && num(draft.annualRevenue) < 0) return 'Enter the annual revenue.';
  if (step === 2 && OWNER_DOCUMENTS.some((doc) => !files[doc.kind])) return 'Upload the deed, appraisal, inspection, insurance, and tax documents.';
  if (step === 3) {
    if (offered <= 0) return 'Offer part of the property to investors.';
    if (draft.structure.trim().length < 8) return 'Describe the ownership structure.';
  }
  if (step === 4) {
    if (!draft.raise && !draft.tokenize) return 'Add a funding campaign or tokenize a portion.';
    if (draft.raise) {
      if (num(draft.target) < 1000) return 'Set a funding target of at least $1,000.';
      if (num(draft.minimum) < 1 || num(draft.minimum) > num(draft.target)) return 'Minimum investment must fit inside the target.';
      if (!draft.deadline) return 'Set a funding deadline.';
      if (draft.distributions.trim().length < 8 || draft.useOfFunds.trim().length < 8 || draft.projections.trim().length < 8) return 'Describe distributions, use of funds, and projections.';
    }
    if (draft.tokenize && (num(draft.tokenPrice) <= 0 || offered <= 0)) return 'Set a token price for the offered share.';
  }
  return '';
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block text-sm text-cream-400 ${className}`}>{label}{children}</label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-cream-400 text-xs">{label}</div>
      <div className="text-cream-100 mt-0.5">{value}</div>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-2 rounded-xl border text-sm ${on ? 'border-accent text-accent bg-accent/10' : 'border-void-600 text-cream-300'}`}>
      {label}
    </button>
  );
}
