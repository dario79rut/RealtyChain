const DEFAULT_JWT = 'jwt_secret';
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function isProduction() {
  return process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function isDemo() {
  if (process.env.DEMO_MODE === 'false') return false;
  if (isProduction() && process.env.DEMO_MODE !== 'true') return false;
  return true;
}

function envValue(...keys) {
  for (const key of keys) {
    const value = (process.env[key] || '').trim();
    if (value) return value;
  }
  return '';
}

function programId() {
  const value = envValue('SOLANA_PROGRAM_ID', 'VITE_SOLANA_PROGRAM_ID');
  return SOLANA_ADDRESS_RE.test(value) ? value : '';
}

function rpcUrl() {
  return envValue('SOLANA_RPC_URL', 'VITE_SOLANA_RPC_URL');
}

function jwtConfigured() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT;
  return secret && secret !== DEFAULT_JWT && secret.length >= 24;
}

function check(id, label, status, detail) {
  return { id, label, status, detail };
}

function staticChecks() {
  const demo = isDemo();
  const program = programId();
  const rpc = rpcUrl();
  const jwtOk = jwtConfigured();
  const bounty = process.env.BUG_BOUNTY_URL || '';
  const firstClose = process.env.FIRST_CLOSE_PROPERTY_ID || '';
  const sumsubWired = Boolean(
    process.env.SUMSUB_APP_TOKEN &&
    process.env.SUMSUB_SECRET_KEY &&
    process.env.SUMSUB_WEBHOOK_SECRET
  );
  const kycVendor = process.env.KYC_VENDOR === 'true' || sumsubWired;
  const auditDate = process.env.AUDIT_DATE || '';
  const jwtStatus = jwtOk ? 'pass' : demo ? 'warn' : 'fail';

  return [
    check('demo', 'Demo mode', demo ? 'warn' : 'pass', demo
      ? (sumsubWired
        ? 'APP_ENV is not production. Do not take real money. Identity checks use Sumsub.'
        : 'APP_ENV is not production. Do not take real money. KYC is mock admin review.')
      : 'APP_ENV=production. Confirm legal, KYC vendor, and audit before any close.'),
    check(
      'jwt',
      'JWT secret',
      jwtStatus,
      jwtOk ? 'JWT_SECRET is set and is not the default.' : 'JWT_SECRET is missing or still the default jwt_secret.'
    ),
    check(
      'factory',
      'Solana program',
      program ? 'pass' : demo ? 'warn' : 'fail',
      program ? program : 'SOLANA_PROGRAM_ID / VITE_SOLANA_PROGRAM_ID is not set.'
    ),
    check(
      'usdc',
      'USDC mint',
      envValue('VITE_SOLANA_USDC_MINT') ? 'pass' : 'warn',
      envValue('VITE_SOLANA_USDC_MINT') || 'VITE_SOLANA_USDC_MINT is not set. Configure uses Circle devnet USDC.'
    ),
    check(
      'kyc',
      'KYC vendor',
      kycVendor ? 'pass' : 'open',
      sumsubWired
        ? 'Sumsub app token, secret, and webhook secret are set.'
        : kycVendor
          ? 'KYC_VENDOR=true. Confirm the vendor is actually wired.'
          : 'In-app KYC is still mock admin review. Do not treat this as CIP/AML.'
    ),
    check(
      'audit',
      'Program audit',
      auditDate ? 'pass' : 'open',
      auditDate ? `AUDIT_DATE=${auditDate}` : 'No audit on file. Do not deploy the program to mainnet without one.'
    ),
    check(
      'bounty',
      'Bug bounty',
      bounty ? 'pass' : 'open',
      bounty || 'No BUG_BOUNTY_URL. Program is not live.'
    ),
    check(
      'first-close',
      'First real asset',
      firstClose ? 'pass' : 'open',
      firstClose
        ? `FIRST_CLOSE_PROPERTY_ID=${firstClose}`
        : 'No first-close property id. Seed catalog listings are demo photos, not a live SPV.'
    ),
    check(
      'rpc',
      'Solana RPC',
      rpc ? 'pass' : demo ? 'warn' : 'fail',
      rpc || 'SOLANA_RPC_URL / VITE_SOLANA_RPC_URL is not set. The wallet defaults to devnet.'
    ),
  ];
}

async function snapshot() {
  const checks = staticChecks();
  const blocking = checks.filter((c) => c.status === 'fail');
  const open = checks.filter((c) => c.status === 'open');
  return {
    demo: isDemo(),
    production: isProduction(),
    chainId: null,
    rpcUrl: rpcUrl(),
    ready: blocking.length === 0,
    liveOfferingAllowed: !isDemo() && blocking.length === 0 && open.length === 0,
    checks,
    rpc: { reachable: Boolean(rpcUrl()), block: null, factoryCode: false, error: null },
  };
}

function startupBlockers() {
  if (!isProduction() || isDemo()) return [];
  const blockers = [];
  if (!jwtConfigured()) blockers.push('Set JWT_SECRET to a long random value before production.');
  if (!rpcUrl()) blockers.push('Set SOLANA_RPC_URL or VITE_SOLANA_RPC_URL for production.');
  if (!programId()) blockers.push('Set SOLANA_PROGRAM_ID or VITE_SOLANA_PROGRAM_ID for production.');
  return blockers;
}

module.exports = { isProduction, isDemo, snapshot, startupBlockers, jwtConfigured };
