import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BuildingIcon, FileTextIcon, LogOutIcon, ScaleIcon, SettingsIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ConnectWalletButton } from '../ui/ConnectWalletButton';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../context/WalletContext';
import { useProperties } from '../../hooks/useProperties';
import {
  GovernanceProposal,
  createProposal,
  fetchGovernance,
  mediaUrl,
  registerOwnedProperty,
  updateOwnedProgress,
  updateOwnedSaleStatus,
  uploadAvatar,
  uploadOwnedDocument,
  verifyOwnedDocuments,
} from '../../utils/api';
import { Property } from '../../utils/types';
import { formatUsd } from '../../utils/ops';

const DOCUMENTS = [
  { kind: 'deed', label: 'Title deed' },
  { kind: 'appraisal', label: 'Appraisal' },
  { kind: 'insurance', label: 'Insurance' },
];

const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100';

function readFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || '');
      const comma = raw.indexOf(',');
      resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function OwnerDesk() {
  const { user, logout, refreshUser } = useAuth();
  const { disconnectWallet } = useWallet();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const requested = params.get('tab');
  const [tab, setTab] = useState(requested === 'proposals' || requested === 'settings' ? requested : 'properties');
  const { data: properties = [] } = useProperties();
  const owned = properties.filter((property) => user?.id != null && Number(property.ownerId) === Number(user.id));
  const [selectedId, setSelectedId] = useState('');
  const selected = owned.find((property) => property.id === selectedId) || owned[0] || null;

  const [registerOpen, setRegisterOpen] = useState(false);
  const [draft, setDraft] = useState({ title: '', location: '', price: '', shares: '', yield: '', description: '' });
  const [saleStatus, setSaleStatus] = useState<Property['status']>('Coming Soon');
  const [progress, setProgress] = useState('0');
  const [progressNote, setProgressNote] = useState('');
  const [proposal, setProposal] = useState({ propertyId: '', kind: 'budget' as GovernanceProposal['kind'], title: '', summary: '', days: 7 });
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (requested === 'properties' || requested === 'proposals' || requested === 'settings') setTab(requested);
  }, [requested]);

  useEffect(() => {
    if (!selected) return;
    setSaleStatus(selected.status);
    setProgress(String(selected.projectProgress || 0));
  }, [selected?.id, selected?.status, selected?.projectProgress]);

  useEffect(() => {
    if (!user) return;
    fetchGovernance()
      .then((res) => setProposals(res.proposals))
      .catch(() => setProposals([]));
  }, [user]);

  useEffect(() => {
    if (!proposal.propertyId && owned[0]) setProposal((current) => ({ ...current, propertyId: owned[0].id }));
  }, [owned, proposal.propertyId]);

  const applyProperty = (property: Property) => {
    queryClient.setQueryData<Property[]>(['properties'], (rows) => {
      const list = rows || [];
      const index = list.findIndex((row) => row.id === property.id);
      if (index === -1) return [...list, property];
      const next = list.slice();
      next[index] = property;
      return next;
    });
    setSelectedId(property.id);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setError('');
    setNotice('');
    setBusy(key);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  const ownedProposals = proposals.filter((row) => owned.some((property) => property.id === row.propertyId));

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100 mb-2">Owner desk</h1>
            <div className="flex flex-wrap items-center gap-3">
              {user?.email && (
                <span className="px-3 py-1.5 rounded-lg bg-void-700 border border-void-600 text-cream-300 text-sm">{user.email}</span>
              )}
              <Badge color="accent">Property owner</Badge>
              {user?.kycStatus !== 'approved' && (
                <button type="button" onClick={() => navigate('/kyc')} className="text-sm text-accent hover:underline">
                  Identity verification is still open
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 [&_button]:!rounded-lg">
            <ConnectWalletButton />
            <Button
              variant="outline"
              icon={<LogOutIcon size={18} />}
              onClick={() => {
                disconnectWallet();
                logout();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-void-700 bg-void-800/40 overflow-hidden">
          <nav className="flex border-b border-void-700">
            {[
              { id: 'properties', label: 'My properties', icon: <BuildingIcon size={18} /> },
              { id: 'proposals', label: 'DAO proposals', icon: <ScaleIcon size={18} /> },
              { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-6 py-4 flex items-center gap-2 text-sm font-medium ${
                  tab === item.id ? 'text-accent border-b-2 border-accent bg-accent-muted/30' : 'text-cream-400 hover:text-cream-100'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-6">
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            {notice && <p className="text-emerald-300 text-sm mb-4">{notice}</p>}

            {tab === 'properties' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-cream-400 text-sm">{owned.length} listings on this account</p>
                  <Button type="button" variant="outline" onClick={() => setRegisterOpen((open) => !open)}>
                    {registerOpen ? 'Close form' : 'Register a property'}
                  </Button>
                </div>

                {registerOpen && (
                  <form
                    className="rounded-2xl border border-void-700 bg-void-900/40 p-5 grid grid-cols-1 md:grid-cols-2 gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run('register', async () => {
                        const res = await registerOwnedProperty({
                          title: draft.title,
                          location: draft.location,
                          description: draft.description,
                          price: Number(draft.price),
                          totalTokens: Number(draft.shares),
                          returnRate: draft.yield ? Number(draft.yield) : 0,
                        });
                        applyProperty(res.property);
                        setDraft({ title: '', location: '', price: '', shares: '', yield: '', description: '' });
                        setRegisterOpen(false);
                        setNotice(`${res.property.title} is registered as Coming Soon. Upload the deed, appraisal, and insurance next.`);
                      });
                    }}
                  >
                    <label className="text-sm text-cream-400">Title
                      <input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className={fieldClass} />
                    </label>
                    <label className="text-sm text-cream-400">Location
                      <input required value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} className={fieldClass} />
                    </label>
                    <label className="text-sm text-cream-400">Asking price (USD)
                      <input required type="number" min="1" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} className={fieldClass} />
                    </label>
                    <label className="text-sm text-cream-400">Shares
                      <input required type="number" min="1" value={draft.shares} onChange={(event) => setDraft({ ...draft, shares: event.target.value })} className={fieldClass} />
                    </label>
                    <label className="text-sm text-cream-400">Stated yield %
                      <input type="number" min="0" step="0.1" value={draft.yield} onChange={(event) => setDraft({ ...draft, yield: event.target.value })} className={fieldClass} />
                    </label>
                    <label className="text-sm text-cream-400 md:col-span-2">Description
                      <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} className={fieldClass} />
                    </label>
                    <div className="md:col-span-2 flex justify-end">
                      <Button type="submit" disabled={busy === 'register'}>{busy === 'register' ? 'Registering…' : 'Register property'}</Button>
                    </div>
                  </form>
                )}

                {owned.length > 0 && (
                  <label className="block text-sm text-cream-400 max-w-md">Property
                    <select
                      value={selected?.id || ''}
                      onChange={(event) => setSelectedId(event.target.value)}
                      className={fieldClass}
                    >
                      {owned.map((property) => (
                        <option key={property.id} value={property.id}>{property.title}</option>
                      ))}
                    </select>
                  </label>
                )}

                {selected && (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <section className="rounded-2xl border border-void-700 p-5">
                      <h2 className="font-display text-lg font-semibold text-cream-100">Sale status</h2>
                      <p className="text-cream-400 text-sm mt-1 mb-4">{selected.location}</p>
                      <div className="text-cream-100 font-medium">${formatUsd(selected.price)}</div>
                      <p className="text-cream-400 text-sm mt-1 mb-3">{selected.tokensSold}/{selected.totalTokens} shares sold</p>
                      <div className="h-2 bg-void-700 rounded-full overflow-hidden mb-4">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${Math.min(100, (selected.tokensSold / Math.max(1, selected.totalTokens)) * 100)}%` }}
                        />
                      </div>
                      <label className="text-sm text-cream-400">Status
                        <select value={saleStatus} onChange={(event) => setSaleStatus(event.target.value as Property['status'])} className={fieldClass}>
                          <option value="Coming Soon">Coming Soon</option>
                          <option value="Available">Available</option>
                          <option value="Sold Out">Sold Out</option>
                        </select>
                      </label>
                      <Button
                        className="mt-4"
                        disabled={busy === 'sale'}
                        onClick={() => run('sale', async () => {
                          const res = await updateOwnedSaleStatus(selected.id, saleStatus);
                          applyProperty(res.property);
                          setNotice(`${res.property.title} is ${res.property.status}.`);
                        })}
                      >
                        {busy === 'sale' ? 'Saving…' : 'Update sale status'}
                      </Button>
                    </section>

                    <section className="rounded-2xl border border-void-700 p-5">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 className="font-display text-lg font-semibold text-cream-100">Documents</h2>
                        <Badge color={selected.documentStatus === 'verified' ? 'green' : 'yellow'}>
                          {selected.documentStatus === 'verified' ? 'Verified' : 'Unverified'}
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {DOCUMENTS.map((doc) => {
                          const filed = (selected.documents || []).find((row) => row.kind === doc.kind);
                          return (
                            <div key={doc.kind} className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-cream-100 text-sm flex items-center gap-2">
                                  <FileTextIcon size={14} className="text-accent" />
                                  {doc.label}
                                </div>
                                <div className="text-cream-400 text-xs mt-0.5">{filed ? filed.review || 'uploaded' : 'Missing'}</div>
                              </div>
                              <label className="text-sm text-accent cursor-pointer">
                                {busy === doc.kind ? 'Uploading…' : filed ? 'Replace' : 'Upload'}
                                <input
                                  type="file"
                                  accept="application/pdf,image/jpeg,image/png"
                                  className="sr-only"
                                  disabled={Boolean(busy)}
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (!file || !selected) return;
                                    run(doc.kind, async () => {
                                      if (file.size > 1_500_000) throw new Error('File must be 1.5 MB or smaller.');
                                      const data = await readFile(file);
                                      const res = await uploadOwnedDocument(selected.id, { kind: doc.kind, filename: file.name, data });
                                      applyProperty(res.property);
                                      setNotice(`${doc.label} saved.`);
                                    });
                                  }}
                                />
                              </label>
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        className="mt-4"
                        variant="outline"
                        disabled={busy === 'verify' || selected.documentStatus === 'verified'}
                        onClick={() => run('verify', async () => {
                          const res = await verifyOwnedDocuments(selected.id);
                          applyProperty(res.property);
                          setNotice('Documents verified. The sale can be set to Available.');
                        })}
                      >
                        {selected.documentStatus === 'verified' ? 'Documents verified' : busy === 'verify' ? 'Checking…' : 'Submit verification'}
                      </Button>
                    </section>

                    <section className="rounded-2xl border border-void-700 p-5">
                      <h2 className="font-display text-lg font-semibold text-cream-100">Project progress</h2>
                      <p className="text-cream-400 text-sm mt-1 mb-3">{selected.projectProgress || 0}% complete</p>
                      <div className="h-2 bg-void-700 rounded-full overflow-hidden mb-4">
                        <div className="h-full bg-accent" style={{ width: `${Math.min(100, selected.projectProgress || 0)}%` }} />
                      </div>
                      <label className="text-sm text-cream-400">Percent
                        <input type="number" min="0" max="100" value={progress} onChange={(event) => setProgress(event.target.value)} className={fieldClass} />
                      </label>
                      <label className="block text-sm text-cream-400 mt-3">Update
                        <textarea value={progressNote} onChange={(event) => setProgressNote(event.target.value)} rows={3} className={fieldClass} placeholder="What changed on the project?" />
                      </label>
                      <Button
                        className="mt-4"
                        disabled={busy === 'progress'}
                        onClick={() => run('progress', async () => {
                          const res = await updateOwnedProgress(selected.id, { percent: Number(progress), note: progressNote });
                          applyProperty(res.property);
                          setProgressNote('');
                          setNotice('Progress update posted.');
                        })}
                      >
                        {busy === 'progress' ? 'Posting…' : 'Post update'}
                      </Button>
                      <div className="mt-4 space-y-2">
                        {(selected.progressLog || []).slice(0, 3).map((entry) => (
                          <div key={entry.at} className="text-sm">
                            <div className="text-cream-400 text-xs">{entry.percent}% · {entry.at.slice(0, 10)}</div>
                            <p className="text-cream-200">{entry.note}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}

            {tab === 'proposals' && (
              <div className="space-y-6">
                <form
                  className="rounded-2xl border border-void-700 bg-void-900/40 p-5 space-y-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run('proposal', async () => {
                      const res = await createProposal(proposal);
                      setProposals(res.proposals);
                      setProposal({ propertyId: proposal.propertyId, kind: 'budget', title: '', summary: '', days: 7 });
                      setNotice('Proposal is open for shareholder votes.');
                    });
                  }}
                >
                  <h2 className="font-display text-lg font-semibold text-cream-100">Open a DAO proposal</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="text-sm text-cream-400">Property
                      <select value={proposal.propertyId} onChange={(event) => setProposal({ ...proposal, propertyId: event.target.value })} className={fieldClass}>
                        {owned.map((property) => (
                          <option key={property.id} value={property.id}>{property.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-cream-400">Type
                      <select value={proposal.kind} onChange={(event) => setProposal({ ...proposal, kind: event.target.value as GovernanceProposal['kind'] })} className={fieldClass}>
                        <option value="budget">Budget</option>
                        <option value="sale">Sale</option>
                        <option value="manager">Manager</option>
                        <option value="distribution">Distribution</option>
                      </select>
                    </label>
                    <label className="text-sm text-cream-400">Window
                      <select value={proposal.days} onChange={(event) => setProposal({ ...proposal, days: Number(event.target.value) })} className={fieldClass}>
                        <option value={3}>3 days</option>
                        <option value={7}>7 days</option>
                        <option value={14}>14 days</option>
                        <option value={30}>30 days</option>
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm text-cream-400">Title
                    <input value={proposal.title} onChange={(event) => setProposal({ ...proposal, title: event.target.value })} className={fieldClass} />
                  </label>
                  <label className="block text-sm text-cream-400">Summary
                    <textarea value={proposal.summary} onChange={(event) => setProposal({ ...proposal, summary: event.target.value })} rows={3} className={fieldClass} />
                  </label>
                  <div className="flex justify-end">
                    <Button type="submit" disabled={busy === 'proposal' || owned.length === 0}>
                      {busy === 'proposal' ? 'Opening…' : 'Open vote'}
                    </Button>
                  </div>
                </form>
                <div className="space-y-3">
                  {ownedProposals.length === 0 && <p className="text-cream-400 text-sm">No proposals on your listings yet.</p>}
                  {ownedProposals.map((row) => (
                    <article key={row.id} className="rounded-2xl border border-void-700 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge color={row.status === 'passed' ? 'green' : row.status === 'rejected' ? 'red' : 'accent'}>{row.status}</Badge>
                        <span className="text-cream-400">{row.propertyTitle}</span>
                      </div>
                      <h3 className="text-cream-100 font-medium mt-2">{row.title}</h3>
                      <p className="text-cream-400 text-sm mt-1">{row.summary}</p>
                      <p className="text-cream-300 text-sm mt-2">{row.forShares} for · {row.againstShares} against</p>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="max-w-lg space-y-6">
                <div>
                  <h2 className="text-cream-100 font-medium mb-2">Profile photo</h2>
                  <div className="flex items-center gap-4">
                    {user?.avatarUrl ? (
                      <img src={mediaUrl(user.avatarUrl)} alt="" className="h-16 w-16 rounded-full object-cover border border-void-600" />
                    ) : (
                      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-void-950 text-lg font-semibold">
                        {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <label className="inline-flex items-center px-3 py-1.5 rounded-lg border border-void-500 text-sm text-cream-200 cursor-pointer">
                      {photoBusy ? 'Uploading…' : 'Upload image'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="sr-only"
                        disabled={photoBusy}
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          if (!file) return;
                          if (file.size > 1_500_000) {
                            setPhotoError('Image must be 1.5 MB or smaller.');
                            return;
                          }
                          setPhotoError('');
                          setPhotoBusy(true);
                          try {
                            const data = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve(String(reader.result || ''));
                              reader.onerror = () => reject(new Error('Could not read that image.'));
                              reader.readAsDataURL(file);
                            });
                            await uploadAvatar({ data, filename: file.name });
                            await refreshUser();
                          } catch (err) {
                            setPhotoError(err instanceof Error ? err.message : 'Could not save that image.');
                          } finally {
                            setPhotoBusy(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                  {photoError && <p className="text-red-400 text-sm mt-2">{photoError}</p>}
                </div>
                <div>
                  <h2 className="text-cream-100 font-medium mb-2">Identity verification</h2>
                  <p className="text-cream-400 text-sm mb-3">Status: {user?.kycStatus || 'unverified'}</p>
                  <Button variant="outline" onClick={() => navigate('/kyc')}>Open verification</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
