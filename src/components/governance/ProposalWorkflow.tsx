import React, { useState } from 'react';
import { GovernanceProposal, GovernanceResponse, respondToProposal } from '../../utils/api';
import { Button } from '../ui/Button';

const STAGES: Record<GovernanceProposal['execution']['status'], string> = {
  awaiting_vote: 'Awaiting vote outcome',
  not_approved: 'Not approved · no work authorized',
  awaiting_spv_review: 'Passed · SPV review required',
  awaiting_acknowledgment: 'Assigned · acknowledgment pending',
  in_progress: 'In progress',
  blocked: 'Blocked · needs follow-up',
  completed: 'Reported complete',
};

const ACTIONS: Record<GovernanceResponse['action'], string> = {
  respond: 'Post response', assign: 'Assign duty under DAO agreement', acknowledge: 'Acknowledge assigned duty', block: 'Report blocker',
  resume: 'Resume work', complete: 'Report completion',
};

export function GovernanceFlow() {
  return (
    <section aria-label="How governance works" className="rounded-2xl border border-void-700 bg-void-800/50 p-5 mb-6">
      <h2 className="font-display text-lg font-semibold text-cream-100">Who handles a Govern ticket?</h2>
      <ol className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-cream-400">
        <li><strong className="block text-cream-100">1. Shareholder submits</strong>An investor with shares in this property opens a proposal describing the decision, cost, and timing.</li>
        <li><strong className="block text-cream-100">2. SPV responds</strong>The SPV is accountable for coordinating the response under the DAO agreement. Its recorded representative responds; the property owner provides property details.</li>
        <li><strong className="block text-cream-100">3. Shareholders vote</strong>One share is one vote. At the deadline, quorum and more votes for than against are required to pass. A tie or missed quorum rejects the proposal.</li>
        <li><strong className="block text-cream-100">4. SPV assigns, responsible party acknowledges</strong>After approval, the SPV assigns work to its representative or the property owner under the agreement, with a target date. The assigned party acknowledges the duty, reports blockers, and records completion.</li>
      </ol>
      <p className="mt-4 text-sm text-cream-400 border-t border-void-700 pt-4">
        The DAO agreement between investors, the SPV, and the property owner defines their duties and the effect of approved votes.
        The SPV remains accountable for coordination while the assigned party performs its work. Acknowledgment records an existing assigned duty; a missing acknowledgment does not waive that duty.
        Agreement references are recorded, not legally verified. Follow the agreement for deadlines, permitted refusal reasons, escalation, and remedies; these terms are not automatically enforced here. Contact the SPV for stalled tickets; contact an admin if its representative is missing.
      </p>
    </section>
  );
}

export function ProposalWorkflow({ proposal, onUpdate }: {
  proposal: GovernanceProposal;
  onUpdate?: (proposal: GovernanceProposal) => void;
}) {
  const [action, setAction] = useState<GovernanceResponse['action']>('respond');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignee, setAssignee] = useState<'owner' | 'spv'>('owner');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { execution } = proposal;
  const overdue = execution.dueAt && ['awaiting_acknowledgment', 'in_progress', 'blocked'].includes(execution.status)
    && Date.parse(`${execution.dueAt}T23:59:59.999Z`) < Date.now();
  const options: GovernanceResponse['action'][] = ['respond'];
  if (proposal.canCoordinate && execution.status === 'awaiting_spv_review') options.push('assign');
  if (proposal.canAcknowledge) options.push('acknowledge');
  if (proposal.canManageExecution && execution.status === 'awaiting_acknowledgment') options.push('block');
  if (proposal.canManageExecution && execution.status === 'in_progress') options.push('block', 'complete');
  if (proposal.canManageExecution && execution.status === 'blocked') options.push('resume');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await respondToProposal(proposal.id, { action, note, dueAt, assignee });
      onUpdate?.(res.proposal);
      setNote('');
      setAction('respond');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save response.');
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2.5 text-cream-100';
  return (
    <div className="mt-5 border-t border-void-700 pt-4">
      <dl className="grid sm:grid-cols-2 gap-3 text-sm">
        <div><dt className="text-cream-400">Created by</dt><dd className="text-cream-100">{proposal.createdBy?.name || 'Demo / legacy record · creator not recorded'}</dd></div>
        <div><dt className="text-cream-400">Accountable SPV</dt><dd className="text-cream-100">{proposal.agreement?.spvName || 'Not configured · admin setup required'}</dd></div>
        <div><dt className="text-cream-400">SPV response contact</dt><dd className="text-cream-100">{proposal.responder?.name || 'No authorized SPV representative recorded'}</dd></div>
        <div><dt className="text-cream-400">Property owner</dt><dd className="text-cream-100">{proposal.propertyOwner?.name || 'Not assigned'}</dd></div>
        <div><dt className="text-cream-400">Work status</dt><dd className="text-accent">{STAGES[execution.status]}</dd></div>
        <div><dt className="text-cream-400">Assigned to perform work</dt><dd className="text-cream-100">{execution.assignedTo?.name || 'SPV must review and assign after approval'}</dd></div>
        <div><dt className="text-cream-400">Duty acknowledged by</dt><dd className="text-cream-100">{execution.acknowledgedBy?.name || 'Pending · duties remain governed by the agreement'}</dd></div>
        {execution.dueAt && <div><dt className="text-cream-400">Target date (UTC)</dt><dd className={overdue ? 'text-red-300' : 'text-cream-100'}>{execution.dueAt}{overdue ? ' · Overdue' : ''}</dd></div>}
        <div><dt className="text-cream-400">DAO agreement reference (unverified)</dt><dd className="text-cream-100 break-words">{execution.agreementReference || 'Not recorded · admin must link the DAO agreement'}</dd></div>
      </dl>
      {execution.legacy && <p className="mt-3 text-sm text-cream-400">Legacy work record: previous acceptance is preserved as acknowledgment. The SPV should review the assignment against the DAO agreement.</p>}
      <details className="mt-4" open={proposal.canRespond || undefined}>
        <summary className="cursor-pointer text-sm text-cream-100">Responses & work history ({proposal.updates.length})</summary>
        {proposal.updates.length === 0 ? <p className="text-sm text-cream-400 mt-3">No response recorded yet.</p> : (
          <ol className="space-y-3 mt-3">
            {proposal.updates.map((update, index) => (
              <li key={`${update.at}-${index}`} className="rounded-xl bg-void-900/50 p-3 text-sm">
                <p className="text-cream-100">{update.author?.name || 'Former member'} · {update.action === 'accept' ? 'Legacy acceptance' : ACTIONS[update.action as GovernanceResponse['action']] || update.action}</p>
                <time className="text-xs text-cream-400" dateTime={update.at}>{new Date(update.at).toLocaleString()}</time>
                <p className="text-cream-300 mt-1 whitespace-pre-wrap break-words">{update.note}</p>
                {update.assignedTo && <p className="text-cream-400 mt-1">Assigned to {update.assignedTo.name} · target {update.dueAt} (UTC) · {update.agreementReference}</p>}
              </li>
            ))}
          </ol>
        )}
        {proposal.canRespond && onUpdate && (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block text-sm text-cream-400">Action
              <select className={fieldClass} value={action} onChange={(event) => setAction(event.target.value as GovernanceResponse['action'])}>
                {options.map((value) => <option key={value} value={value}>{ACTIONS[value]}</option>)}
              </select>
            </label>
            {action === 'assign' && (
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-sm text-cream-400">Target completion date (UTC)
                  <input required type="date" className={fieldClass} value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </label>
                <label className="block text-sm text-cream-400">Party assigned under the agreement
                  <select className={fieldClass} value={assignee} onChange={(event) => setAssignee(event.target.value as 'owner' | 'spv')}>
                    <option value="owner" disabled={!proposal.propertyOwner}>Property owner{proposal.propertyOwner ? ` · ${proposal.propertyOwner.name}` : ' · not assigned'}</option>
                    <option value="spv">SPV representative · {proposal.responder?.name}</option>
                  </select>
                </label>
              </div>
            )}
            {action === 'assign' && <p className="text-sm text-cream-400">Assign only work within the recorded DAO agreement. State the relevant clause, scope, and timing in the note. The SPV retains coordination responsibility.</p>}
            {action === 'acknowledge' && <p className="text-sm text-cream-400">This records acknowledgment of your assigned duty under the DAO agreement. It does not create or waive the underlying obligation.</p>}
            <label className="block text-sm text-cream-400">{action === 'complete' ? 'Completion details and evidence reference' : 'Response / work update'}
              <textarea required minLength={10} maxLength={2000} rows={3} className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={action === 'complete' ? 'Describe the outcome and reference supporting documents.' : 'Describe the next steps, answer the proposal, or explain the blocker.'} />
            </label>
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : ACTIONS[action]}</Button>
          </form>
        )}
      </details>
    </div>
  );
}
