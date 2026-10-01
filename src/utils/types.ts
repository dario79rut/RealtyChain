export type Property = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  location: string;
  price: number;
  tokenPrice: number;
  totalTokens: number;
  tokensSold: number;
  status: 'Available' | 'Sold Out' | 'Coming Soon';
  features: string[];
  documents: {
    name: string;
    url: string;
    kind?: string;
    review?: string;
  }[];
  documentStatus?: 'unverified' | 'verified';
  projectProgress?: number;
  progressLog?: {
    at: string;
    percent: number;
    note: string;
  }[];
  contractAddress?: string;
  offeringAddress?: string;
  tokenAddress?: string;
  sharePriceUsdc?: number;
  returnRate?: number;
  ownerId?: number | null;
  occupancyPercent?: number | null;
  capRate?: number | null;
  rentRollExcerpt?: string;
  galleryUrls?: string[];
  mapUrl?: string;
  lat?: number | null;
  lng?: number | null;
  unitMix?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  interiors?: {
    name: string;
    detail: string;
    imageUrl: string;
  }[];
  comps?: {
    address: string;
    soldDate: string;
    priceUsd: number;
    sqft?: number | null;
    note?: string;
  }[];
  distributorAddress?: string;
  redemptionAddress?: string;
  grossRentMonthly?: number | null;
  opexMonthly?: number | null;
  reservesMonthly?: number | null;
  nextAppraisalAt?: string;
  appraisals?: {
    date: string;
    valueUsd: number;
    note?: string;
  }[];
  offering?: OwnerOffering | null;
};

export type OwnerOffering = {
  name: string;
  address: string;
  propertyType: string;
  purchasePrice: number;
  valuation: number;
  units: number;
  occupancy: number;
  monthlyRent: number;
  financials: {
    annualRevenue: number;
    operatingExpenses: number;
    mortgage: number;
    propertyTax: number;
    insurance: number;
    noi: number;
  };
  ownership: { ownerPercent: number; offeredPercent: number; structure: string };
  campaign: {
    target: number;
    minimum: number;
    deadline: string;
    structure: string;
    expectedDistributions: string;
    useOfFunds: string;
    projections: string;
    raised: number;
    status: 'open' | 'funded';
  } | null;
  tokenization: {
    propertyValue: number;
    ownerPercent: number;
    offeredPercent: number;
    target: number;
    supply: number;
    price: number;
    status: 'live';
  } | null;
  financing: {
    collateralValue: number;
    outstanding: number;
    apr: number;
    termMonths: number;
    monthlyPayment: number;
    maxLtv: number;
    status: 'none' | 'offered' | 'active';
    offer: {
      amount: number;
      apr: number;
      termMonths: number;
      monthlyPayment: number;
      ltv: number;
    } | null;
  };
};

export type ActivityLot = {
  propertyId: string;
  shares: number;
  costUsdc: number;
  rentClaimedUsdc: number;
};

export type UserPortfolio = {
  totalInvested: number;
  totalProperties: number;
  properties: {
    propertyId: string;
    propertyName: string;
    tokensOwned: number;
    investmentValue: number;
    costBasisUsdc?: number;
  }[];
};
