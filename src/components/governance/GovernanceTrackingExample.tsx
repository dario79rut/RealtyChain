import React from 'react';
import type { GovernanceProposal } from '../../utils/api';
import { ProposalWorkflow } from './ProposalWorkflow';

// A read-only example ticket displayed in the In progress view; never submitted to the API.
const DAY = 86400000;
function trackingExample(): GovernanceProposal {
  const now = Date.now();
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const investor = { id: 'example-investor', name: 'Daniel Morgan' };
  const spv = { id: 'example-spv', name: 'Sofia Bennett' };
  const owner = { id: 'example-owner', name: 'Michael Chen' };
  const reference = 'Example DAO agreement v1 · maintenance clause 4';
  return {
    id: 'EXAMPLE-001', propertyId: 'example', propertyTitle: 'Property',
    title: 'Outdoor seating expansion', kind: 'budget',
    summary: 'Shareholders approved a $42,000 reserve budget. The property owner is carrying out the work, coordinated by the SPV.',
    createdAt: at(-20), endsAt: at(-10), createdBy: investor,
    responder: spv, propertyOwner: owner,
    agreement: { spvName: 'Harborview Property Holdings LLC', reference, representative: spv },
    canRespond: false, canCoordinate: false, canAcknowledge: false, canManageExecution: false,
    execution: {
      status: 'in_progress', assignedTo: owner, acknowledgedBy: owner,
      dueAt: at(7).slice(0, 10), agreementReference: reference, legacy: false,
    },
    updates: [
      { action: 'assign', at: at(-9), author: spv, assignedTo: owner, dueAt: at(7).slice(0, 10), agreementReference: reference,
        note: 'Vote passed: 240 shares for, 36 against; quorum 120. Under maintenance clause 4, the owner will coordinate the contractor and patio installation within the approved $42,000 budget.' },
      { action: 'acknowledge', at: at(-8), author: owner,
        note: 'Duty acknowledged. Contractor booked and materials ordered. Next step: prepare the patio foundation.' },
      { action: 'respond', at: at(-4), author: owner,
        note: 'Foundation preparation completed. Evidence reference: EXAMPLE-SITE-REPORT-01 (illustrative). Furniture delivery confirmed; installation is next. No blockers reported.' },
      { action: 'respond', at: at(-1), author: owner,
        note: 'Furniture delivered and installation underway. Next: finish installation in 3 days, then SPV inspection before opening. Target date unchanged; no blockers reported. Evidence reference: EXAMPLE-DELIVERY-02 (illustrative).' },
    ],
    votingPower: 0, forShares: 240, againstShares: 36, turnout: 276,
    quorumShares: 120, status: 'passed', myVote: null, myShares: 0,
  };
}

export function GovernanceTrackingExample() {
  const [proposal] = React.useState(trackingExample);
  return (
    <article className="rounded-2xl border border-void-700 bg-void-800/50 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-accent">In progress</span>
        <span className="text-xs text-cream-400">Example ticket · EXAMPLE-001</span>
      </div>
      <p className="mt-2 text-xs text-cream-400">Read-only example · all names, dates, and evidence references are fictional. This example is separate from your property tickets.</p>
      <h2 className="mt-4 font-display text-xl text-cream-100">{proposal.title}</h2>
      <p className="mt-2 text-sm text-cream-400">{proposal.summary}</p>
      <ProposalWorkflow proposal={proposal} />
    </article>
  );
}
