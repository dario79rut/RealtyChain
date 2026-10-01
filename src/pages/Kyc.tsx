import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShieldCheckIcon } from 'lucide-react';
import snsWebSdk from '@sumsub/websdk';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { fetchKyc, startSumsub, submitKyc, syncSumsub } from '../utils/api';

const SumsubFrame = React.memo(function SumsubFrame() {
  return (
    <div
      id="sumsub-websdk-container"
      className="min-h-[640px] overflow-hidden rounded-2xl border border-void-700 bg-void-900"
    />
  );
});

export default function Kyc() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [legalName, setLegalName] = useState(user?.name || '');
  const [country, setCountry] = useState(user?.kyc?.country || 'US');
  const [accredited, setAccredited] = useState(false);
  const [attested, setAttested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sumsubConfigured, setSumsubConfigured] = useState<boolean | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const attestedRef = useRef(attested);
  const accreditedRef = useRef(accredited);
  attestedRef.current = attested;
  accreditedRef.current = accredited;

  const status = user?.kycStatus || 'unverified';

  useEffect(() => {
    if (status === 'approved') setAccessToken('');
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    fetchKyc()
      .then((res) => {
        if (!cancelled) setSumsubConfigured(Boolean(res.sumsubConfigured));
      })
      .catch(() => {
        if (!cancelled) setSumsubConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sumsubConfigured || status !== 'pending') return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await syncSumsub();
        if (!stopped && res.user.kycStatus !== 'pending') await refreshUser();
      } catch {
        // The applicant may not exist until the WebSDK submits.
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [sumsubConfigured, status, refreshUser]);

  useEffect(() => {
    if (!accessToken) return undefined;
    const container = document.getElementById('sumsub-websdk-container');
    if (!container) return undefined;
    const sdk = snsWebSdk
      .init(accessToken, async () => {
        const res = await startSumsub({
          accredited: accreditedRef.current,
          attested: attestedRef.current,
        });
        if (!res.token) throw new Error('Sumsub did not return an access token.');
        return res.token;
      })
      .withConf({ lang: 'en', theme: 'dark' })
      .withOptions({ addViewportTag: false, adaptIframeHeight: true })
      .on('idCheck.onApplicantSubmitted', () => {
        syncSumsub().then(() => refreshUser()).catch(() => {});
      })
      .on('idCheck.onApplicantStatusChanged', () => {
        syncSumsub().then(() => refreshUser()).catch(() => {});
      })
      .on('idCheck.onApplicantReviewComplete', () => {
        syncSumsub().then(() => refreshUser()).catch(() => {});
      })
      .on('idCheck.onError', (sdkError) => {
        const message = sdkError && typeof sdkError === 'object' && 'message' in sdkError
          ? String(sdkError.message || '')
          : '';
        if (message) setError(message);
      })
      .build();
    sdk.launch(container);
    return () => {
      sdk.destroy();
    };
  }, [accessToken, refreshUser]);

  const handleMockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await submitKyc({ legalName, country, accredited, attested });
      await refreshUser();
      navigate('/user');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit verification.');
    } finally {
      setLoading(false);
    }
  };

  const openSumsub = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = status === 'pending'
        ? { accredited: true, attested: true }
        : { accredited, attested };
      const res = await startSumsub(payload);
      if (!res.token) throw new Error('Sumsub did not return an access token.');
      setAccessToken(res.token);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open Sumsub.');
    } finally {
      setLoading(false);
    }
  };

  const showSumsubForm = sumsubConfigured && status !== 'approved';
  const showMockForm = sumsubConfigured === false && (status === 'unverified' || status === 'rejected');

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="font-display text-accent text-sm uppercase tracking-widest mb-2">Compliance</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100 mb-3">
            {user?.role === 'owner' ? 'Property owner verification' : 'Investor verification'}
          </h1>
          <p className="text-cream-400 mb-8 leading-relaxed">
            {user?.role === 'owner'
              ? 'Property owners complete the same identity check as investors before the account is treated as verified.'
              : sumsubConfigured
                ? 'Identity documents are checked by Sumsub. The accredited-investor attestation is still collected here. A green Sumsub result does not register the wallet on-chain.'
                : 'Tokenized real estate is treated as a security. You must complete identity checks and an accredited-investor attestation before buying. This form is a platform control, not a substitute for a licensed KYC vendor or legal counsel.'}
          </p>

          <div className="mb-8">
            <Badge
              color={
                status === 'approved' ? 'green' : status === 'pending' ? 'yellow' : status === 'rejected' ? 'red' : 'accent'
              }
            >
              {status}
            </Badge>
          </div>

          {status === 'approved' && (
            <div className="rounded-2xl border border-void-700 bg-void-800/60 p-8">
              <div className="flex items-center gap-3 mb-3">
                <ShieldCheckIcon className="text-accent" size={22} />
                <h2 className="font-display text-xl font-semibold text-cream-100">You are verified</h2>
              </div>
              <p className="text-cream-400 mb-6">
                {user?.role === 'owner'
                  ? 'This property owner account is verified. Link a wallet if you also want to buy or sell shares.'
                  : 'This account can buy tokens once the linked wallet is connected and an admin registers it on-chain.'}
              </p>
              <Button onClick={() => navigate('/browse')}>Browse properties</Button>
            </div>
          )}

          {status === 'pending' && (
            <div className="rounded-2xl border border-void-700 bg-void-800/60 p-8 mb-6">
              <h2 className="font-display text-xl font-semibold text-cream-100 mb-2">In review</h2>
              <p className="text-cream-400">
                {sumsubConfigured
                  ? 'Sumsub has the application. This page checks for a decision while it is open. Approve or reject the applicant in the Sumsub dashboard, or send the applicantReviewed webhook. You cannot purchase until it is approved, and an admin must still register the wallet on-chain.'
                  : 'An admin will approve or reject this application. You cannot purchase until it is approved.'}
              </p>
            </div>
          )}

          {showSumsubForm && (
            <form
              onSubmit={openSumsub}
              className="rounded-2xl border border-void-700 bg-void-800/80 p-8 space-y-5"
            >
              {status === 'rejected' && user?.kyc?.reviewNote && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  Previous decision: {user.kyc.reviewNote}
                </p>
              )}

              {status !== 'pending' && (
                <>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accredited}
                      onChange={(e) => setAccredited(e.target.checked)}
                      className="mt-1 rounded border-void-600 bg-void-700 text-accent focus:ring-accent/50"
                    />
                    <span className="text-cream-300 text-sm">
                      I am an accredited investor under applicable U.S. securities law (Reg D 506(c)-style attestation).
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                      className="mt-1 rounded border-void-600 bg-void-700 text-accent focus:ring-accent/50"
                    />
                    <span className="text-cream-300 text-sm">
                      I understand this is not legal advice, that transfers may be restricted, and that false statements can void my participation.
                    </span>
                  </label>
                </>
              )}

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || (status !== 'pending' && (!accredited || !attested))}
                size="lg"
              >
                {loading ? 'Opening…' : accessToken ? 'Refresh identity check' : 'Continue to identity check'}
              </Button>

              {accessToken && <SumsubFrame />}
            </form>
          )}

          {showMockForm && (
            <form
              onSubmit={handleMockSubmit}
              className="rounded-2xl border border-void-700 bg-void-800/80 p-8 space-y-5"
            >
              {status === 'rejected' && user?.kyc?.reviewNote && (
                <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  Previous decision: {user.kyc.reviewNote}
                </p>
              )}

              <div>
                <label className="block text-sm font-medium text-cream-400 mb-2">Legal name</label>
                <input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  required
                  className="w-full bg-void-700 border border-void-600 text-cream-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-cream-400 mb-2">
                  Country of residence (ISO code)
                </label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  maxLength={2}
                  required
                  placeholder="US"
                  className="w-full bg-void-700 border border-void-600 text-cream-100 rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accredited}
                  onChange={(e) => setAccredited(e.target.checked)}
                  className="mt-1 rounded border-void-600 bg-void-700 text-accent focus:ring-accent/50"
                />
                <span className="text-cream-300 text-sm">
                  I am an accredited investor under applicable U.S. securities law (Reg D 506(c)-style attestation).
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => setAttested(e.target.checked)}
                  className="mt-1 rounded border-void-600 bg-void-700 text-accent focus:ring-accent/50"
                />
                <span className="text-cream-300 text-sm">
                  I understand this is not legal advice, that transfers may be restricted, and that false statements can void my participation.
                </span>
              </label>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} size="lg">
                {loading ? 'Submitting…' : 'Submit for review'}
              </Button>
            </form>
          )}

          {sumsubConfigured === null && status !== 'approved' && (
            <p className="text-cream-400">Checking verification options…</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
