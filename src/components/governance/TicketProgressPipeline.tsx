import React, { useId, useState } from 'react';
import { CheckIcon, CircleDotIcon, PauseIcon, XIcon } from 'lucide-react';
import type { GovernanceProposal } from '../../utils/api';

const STEPS = [
  { title: 'Voting', description: 'Shareholders vote on the proposed decision.', actions: [] },
  { title: 'SPV review', description: 'The accountable SPV reviews the approved decision and coordinates the work.', actions: [] },
  { title: 'Assignment', description: 'The SPV assigns the duty and target date. The assigned party must acknowledge it.', actions: ['assign'] },
  { title: 'Execution', description: 'The assigned party carries out the work and reports progress or blockers.', actions: ['acknowledge', 'accept', 'resume', 'block'] },
  { title: 'Completion', description: 'The responsible party reports the outcome and supporting evidence.', actions: ['complete'] },
];

export function TicketProgressPipeline({ proposal }: { proposal: GovernanceProposal }) {
  const { execution } = proposal;
  const rejected = execution.status === 'not_approved';
  const blocked = execution.status === 'blocked';
  const complete = execution.status === 'completed';
  const current = execution.status === 'awaiting_vote' || rejected ? 0
    : execution.status === 'awaiting_spv_review' ? 1
      : execution.status === 'awaiting_acknowledgment' || (blocked && !execution.acknowledgedBy) ? 2
        : complete ? 4 : 3;
  const detailsId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const inspected = selected ?? current;
  const step = STEPS[inspected];
  const actions = inspected === current && blocked ? ['block'] : step.actions;
  const recorded = [...proposal.updates].reverse().find((entry) => actions.includes(entry.action));

  function stateAt(index: number) {
    if (index < current || complete) return 'Complete';
    if (index > current) return rejected ? 'Not authorized' : 'Upcoming';
    if (rejected) return 'Not approved';
    if (blocked) return 'Blocked';
    if (index === 2) return 'Awaiting acknowledgment';
    return 'Current stage';
  }

  const statusLabel = rejected ? 'Not approved' : blocked ? 'Blocked' : complete ? 'Reported complete' : STEPS[current].title;
  return (
    <div className="mb-4 rounded-2xl border border-void-600 bg-void-900/40 p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-cream-400">{complete ? 'Pipeline complete' : rejected ? 'Vote closed · execution not authorized' : `Stage ${current + 1} of ${STEPS.length}`} · select a stage for details</p>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${rejected ? 'border-red-500/40 text-red-300 bg-red-500/10' : blocked ? 'border-amber-400/40 text-amber-200 bg-amber-400/10' : complete ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : 'border-accent/40 text-accent bg-accent/10'}`}>{statusLabel}</span>
      </div>
      <ol aria-label="Ticket progress pipeline" className="flex flex-col sm:flex-row">
        {STEPS.map((item, index) => {
          const done = index < current || complete;
          const active = index === current && !complete;
          const tone = active && rejected ? 'border-red-400 bg-red-500/15 text-red-300'
            : active && blocked ? 'border-amber-300 bg-amber-400/15 text-amber-200'
              : done ? 'border-emerald-400 bg-emerald-400 text-void-950'
                : active ? 'border-accent bg-accent/15 text-accent' : 'border-void-500 bg-void-800 text-cream-400';
          return (
            <li key={item.title} aria-current={active ? 'step' : undefined} className="relative min-w-0 flex-1">
              {index < STEPS.length - 1 && <span aria-hidden="true" className={`absolute left-[19px] top-10 bottom-0 w-0.5 sm:left-[calc(50%+20px)] sm:top-[19px] sm:bottom-auto sm:h-0.5 sm:w-[calc(100%-40px)] ${index < current || complete ? 'bg-emerald-400/70' : 'bg-void-600'}`} />}
              <button type="button" aria-controls={detailsId} aria-pressed={inspected === index} aria-label={`${item.title}: ${stateAt(index)}. Show stage details.`}
                onClick={() => setSelected(index)}
                className="relative z-10 flex w-full items-start gap-3 rounded-xl pb-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:flex-col sm:items-center sm:gap-2 sm:px-1 sm:pb-2 sm:text-center">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-shadow ${tone} ${inspected === index ? 'ring-4 ring-cream-100/10' : 'hover:ring-4 hover:ring-cream-100/5'}`}>
                  {active && rejected ? <XIcon size={18} /> : active && blocked ? <PauseIcon size={17} /> : done ? <CheckIcon size={19} strokeWidth={3} /> : active ? <CircleDotIcon size={20} /> : <span className="text-sm font-semibold">{index + 1}</span>}
                </span>
                <span className="min-w-0 pt-0.5 sm:pt-0">
                  <span className={`block text-sm font-semibold ${done || active ? 'text-cream-100' : 'text-cream-400'}`}>{item.title}</span>
                  <span className={`mt-1 block text-xs ${active && blocked ? 'text-amber-200' : active && rejected ? 'text-red-300' : 'text-cream-400'}`}>{stateAt(index)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div id={detailsId} role="region" aria-label={`${step.title} stage details`} aria-live="polite" className="mt-2 rounded-xl border border-void-700 bg-void-800/60 p-3 sm:mt-4">
        <p className="text-sm font-medium text-cream-100">{step.title} · {stateAt(inspected)}</p>
        <p className="mt-1 text-sm text-cream-400">{step.description}</p>
        {rejected && inspected > 0 ? <p className="mt-2 text-sm text-red-300">The vote did not pass. No execution is authorized.</p>
          : inspected > current ? <p className="mt-2 text-xs text-cream-400">This stage has not been reached.</p>
            : recorded ? <div className="mt-2 text-sm text-cream-300">
              <p className="whitespace-pre-wrap break-words">{recorded.note}</p>
              <p className="mt-2 text-xs text-cream-400">{recorded.author?.name || 'Former member'} · <time dateTime={recorded.at}>{new Date(recorded.at).toLocaleString()}</time></p>
            </div>
              : inspected === 0 ? <p className="mt-2 text-xs text-cream-300">{proposal.status === 'active' ? 'Voting closes' : 'Voting closed'} <time dateTime={proposal.endsAt}>{new Date(proposal.endsAt).toLocaleString()}</time> · {proposal.forShares.toLocaleString()} for · {proposal.againstShares.toLocaleString()} against · quorum {proposal.quorumShares.toLocaleString()} shares</p>
                : inspected === 1 ? <p className="mt-2 text-xs text-cream-300">Accountable SPV: {proposal.agreement?.spvName || 'Not configured'}. {current > 1 ? 'Work has been assigned; no separate review event is recorded.' : 'Awaiting SPV review and assignment.'}</p>
                  : <p className="mt-2 text-xs text-cream-400">No separate event recorded for this stage.</p>}
        {inspected === current && blocked && <p className="mt-2 text-xs text-amber-200">Progress is paused. The assigned party or SPV representative must report a resolution and resume work.</p>}
      </div>
    </div>
  );
}
