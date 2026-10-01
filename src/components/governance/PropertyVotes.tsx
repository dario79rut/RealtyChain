import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchGovernance, GovernanceProposal } from '../../utils/api';

export function PropertyVotes({ propertyId }: { propertyId: string }) {
  const [proposals, setProposals] = useState<GovernanceProposal[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchGovernance(propertyId)
      .then((res) => {
        if (!cancelled) setProposals(res.proposals.filter((proposal) => proposal.status === 'active').slice(0, 2));
      })
      .catch(() => {
        if (!cancelled) setProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return (
    <div className="mb-8 rounded-2xl border border-void-700 bg-void-800/40 p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-display text-lg font-semibold text-cream-100">Shareholder votes</h2>
        <Link to={`/governance?property=${propertyId}`} className="text-accent text-sm hover:underline">
          Open governance
        </Link>
      </div>
      {proposals.length === 0 ? (
        <p className="text-cream-400 text-sm">No open vote on this property.</p>
      ) : (
        <ul className="space-y-3">
          {proposals.map((proposal) => (
            <li key={proposal.id}>
              <Link to={`/governance?property=${propertyId}`} className="block group">
                <p className="text-cream-100 font-medium group-hover:text-accent">{proposal.title}</p>
                <p className="text-cream-400 text-sm mt-1">
                  {proposal.forShares.toLocaleString()} for · {proposal.againstShares.toLocaleString()} against
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
