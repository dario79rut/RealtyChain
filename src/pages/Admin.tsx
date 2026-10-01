import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BanknoteIcon, Building2Icon, CoinsIcon, HandCoinsIcon, KeyRoundIcon, LandmarkIcon, LineChartIcon, ShieldIcon, UsersIcon, type LucideIcon } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { useProperties } from '../hooks/useProperties';
import { AdminAccount, AdminDesk, AdminPoint, adminAction, fetchAdmin } from '../utils/api';
import { DocumentVaultModal } from '../components/modals/DocumentVaultModal';
import { GrowthChart } from '../components/admin/GrowthChart';
import { PropertyThumb } from '../components/ui/PropertyThumb';
import { formatUsd } from '../utils/ops';

const SECTIONS = ['dashboard', 'properties', 'tokens', 'owners', 'investors', 'market', 'lending', 'distributions', 'financials', 'compliance'] as const;

const STAGES = ['draft', 'review', 'approved', 'tokenized', 'funded', 'active'];
const fieldClass = 'mt-1 w-full bg-void-700 border border-void-600 rounded-xl px-3 py-2 text-cream-100 text-sm';

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function stageColor(stage: string): 'green' | 'yellow' | 'red' | 'accent' | 'blue' {
  if (stage === 'active' || stage === 'funded') return 'green';
  if (stage === 'review' || stage === 'draft') return 'yellow';
  if (stage === 'tokenized' || stage === 'approved') return 'blue';
  return 'accent';
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: catalog = [] } = useProperties();
  const isAdmin = user?.role === 'admin';
  const { data: desk, isLoading } = useQuery({
    queryKey: ['admin-desk'],
    queryFn: fetchAdmin,
    enabled: isAdmin,
  });
  const [params, setParams] = useSearchParams();
  const requested = params.get('section');
  const section = (SECTIONS as readonly string[]).includes(requested || '') ? (requested as (typeof SECTIONS)[number]) : 'dashboard';
  const setSection = (id: (typeof SECTIONS)[number]) => {
    if (id === 'dashboard') setParams({});
    else setParams({ section: id });
  };
  const [propertyId, setPropertyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: '', location: '', description: '' });
  const [valuation, setValuation] = useState('');
  const [token, setToken] = useState({ supply: '', price: '', ownerPercent: '30' });
  const [mintShares, setMintShares] = useState('100');
  const [feeBps, setFeeBps] = useState('100');

  const selected = desk?.properties.find((row) => row.id === propertyId) || desk?.properties[0] || null;

  useEffect(() => {
    if (!propertyId && desk?.properties[0]) setPropertyId(desk.properties[0].id);
  }, [desk, propertyId]);

  useEffect(() => {
    if (!selected) return;
    setEdit({ title: selected.title, location: selected.location, description: selected.description });
    setValuation(String(selected.valuationUsd || ''));
    setToken({
      supply: String(selected.token.totalSupply || ''),
      price: String(selected.token.price || ''),
      ownerPercent: String(selected.token.ownerPercent ?? 30),
    });
    setFeeBps(String(selected.feeBps || 0));
  }, [selected?.id]);

  const run = async (key: string, payload: Record<string, unknown>, message: string) => {
    setError('');
    setNotice('');
    setBusy(key);
    try {
      const next = await adminAction(payload);
      queryClient.setQueryData(['admin-desk'], next);
      setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center px-4">
        <div className="text-center max-w-md w-full p-10 rounded-2xl border border-void-700 bg-void-800/80">
          <ShieldIcon size={32} className="text-accent mx-auto mb-4" />
          <h2 className="font-display text-2xl font-semibold text-cream-100 mb-3">Admin access required</h2>
          <Button onClick={() => navigate('/home')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {notice && <p className="text-emerald-300 text-sm mb-3">{notice}</p>}
        <div>
          <div className="min-w-0">
            {isLoading || !desk ? (
              <p className="text-cream-400">Loading the console…</p>
            ) : section === 'dashboard' ? (
              <Dashboard desk={desk} onOpen={setSection} />
            ) : (
              <Console
                section={section}
                desk={desk}
                selectedId={selected?.id || ''}
                onSelect={setPropertyId}
                edit={edit}
                setEdit={setEdit}
                valuation={valuation}
                setValuation={setValuation}
                token={token}
                setToken={setToken}
                mintShares={mintShares}
                setMintShares={setMintShares}
                feeBps={feeBps}
                setFeeBps={setFeeBps}
                busy={busy}
                run={run}
                onDocs={setVaultId}
              />
            )}
          </div>
        </div>
      </div>
      <DocumentVaultModal
        isOpen={Boolean(vaultId)}
        property={catalog.find((row) => row.id === vaultId) || null}
        onClose={() => setVaultId(null)}
        onUpdated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['admin-desk'] });
          await queryClient.invalidateQueries({ queryKey: ['properties'] });
        }}
      />
    </div>
  );
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function changeLabel(points: AdminPoint[]) {
  if (points.length < 2 || points[0].value === 0) return null;
  const delta = ((points[points.length - 1].value - points[0].value) / Math.abs(points[0].value)) * 100;
  return { text: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, up: delta >= 0 };
}

function Dashboard({ desk, onOpen }: { desk: AdminDesk; onOpen: (id: (typeof SECTIONS)[number]) => void }) {
  const rent = sum(desk.properties.map((row) => row.flow.rent));
  const expenses = sum(desk.properties.map((row) => row.flow.expenses));
  const fees = sum(desk.properties.map((row) => row.flow.fee));
  const net = sum(desk.properties.map((row) => row.flow.net));
  const investorShare = sum(desk.properties.map((row) => row.flow.investor));
  const ownerShare = sum(desk.properties.map((row) => row.flow.owner));
  const aum = sum(desk.properties.map((row) => row.valuationUsd));
  const debt = sum(desk.lending.loans.map((row) => row.debt));
  const collateral = sum(desk.lending.loans.map((row) => row.collateral));
  const pending = [...desk.investors, ...desk.owners].filter((row) => row.kycStatus === 'pending').length;
  const flagged = [...desk.investors, ...desk.owners].filter((row) => row.suspicious || row.restricted || row.suspended).length;
  const approved = [...desk.investors, ...desk.owners].filter((row) => row.kycStatus === 'approved').length;
  const growth = desk.growth;
  const charts: { title: string; points: AdminPoint[]; kind: 'usd' | 'count' }[] = [
    { title: 'Portfolio value', points: growth.asset, kind: 'usd' },
    { title: 'Sold tokens', points: growth.sold, kind: 'usd' },
    { title: 'Trading volume', points: growth.volume, kind: 'usd' },
    { title: 'Lending capacity', points: growth.capacity, kind: 'usd' },
    { title: 'Accrued net income', points: growth.accrued, kind: 'usd' },
    { title: 'Investors', points: growth.investors, kind: 'count' },
  ];
  const departments: {
    id: (typeof SECTIONS)[number];
    title: string;
    icon: LucideIcon;
    stats: [string, string][];
  }[] = [
    {
      id: 'financials',
      title: 'Financials',
      icon: LandmarkIcon,
      stats: [
        ['Asset value', `$${formatUsd(aum)}`],
        ['Monthly rent', `$${formatUsd(rent)}`],
        ['Expenses', `$${formatUsd(expenses)}`],
        ['Fees', `$${formatUsd(fees)}`],
        ['Net income', `$${formatUsd(net)}`],
      ],
    },
    {
      id: 'properties',
      title: 'Properties',
      icon: Building2Icon,
      stats: [
        ['Listings', String(desk.properties.length)],
        ['In review', String(desk.properties.filter((row) => row.stage === 'review').length)],
        ['Active', String(desk.properties.filter((row) => row.stage === 'active').length)],
        ['Suspended', String(desk.properties.filter((row) => row.suspended).length)],
      ],
    },
    {
      id: 'tokens',
      title: 'Tokens',
      icon: CoinsIcon,
      stats: [
        ['Sold', sum(desk.properties.map((row) => row.tokensSold)).toLocaleString()],
        ['Supply', sum(desk.properties.map((row) => row.totalTokens)).toLocaleString()],
        ['Investor value', `$${formatUsd(growth.sold.at(-1)?.value || 0)}`],
      ],
    },
    {
      id: 'owners',
      title: 'Owners',
      icon: KeyRoundIcon,
      stats: [
        ['Owners', String(desk.owners.length)],
        ['Unverified', String(desk.owners.filter((row) => row.kycStatus !== 'approved').length)],
        ['Distributions', `$${formatUsd(ownerShare)}`],
      ],
    },
    {
      id: 'investors',
      title: 'Investors',
      icon: UsersIcon,
      stats: [
        ['Investors', String(desk.investors.length)],
        ['Pending KYC', String(desk.investors.filter((row) => row.kycStatus === 'pending').length)],
        ['Distributions', `$${formatUsd(investorShare)}`],
      ],
    },
    {
      id: 'market',
      title: 'Market',
      icon: LineChartIcon,
      stats: [
        ['Volume', `$${formatUsd(desk.market.volume)}`],
        ['Open orders', String(desk.market.orders.length)],
        ['Rejected', String(desk.market.failures.length)],
      ],
    },
    {
      id: 'lending',
      title: 'Lending',
      icon: HandCoinsIcon,
      stats: [
        ['Pool', `$${formatUsd(desk.lending.poolUsdc)}`],
        ['Debt', `$${formatUsd(debt)}`],
        ['Collateral', `$${formatUsd(collateral)}`],
        ['Loans', String(desk.lending.loans.length)],
      ],
    },
    {
      id: 'distributions',
      title: 'Distributions',
      icon: BanknoteIcon,
      stats: [
        ['Monthly net', `$${formatUsd(net)}`],
        ['Investors', `$${formatUsd(investorShare)}`],
        ['Owners', `$${formatUsd(ownerShare)}`],
        ['Posted', String(desk.distributions.length)],
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance',
      icon: ShieldIcon,
      stats: [
        ['Approved', String(approved)],
        ['Pending', String(pending)],
        ['Flagged', String(flagged)],
      ],
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-cream-100">Dashboard</h1>
        <p className="text-cream-400 mt-1">Growth for the last 60 sessions, then the current book for each department.</p>
      </div>
      <section className="mb-8">
        <h2 className="font-display text-lg font-semibold text-cream-100 mb-3">Growth</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {charts.map((chart) => {
            const change = changeLabel(chart.points);
            return (
              <div key={chart.title} className="rounded-2xl border border-void-700 bg-void-800/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-medium text-cream-100">{chart.title}</h3>
                  {change && (
                    <span className={`text-xs font-medium ${change.up ? 'text-emerald-300' : 'text-red-300'}`}>{change.text}</span>
                  )}
                </div>
                <GrowthChart points={chart.points} kind={chart.kind} />
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2 className="font-display text-lg font-semibold text-cream-100 mb-3">Departments</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {departments.map((department) => {
            const Icon = department.icon;
            return (
              <button
                key={department.id}
                type="button"
                onClick={() => onOpen(department.id)}
                className="text-left rounded-2xl border border-void-700 bg-void-800/40 p-4 hover:border-accent/40"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <Icon size={16} />
                    </span>
                    <span className="font-medium text-cream-100">{department.title}</span>
                  </div>
                  <span className="text-xs text-accent">Manage</span>
                </div>
                <dl className="space-y-1.5">
                  {department.stats.map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                      <dt className="text-cream-400">{label}</dt>
                      <dd className="text-cream-100 font-medium text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PropertySelect({ desk, value, onChange }: { desk: AdminDesk; value: string; onChange: (id: string) => void }) {
  return (
    <div className="mb-4">
      <p className="text-sm text-cream-400 mb-2">Property</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {desk.properties.map((row) => {
          const active = row.id === value;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onChange(row.id)}
              className={`flex items-center gap-3 text-left rounded-xl border px-3 py-2 ${active ? 'border-accent bg-accent/10' : 'border-void-700 bg-void-800/40 hover:border-void-600'}`}
            >
              <PropertyThumb title={row.title} imageUrl={row.imageUrl} className="h-12 w-16" />
              <span className="text-sm text-cream-100 font-medium min-w-0 truncate">{row.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Console(props: {
  section: string;
  desk: AdminDesk;
  selectedId: string;
  onSelect: (id: string) => void;
  edit: { title: string; location: string; description: string };
  setEdit: (value: { title: string; location: string; description: string }) => void;
  valuation: string;
  setValuation: (value: string) => void;
  token: { supply: string; price: string; ownerPercent: string };
  setToken: (value: { supply: string; price: string; ownerPercent: string }) => void;
  mintShares: string;
  setMintShares: (value: string) => void;
  feeBps: string;
  setFeeBps: (value: string) => void;
  busy: string;
  run: (key: string, payload: Record<string, unknown>, message: string) => Promise<void>;
  onDocs: (id: string) => void;
}) {
  const { section, desk, selectedId, onSelect, run, busy } = props;
  const property = desk.properties.find((row) => row.id === selectedId) || desk.properties[0];
  if (!property) return <p className="text-cream-400">No properties on the platform.</p>;

  if (section === 'properties') {
    return (
      <div>
        <div className="flex items-start gap-4 mb-4">
          <PropertyThumb title={property.title} imageUrl={property.imageUrl} className="h-16 w-24" />
          <div>
            <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">Property management</h2>
            <p className="text-cream-400 text-sm">Draft, review, approved, tokenized, funded, then active. Suspend a listing or open a sale from here.</p>
          </div>
        </div>
        <PropertySelect desk={desk} value={property.id} onChange={onSelect} />
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Badge color={stageColor(property.stage)}>{property.stage}</Badge>
          {property.suspended && <Badge color="red">Suspended</Badge>}
          {property.sale && <Badge color="orange">Sale initiated</Badge>}
          <Badge color={property.ownershipVerified ? 'green' : 'yellow'}>
            {property.ownershipVerified ? 'Ownership verified' : 'Documents unverified'}
          </Badge>
          <span className="text-cream-400 text-sm">{property.ownerName || 'No owner'} · {property.tokensSold}/{property.totalTokens} sold</span>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {STAGES.map((stage) => (
            <Button key={stage} size="sm" variant={property.stage === stage ? 'primary' : 'outline'} disabled={busy === 'stage'} onClick={() => run('stage', { type: 'property-stage', id: property.id, stage }, `Stage set to ${stage}.`)}>
              {stage}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <Button size="sm" variant="outline" onClick={() => run('review', { type: 'property-review', id: property.id, decision: 'approved' }, 'Property approved.')}>Approve</Button>
          <Button size="sm" variant="danger" onClick={() => run('review', { type: 'property-review', id: property.id, decision: 'rejected' }, 'Property returned to draft.')}>Reject</Button>
          <Button size="sm" variant="outline" onClick={() => run('verify', { type: 'property-verify', id: property.id }, 'Ownership documents verified.')}>Verify documents</Button>
          <Button size="sm" variant="outline" onClick={() => props.onDocs(property.id)}>Upload documents</Button>
          <Button size="sm" variant="outline" onClick={() => run('suspend', { type: 'property-suspend', id: property.id, suspended: !property.suspended }, property.suspended ? 'Property restored.' : 'Property suspended.')}>
            {property.suspended ? 'Restore' : 'Freeze'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('sale', { type: 'property-sale', id: property.id, sale: property.sale ? null : 'initiated' }, property.sale ? 'Sale cleared.' : 'Sale initiated.')}>
            {property.sale ? 'Clear sale' : 'Initiate sale'}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); run('value', { type: 'property-valuation', id: property.id, usd: Number(props.valuation) }, 'Valuation saved.'); }}>
            <label className="text-sm text-cream-400">Valuation (USD)
              <input value={props.valuation} onChange={(event) => props.setValuation(event.target.value)} className={fieldClass} />
            </label>
            <Button type="submit" size="sm" disabled={busy === 'value'}>Save valuation</Button>
          </form>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); run('edit', { type: 'property-edit', id: property.id, ...props.edit }, 'Listing updated.'); }}>
            <label className="text-sm text-cream-400">Title
              <input value={props.edit.title} onChange={(event) => props.setEdit({ ...props.edit, title: event.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm text-cream-400">Location
              <input value={props.edit.location} onChange={(event) => props.setEdit({ ...props.edit, location: event.target.value })} className={fieldClass} />
            </label>
            <label className="text-sm text-cream-400">Description
              <textarea value={props.edit.description} onChange={(event) => props.setEdit({ ...props.edit, description: event.target.value })} rows={3} className={fieldClass} />
            </label>
            <Button type="submit" size="sm" disabled={busy === 'edit'}>Save listing</Button>
          </form>
        </div>
        <ul className="mt-4 text-sm text-cream-300 space-y-1">
          {property.documents.length === 0 && <li>No documents on file.</li>}
          {property.documents.map((doc) => (
            <li key={doc.name}>{doc.name}{doc.review ? ` · ${doc.review}` : ''}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (section === 'tokens') {
    return (
      <div>
        <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">Tokenization</h2>
        <p className="text-cream-400 text-sm mb-4">Set supply, price, and the owner’s retained percentage. Minting and burning update the catalog supply. Trading pause and transfer limits apply on the market.</p>
        <PropertySelect desk={desk} value={property.id} onChange={onSelect} />
        <p className="text-cream-300 text-sm mb-4">
          Supply {property.token.totalSupply} · price ${formatUsd(property.token.price)} · owner {property.token.ownerPercent}% · minted {property.token.minted} · burned {property.token.burned}
          {property.token.contract ? ` · ${property.token.contract}` : ' · demo ledger, no contract address yet'}
        </p>
        <form className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4" onSubmit={(event) => { event.preventDefault(); run('token', { type: 'token-set', id: property.id, totalSupply: Number(props.token.supply), price: Number(props.token.price), ownerPercent: Number(props.token.ownerPercent) }, 'Token terms saved.'); }}>
          <label className="text-sm text-cream-400">Total supply
            <input value={props.token.supply} onChange={(event) => props.setToken({ ...props.token, supply: event.target.value })} className={fieldClass} />
          </label>
          <label className="text-sm text-cream-400">Initial price (USDC)
            <input value={props.token.price} onChange={(event) => props.setToken({ ...props.token, price: event.target.value })} className={fieldClass} />
          </label>
          <label className="text-sm text-cream-400">Owner percentage
            <input value={props.token.ownerPercent} onChange={(event) => props.setToken({ ...props.token, ownerPercent: event.target.value })} className={fieldClass} />
          </label>
          <div className="md:col-span-3"><Button type="submit" size="sm" disabled={busy === 'token'}>Save token</Button></div>
        </form>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-cream-400">Shares
            <input value={props.mintShares} onChange={(event) => props.setMintShares(event.target.value)} className={fieldClass} />
          </label>
          <Button size="sm" disabled={busy === 'mint'} onClick={() => run('mint', { type: 'token-mint', id: property.id, shares: Number(props.mintShares) }, 'Tokens minted.')}>Mint</Button>
          <Button size="sm" variant="outline" disabled={busy === 'burn'} onClick={() => run('burn', { type: 'token-burn', id: property.id, shares: Number(props.mintShares) }, 'Tokens burned.')}>Burn</Button>
          <Button size="sm" variant="outline" onClick={() => run('pause', { type: 'token-pause', id: property.id, paused: !property.tradingPaused }, property.tradingPaused ? 'Trading opened.' : 'Trading paused.')}>
            {property.tradingPaused ? 'Resume trading' : 'Pause trading'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => run('restrict', { type: 'token-restrict', id: property.id, restricted: !property.transfersRestricted }, property.transfersRestricted ? 'Transfers opened.' : 'Transfers restricted.')}>
            {property.transfersRestricted ? 'Allow transfers' : 'Restrict transfers'}
          </Button>
        </div>
      </div>
    );
  }

  if (section === 'owners') return <Accounts title="Owner management" copy="Onboarding, identity, ownership, wallet, listings, and payouts." rows={desk.owners} desk={desk} run={run} busy={busy} kind="owner" />;
  if (section === 'investors') return <Accounts title="Investor management" copy="Identity, accreditation, wallets, holdings, cash, and restrictions." rows={desk.investors} desk={desk} run={run} busy={busy} kind="investor" />;

  if (section === 'market') {
    return (
      <div>
        <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">Marketplace</h2>
        <p className="text-cream-400 text-sm mb-4">Open orders, prints, volume, rejected orders, and the per-property trading fee.</p>
        <p className="text-cream-100 mb-4">Volume ${formatUsd(desk.market.volume)}</p>
        <PropertySelect desk={desk} value={property.id} onChange={onSelect} />
        <form className="flex items-end gap-2 mb-6" onSubmit={(event) => { event.preventDefault(); run('fee', { type: 'market-fee', id: property.id, feeBps: Number(props.feeBps) }, 'Fee updated.'); }}>
          <label className="text-sm text-cream-400">Fee (bps)
            <input value={props.feeBps} onChange={(event) => props.setFeeBps(event.target.value)} className={fieldClass} />
          </label>
          <Button type="submit" size="sm">Save fee</Button>
          <span className="text-cream-400 text-sm pb-2">{property.tradingPaused ? 'Trading paused' : 'Trading open'}</span>
        </form>
        <h3 className="text-cream-100 font-medium mb-2">Open orders</h3>
        <SimpleTable
          empty="No open orders."
          rows={desk.market.orders.map((order) => [order.id, titleOf(desk, order.propertyId), order.side, `$${formatUsd(order.price)}`, String(order.shares)])}
          headers={['Order', 'Property', 'Side', 'Price', 'Shares']}
        />
        <h3 className="text-cream-100 font-medium mt-6 mb-2">Trades</h3>
        <SimpleTable
          empty="No trades yet."
          rows={desk.market.trades.map((trade) => [trade.at.slice(0, 16).replace('T', ' '), titleOf(desk, trade.propertyId), `$${formatUsd(trade.price)}`, String(trade.shares)])}
          headers={['Time', 'Property', 'Price', 'Shares']}
        />
        <h3 className="text-cream-100 font-medium mt-6 mb-2">Failed orders</h3>
        <SimpleTable
          empty="No rejected orders."
          rows={desk.market.failures.map((row) => [row.at.slice(0, 16).replace('T', ' '), row.propertyId || '—', row.error])}
          headers={['Time', 'Property', 'Reason']}
        />
      </div>
    );
  }

  if (section === 'lending') {
    const loans = desk.lending.loans;
    return (
      <div>
        <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">DeFi lending</h2>
        <p className="text-cream-400 text-sm mb-4">
          Max LTV {pct(desk.lending.maxLtv)} · liquidation {pct(desk.lending.liquidationLtv)} · borrow {pct(desk.lending.borrowApr)} · supply {pct(desk.lending.supplyApr)} · pool ${formatUsd(desk.lending.poolUsdc)}
        </p>
        <SimpleTable
          empty="No open loans."
          headers={['Borrower', 'Debt', 'Interest', 'Collateral', 'LTV', 'Health']}
          rows={loans.map((loan) => [loan.borrower, `$${formatUsd(loan.debt)}`, `$${formatUsd(loan.interest)}`, `$${formatUsd(loan.collateral)}`, pct(loan.ltv), loan.health])}
        />
        <p className="text-cream-400 text-sm mt-4">
          Margin is a loan between 50% and 65% LTV. At 65% another account can liquidate it from the Lend page. Repayments return to the pool. Bad debt appears when collateral no longer covers the balance.
        </p>
        <ul className="mt-3 text-sm text-cream-300">
          {loans.filter((loan) => loan.collateral < loan.debt).map((loan) => (
            <li key={loan.id}>{loan.borrower} is undercollateralized by ${formatUsd(loan.debt - loan.collateral)}.</li>
          ))}
          {loans.every((loan) => loan.collateral >= loan.debt) && <li>No bad debt.</li>}
        </ul>
      </div>
    );
  }

  if (section === 'distributions' || section === 'financials') {
    const flow = property.flow;
    return (
      <div>
        <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">
          {section === 'financials' ? 'Property financials' : 'Rental distributions'}
        </h2>
        <PropertySelect desk={desk} value={property.id} onChange={onSelect} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-sm">
          {[
            ['Monthly rent', flow.rent],
            ['Property expenses', flow.expenses],
            ['Management fee', flow.fee],
            ['Net income', flow.net],
            ['Investor distribution', flow.investor],
            ['Owner distribution', flow.owner],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-void-700 p-3">
              <div className="text-cream-400 text-xs">{label}</div>
              <div className="text-cream-100 font-medium">${formatUsd(Number(value))}</div>
            </div>
          ))}
        </div>
        <p className="text-cream-400 text-sm mb-4">Owner retains {flow.ownerPercent}% of net income. The rest is the investor distribution.</p>
        {section === 'distributions' && (
          <>
            <Button size="sm" disabled={busy === 'dist'} onClick={() => run('dist', { type: 'distribution-run', id: property.id }, 'Distribution posted.')}>Post distribution</Button>
            <div className="mt-4">
              <SimpleTable
                empty="No distributions posted."
                headers={['When', 'Property', 'Net', 'Investors', 'Owner', 'Status']}
                rows={desk.distributions.map((row) => [row.at.slice(0, 10), row.title, `$${formatUsd(row.net)}`, `$${formatUsd(row.investor)}`, `$${formatUsd(row.owner)}`, row.status])}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  const flagged = [...desk.investors, ...desk.owners].filter((row) => row.suspicious || row.restricted || !row.screenedAt || row.kycStatus !== 'approved');
  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">Compliance</h2>
      <p className="text-cream-400 text-sm mb-4">Identity status, screening marks, restrictions, and the admin audit trail. Screening here is a platform record, not a licensed AML vendor.</p>
      <SimpleTable
        empty="No accounts need attention."
        headers={['Account', 'Role', 'KYC', 'Country', 'Screened', 'Flags']}
        rows={flagged.map((row) => [
          row.email,
          row.role === 'owner' ? 'Owner' : 'Investor',
          row.kycStatus,
          row.country || '—',
          row.screenedAt ? row.screenedAt.slice(0, 10) : 'Not screened',
          [row.suspicious ? 'suspicious' : '', row.restricted ? 'restricted' : '', row.suspended ? 'suspended' : ''].filter(Boolean).join(', ') || '—',
        ])}
      />
      <h3 className="text-cream-100 font-medium mt-6 mb-2">Audit trail</h3>
      <SimpleTable
        empty="No admin actions yet."
        headers={['When', 'Action', 'Target', 'Detail']}
        rows={desk.audit.map((row) => [row.at.slice(0, 16).replace('T', ' '), row.action, row.target || '—', row.detail])}
      />
    </div>
  );
}

function Accounts({ title, copy, rows, desk, run, busy, kind }: {
  title: string;
  copy: string;
  rows: AdminAccount[];
  desk: AdminDesk;
  run: (key: string, payload: Record<string, unknown>, message: string) => Promise<void>;
  busy: string;
  kind: 'owner' | 'investor';
}) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold text-cream-100 mb-1">{title}</h2>
      <p className="text-cream-400 text-sm mb-4">{copy}</p>
      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-void-700 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-cream-100 font-medium">{row.name || row.email}</span>
              <Badge color={row.kycStatus === 'approved' ? 'green' : row.kycStatus === 'rejected' ? 'red' : 'yellow'}>{row.kycStatus}</Badge>
              {row.accredited && <Badge color="blue">Accredited</Badge>}
              {row.suspended && <Badge color="red">Suspended</Badge>}
              {row.restricted && <Badge color="orange">Restricted</Badge>}
              {row.suspicious && <Badge color="yellow">Suspicious</Badge>}
            </div>
            <p className="text-cream-400 text-sm mt-1">{row.email} · {row.country || 'No country'} · {row.walletAddress || 'No wallet'}</p>
            <p className="text-cream-300 text-sm mt-1">Cash ${formatUsd(row.cashUsdc)} · {row.holdings.map((holding) => `${holding.shares} ${holding.title}`).join(', ') || 'No tokens'}</p>
            {kind === 'owner' && (
              <p className="text-cream-300 text-sm">Listings: {row.properties.map((item) => item.title).join(', ') || 'None'}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {row.kycStatus === 'pending' && (
                <>
                  <Button size="sm" variant="outline" disabled={busy === `kyc-${row.id}`} onClick={() => run(`kyc-${row.id}`, { type: 'account-kyc', id: row.id, decision: 'approved' }, 'Application approved.')}>Approve KYC</Button>
                  <Button size="sm" variant="danger" disabled={busy === `kyc-${row.id}`} onClick={() => run(`kyc-${row.id}`, { type: 'account-kyc', id: row.id, decision: 'rejected', note: 'Incomplete application.' }, 'Application rejected.')}>Reject</Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => run(`sus-${row.id}`, { type: 'account-suspend', id: row.id, suspended: !row.suspended }, row.suspended ? 'Account restored.' : 'Account suspended.')}>
                {row.suspended ? 'Restore' : 'Suspend'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(`flag-${row.id}`, { type: 'account-flag', id: row.id, suspicious: !row.suspicious, restricted: row.restricted }, row.suspicious ? 'Flag cleared.' : 'Marked suspicious.')}>
                {row.suspicious ? 'Clear flag' : 'Flag'}
              </Button>
              {kind === 'investor' && (
                <Button size="sm" variant="outline" onClick={() => run(`rest-${row.id}`, { type: 'account-flag', id: row.id, suspicious: row.suspicious, restricted: !row.restricted }, row.restricted ? 'Restriction lifted.' : 'Account restricted.')}>
                  {row.restricted ? 'Lift restriction' : 'Restrict'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => run(`screen-${row.id}`, { type: 'account-screen', id: row.id }, 'Screening recorded.')}>
                {row.screenedAt ? 'Screened' : 'Mark screened'}
              </Button>
            </div>
            {kind === 'owner' && (
              <p className="text-cream-400 text-xs mt-2">
                Payouts: {desk.distributions.filter((item) => row.properties.some((owned) => owned.title === item.title)).map((item) => `$${formatUsd(item.owner)} on ${item.at.slice(0, 10)}`).join(' · ') || 'None posted'}
              </p>
            )}
          </article>
        ))}
        {rows.length === 0 && <p className="text-cream-400 text-sm">No accounts.</p>}
      </div>
    </div>
  );
}

function titleOf(desk: AdminDesk, id: string) {
  return desk.properties.find((row) => row.id === id)?.title || id;
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-cream-400 text-sm">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-void-700">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-void-700">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-left text-xs font-medium text-cream-400 uppercase">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-void-700">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 text-cream-200">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
