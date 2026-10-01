import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CoinsIcon, HistoryIcon, BuildingIcon, SettingsIcon, LogOutIcon, ShieldCheckIcon, TrendingUpIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { PropertyThumb } from '../components/ui/PropertyThumb';
import { Badge } from '../components/ui/Badge';
import { useWallet } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';
import { useProperties } from '../hooks/useProperties';
import { ConnectWalletButton } from '../components/ui/ConnectWalletButton';
import { formatUnits } from 'viem';
import { useReadContracts, usePublicClient, useWriteContract } from 'wagmi';
import {
  erc20Abi,
  distributorAbi,
  redemptionAbi,
  offeringAbi,
  isFactoryConfigured,
  isMarketConfigured,
  PROPERTY_FACTORY_ADDRESS,
  propertyFactoryAbi,
} from '../contracts/config';
import { bindWallet, downloadTaxCsv, fetchMarket, MarketBook, mediaUrl, uploadAvatar } from '../utils/api';
import { listingFromResult } from '../hooks/useListing';
import { sharePriceUsdc } from '../utils/pricing';
import { formatUsd, navPerShare } from '../utils/ops';
import { PortfolioWheel } from '../components/ui/PortfolioWheel';
import { OptimizeChannel } from '../components/portfolio/OptimizeChannel';
import { recommendations } from '../utils/portfolioOptimize';
import { ListSharesModal } from '../components/modals/ListSharesModal';
import { TransferSharesModal } from '../components/modals/TransferSharesModal';
import { OnrampModal } from '../components/modals/OnrampModal';
import { useActivity, useSyncActivity } from '../hooks/useActivity';
import { OwnerDesk } from '../components/owner/OwnerDesk';

const ZERO = '0x0000000000000000000000000000000000000000';

export default function User() {
  const { address, disconnectWallet, isConnected } = useWallet();
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedTab = params.get('tab');
  const [activeTab, setActiveTab] = useState(
    requestedTab === 'optimize' || requestedTab === 'transactions' || requestedTab === 'settings'
      ? requestedTab
      : 'portfolio',
  );
  const [walletError, setWalletError] = useState('');
  const [linking, setLinking] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundError, setRefundError] = useState('');
  const [onrampOpen, setOnrampOpen] = useState(false);
  const [listTarget, setListTarget] = useState<{
    propertyId: string;
    propertyTitle: string;
    token: `0x${string}`;
    maxShares: number;
    defaultPriceUsdc: number;
  } | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    propertyTitle: string;
    token: `0x${string}`;
    maxShares: number;
  } | null>(null);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: properties = [], isLoading: propertiesLoading } = useProperties();

  useEffect(() => {
    let cancelled = false;
    fetchMarket()
      .then((book) => {
        if (!cancelled) setAccountBook(book);
      })
      .catch(() => {
        if (!cancelled) setAccountBook(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const { data: activity } = useActivity(Boolean(user?.walletAddress));
  const syncActivityIndex = useSyncActivity();
  const [syncingActivity, setSyncingActivity] = useState(false);
  const [taxYear, setTaxYear] = useState(String(new Date().getUTCFullYear()));
  const [taxError, setTaxError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [accountBook, setAccountBook] = useState<MarketBook | null>(null);
  const accountPositions = (accountBook?.positions || []).filter((row) => row.shares > 0);

  useEffect(() => {
    if (requestedTab === 'portfolio' || requestedTab === 'optimize' || requestedTab === 'transactions' || requestedTab === 'settings') {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (user?.role === 'admin') navigate('/admin', { replace: true });
  }, [user, navigate]);
  const ownedProperties = properties.filter((property) => user?.id != null && Number(property.ownerId) === Number(user.id));
  const ownedValue = ownedProperties.reduce((sum, property) => sum + Number(property.price || 0), 0);
  const ownedIncome = ownedProperties.reduce(
    (sum, property) => sum + Number(property.price || 0) * (Number(property.returnRate || 0) / 100),
    0,
  );

  const { data: listingResults, isFetching: listingsLoading } = useReadContracts({
    contracts: properties.map((p) => ({
      address: PROPERTY_FACTORY_ADDRESS as `0x${string}`,
      abi: propertyFactoryAbi,
      functionName: 'getListing' as const,
      args: [BigInt(p.id)] as const,
    })),
    query: { enabled: isFactoryConfigured && Boolean(address) && properties.length > 0 },
  });

  const { data: distributorResults, refetch: refetchDistributors } = useReadContracts({
    contracts: properties.map((p) => ({
      address: PROPERTY_FACTORY_ADDRESS as `0x${string}`,
      abi: propertyFactoryAbi,
      functionName: 'getDistributor' as const,
      args: [BigInt(p.id)] as const,
    })),
    query: { enabled: isFactoryConfigured && Boolean(address) && properties.length > 0 },
  });

  const { data: redemptionResults, refetch: refetchRedemptions } = useReadContracts({
    contracts: properties.map((p) => ({
      address: PROPERTY_FACTORY_ADDRESS as `0x${string}`,
      abi: propertyFactoryAbi,
      functionName: 'getRedemption' as const,
      args: [BigInt(p.id)] as const,
    })),
    query: { enabled: isFactoryConfigured && Boolean(address) && properties.length > 0 },
  });

  const liveHoldings = properties
    .map((p, i) => {
      const distRaw = distributorResults?.[i]?.result;
      const distributor =
        typeof distRaw === 'string' && distRaw.toLowerCase() !== ZERO ? (distRaw as `0x${string}`) : null;
      const redRaw = redemptionResults?.[i]?.result;
      const redemption =
        typeof redRaw === 'string' && redRaw.toLowerCase() !== ZERO ? (redRaw as `0x${string}`) : null;
      return { property: p, listing: listingFromResult(listingResults?.[i]?.result), distributor, redemption };
    })
    .filter(
      (row) =>
        row.listing?.exists &&
        row.listing.token &&
        row.listing.token.toLowerCase() !== ZERO
    );

  const { data: balances, isFetching: balancesLoading, refetch: refetchBalances } = useReadContracts({
    contracts: liveHoldings.map((row) => ({
      address: row.listing!.token,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(address) && liveHoldings.length > 0 },
  });

  const distHoldings = liveHoldings.filter((row) => row.distributor);
  const { data: pendingResults, refetch: refetchPending } = useReadContracts({
    contracts: distHoldings.map((row) => ({
      address: row.distributor as `0x${string}`,
      abi: distributorAbi,
      functionName: 'pending' as const,
      args: [address as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(address) && distHoldings.length > 0 },
  });
  const pendingByPropertyId = new Map(
    distHoldings.map((row, i) => [row.property.id, pendingResults?.[i]?.result])
  );

  const holdings = liveHoldings
    .map((row, i) => {
      const raw = balances?.[i]?.result;
      const tokensOwned = typeof raw === 'bigint' ? Number(raw) : 0;
      const pendingRaw = pendingByPropertyId.get(row.property.id);
      const pendingUsdc = typeof pendingRaw === 'bigint' ? pendingRaw : 0n;
      return {
        propertyId: row.property.id,
        propertyName: row.property.title,
        token: row.listing!.token,
        tokensOwned,
        investmentValue: tokensOwned * sharePriceUsdc(row.property),
        navValue: tokensOwned * navPerShare(row.property),
        sharePrice: sharePriceUsdc(row.property),
        distributor: row.distributor,
        redemption: row.redemption,
        offering: row.listing!.offering,
        pendingUsdc,
      };
    })
    .filter((h) => h.tokensOwned > 0 || h.pendingUsdc > 0n);

  const exitHoldings = holdings.filter((h) => h.redemption);
  const { data: exitOpenedResults, refetch: refetchExitOpened } = useReadContracts({
    contracts: exitHoldings.map((h) => ({
      address: h.redemption as `0x${string}`,
      abi: redemptionAbi,
      functionName: 'opened' as const,
    })),
    query: { enabled: Boolean(address) && exitHoldings.length > 0 },
  });
  const exitOpenedById = new Map(
    exitHoldings.map((h, i) => [h.propertyId, exitOpenedResults?.[i]?.result === true])
  );

  const quoteHoldings = holdings.filter(
    (h) => h.redemption && exitOpenedById.get(h.propertyId) && h.tokensOwned > 0
  );
  const { data: quoteResults, refetch: refetchQuotes } = useReadContracts({
    contracts: quoteHoldings.map((h) => ({
      address: h.redemption as `0x${string}`,
      abi: redemptionAbi,
      functionName: 'quote' as const,
      args: [BigInt(h.tokensOwned)] as const,
    })),
    query: { enabled: Boolean(address) && quoteHoldings.length > 0 },
  });
  const quoteByPropertyId = new Map(
    quoteHoldings.map((h, i) => [h.propertyId, quoteResults?.[i]?.result])
  );

  const { data: offeringFinalizedResults, refetch: refetchOfferingFinalized } = useReadContracts({
    contracts: holdings.map((h) => ({
      address: h.offering,
      abi: offeringAbi,
      functionName: 'finalized' as const,
    })),
    query: { enabled: Boolean(address) && holdings.length > 0 },
  });
  const { data: offeringSuccessResults, refetch: refetchOfferingSuccess } = useReadContracts({
    contracts: holdings.map((h) => ({
      address: h.offering,
      abi: offeringAbi,
      functionName: 'successful' as const,
    })),
    query: { enabled: Boolean(address) && holdings.length > 0 },
  });
  const { data: purchasedResults, refetch: refetchPurchased } = useReadContracts({
    contracts: holdings.map((h) => ({
      address: h.offering,
      abi: offeringAbi,
      functionName: 'purchased' as const,
      args: [address as `0x${string}`] as const,
    })),
    query: { enabled: Boolean(address) && holdings.length > 0 },
  });
  const refundableById = new Map(
    holdings.map((h, i) => {
      const purchased = purchasedResults?.[i]?.result;
      const can =
        offeringFinalizedResults?.[i]?.result === true &&
        offeringSuccessResults?.[i]?.result === false &&
        typeof purchased === 'bigint' &&
        purchased > 0n;
      return [h.propertyId, can] as const;
    })
  );

  const chainOwnedIds = new Set(
    holdings.filter((row) => row.tokensOwned > 0).map((row) => String(row.propertyId))
  );
  const financeRows = accountPositions.map((row) => {
    const property = properties.find((item) => String(item.id) === String(row.propertyId));
    const quote = accountBook?.quotes.find((item) => item.propertyId === String(row.propertyId));
    const cost = property ? sharePriceUsdc(property) : quote?.last || 0;
    const last = quote?.last ?? cost;
    const marketValue = row.shares * last;
    const costValue = row.shares * cost;
    const pnl = marketValue - costValue;
    const yieldRate = property?.returnRate || 0;
    return {
      ...row,
      last,
      cost,
      marketValue,
      pnl,
      pnlPct: costValue > 0 ? (pnl / costValue) * 100 : 0,
      yieldRate,
      income: marketValue * (yieldRate / 100),
      change: quote?.change || 0,
      imageUrl: property?.imageUrl || '',
    };
  });
  const investedValue = financeRows.reduce((sum, row) => sum + row.marketValue, 0);
  const cashValue = accountBook?.cashUsdc || 0;
  const cashReserved = accountBook?.cashReserved || 0;
  const portfolioValue = investedValue + cashValue;
  const unrealized = financeRows.reduce((sum, row) => sum + row.pnl, 0);
  const annualIncome = financeRows.reduce((sum, row) => sum + row.income, 0);
  const weightedYield = investedValue > 0 ? (annualIncome / investedValue) * 100 : 0;
  const accountOnly = accountPositions.filter((row) => !chainOwnedIds.has(String(row.propertyId)));
  const propertiesOwned = chainOwnedIds.size + accountOnly.length;
  const costByPropertyId = new Map((activity?.holdings || []).map((row) => [row.propertyId, row.costUsdc]));

  const handleClaim = async (propertyId: string, distributor: `0x${string}`) => {
    setClaimError('');
    setClaimingId(propertyId);
    try {
      const hash = await writeContractAsync({
        address: distributor,
        abi: distributorAbi,
        functionName: 'claim',
      } as never);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await refetchPending();
      await refetchDistributors();
      try {
        await syncActivityIndex();
      } catch {
        // Chain sync is best-effort; claim still succeeded.
      }
    } catch (err) {
      const anyErr = err as { shortMessage?: string; message?: string };
      setClaimError(anyErr.shortMessage || anyErr.message || 'Claim failed.');
    } finally {
      setClaimingId(null);
    }
  };

  const handleRedeem = async (propertyId: string, redemption: `0x${string}`, shares: number) => {
    setRedeemError('');
    setRedeemingId(propertyId);
    try {
      const hash = await writeContractAsync({
        address: redemption,
        abi: redemptionAbi,
        functionName: 'redeem',
        args: [BigInt(shares)],
      } as never);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await refetchBalances();
      await refetchPending();
      await refetchRedemptions();
      await refetchExitOpened();
      await refetchQuotes();
      try {
        await syncActivityIndex();
      } catch {
        // Chain sync is best-effort; redeem still succeeded.
      }
    } catch (err) {
      const anyErr = err as { shortMessage?: string; message?: string };
      setRedeemError(anyErr.shortMessage || anyErr.message || 'Redeem failed.');
    } finally {
      setRedeemingId(null);
    }
  };

  const handleRefund = async (propertyId: string, offering: `0x${string}`) => {
    setRefundError('');
    setRefundingId(propertyId);
    try {
      const hash = await writeContractAsync({
        address: offering,
        abi: offeringAbi,
        functionName: 'refund',
      } as never);
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      await refetchBalances();
      await refetchPurchased();
      await refetchOfferingFinalized();
      await refetchOfferingSuccess();
      try {
        await syncActivityIndex();
      } catch {
        // best-effort
      }
    } catch (err) {
      const anyErr = err as { shortMessage?: string; message?: string };
      setRefundError(anyErr.shortMessage || anyErr.message || 'Refund failed.');
    } finally {
      setRefundingId(null);
    }
  };

  const kycColor =
    user?.kycStatus === 'approved' ? 'green' : user?.kycStatus === 'pending' ? 'yellow' : user?.kycStatus === 'rejected' ? 'red' : 'accent';

  const handleLinkWallet = async () => {
    if (!address) return;
    setWalletError('');
    setLinking(true);
    try {
      await bindWallet(address);
      await refreshUser();
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Could not link wallet.');
    } finally {
      setLinking(false);
    }
  };

  const optimizeMoves = recommendations(
    financeRows.map((row) => ({
      propertyId: row.propertyId,
      title: row.title,
      marketValue: row.marketValue,
      yieldRate: row.yieldRate,
    })),
    cashValue,
  ).filter((note) => note.kind === 'cash' || note.kind === 'trim' || note.kind === 'add').length;

  const tabs = [
    { id: 'portfolio', label: 'My Portfolio', icon: <BuildingIcon size={18} /> },
    { id: 'optimize', label: 'Optimize', icon: <TrendingUpIcon size={18} /> },
    { id: 'transactions', label: 'Transactions', icon: <HistoryIcon size={18} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  if (user?.role === 'owner') {
    return <OwnerDesk />;
  }

  if (user?.role === 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100 mb-2">
                My Dashboard
              </h1>
              <div className="flex items-center gap-3">
                {user?.email && (
                  <span className="px-3 py-1.5 rounded-lg bg-void-700 border border-void-600 text-cream-300 text-sm">
                    {user.email}
                  </span>
                )}
                {user?.role === 'owner' && <Badge color="accent">Property owner</Badge>}
                {address && (
                  <span className="px-3 py-1.5 rounded-lg bg-void-700 border border-void-600 text-cream-300 text-sm font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 [&_button]:!rounded-lg">
              <ConnectWalletButton />
              <Button variant="outline" onClick={() => setOnrampOpen(true)}>
                Get USDC
              </Button>
              <Button
                variant="outline"
                icon={<LogOutIcon size={18} />}
                onClick={() => {
                  disconnectWallet();
                  logout();
                  navigate('/');
                }}
              >
                Sign out
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {[
              { icon: CoinsIcon, label: 'Portfolio value', value: `$${formatUsd(portfolioValue)}`, accent: true },
              { icon: CoinsIcon, label: 'Cash', value: `$${formatUsd(cashValue)}` },
              { icon: BuildingIcon, label: 'Investments', value: `$${formatUsd(investedValue)}` },
              {
                icon: ShieldCheckIcon,
                label: 'Unrealized',
                value: `${unrealized >= 0 ? '+' : ''}$${formatUsd(unrealized)}`,
                accent: unrealized >= 0,
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl border border-void-700 bg-void-800/60"
              >
                <div className="flex items-center gap-2 text-cream-400 text-sm mb-2">
                  <stat.icon size={16} />
                  {stat.label}
                </div>
                <div className={`font-display text-2xl font-bold ${stat.accent ? 'text-accent' : 'text-cream-100'}`}>
                  {stat.value}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="rounded-2xl border border-void-700 bg-void-800/40 overflow-hidden">
            <nav className="flex border-b border-void-700">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 flex items-center gap-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-accent border-b-2 border-accent bg-accent-muted/30'
                      : 'text-cream-400 hover:text-cream-100'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id === 'optimize' && optimizeMoves > 0 && (
                    <span className="inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-accent text-void-900 text-[11px] font-semibold leading-none">
                      {optimizeMoves}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-6">
              {activeTab === 'portfolio' && (
                <div>
                  {ownedProperties.length > 0 && (
                    <div className="mb-10">
                      <h3 className="font-display text-lg font-semibold text-cream-100">Properties you own</h3>
                      <p className="text-cream-400 text-sm mt-1 mb-4">
                        {ownedProperties.length} listings · ${formatUsd(ownedValue)} asset value · ${formatUsd(ownedIncome)} a year at the stated yields
                      </p>
                      <div className="overflow-x-auto rounded-2xl border border-void-700">
                        <table className="min-w-full">
                          <thead>
                            <tr className="border-b border-void-700">
                              <th className="px-4 py-3 text-left text-xs font-medium text-cream-400 uppercase">Property</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase">Value</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase">Sold</th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase">Yield</th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-cream-400 uppercase">Status</th>
                              <th className="px-4 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-void-700">
                            {ownedProperties.map((property) => (
                              <tr key={property.id}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <PropertyThumb title={property.title} imageUrl={property.imageUrl} className="h-12 w-16" />
                                    <div>
                                      <div className="text-cream-100 font-medium">{property.title}</div>
                                      <div className="text-cream-400 text-xs">{property.location}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-cream-100">${formatUsd(property.price)}</td>
                                <td className="px-4 py-3 text-right text-cream-300">{property.tokensSold}/{property.totalTokens}</td>
                                <td className="px-4 py-3 text-right text-cream-300">{Number(property.returnRate || 0).toFixed(1)}%</td>
                                <td className="px-4 py-3 text-cream-300">{property.status}</td>
                                <td className="px-4 py-3 text-right">
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/property/${property.id}`)}>
                                    View
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-cream-100">Investment portfolio</h3>
                      <p className="text-cream-400 text-sm mt-1">
                        {propertiesOwned} properties · ${formatUsd(cashValue - cashReserved)} cash available
                        {cashReserved > 0 ? ` · $${formatUsd(cashReserved)} reserved in bids` : ''}
                        {' · '}
                        {weightedYield.toFixed(1)}% weighted yield · ${formatUsd(annualIncome)} a year
                      </p>
                    </div>
                    <p className={`font-display text-3xl font-bold ${unrealized >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {unrealized >= 0 ? '+' : ''}${formatUsd(unrealized)}
                      <span className="block text-sm font-medium text-cream-400">unrealized vs cost</span>
                    </p>
                  </div>
                  {portfolioValue > 0 && (
                    <div className="mb-8 rounded-2xl border border-void-700 bg-void-900/40 p-5">
                      <PortfolioWheel
                        centerLabel="Portfolio"
                        centerValue={`$${formatUsd(portfolioValue)}`}
                        slices={[
                          ...financeRows.map((row, index) => ({
                            id: row.propertyId,
                            label: row.title,
                            value: row.marketValue,
                            color: ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185'][index % 6],
                          })),
                          { id: 'cash', label: 'Cash', value: cashValue, color: '#e7e5e4' },
                        ]}
                      />
                    </div>
                  )}
                  {financeRows.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-void-700 mb-8">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-void-700">
                            <th className="px-4 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Holding</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Shares</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Last</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Value</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">P/L</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Yield</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Weight</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-void-700">
                          {financeRows.map((row) => (
                            <tr key={row.propertyId}>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <PropertyThumb title={row.title} imageUrl={row.imageUrl} className="h-12 w-16" />
                                  <div>
                                    <div className="text-cream-100 font-medium">{row.title}</div>
                                    <div className="text-cream-400 text-xs">
                                      Cost ${formatUsd(row.cost)} · {row.available} free to sell
                                      {row.locked ? ` · ${row.locked} locked as collateral` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right text-cream-100">{row.shares}</td>
                              <td className={`px-4 py-4 text-right font-mono ${row.change >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                ${formatUsd(row.last)}
                              </td>
                              <td className="px-4 py-4 text-right text-cream-100">${formatUsd(row.marketValue)}</td>
                              <td className={`px-4 py-4 text-right ${row.pnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {row.pnl >= 0 ? '+' : ''}${formatUsd(row.pnl)}
                                <div className="text-xs">{row.pnl >= 0 ? '+' : ''}{row.pnlPct.toFixed(1)}%</div>
                              </td>
                              <td className="px-4 py-4 text-right text-cream-100">{row.yieldRate.toFixed(1)}%</td>
                              <td className="px-4 py-4 text-right text-cream-400">
                                {portfolioValue > 0 ? ((row.marketValue / portfolioValue) * 100).toFixed(0) : 0}%
                              </td>
                              <td className="px-4 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/property/${row.propertyId}`)}>
                                    View
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/market?property=${row.propertyId}`)}>
                                    Trade
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => navigate('/lend')}>
                                    Borrow
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/governance?property=${row.propertyId}`)}>
                                    Vote
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-void-900/40">
                            <td className="px-4 py-4 text-cream-100 font-medium">Cash</td>
                            <td className="px-4 py-4" />
                            <td className="px-4 py-4" />
                            <td className="px-4 py-4 text-right text-cream-100">${formatUsd(cashValue)}</td>
                            <td className="px-4 py-4 text-right text-cream-400">—</td>
                            <td className="px-4 py-4 text-right text-cream-400">—</td>
                            <td className="px-4 py-4 text-right text-cream-400">
                              {portfolioValue > 0 ? ((cashValue / portfolioValue) * 100).toFixed(0) : 0}%
                            </td>
                            <td className="px-4 py-4 text-right">
                              <Button variant="outline" size="sm" onClick={() => navigate('/market')}>
                                Trade
                              </Button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {claimError && <p className="text-red-400 text-sm mb-4">{claimError}</p>}
                  {redeemError && <p className="text-red-400 text-sm mb-4">{redeemError}</p>}
                  {refundError && <p className="text-red-400 text-sm mb-4">{refundError}</p>}
                  {!isConnected ? (
                    accountPositions.length > 0 ? null : (
                      <p className="text-cream-400">Connect a wallet to read on-chain balances.</p>
                    )
                  ) : !isFactoryConfigured ? (
                    <p className="text-cream-400">
                      Holdings cannot be read until <span className="font-mono text-cream-200">VITE_PROPERTY_FACTORY_ADDRESS</span> is set.
                    </p>
                  ) : propertiesLoading || listingsLoading || balancesLoading ? (
                    <p className="text-cream-400">Reading balances…</p>
                  ) : holdings.length === 0 ? (
                    accountPositions.length > 0 ? null : (
                      <p className="text-cream-400">
                        No shares in this wallet for the current factory. Buy from a listing, then return here after the transaction confirms.
                      </p>
                    )
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-void-700">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-void-700">
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Property</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Shares</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Listed</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">NAV</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Cost basis</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Rent</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-cream-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-void-700">
                          {holdings.map((p) => (
                            <tr key={p.propertyId} className="hover:bg-void-700/30 transition-colors">
                              <td className="px-6 py-4 text-cream-100 font-medium">{p.propertyName}</td>
                              <td className="px-6 py-4 text-cream-400">{p.tokensOwned}</td>
                              <td className="px-6 py-4 text-cream-400">{p.investmentValue.toLocaleString()} USDC</td>
                              <td className="px-6 py-4 text-accent">{formatUsd(p.navValue)} USDC</td>
                              <td className="px-6 py-4 text-cream-400">
                                {costByPropertyId.has(p.propertyId)
                                  ? `${formatUsd(costByPropertyId.get(p.propertyId) || 0)} USDC`
                                  : '—'}
                              </td>
                              <td className="px-6 py-4 text-cream-100">
                                {p.distributor ? `${formatUnits(p.pendingUsdc, 6)} USDC` : '—'}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  {refundableById.get(p.propertyId) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={refundingId === p.propertyId}
                                      onClick={() => handleRefund(p.propertyId, p.offering)}
                                    >
                                      {refundingId === p.propertyId ? 'Refunding…' : 'Refund'}
                                    </Button>
                                  )}
                                  {p.distributor && p.pendingUsdc > 0n && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={claimingId === p.propertyId}
                                      onClick={() => handleClaim(p.propertyId, p.distributor!)}
                                    >
                                      {claimingId === p.propertyId ? 'Claiming…' : 'Claim'}
                                    </Button>
                                  )}
                                  {p.redemption &&
                                    exitOpenedById.get(p.propertyId) &&
                                    p.tokensOwned > 0 && (
                                      <Button
                                        size="sm"
                                        disabled={redeemingId === p.propertyId}
                                        onClick={() => handleRedeem(p.propertyId, p.redemption!, p.tokensOwned)}
                                      >
                                        {redeemingId === p.propertyId
                                          ? 'Redeeming…'
                                          : `Redeem${
                                              typeof quoteByPropertyId.get(p.propertyId) === 'bigint'
                                                ? ` ${formatUnits(quoteByPropertyId.get(p.propertyId) as bigint, 6)} USDC`
                                                : ''
                                            }`}
                                      </Button>
                                    )}
                                  {p.tokensOwned > 0 && !p.redemption && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!isMarketConfigured}
                                        onClick={() =>
                                          setListTarget({
                                            propertyId: p.propertyId,
                                            propertyTitle: p.propertyName,
                                            token: p.token,
                                            maxShares: p.tokensOwned,
                                            defaultPriceUsdc: p.sharePrice,
                                          })
                                        }
                                      >
                                        List
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                          setTransferTarget({
                                            propertyTitle: p.propertyName,
                                            token: p.token,
                                            maxShares: p.tokensOwned,
                                          })
                                        }
                                      >
                                        Send
                                      </Button>
                                    </>
                                  )}
                                  {p.redemption && !exitOpenedById.get(p.propertyId) && p.tokensOwned > 0 && (
                                    <span className="text-cream-400 text-xs self-center">Exit frozen</span>
                                  )}
                                  <Button variant="outline" size="sm" onClick={() => navigate(`/property/${p.propertyId}`)}>
                                    View
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'optimize' && (
                <OptimizeChannel
                  holdings={financeRows.map((row) => ({
                    propertyId: row.propertyId,
                    title: row.title,
                    marketValue: row.marketValue,
                    yieldRate: row.yieldRate,
                  }))}
                  cash={cashValue}
                  onTrade={(propertyId) => navigate(`/market?property=${propertyId}`)}
                />
              )}
              {activeTab === 'transactions' && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
                    <div>
                      <h3 className="font-display text-lg font-semibold text-cream-100 mb-2">Transaction history</h3>
                      <p className="text-cream-400 text-sm max-w-2xl">
                        Buys, sells, open orders, and cancels from the exchange. On-chain claims and redemptions appear
                        after Sync activity, which reads the local RPC. The CSV is a demo worksheet, not a K-1 or 1099.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={syncingActivity || !user?.walletAddress}
                        onClick={async () => {
                          setSyncingActivity(true);
                          setTaxError('');
                          try {
                            await syncActivityIndex();
                          } catch (err) {
                            setTaxError(err instanceof Error ? err.message : 'Sync failed.');
                          } finally {
                            setSyncingActivity(false);
                          }
                        }}
                      >
                        {syncingActivity ? 'Syncing…' : 'Sync activity'}
                      </Button>
                      <input
                        className="w-24 bg-void-700 border border-void-600 text-cream-100 rounded-lg py-1.5 px-3 text-sm"
                        type="number"
                        min={2020}
                        max={2100}
                        value={taxYear}
                        onChange={(e) => setTaxYear(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!user?.walletAddress}
                        onClick={async () => {
                          setTaxError('');
                          try {
                            await downloadTaxCsv(Number(taxYear) || new Date().getUTCFullYear());
                          } catch (err) {
                            setTaxError(err instanceof Error ? err.message : 'Export failed.');
                          }
                        }}
                      >
                        Export tax CSV
                      </Button>
                    </div>
                  </div>
                  {activity?.lastSyncAt && (
                    <p className="text-cream-400 text-xs mb-3">Last sync {activity.lastSyncAt}</p>
                  )}
                  {taxError && <p className="text-red-400 text-sm mb-3">{taxError}</p>}
                  {(() => {
                    const marketRows = [
                      ...(accountBook?.fills || []).map((fill) => ({
                        id: fill.id,
                        at: fill.at,
                        type: fill.side === 'sell' ? 'Sell' : 'Buy',
                        title: fill.title,
                        shares: String(fill.shares),
                        usdc: fill.price * fill.shares,
                        status: 'Filled',
                      })),
                      ...(accountBook?.orders || []).map((order) => ({
                        id: order.id,
                        at: order.createdAt,
                        type: order.side === 'ask' ? 'Sell' : 'Buy',
                        title: order.title,
                        shares: String(order.amount ?? order.shares),
                        usdc: (order.amount ?? order.shares) * order.price,
                        status: 'Open',
                      })),
                      ...(accountBook?.orderHistory || [])
                        .filter((order) => order.status === 'cancelled')
                        .map((order) => ({
                          id: order.id,
                          at: order.createdAt,
                          type: order.side === 'ask' ? 'Sell' : 'Buy',
                          title: order.title,
                          shares: String(order.amount ?? order.shares),
                          usdc: (order.amount ?? order.shares) * order.price,
                          status: 'Canceled',
                        })),
                    ].sort((a, b) => b.at.localeCompare(a.at));
                    const chainEvents = activity?.events || [];
                    if (!marketRows.length && !chainEvents.length) {
                      return (
                        <p className="text-cream-400">
                          No transactions yet. A buy or sell on the exchange is listed here.
                        </p>
                      );
                    }
                    return (
                    <div className="overflow-x-auto rounded-xl border border-void-700">
                      <table className="min-w-full">
                        <thead>
                          <tr className="border-b border-void-700">
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">When</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Property</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Shares</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">USDC</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-cream-400 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-void-700">
                          {marketRows.map((row) => (
                            <tr key={row.id} className="hover:bg-void-700/30 transition-colors">
                              <td className="px-6 py-4 text-cream-400 text-sm whitespace-nowrap">{row.at.slice(0, 16).replace('T', ' ')}</td>
                              <td className="px-6 py-4 text-cream-100 text-sm">{row.type}</td>
                              <td className="px-6 py-4 text-cream-400 text-sm">{row.title}</td>
                              <td className="px-6 py-4 text-cream-400 text-sm">{row.shares}</td>
                              <td className="px-6 py-4 text-cream-100 text-sm">{formatUsd(row.usdc)}</td>
                              <td className="px-6 py-4 text-cream-300 text-sm">{row.status}</td>
                            </tr>
                          ))}
                          {chainEvents
                            .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
                            .map((event) => (
                              <tr key={event.id} className="hover:bg-void-700/30 transition-colors">
                                <td className="px-6 py-4 text-cream-400 text-sm whitespace-nowrap">
                                  {event.timestamp
                                    ? new Date(event.timestamp * 1000).toISOString().slice(0, 10)
                                    : `block ${event.blockNumber}`}
                                </td>
                                <td className="px-6 py-4 text-cream-100 text-sm">{event.type.replace(/_/g, ' ')}</td>
                                <td className="px-6 py-4 text-cream-400 text-sm">
                                  {activity?.holdings.find((h) => h.propertyId === event.propertyId)?.propertyTitle ||
                                    event.propertyId}
                                </td>
                                <td className="px-6 py-4 text-cream-400 text-sm">{event.shares}</td>
                                <td className="px-6 py-4 text-cream-100 text-sm">
                                  {formatUnits(BigInt(event.usdc || '0'), 6)}
                                </td>
                                <td className="px-6 py-4 text-cream-300 text-sm">On-chain</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    );
                  })()}
                </div>
              )}
              {activeTab === 'settings' && (
                <div>
                  <h3 className="font-display text-lg font-semibold text-cream-100 mb-6">Account settings</h3>
                  <div className="space-y-6 max-w-lg">
                    <div>
                      <h4 className="text-cream-100 font-medium mb-2">Profile photo</h4>
                      <div className="flex items-center gap-4">
                        {user?.avatarUrl ? (
                          <img src={mediaUrl(user.avatarUrl)} alt="" className="h-16 w-16 rounded-full object-cover border border-void-600" />
                        ) : (
                          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-void-950 text-lg font-semibold">
                            {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div>
                          <label className="inline-flex items-center px-3 py-1.5 rounded-lg border border-void-500 text-sm text-cream-200 cursor-pointer hover:border-accent/50">
                            {photoBusy ? 'Uploading…' : 'Upload image'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              className="sr-only"
                              disabled={photoBusy}
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (!file) return;
                                if (file.size > 1_500_000) {
                                  setPhotoError('Image must be 1.5 MB or smaller.');
                                  return;
                                }
                                setPhotoError('');
                                setPhotoBusy(true);
                                try {
                                  const data = await new Promise<string>((resolve, reject) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(String(reader.result || ''));
                                    reader.onerror = () => reject(new Error('Could not read that image.'));
                                    reader.readAsDataURL(file);
                                  });
                                  await uploadAvatar({ data, filename: file.name });
                                  await refreshUser();
                                } catch (err) {
                                  setPhotoError(err instanceof Error ? err.message : 'Could not save that image.');
                                } finally {
                                  setPhotoBusy(false);
                                }
                              }}
                            />
                          </label>
                          <p className="text-cream-400 text-xs mt-2">JPEG, PNG, WebP, or GIF. Shown on the top bar.</p>
                          {photoError && <p className="text-red-400 text-sm mt-2">{photoError}</p>}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-cream-100 font-medium mb-2">Verification</h4>
                      <div className="flex items-center gap-3 mb-3">
                        <Badge color={kycColor}>{user?.kycStatus || 'unverified'}</Badge>
                        {user?.accredited && <Badge color="green">Accredited attestation</Badge>}
                      </div>
                      {user?.kycStatus !== 'approved' && (
                        <Button variant="outline" size="sm" onClick={() => navigate('/kyc')}>
                          {user?.kycStatus === 'pending' ? 'View status' : 'Start verification'}
                        </Button>
                      )}
                    </div>
                    <div>
                      <h4 className="text-cream-100 font-medium mb-2">USDC</h4>
                      <p className="text-cream-400 text-sm mb-3">
                        Demo faucet mints MockUSDC after KYC. Optional MoonPay when a publishable key is set. Not a bank.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => setOnrampOpen(true)}>
                        Get USDC
                      </Button>
                    </div>
                    <div>
                      <h4 className="text-cream-100 font-medium mb-2">Linked wallet</h4>
                      <p className="text-cream-100 text-sm font-mono mb-3 break-all">
                        {user?.walletAddress || 'No wallet linked yet'}
                      </p>
                      {address && user?.walletAddress && address.toLowerCase() !== user.walletAddress.toLowerCase() && (
                        <p className="text-amber-200 text-sm mb-3">
                          Connected wallet does not match the linked account wallet.
                        </p>
                      )}
                      {walletError && <p className="text-red-400 text-sm mb-3">{walletError}</p>}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!address || linking}
                        onClick={handleLinkWallet}
                      >
                        {linking ? 'Linking…' : user?.walletAddress ? 'Update linked wallet' : 'Link connected wallet'}
                      </Button>
                    </div>
                    <div>
                      <h4 className="text-cream-100 font-medium mb-2">Connected wallet</h4>
                      <div className="p-4 rounded-xl bg-void-700/50 border border-void-600">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="text-cream-100 font-medium">Wallet</div>
                            <div className="text-cream-100 text-sm font-mono truncate" title={address || undefined}>
                              {address || 'Not connected'}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <ConnectWalletButton showBalance={false} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
      <ListSharesModal
        isOpen={Boolean(listTarget)}
        propertyId={listTarget?.propertyId || ''}
        propertyTitle={listTarget?.propertyTitle || ''}
        token={listTarget?.token || null}
        maxShares={listTarget?.maxShares || 0}
        defaultPriceUsdc={listTarget?.defaultPriceUsdc || 0}
        onClose={() => setListTarget(null)}
        onListed={async () => {
          setListTarget(null);
          await refetchBalances();
          try {
            await syncActivityIndex();
          } catch {
            // ignore
          }
          navigate('/market');
        }}
      />
      <TransferSharesModal
        isOpen={Boolean(transferTarget)}
        propertyTitle={transferTarget?.propertyTitle || ''}
        token={transferTarget?.token || null}
        maxShares={transferTarget?.maxShares || 0}
        onClose={() => setTransferTarget(null)}
        onSent={async () => {
          setTransferTarget(null);
          await refetchBalances();
          await refetchPending();
          try {
            await syncActivityIndex();
          } catch {
            // ignore
          }
        }}
      />
      <OnrampModal isOpen={onrampOpen} onClose={() => setOnrampOpen(false)} />
    </div>
  );
}
