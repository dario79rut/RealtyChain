import React, { useEffect, useState } from 'react';
import { LoaderIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { apiFetch, LoginAttempt, ServerSettings } from '../../utils/api';

const RESULT_LABEL: Record<LoginAttempt['result'], string> = {
  blocked: 'Blocked',
  rejected: 'Wrong password',
  'signed-in': 'Signed in',
};

function ago(at: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 1000));
  if (seconds < 15) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export function LoginAttempts({ onSettingsChange }: { onSettingsChange?: (settings: ServerSettings) => void }) {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [error, setError] = useState('');
  const [savingIp, setSavingIp] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await apiFetch<ServerSettings>('/api/settings');
        if (!cancelled) {
          setSettings(next);
          onSettingsChange?.(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load sign-in attempts.');
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [onSettingsChange]);

  const allow = async (ip: string) => {
    if (!settings || savingIp) return;
    setSavingIp(ip);
    setError('');
    try {
      const next = await apiFetch<ServerSettings>('/api/settings/allowed-ips', {
        method: 'POST',
        body: JSON.stringify({ allowedAdminIps: [...settings.allowedAdminIps, ip] }),
      });
      setSettings(next);
      onSettingsChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not allow that address.');
    } finally {
      setSavingIp('');
    }
  };

  const attempts = settings?.loginAttempts || [];
  const recentLogins = settings?.recentLogins || [];
  const allowed = new Set(settings?.allowedAdminIps || []);
  const now = Date.now();

  return (
    <div className="rounded-2xl border border-void-700 bg-void-800/80 p-6">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-lg font-semibold text-cream-100">Login activity</h2>
        {!settings && !error && <LoaderIcon size={16} className="animate-spin text-cream-400" />}
      </div>
      <p className="text-sm text-cream-400 mb-4">
        Addresses that are not on the allowlist are refused. Allow one here to let that person sign in.
      </p>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {settings?.loginActivityError && <p className="text-sm text-red-400 mb-3">{settings.loginActivityError}</p>}
      {settings && !settings.loginActivityError && attempts.length === 0 && (
        <p className="text-sm text-cream-400">No recent sign-in attempts recorded.</p>
      )}
      {settings && !settings.loginActivityError && (
        <div className="mb-5">
          <h3 className="text-sm font-medium text-cream-100 mb-2">Recent successful logins</h3>
          <p className="text-xs text-cream-400 mb-3">Last successful sign-in for each address. This does not indicate who is currently online.</p>
          {recentLogins.length === 0 ? (
            <p className="text-sm text-cream-400">No successful sign-ins recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentLogins.map((login) => (
                <li key={login.id} className="rounded-xl border border-void-600 bg-void-700/50 px-4 py-2.5">
                  <p className="text-sm text-cream-100">{login.email || 'Unknown account'}</p>
                  <p className="text-xs text-cream-400 mt-0.5">
                    <code className="text-cream-300">{login.ip}</code>
                    {' · '}
                    <time dateTime={login.at} title={new Date(login.at).toLocaleString()}>{ago(login.at)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {attempts.length > 0 && (
        <ul className="space-y-2">
          {attempts.map((attempt) => {
            const recent = now - new Date(attempt.at).getTime() < 2 * 60 * 1000;
            const canAllow = attempt.result === 'blocked' && attempt.ip !== 'unknown' && !allowed.has(attempt.ip);
            return (
              <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-void-600 bg-void-700/50 px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-cream-100 font-medium">{attempt.email || 'Unknown account'}</span>
                    {recent && <span className="text-[10px] uppercase tracking-wide text-accent">Recent</span>}
                  </div>
                  <p className="text-xs text-cream-400 mt-0.5">
                    <code className="text-cream-300">{attempt.ip}</code>
                    {' · '}
                    {RESULT_LABEL[attempt.result] || attempt.result}
                    {' · '}
                    {ago(attempt.at)}
                  </p>
                </div>
                {canAllow && (
                  <Button size="sm" disabled={savingIp === attempt.ip} onClick={() => allow(attempt.ip)}>
                    {savingIp === attempt.ip ? 'Allowing…' : 'Allow this IP'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
