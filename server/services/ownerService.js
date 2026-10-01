const persistence = require('../mock/persistence');
const propertyService = require('./propertyService');
const vault = require('./vaultService');
const images = require('./imageService');

const STATUSES = new Set(['Available', 'Sold Out', 'Coming Soon']);
const REQUIRED = [
  { kind: 'deed', label: 'Deed' },
  { kind: 'appraisal', label: 'Appraisal' },
  { kind: 'inspection', label: 'Inspection' },
  { kind: 'insurance', label: 'Insurance' },
  { kind: 'tax', label: 'Tax documents' },
];
const PROPERTY_TYPES = new Set(['Multifamily', 'Duplex', 'Condo', 'Single family', 'Retail', 'Office', 'Industrial', 'Mixed use']);
const FINANCE_LTV = 0.6;
const FINANCE_APR = 0.09;
const FINANCE_MONTHS = 360;

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function ownerAccount(userId) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (user.role !== 'owner') fail('Property owner access required.', 403);
  return user;
}

function ownedProperty(user, id) {
  const property = propertyService.getById(id);
  if (!property || String(property.ownerId) !== String(user.id)) fail('Property not found.', 404);
  return property;
}

function money(value) {
  return Math.round(Number(value) * 100) / 100;
}

function amount(value, label, min, max = Number.POSITIVE_INFINITY) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    fail(max === Number.POSITIVE_INFINITY ? `${label} must be at least ${min}.` : `${label} must be between ${min} and ${max}.`, 400);
  }
  return money(n);
}

function note(value, label, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) fail(`${label} must be ${min}–${max} characters.`, 400);
  return text;
}

function paymentFor(principal) {
  if (!(principal > 0)) return 0;
  const monthly = FINANCE_APR / 12;
  const factor = (1 + monthly) ** FINANCE_MONTHS;
  return money((principal * monthly * factor) / (factor - 1));
}

function emptyFinance(collateral) {
  return {
    collateralValue: money(collateral || 0),
    outstanding: 0,
    apr: FINANCE_APR,
    termMonths: FINANCE_MONTHS,
    monthlyPayment: 0,
    maxLtv: FINANCE_LTV,
    status: 'none',
    offer: null,
  };
}

function financialsOf(source) {
  const annualRevenue = amount(source.annualRevenue, 'Annual revenue', 0);
  const operatingExpenses = amount(source.operatingExpenses, 'Operating expenses', 0);
  const mortgage = amount(source.mortgage, 'Mortgage', 0);
  const propertyTax = amount(source.propertyTax, 'Property tax', 0);
  const insurance = amount(source.insurance, 'Insurance', 0);
  return {
    annualRevenue,
    operatingExpenses,
    mortgage,
    propertyTax,
    insurance,
    noi: money(Math.max(0, annualRevenue - operatingExpenses - propertyTax - insurance)),
  };
}

function campaignOf(source) {
  if (!source) return null;
  const target = amount(source.target, 'Funding target', 1000);
  const minimum = amount(source.minimum, 'Minimum investment', 1, target);
  const deadline = String(source.deadline || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) fail('Funding deadline must be a date.', 400);
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) fail('Funding deadline must be today or later.', 400);
  return {
    target,
    minimum,
    deadline,
    structure: note(source.structure, 'Ownership structure', 8, 400),
    expectedDistributions: note(source.expectedDistributions, 'Expected distributions', 8, 400),
    useOfFunds: note(source.useOfFunds, 'Use of funds', 8, 800),
    projections: note(source.projections, 'Financial projections', 8, 800),
    raised: 0,
    status: 'open',
    pledges: [],
  };
}

function tokenizationOf(source, valuation) {
  if (!source) return null;
  const propertyValue = amount(source.propertyValue == null ? valuation : source.propertyValue, 'Property value', 1);
  const ownerPercent = amount(source.ownerPercent, 'Owner share', 0, 100);
  const offeredPercent = money(100 - ownerPercent);
  if (offeredPercent <= 0) fail('Offer at least part of the property to investors.', 400);
  const target = money(propertyValue * offeredPercent / 100);
  const price = amount(source.price, 'Token price', 0.01);
  const supply = Math.round(target / price);
  if (supply < 1) fail('Token price is higher than the amount offered to investors.', 400);
  return {
    propertyValue,
    ownerPercent,
    offeredPercent,
    target,
    supply,
    price,
    status: 'live',
  };
}

function offeringFrom(input) {
  const source = input && typeof input === 'object' ? input : {};
  const name = note(source.name, 'Property name', 2, 160);
  const address = note(source.address, 'Address', 4, 160);
  const description = note(source.description, 'Description', 20, 4000);
  const propertyType = String(source.propertyType || '');
  if (!PROPERTY_TYPES.has(propertyType)) fail('Choose a property type.', 400);
  const purchasePrice = amount(source.purchasePrice, 'Purchase price', 1);
  const valuation = amount(source.valuation, 'Current valuation', 1);
  const units = amount(source.units, 'Units', 1, 10000);
  if (!Number.isInteger(units)) fail('Units must be a whole number.', 400);
  const occupancy = amount(source.occupancy, 'Occupancy', 0, 100);
  const monthlyRent = amount(source.monthlyRent, 'Monthly rent', 0);
  const financials = financialsOf(source.financials || {});
  const ownerPercent = amount(source.ownerPercent, 'Retained ownership', 0, 100);
  const campaign = source.campaign ? campaignOf(source.campaign) : null;
  const tokenization = source.tokenization ? tokenizationOf({ ...source.tokenization, ownerPercent: source.tokenization.ownerPercent ?? ownerPercent, propertyValue: source.tokenization.propertyValue ?? valuation }, valuation) : null;
  if (!campaign && !tokenization) fail('Add a funding campaign or tokenize a portion before submitting.', 400);
  return {
    name,
    address,
    description,
    propertyType,
    purchasePrice,
    valuation,
    units,
    occupancy,
    monthlyRent,
    financials,
    ownership: {
      ownerPercent: tokenization ? tokenization.ownerPercent : ownerPercent,
      offeredPercent: tokenization ? tokenization.offeredPercent : money(100 - ownerPercent),
      structure: campaign ? campaign.structure : note(source.structure || 'Owner retains the unsold share.', 'Ownership structure', 8, 400),
    },
    campaign,
    tokenization,
    financing: emptyFinance(valuation),
  };
}

function register(userId, input) {
  const user = ownerAccount(userId);
  const offering = offeringFrom(input);
  const supply = offering.tokenization ? offering.tokenization.supply : 1;
  const sharePrice = offering.tokenization ? offering.tokenization.price : offering.valuation;
  const property = propertyService.create({
    title: offering.name,
    location: offering.address,
    description: offering.description,
    price: offering.valuation,
    totalTokens: supply,
    sharePriceUsdc: sharePrice,
    status: 'Coming Soon',
    occupancyPercent: offering.occupancy,
    grossRentMonthly: offering.monthlyRent,
    returnRate: offering.valuation > 0 ? money((offering.financials.noi / offering.valuation) * 100) : 0,
    features: [offering.propertyType, `${offering.units} units`],
    unitMix: `${offering.units} units`,
  });
  property.ownerId = user.id;
  property.documentStatus = 'unverified';
  property.projectProgress = 0;
  property.progressLog = [];
  property.offering = offering;
  persistence.save();
  return property;
}

function ensureOffering(property) {
  if (!property.offering || typeof property.offering !== 'object') {
    const valuation = Number(property.price) || 0;
    property.offering = {
      name: property.title,
      address: property.location,
      propertyType: 'Multifamily',
      purchasePrice: valuation,
      valuation,
      units: 1,
      occupancy: Number(property.occupancyPercent) || 0,
      monthlyRent: Number(property.grossRentMonthly) || 0,
      financials: { annualRevenue: 0, operatingExpenses: 0, mortgage: 0, propertyTax: 0, insurance: 0, noi: 0 },
      ownership: { ownerPercent: 100, offeredPercent: 0, structure: '' },
      campaign: null,
      tokenization: null,
      financing: emptyFinance(valuation),
    };
  }
  if (!property.offering.financing) property.offering.financing = emptyFinance(property.offering.valuation || property.price);
  return property.offering;
}

function addPhoto(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const source = input && typeof input === 'object' ? input : {};
  const saved = images.saveBuffer(images.decodeUpload(source.data), source.filename || 'photo.jpg');
  const gallery = Array.isArray(property.galleryUrls) ? property.galleryUrls : [];
  const coverIsDefault = !property.imageUrl || property.imageUrl === images.defaultUrl();
  if (coverIsDefault) {
    property.imageUrl = saved.url;
  } else if (gallery.length >= 7) {
    fail('A listing can have 8 photos.', 400);
  } else {
    property.galleryUrls = [...gallery, saved.url];
  }
  persistence.save();
  return property;
}

function saveCampaign(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const offering = ensureOffering(property);
  offering.campaign = campaignOf(input);
  if (!property.description) property.description = offering.campaign.useOfFunds;
  persistence.save();
  return property;
}

function tokenize(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const offering = ensureOffering(property);
  const token = tokenizationOf(input, offering.valuation || property.price);
  offering.tokenization = token;
  offering.ownership = {
    ownerPercent: token.ownerPercent,
    offeredPercent: token.offeredPercent,
    structure: offering.ownership?.structure || `Owner retains ${token.ownerPercent}%.`,
  };
  property.totalTokens = token.supply;
  property.tokenPrice = token.price;
  property.sharePriceUsdc = token.price;
  property.price = token.propertyValue;
  offering.valuation = token.propertyValue;
  persistence.save();
  return property;
}

function applyFinance(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const offering = ensureOffering(property);
  const collateral = amount(offering.valuation || property.price, 'Collateral value', 1);
  const finance = offering.financing;
  finance.collateralValue = collateral;
  const outstanding = Number(finance.outstanding) || 0;
  const capacity = money(Math.max(0, collateral * FINANCE_LTV - outstanding));
  const requested = amount(input && input.amount, 'Loan amount', 1000);
  if (requested > capacity) fail(`Available capacity is $${capacity.toLocaleString()}.`, 400);
  const nextOutstanding = money(outstanding + requested);
  finance.offer = {
    amount: requested,
    apr: FINANCE_APR,
    termMonths: FINANCE_MONTHS,
    monthlyPayment: paymentFor(nextOutstanding),
    ltv: collateral > 0 ? money(nextOutstanding / collateral) : 0,
  };
  finance.status = 'offered';
  persistence.save();
  return property;
}

function acceptFinance(userId, id) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const finance = ensureOffering(property).financing;
  const offer = finance.offer;
  if (!offer || !(offer.amount > 0)) fail('Apply for financing before accepting an offer.', 400);
  finance.outstanding = money((Number(finance.outstanding) || 0) + offer.amount);
  finance.monthlyPayment = paymentFor(finance.outstanding);
  finance.apr = FINANCE_APR;
  finance.status = 'active';
  finance.offer = null;
  user.cashCents = (Number(user.cashCents) || 0) + Math.round(offer.amount * 100);
  persistence.save();
  return property;
}

function repayFinance(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const finance = ensureOffering(property).financing;
  const outstanding = Number(finance.outstanding) || 0;
  if (outstanding <= 0) fail('There is no balance to repay.', 400);
  const requested = amount(input && input.amount, 'Repayment', 1, outstanding);
  const cents = Math.round(requested * 100);
  if ((Number(user.cashCents) || 0) < cents) fail('Not enough cash to repay that amount.', 400);
  user.cashCents -= cents;
  finance.outstanding = money(outstanding - requested);
  finance.monthlyPayment = finance.outstanding > 0 ? paymentFor(finance.outstanding) : 0;
  finance.status = finance.outstanding > 0 ? 'active' : 'none';
  finance.offer = null;
  persistence.save();
  return property;
}

function pledge(userId, id, input) {
  const user = persistence.data.users.find((row) => String(row.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (user.role === 'admin' || user.role === 'owner') fail('Investors fund campaigns.', 403);
  if (user.suspended) fail('This account is suspended.', 403);
  const property = propertyService.getById(id);
  if (!property) fail('Property not found.', 404);
  const campaign = property.offering && property.offering.campaign;
  if (!campaign || campaign.status !== 'open') fail('This campaign is not open.', 400);
  const remaining = money(campaign.target - (Number(campaign.raised) || 0));
  const dollars = amount(input && input.amount, 'Investment', campaign.minimum, remaining);
  const cents = Math.round(dollars * 100);
  if ((Number(user.cashCents) || 0) < cents) fail('Not enough cash for that investment.', 400);
  user.cashCents -= cents;
  campaign.raised = money((Number(campaign.raised) || 0) + dollars);
  if (!Array.isArray(campaign.pledges)) campaign.pledges = [];
  campaign.pledges.unshift({ userId: user.id, amount: dollars, at: new Date().toISOString() });
  campaign.pledges = campaign.pledges.slice(0, 40);
  if (campaign.raised >= campaign.target) campaign.status = 'funded';
  persistence.save();
  return property;
}

function setSaleStatus(userId, id, status) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  if (!STATUSES.has(status)) fail('Choose Available, Coming Soon, or Sold Out.', 400);
  if (status === 'Available' && property.documentStatus === 'unverified') {
    fail('Verify the deed, appraisal, inspection, insurance, and tax documents before opening the sale.', 400);
  }
  property.status = status;
  persistence.save();
  return property;
}

function addDocument(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const source = input && typeof input === 'object' ? input : {};
  const kind = String(source.kind || '').trim();
  const required = REQUIRED.find((row) => row.kind === kind);
  if (!required) fail('Choose a deed, appraisal, inspection, insurance, or tax file.', 400);
  const data = String(source.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!data) fail('File data is required.', 400);
  let buffer;
  try {
    buffer = Buffer.from(data, 'base64');
  } catch {
    fail('File data must be base64.', 400);
  }
  const stored = vault.saveUpload(property.id, source.filename || `${kind}.pdf`, buffer);
  stored.name = required.label;
  stored.kind = kind;
  stored.review = 'pending';
  property.documents = [...(property.documents || []).filter((doc) => doc.kind !== kind), stored];
  if (property.documentStatus === 'verified') property.documentStatus = 'unverified';
  persistence.save();
  return property;
}

function verifyDocuments(userId, id) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const missing = REQUIRED.filter((row) => !(property.documents || []).some((doc) => doc.kind === row.kind));
  if (missing.length) {
    fail(`Upload ${missing.map((row) => row.label.toLowerCase()).join(', ')} before verification.`, 400);
  }
  for (const doc of property.documents) {
    if (REQUIRED.some((row) => row.kind === doc.kind)) doc.review = 'verified';
  }
  property.documentStatus = 'verified';
  property.documentsVerifiedAt = new Date().toISOString();
  persistence.save();
  return property;
}

function addProgress(userId, id, input) {
  const user = ownerAccount(userId);
  const property = ownedProperty(user, id);
  const source = input && typeof input === 'object' ? input : {};
  const percent = Number(source.percent);
  const note = String(source.note || '').trim();
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) fail('Progress must be a whole number from 0 to 100.', 400);
  if (note.length < 8 || note.length > 400) fail('Describe the update in 8–400 characters.', 400);
  const entry = { at: new Date().toISOString(), percent, note };
  property.projectProgress = percent;
  property.progressLog = [entry, ...(property.progressLog || [])].slice(0, 20);
  persistence.save();
  return property;
}

module.exports = {
  REQUIRED,
  register,
  setSaleStatus,
  addDocument,
  verifyDocuments,
  addProgress,
  addPhoto,
  saveCampaign,
  tokenize,
  applyFinance,
  acceptFinance,
  repayFinance,
  pledge,
};
