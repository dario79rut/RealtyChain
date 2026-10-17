// Delegate scheduled work to the normal API transaction and conflict handling.
export default async function () {
  const secret = process.env.INVESTMENT_SCHEDULER_SECRET || '';
  const origin = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (secret.length < 32 || !origin) return new Response(JSON.stringify({ skipped: true, reason: 'Investment scheduler configuration is incomplete.' }), { status: 200 });
  const response = await fetch(new URL('/api/investment-plans/process-due', origin), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Scheduler-Secret': secret }, body: '{}' });
  if (!response.ok) throw new Error(`Investment plan processing failed with status ${response.status}; no automatic retry was attempted.`);
  return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json' } });
}
