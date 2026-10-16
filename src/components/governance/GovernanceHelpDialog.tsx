import React, { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';

export const GovernanceHelpDialog = forwardRef<HTMLDialogElement>(function GovernanceHelpDialog(_props, ref) {
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="governance-help-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl border border-void-600 bg-void-900 p-0 text-cream-100 shadow-2xl backdrop:bg-black/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent mb-2">Govern help</p>
            <h2 id="governance-help-title" className="font-display text-2xl font-semibold">How Govern tickets work</h2>
          </div>
          <button
            type="button"
            autoFocus
            aria-label="Close governance help"
            onClick={(event) => event.currentTarget.closest('dialog')?.close()}
            className="shrink-0 rounded-lg p-2 text-cream-400 hover:bg-void-700 hover:text-cream-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <XIcon size={20} />
          </button>
        </div>
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
      </div>
    </dialog>,
    document.body,
  );
});
