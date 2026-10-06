/**
 * RealtyChain chain config. Settlement runs on the Solana program in programs/realty_chain.
 */

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isSolanaAddress(value: string | undefined | null): value is string {
  return Boolean(value && SOLANA_ADDRESS_RE.test(value));
}

export function isChainAddress(value: string | undefined | null): value is string {
  return isSolanaAddress(value);
}

export const SOLANA_PROGRAM_ID = ((import.meta.env.VITE_SOLANA_PROGRAM_ID as string) || '').trim();
export const USDC_ADDRESS = ((import.meta.env.VITE_SOLANA_USDC_MINT as string) || '').trim();

export const isFactoryConfigured = isSolanaAddress(SOLANA_PROGRAM_ID);
export const isMarketConfigured = isFactoryConfigured;
export const isIdentityConfigured = isFactoryConfigured;
export const isClaimIssuerConfigured = isFactoryConfigured;
export const isOnboarderConfigured = isFactoryConfigured;
export const isUsdcConfigured = isSolanaAddress(USDC_ADDRESS);
export const isContractConfigured = isFactoryConfigured;

export const PROPERTY_FACTORY_ADDRESS = SOLANA_PROGRAM_ID;
export const SHARE_MARKET_ADDRESS = SOLANA_PROGRAM_ID;
export const IDENTITY_REGISTRY_ADDRESS = '';
export const CLAIM_ISSUER_ADDRESS = '';
export const INVESTOR_ONBOARDER_ADDRESS = '';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE !== 'false';
export const isUsdcFaucetEnabled = isDemoMode && isFactoryConfigured;

export const MOONPAY_KEY = (import.meta.env.VITE_MOONPAY_PUBLISHABLE_KEY as string) || '';
export const isMoonpayConfigured = Boolean(MOONPAY_KEY.trim());

export function moonpayBuyUrl(walletAddress: string, usd?: number) {
  if (!isMoonpayConfigured || !isSolanaAddress(walletAddress)) return '';
  const sandbox = import.meta.env.VITE_MOONPAY_SANDBOX === 'true';
  const origin = sandbox ? 'https://buy-sandbox.moonpay.com' : 'https://buy.moonpay.com';
  const params = new URLSearchParams({
    apiKey: MOONPAY_KEY.trim(),
    currencyCode: 'usdc_sol',
    walletAddress,
  });
  if (usd !== undefined && Number.isFinite(usd) && usd > 0) {
    params.set('baseCurrencyAmount', String(usd));
  }
  return `${origin}/?${params.toString()}`;
}

export const erc20Abi = [] as const;
export const mockUsdcAbi = [] as const;
export const identityRegistryAbi = [] as const;
export const investorOnboarderAbi = [] as const;
export const claimIssuerAbi = [] as const;
export const offeringAbi = [] as const;
export const propertyFactoryAbi = [] as const;
export const distributorAbi = [] as const;
export const propertyShareAbi = [] as const;
export const shareMarketAbi = [] as const;
export const redemptionAbi = [] as const;
