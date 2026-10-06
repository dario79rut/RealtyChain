import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProperties } from '../hooks/useProperties';
import { Button } from '../components/ui/Button';
import {
  BridgeDesk,
  CordaPosition,
  SolanaSettlement,
  createCordaPosition,
  fetchBridgeDesk,
  fetchPublicSettlements,
  settleCordaPosition,
} from '../utils/api';

function shortHash(value: string | null) {
  if (!value) return '—';
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export default function Institution() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: properties } = useProperties();
  const [desk, setDesk] = useState<BridgeDesk | null>(null);
  const [tape, setTape] = useState<SolanaSettlement[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [shares, setShares] = useState('25');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    const pub = await fetchPublicSettlements();
    setTape(pub.settlements);
    try {
      setDesk(await fetchBridgeDesk());
    } catch {
      setDesk(null);
    }
  };

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Could not load the bridge.'));
  }, []);

  const issue = async () => {
    setError('');
    setBusy('issue');
    try {
      await createCordaPosition(Number(propertyId), Number(shares));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not issue that position.');
    } finally {
      setBusy('');
    }
  };

  const settle = async (position: CordaPosition) => {
    setError('');
    setBusy(position.linearId);
    try {
      await settleCordaPosition(position.linearId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Solana settlement was rejected.');
    } finally {
      setBusy('');
    }
  };

  const available = (properties || []).filter((property) => property.status === 'Available');

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
        <p className="font-display text-accent text-sm uppercase tracking-widest mb-1">Corda and Solana</p>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Institutional settlement</h1>
        <p className="text-cream-400 mt-3 max-w-3xl">
          The institution’s legal name, LEI, and full position stay on its Corda node, shared only with the operator and the notary.
          Solana receives the share amount and a commitment hash, which is how the public chain can settle the position without the private record.
        </p>

        {desk && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-void-600 bg-void-900 p-4">
              <div className="text-[11px] uppercase tracking-wider text-cream-400">This node</div>
              <div className="text-cream-100 mt-1 text-sm">{desk.node}</div>
            </div>
            <div className="rounded-xl border border-void-600 bg-void-900 p-4">
              <div className="text-[11px] uppercase tracking-wider text-cream-400">Sees this state</div>
              <div className="text-cream-100 mt-1 text-sm">{desk.counterparty}</div>
              <div className="text-cream-400 mt-1 text-sm">Notary {desk.notary}</div>
            </div>
            <div className="rounded-xl border border-void-600 bg-void-900 p-4">
              <div className="text-[11px] uppercase tracking-wider text-cream-400">Corda compliance</div>
              <div className="text-cream-100 mt-1 text-sm">{desk.identity.legalName}</div>
              <div className="text-cream-400 mt-1 text-sm">
                {desk.identity.lei ? `LEI ${desk.identity.lei}` : 'Operator node'}
                {desk.identity.verified ? ' · verified' : ' · not verified'}
              </div>
            </div>
          </div>
        )}

        {user?.role === 'institution' && (
          <form
            className="mt-8 rounded-xl border border-void-600 bg-void-900 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void issue();
            }}
          >
            <h2 className="text-cream-100 font-medium">Issue a private position</h2>
            <p className="text-cream-400 text-sm mt-1">This flow writes a Corda state. It does not publish the holder.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
              <label className="block text-sm text-cream-300">
                Property
                <select
                  value={propertyId}
                  onChange={(event) => setPropertyId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-void-600 bg-void-800 px-3 py-2 text-cream-100"
                  required
                >
                  <option value="">Select</option>
                  {available.map((property) => (
                    <option key={property.id} value={property.id}>{property.title}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-cream-300">
                Shares
                <input
                  value={shares}
                  onChange={(event) => setShares(event.target.value)}
                  inputMode="numeric"
                  className="mt-1 w-full rounded-lg border border-void-600 bg-void-800 px-3 py-2 text-cream-100"
                  required
                />
              </label>
              <Button type="submit" disabled={busy === 'issue'}>Issue on Corda</Button>
            </div>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="text-cream-100 font-medium">Corda states</h2>
            <p className="text-cream-400 text-sm mt-1">Visible to the institution and the operator. Hidden from the public tape.</p>
            <div className="mt-4 space-y-3">
              {(desk?.positions || []).length === 0 && (
                <p className="text-cream-400 text-sm">No private positions on this node.</p>
              )}
              {(desk?.positions || []).map((position) => (
                <article key={position.linearId} className="rounded-xl border border-void-600 bg-void-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-cream-100">{position.propertyTitle}</div>
                      <div className="text-cream-400 text-sm mt-1">{position.shares} shares · {position.status}</div>
                    </div>
                    {position.status === 'ISSUED' && user?.role === 'institution' && (
                      <Button size="sm" disabled={busy === position.linearId} onClick={() => void settle(position)}>
                        Settle on Solana
                      </Button>
                    )}
                  </div>
                  <dl className="mt-3 text-sm text-cream-300 space-y-1">
                    <div>Holder {position.private.legalName}</div>
                    <div>LEI {position.private.lei}</div>
                    <div className="break-all">Parties {position.participants.join(' · ')}</div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-cream-100 font-medium">What Solana sees</h2>
            <p className="text-cream-400 text-sm mt-1">Tag 14. Property, share amount, and the commitment. No legal name and no LEI.</p>
            <div className="mt-4 space-y-3">
              {tape.length === 0 && <p className="text-cream-400 text-sm">No public settlements yet.</p>}
              {tape.map((row) => (
                <article key={row.id} className="rounded-xl border border-void-600 bg-void-900 p-4">
                  <div className="text-cream-100">{row.propertyTitle}</div>
                  <div className="text-cream-400 text-sm mt-1">{row.shares} shares · settle</div>
                  <div className="text-cream-300 text-sm mt-2 font-mono">commitment {shortHash(row.commitment)}</div>
                  <div className="text-cream-500 text-xs mt-2 break-all">instruction {row.solana.instructionHex.slice(0, 42)}…</div>
                </article>
              ))}
            </div>
            {user?.role !== 'institution' && user?.role !== 'admin' && (
              <p className="text-cream-400 text-sm mt-4">
                This account is not a Corda participant.
                {' '}
                <button type="button" className="text-accent" onClick={() => navigate('/home')}>Back to the public app</button>
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
