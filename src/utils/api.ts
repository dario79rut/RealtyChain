export type ServerSettings = {
  allowedAdminIps: string[];
  envAllowedIps?: string[];
  currentIp: string;
  ipAllowed: boolean;
};

export type KycStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  kycStatus: KycStatus;
  accredited: boolean;
  walletAddress: string | null;
  avatarUrl: string | null;
  kyc: {
    legalName: string | null;
    country: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    provider: string | null;
  } | null;
};

export type Eligibility = {
  canInvest: boolean;
  reasons: string[];
  kycStatus: KycStatus;
  accredited: boolean;
  walletAddress: string | null;
};

export type KycResponse = {
  user: AuthUser;
  eligibility: Eligibility;
  sumsubConfigured?: boolean;
  token?: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export const TOKEN_KEY = 'defi_estate_token';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage failures (e.g. private mode)
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function loginRequest(email: string, password: string) {
  return apiFetch<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchMe() {
  return apiFetch<{ user: AuthUser }>('/api/auth/me');
}

export function fetchKyc() {
  return apiFetch<KycResponse>('/api/kyc');
}

export function submitKyc(payload: {
  legalName: string;
  country: string;
  accredited: boolean;
  attested: boolean;
}) {
  return apiFetch<KycResponse>('/api/kyc', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function startSumsub(payload: { accredited: boolean; attested: boolean }) {
  return apiFetch<KycResponse>('/api/kyc/sumsub/token', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function syncSumsub() {
  return apiFetch<KycResponse>('/api/kyc/sumsub/sync', { method: 'POST' });
}

export type PropertySearchFilters = {
  status: string;
  minPrice: string;
  maxPrice: string;
  location: string;
  rooms: string;
  wcs: string;
  propertyType: string;
  minSqft: string;
  minYield: string;
  sort: string;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string;
  filters: PropertySearchFilters;
  createdAt: string;
};

export function fetchSavedSearches() {
  return apiFetch<{ searches: SavedSearch[] }>('/api/searches');
}

export function saveSearch(payload: { name?: string; query: string; filters: PropertySearchFilters }) {
  return apiFetch<{ search: SavedSearch; searches: SavedSearch[] }>('/api/searches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteSavedSearch(id: string) {
  return apiFetch<{ searches: SavedSearch[] }>(`/api/searches/${id}`, { method: 'DELETE' });
}

export type GovernanceProposal = {
  id: string;
  propertyId: string;
  propertyTitle: string;
  title: string;
  summary: string;
  kind: 'budget' | 'sale' | 'manager' | 'distribution';
  endsAt: string;
  createdAt: string;
  votingPower: number;
  forShares: number;
  againstShares: number;
  turnout: number;
  quorumShares: number;
  status: 'active' | 'passed' | 'rejected';
  myVote: 'for' | 'against' | null;
  myShares: number;
};

export type GovernanceBalance = {
  propertyId: string;
  propertyTitle: string;
  shares: number;
};

export function fetchGovernance(propertyId?: string) {
  const query = propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : '';
  return apiFetch<{ proposals: GovernanceProposal[]; balances: GovernanceBalance[] }>(`/api/governance${query}`);
}

export function createProposal(payload: {
  propertyId: string;
  title: string;
  summary: string;
  kind: GovernanceProposal['kind'];
  days: number;
}) {
  return apiFetch<{ proposal: GovernanceProposal; proposals: GovernanceProposal[]; balances: GovernanceBalance[] }>(
    '/api/governance',
    { method: 'POST', body: JSON.stringify(payload) }
  );
}

export function castVote(id: string, choice: 'for' | 'against') {
  return apiFetch<{ proposal: GovernanceProposal }>(`/api/governance/${id}/vote`, {
    method: 'POST',
    body: JSON.stringify({ choice }),
  });
}

export type MarketLevel = { price: number; shares: number };

export type MarketQuote = {
  propertyId: string;
  title: string;
  location: string;
  last: number;
  change: number;
  bid: number | null;
  ask: number | null;
  bidSize: number;
  askSize: number;
  volume: number;
};

export type MarketOrder = {
  id: string;
  propertyId: string;
  title: string;
  side: 'bid' | 'ask';
  price: number;
  shares: number;
  amount?: number;
  filled?: number;
  status?: 'open' | 'filled' | 'cancelled';
  createdAt: string;
};

export type MarketPosition = {
  propertyId: string;
  title: string;
  shares: number;
  reserved: number;
  locked?: number;
  available: number;
};

export type MarketCandle = {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketTrade = {
  id: string;
  propertyId: string;
  title: string;
  price: number;
  shares: number;
  side: 'buy' | 'sell' | 'book';
  at: string;
};

export type MarketBook = {
  quotes: MarketQuote[];
  books: Record<string, { bids: MarketLevel[]; asks: MarketLevel[] }>;
  orders: MarketOrder[];
  orderHistory: MarketOrder[];
  fills: MarketTrade[];
  trades: MarketTrade[];
  candles: Record<string, MarketCandle[]>;
  positions: MarketPosition[];
  cashUsdc: number;
  cashReserved: number;
};

export function fetchMarket() {
  return apiFetch<MarketBook>('/api/market');
}

export function placeMarketOrder(payload: {
  propertyId: string;
  side: 'bid' | 'ask';
  price: number;
  shares: number;
  open?: boolean;
}) {
  return apiFetch<MarketBook>('/api/market/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type LendingTerms = {
  maxLtv: number;
  liquidationLtv: number;
  borrowApr: number;
  supplyApr: number;
  penalty: number;
};

export type LendingLine = {
  propertyId: string;
  title: string;
  shares: number;
  mark: number;
  value: number;
};

export type LendingLoan = {
  id: string;
  borrowerId: number;
  borrower: string;
  debt: number;
  principal: number;
  interest: number;
  collateralValue: number;
  ltv: number;
  health: 'healthy' | 'limited' | 'liquidatable';
  maxBorrow: number;
  collateral: LendingLine[];
};

export type LendingDesk = {
  terms: LendingTerms;
  poolUsdc: number;
  cashUsdc: number;
  supply: { principal: number; interest: number; total: number } | null;
  loan: LendingLoan | null;
  collateral: {
    propertyId: string;
    title: string;
    shares: number;
    locked: number;
    available: number;
    mark: number;
    value: number;
  }[];
  liquidations: LendingLoan[];
};

export function fetchLending() {
  return apiFetch<LendingDesk>('/api/lend');
}

export function supplyUsdc(usdc: number) {
  return apiFetch<LendingDesk>('/api/lend/supply', { method: 'POST', body: JSON.stringify({ usdc }) });
}

export function withdrawUsdc(usdc: number) {
  return apiFetch<LendingDesk>('/api/lend/withdraw', { method: 'POST', body: JSON.stringify({ usdc }) });
}

export function borrowUsdc(payload: { propertyId: string; shares: number; usdc: number }) {
  return apiFetch<LendingDesk>('/api/lend/borrow', { method: 'POST', body: JSON.stringify(payload) });
}

export function repayUsdc(usdc: number) {
  return apiFetch<LendingDesk>('/api/lend/repay', { method: 'POST', body: JSON.stringify({ usdc }) });
}

export function releaseCollateral(payload: { propertyId: string; shares: number }) {
  return apiFetch<LendingDesk>('/api/lend/release', { method: 'POST', body: JSON.stringify(payload) });
}

export function liquidateLoan(id: string) {
  return apiFetch<LendingDesk>(`/api/lend/liquidate/${id}`, { method: 'POST', body: JSON.stringify({}) });
}

export function cancelMarketOrder(id: string) {
  return apiFetch<MarketBook>(`/api/market/orders/${id}`, { method: 'DELETE' });
}

export function bindWallet(address: string) {
  return apiFetch<KycResponse>('/api/kyc/wallet', {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

export type AdminDesk = {
  properties: {
    id: string;
    title: string;
    location: string;
    description: string;
    status: string;
    ownerId: number | null;
    ownerName: string | null;
    price: number;
    tokensSold: number;
    totalTokens: number;
    documentStatus: string;
    documents: { name: string; kind: string | null; review: string | null }[];
    stage: string;
    suspended: boolean;
    sale: string | null;
    valuationUsd: number;
    ownershipVerified: boolean;
    tradingPaused: boolean;
    transfersRestricted: boolean;
    feeBps: number;
    token: {
      totalSupply: number;
      price: number;
      ownerPercent: number;
      minted: number;
      burned: number;
      contract: string | null;
    };
    flow: {
      rent: number;
      expenses: number;
      fee: number;
      net: number;
      investor: number;
      owner: number;
      ownerPercent: number;
    };
  }[];
  owners: AdminAccount[];
  investors: AdminAccount[];
  market: {
    orders: { id: string; propertyId: string; side: string; price: number; shares: number; status: string }[];
    trades: { id: string; propertyId: string; price: number; shares: number; at: string }[];
    volume: number;
    failures: { at: string; propertyId: string | null; error: string }[];
  };
  lending: {
    maxLtv: number;
    liquidationLtv: number;
    borrowApr: number;
    supplyApr: number;
    poolUsdc: number;
    loans: {
      id: string;
      borrower: string;
      debt: number;
      interest: number;
      collateral: number;
      ltv: number;
      health: string;
    }[];
  };
  distributions: {
    id: string;
    title: string;
    at: string;
    rent: number;
    expenses: number;
    fee: number;
    net: number;
    investor: number;
    owner: number;
    status: string;
  }[];
  audit: { id: string; at: string; action: string; target: string | null; detail: string }[];
  growth: {
    asset: AdminPoint[];
    sold: AdminPoint[];
    volume: AdminPoint[];
    capacity: AdminPoint[];
    accrued: AdminPoint[];
    investors: AdminPoint[];
    owners: AdminPoint[];
    approved: AdminPoint[];
  };
};

export type AdminPoint = { t: string; value: number };

export type AdminAccount = {
  id: number;
  email: string;
  name: string | null;
  role: string;
  kycStatus: string;
  accredited: boolean;
  country: string | null;
  walletAddress: string | null;
  suspended: boolean;
  restricted: boolean;
  suspicious: boolean;
  screenedAt: string | null;
  cashUsdc: number;
  holdings: { propertyId: string; title: string; shares: number; value: number }[];
  properties: { id: string; title: string; stage: string | null }[];
};

export function fetchAdmin() {
  return apiFetch<AdminDesk>('/api/admin');
}

export function adminAction(payload: Record<string, unknown>) {
  return apiFetch<AdminDesk>('/api/admin/actions', { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchInvestors() {
  return apiFetch<{ investors: AuthUser[] }>('/api/kyc/admin/investors');
}

export function reviewKyc(userId: number, decision: 'approved' | 'rejected', note?: string) {
  return apiFetch<KycResponse>(`/api/kyc/admin/${userId}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
  });
}

export function registerOwnedProperty(payload: Record<string, unknown>) {
  return apiFetch<{ property: import('./types').Property }>('/api/properties/mine', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveOwnedCampaign(id: string, payload: Record<string, unknown>) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/campaign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function tokenizeOwnedProperty(id: string, payload: Record<string, unknown>) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/tokenize`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function applyOwnerFinance(id: string, amount: number) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/finance/apply`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function acceptOwnerFinance(id: string) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/finance/accept`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function repayOwnerFinance(id: string, amount: number) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/finance/repay`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function pledgeCampaign(id: string, amount: number) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/${id}/campaign/pledge`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function updateOwnedSaleStatus(id: string, status: import('./types').Property['status']) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function uploadOwnedPhoto(id: string, payload: { filename: string; data: string }) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/photos`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function uploadOwnedDocument(id: string, payload: { kind: string; filename: string; data: string }) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/documents`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function verifyOwnedDocuments(id: string) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function updateOwnedProgress(id: string, payload: { percent: number; note: string }) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/mine/${id}/progress`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createProperty(payload: Partial<import('./types').Property>) {
  return apiFetch<{ property: import('./types').Property }>('/api/properties', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProperty(id: string, payload: Partial<import('./types').Property>) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteProperty(id: string) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/${id}`, {
    method: 'DELETE',
  });
}

export function fetchReadiness() {
  return apiFetch<{
    demo: boolean;
    production: boolean;
    chainId: number;
    rpcUrl: string;
    ready: boolean;
    liveOfferingAllowed: boolean;
    checks: { id: string; label: string; status: string; detail: string }[];
    rpc: { reachable: boolean; block: number | null; factoryCode: boolean; error: string | null };
  }>('/api/ops/readiness');
}

export type ActivityEvent = {
  id: string;
  type: string;
  propertyId: string;
  wallet: string;
  counterparty: string | null;
  shares: string;
  usdc: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  timestamp: number;
};

export type ActivityHolding = {
  propertyId: string;
  propertyTitle: string;
  shares: number;
  costUsdc: number;
  rentClaimedUsdc: number;
  redeemProceedsUsdc: number;
  secondaryProceedsUsdc: number;
};

export type ActivityResponse = {
  wallet: string;
  lastSyncAt: string | null;
  events: ActivityEvent[];
  holdings: ActivityHolding[];
  totals: {
    shares: number;
    costUsdc: number;
    rentClaimedUsdc: number;
    redeemProceedsUsdc: number;
    secondaryProceedsUsdc: number;
  };
};

export type TaxPack = {
  disclaimer: string;
  year: number;
  wallet: string;
  holdings: ActivityHolding[];
  yearActivity: ActivityHolding[];
  events: ActivityEvent[];
  totals: ActivityResponse['totals'];
  yearTotals: ActivityResponse['totals'];
};

export function uploadAvatar(payload: { data: string; filename: string }) {
  return apiFetch<{ user: AuthUser }>('/api/auth/avatar', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchActivity() {
  return apiFetch<ActivityResponse>('/api/activity');
}

export function syncActivity() {
  return apiFetch<{ synced: boolean; added?: number; reason?: string; lastSyncAt?: string }>('/api/activity/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function fetchTaxPack(year: number) {
  return apiFetch<TaxPack>(`/api/activity/tax?year=${year}`);
}

export function uploadPropertyDocument(propertyId: string, payload: { name: string; filename: string; data: string }) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/${propertyId}/documents`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deletePropertyDocument(propertyId: string, index: number) {
  return apiFetch<{ property: import('./types').Property }>(`/api/properties/${propertyId}/documents/${index}`, {
    method: 'DELETE',
  });
}

export async function downloadVaultFile(url: string, filename: string) {
  if (!url.startsWith('/api/vault/')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const token = getToken();
  const res = await fetch(`${API_BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Could not download document.');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename || 'document.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export async function downloadTaxCsv(year: number) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/activity/tax.csv?year=${year}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Could not export tax worksheet.');
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `realtychain-tax-${year}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export function mediaUrl(url: string | undefined | null) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${API_BASE}${url}`;
}

export function uploadListingImage(payload: { filename: string; data: string }) {
  return apiFetch<{ url: string; contentType: string; bytes: number; filename: string }>('/api/images', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function ingestListingImage(sourceUrl: string) {
  return apiFetch<{ url: string; contentType: string; bytes: number; filename: string }>('/api/images', {
    method: 'POST',
    body: JSON.stringify({ sourceUrl }),
  });
}

export function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

export function canInvest(user: AuthUser | null, connectedAddress?: string | null) {
  if (!user) return false;
  if (user.kycStatus !== 'approved' || !user.accredited || !user.walletAddress) return false;
  if (connectedAddress && user.walletAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
    return false;
  }
  return true;
}
