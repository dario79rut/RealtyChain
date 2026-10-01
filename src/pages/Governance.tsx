import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  GovernanceBalance,
  GovernanceProposal,
  castVote,
  createProposal,
  fetchGovernance,
} from '../utils/api';
import { Button } from '../components/ui/Button';

const KIND_LABELS: Record<GovernanceProposal['kind'], string> = {
  budget: 'Budget',
  sale: 'Sale',
  manager: 'Manager',
  distribution: 'Distribution',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Open' },
  { id: 'passed', label: 'Passed' },
  { id: 'rejected', label: 'Rejected' },
] as const;

function daysLeft(endsAt: string) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'Closed';
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return days === 1 ? '1 day left' : `${days} days left`;
}

function statusClass(status: GovernanceProposal['status']) {
  if (status === 'passed') return 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10';
  if (status === 'rejected') return 'text-red-300 border-red-500/40 bg-red-500/10';
  return 'text-accent border-accent/40 bg-accent/10';
}

export function ProposalCard({
  proposal,
  onVote,
  busy,
}: {
  proposal: GovernanceProposal;
  onVote?: (choice: 'for' | 'against') => void;
  busy?: boolean;
}) {
  const cast = proposal.forShares + proposal.againstShares;
  const forPct = cast > 0 ? (proposal.forShares / cast) * 100 : 0;
  const quorumMet = proposal.turnout >= proposal.quorumShares;
  return (
    <article className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`text-xs font-medium uppercase tracking-wide rounded-full border px-2.5 py-1 ${statusClass(proposal.status)}`}>
          {proposal.status}
        </span>
        <span className="text-xs text-cream-400 border border-void-600 rounded-full px-2.5 py-1">
          {KIND_LABELS[proposal.kind] || proposal.kind}
        </span>
        <Link to={`/property/${proposal.propertyId}`} className="text-sm text-accent hover:underline">
          {proposal.propertyTitle}
        </Link>
        <span className="text-cream-400 text-sm ml-auto">{daysLeft(proposal.endsAt)}</span>
      </div>
      <h2 className="font-display text-xl font-semibold text-cream-100">{proposal.title}</h2>
      <p className="text-cream-400 mt-2 leading-relaxed">{proposal.summary}</p>
      <div className="mt-4">
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-emerald-300">{proposal.forShares.toLocaleString()} for</span>
          <span className="text-red-300">{proposal.againstShares.toLocaleString()} against</span>
        </div>
        <div className="h-2 rounded-full bg-red-500/30 overflow-hidden">
          <div className="h-full bg-emerald-400" style={{ width: `${forPct}%` }} />
        </div>
        <p className="text-cream-400 text-xs mt-2">
          {quorumMet
            ? `Quorum reached (${proposal.quorumShares.toLocaleString()} shares)`
            : `${Math.max(0, proposal.quorumShares - proposal.turnout).toLocaleString()} shares still needed for quorum`}
          {proposal.myVote ? ` · You voted ${proposal.myVote} with ${proposal.myShares} shares` : ''}
        </p>
      </div>
      {proposal.status === 'active' && onVote && (
        <div className="mt-4 flex flex-col sm:flex-row gap-2">
          {proposal.votingPower > 0 ? (
            <>
              <Button
                type="button"
                variant={proposal.myVote === 'for' ? 'primary' : 'outline'}
                disabled={busy}
                onClick={() => onVote('for')}
              >
                Vote for · {proposal.votingPower} shares
              </Button>
              <Button
                type="button"
                variant={proposal.myVote === 'against' ? 'primary' : 'outline'}
                disabled={busy}
                onClick={() => onVote('against')}
              >
                Vote against
              </Button>
            </>
          ) : (
            <p className="text-cream-400 text-sm">You don’t hold shares in this property.</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function Governance() {
  const [params] = useSearchParams();
  const propertyId = params.get('property') || '';
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);
  const [balances, setBalances] = useState<GovernanceBalance[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votingId, setVotingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    propertyId: '',
    kind: 'budget' as GovernanceProposal['kind'],
    title: '',
    summary: '',
    days: 7,
  });

  useEffect(() => {
    setLoading(true);
    fetchGovernance(propertyId || undefined)
      .then((res) => {
        setProposals(res.proposals);
        setBalances(res.balances);
        setDraft((current) => ({
          ...current,
          propertyId: current.propertyId || propertyId || res.balances[0]?.propertyId || '',
        }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load votes.'))
      .finally(() => setLoading(false));
  }, [propertyId]);

  const visible = proposals.filter((proposal) => filter === 'all' || proposal.status === filter);
  const propertyName = balances.find((row) => row.propertyId === propertyId)?.propertyTitle
    || proposals.find((proposal) => proposal.propertyId === propertyId)?.propertyTitle;

  const handleVote = async (proposal: GovernanceProposal, choice: 'for' | 'against') => {
    setError('');
    setVotingId(proposal.id);
    try {
      const res = await castVote(proposal.id, choice);
      setProposals((rows) => rows.map((row) => (row.id === res.proposal.id ? res.proposal : row)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record that vote.');
    } finally {
      setVotingId('');
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await createProposal(draft);
      setProposals(res.proposals.filter((proposal) => !propertyId || proposal.propertyId === propertyId));
      setBalances(res.balances);
      setShowForm(false);
      setDraft({ propertyId: draft.propertyId, kind: 'budget', title: '', summary: '', days: 7 });
      setFilter('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that vote.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="font-display text-accent text-sm uppercase tracking-widest mb-1">Shareholders</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Property governance</h1>
            <p className="text-cream-400 mt-2 max-w-2xl">
              One share is one vote. Open proposals cover budgets, managers, sales, and distributions.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setShowForm((open) => !open)}>
            {showForm ? 'Close' : 'New proposal'}
          </Button>
        </div>

        {balances.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {balances.map((row) => (
              <Link
                key={row.propertyId}
                to={`/governance?property=${row.propertyId}`}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  propertyId === row.propertyId
                    ? 'border-accent bg-accent/15 text-cream-100'
                    : 'border-void-600 text-cream-300 hover:border-cream-400'
                }`}
              >
                {row.shares > 0 ? `${row.shares} shares · ${row.propertyTitle}` : row.propertyTitle}
              </Link>
            ))}
            {propertyId && (
              <Link to="/governance" className="rounded-full border border-void-600 px-3 py-1.5 text-sm text-accent">
                All properties
              </Link>
            )}
          </div>
        )}

        {propertyName && (
          <p className="text-cream-300 mb-4">Votes for {propertyName}</p>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="rounded-2xl border border-void-700 bg-void-800/50 p-5 mb-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block text-sm text-cream-400">
                Property
                <select
                  value={draft.propertyId}
                  onChange={(event) => setDraft({ ...draft, propertyId: event.target.value })}
                  className="mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100"
                >
                  {balances.map((row) => (
                    <option key={row.propertyId} value={row.propertyId}>{row.propertyTitle}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-cream-400">
                Type
                <select
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value as GovernanceProposal['kind'] })}
                  className="mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100"
                >
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-cream-400">
                Window
                <select
                  value={draft.days}
                  onChange={(event) => setDraft({ ...draft, days: Number(event.target.value) })}
                  className="mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100"
                >
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
            </div>
            <label className="block text-sm text-cream-400">
              Title
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100"
                placeholder="What should shareholders decide?"
              />
            </label>
            <label className="block text-sm text-cream-400">
              Summary
              <textarea
                value={draft.summary}
                onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                rows={3}
                className="mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100"
                placeholder="The cost, the timing, and what changes if it passes."
              />
            </label>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving || balances.length === 0}>
                {saving ? 'Opening…' : 'Open vote'}
              </Button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-2 mb-5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                filter === item.id
                  ? 'border-accent bg-accent text-void-950 font-semibold'
                  : 'border-void-600 text-cream-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {loading ? (
          <p className="text-cream-400">Loading votes…</p>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-void-700 bg-void-800/40 p-10 text-center text-cream-400">
            No proposals in this view.
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                busy={votingId === proposal.id}
                onVote={(choice) => handleVote(proposal, choice)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
