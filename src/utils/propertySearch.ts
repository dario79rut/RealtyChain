import { Property } from './types';
import { meetsMinCount, propertyRoomCount, propertyWcCount } from './propertyCounts';

export const EMPTY_FILTERS = {
  status: 'all',
  minPrice: '',
  maxPrice: '',
  location: 'all',
  rooms: 'all',
  wcs: 'all',
  propertyType: 'all',
  minSqft: '',
  minYield: '',
  sort: 'featured',
};

export type SearchFilters = typeof EMPTY_FILTERS;

export const COUNT_OPTIONS = [
  { value: 'all', label: 'Any' },
  { value: '1', label: '1+' },
  { value: '2', label: '2+' },
  { value: '3', label: '3+' },
  { value: '4', label: '4+' },
  { value: '5', label: '5+' },
];

export const HOME_TYPES = [
  { value: 'all', label: 'Any' },
  { value: 'home', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'villa', label: 'Villa' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'commercial', label: 'Commercial' },
];

export const PRICE_PRESETS = [
  { id: 'any', label: 'Any price', min: '', max: '' },
  { id: 'u500', label: 'Under $500k', min: '', max: '500000' },
  { id: '500-1m', label: '$500k – $1M', min: '500000', max: '1000000' },
  { id: '1m-2m', label: '$1M – $2M', min: '1000000', max: '2000000' },
  { id: '2m', label: '$2M+', min: '2000000', max: '' },
];

export const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price (low to high)' },
  { value: 'price-desc', label: 'Price (high to low)' },
  { value: 'yield', label: 'Yield (high to low)' },
  { value: 'size', label: 'Size (large to small)' },
];

export function withFilterDefaults(filters: Partial<SearchFilters> | undefined): SearchFilters {
  return { ...EMPTY_FILTERS, ...(filters || {}) };
}

export function propertySqft(property: Property): number | null {
  const sources = [...(property.features || []), property.unitMix || ''];
  for (const source of sources) {
    const match = source.match(/([\d,]+(?:\.\d+)?)\s*sq\s*ft/i);
    if (!match) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function propertyKind(property: Property): Exclude<SearchFilters['propertyType'], 'all'> {
  const blob = `${property.title} ${property.unitMix || ''} ${(property.features || []).join(' ')}`.toLowerCase();
  if (/office|retail|commercial/.test(blob)) return 'commercial';
  if (/villa|beachfront/.test(blob)) return 'villa';
  if (/cabin|retreat|mountain/.test(blob)) return 'cabin';
  if (/apartment|condo/.test(blob)) return 'apartment';
  return 'home';
}

export function kindLabel(kind: string) {
  return HOME_TYPES.find((type) => type.value === kind)?.label || kind;
}

function haystack(property: Property) {
  return [property.title, property.location, property.description, ...(property.features || [])]
    .join(' ')
    .toLowerCase();
}

export function filterProperties(properties: Property[], query: string, filters: SearchFilters) {
  let result = [...properties];
  const needle = query.trim().toLowerCase();
  if (needle) result = result.filter((property) => haystack(property).includes(needle));
  if (filters.status !== 'all') result = result.filter((property) => property.status === filters.status);
  if (filters.minPrice) result = result.filter((property) => property.price >= Number(filters.minPrice));
  if (filters.maxPrice) result = result.filter((property) => property.price <= Number(filters.maxPrice));
  if (filters.location !== 'all') {
    result = result.filter((property) => property.location.toLowerCase().includes(filters.location.toLowerCase()));
  }
  if (filters.propertyType !== 'all') {
    result = result.filter((property) => propertyKind(property) === filters.propertyType);
  }
  if (filters.minSqft) {
    const min = Number(filters.minSqft);
    result = result.filter((property) => {
      const sqft = propertySqft(property);
      return sqft != null && sqft >= min;
    });
  }
  if (filters.minYield) {
    const min = Number(filters.minYield);
    result = result.filter((property) => (property.returnRate || 0) >= min);
  }
  result = result.filter((property) => meetsMinCount(propertyRoomCount(property), filters.rooms));
  result = result.filter((property) => meetsMinCount(propertyWcCount(property), filters.wcs));
  return sortProperties(result, filters.sort);
}

export function sortProperties(properties: Property[], sort: string) {
  const list = [...properties];
  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (sort === 'yield') list.sort((a, b) => (b.returnRate || 0) - (a.returnRate || 0));
  if (sort === 'size') list.sort((a, b) => (propertySqft(b) || 0) - (propertySqft(a) || 0));
  return list;
}

export function isNarrowed(query: string, filters: SearchFilters) {
  return Boolean(
    query.trim()
    || filters.status !== 'all'
    || filters.minPrice
    || filters.maxPrice
    || filters.location !== 'all'
    || filters.rooms !== 'all'
    || filters.wcs !== 'all'
    || filters.propertyType !== 'all'
    || filters.minSqft
    || filters.minYield
  );
}

export function moneyShort(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !value) return '';
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${amount.toLocaleString()}`;
}

export function priceMenuLabel(filters: SearchFilters) {
  if (!filters.minPrice && !filters.maxPrice) return 'Price';
  if (filters.minPrice && filters.maxPrice) return `${moneyShort(filters.minPrice)} – ${moneyShort(filters.maxPrice)}`;
  if (filters.minPrice) return `${moneyShort(filters.minPrice)}+`;
  return `Up to ${moneyShort(filters.maxPrice)}`;
}

export function bedsMenuLabel(filters: SearchFilters) {
  const parts = [];
  if (filters.rooms !== 'all') parts.push(`${filters.rooms}+ bd`);
  if (filters.wcs !== 'all') parts.push(`${filters.wcs}+ ba`);
  return parts.length ? parts.join(', ') : 'Beds & baths';
}

export function filterSetLabels(query: string, filters: SearchFilters) {
  const labels: string[] = [];
  if (query.trim()) labels.push(query.trim());
  if (filters.status !== 'all') labels.push(filters.status);
  if (filters.location !== 'all') labels.push(filters.location);
  if (filters.propertyType !== 'all') labels.push(kindLabel(filters.propertyType));
  if (filters.minPrice || filters.maxPrice) labels.push(priceMenuLabel(filters));
  if (filters.rooms !== 'all') labels.push(`${filters.rooms}+ beds`);
  if (filters.wcs !== 'all') labels.push(`${filters.wcs}+ baths`);
  if (filters.minSqft) labels.push(`${Number(filters.minSqft).toLocaleString()}+ sq ft`);
  if (filters.minYield) labels.push(`${filters.minYield}%+ yield`);
  const sort = SORTS.find((item) => item.value === filters.sort);
  if (filters.sort !== 'featured' && sort) labels.push(sort.label);
  return labels;
}

export type ActiveChip = {
  id: string;
  label: string;
  query: string;
  filters: SearchFilters;
};

export function activeChips(query: string, filters: SearchFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  if (query.trim()) {
    chips.push({ id: 'query', label: query.trim(), query: '', filters });
  }
  if (filters.status !== 'all') {
    chips.push({ id: 'status', label: filters.status, query, filters: { ...filters, status: 'all' } });
  }
  if (filters.location !== 'all') {
    chips.push({ id: 'location', label: filters.location, query, filters: { ...filters, location: 'all' } });
  }
  if (filters.propertyType !== 'all') {
    chips.push({
      id: 'type',
      label: kindLabel(filters.propertyType),
      query,
      filters: { ...filters, propertyType: 'all' },
    });
  }
  if (filters.minPrice || filters.maxPrice) {
    chips.push({
      id: 'price',
      label: priceMenuLabel(filters),
      query,
      filters: { ...filters, minPrice: '', maxPrice: '' },
    });
  }
  if (filters.rooms !== 'all') {
    chips.push({
      id: 'rooms',
      label: `${filters.rooms}+ beds`,
      query,
      filters: { ...filters, rooms: 'all' },
    });
  }
  if (filters.wcs !== 'all') {
    chips.push({
      id: 'wcs',
      label: `${filters.wcs}+ baths`,
      query,
      filters: { ...filters, wcs: 'all' },
    });
  }
  if (filters.minSqft) {
    chips.push({
      id: 'sqft',
      label: `${Number(filters.minSqft).toLocaleString()}+ sq ft`,
      query,
      filters: { ...filters, minSqft: '' },
    });
  }
  if (filters.minYield) {
    chips.push({
      id: 'yield',
      label: `${filters.minYield}%+ yield`,
      query,
      filters: { ...filters, minYield: '' },
    });
  }
  return chips;
}

export function sameSearch(savedQuery: string, savedFilters: Partial<SearchFilters>, query: string, filters: SearchFilters) {
  const saved = withFilterDefaults(savedFilters);
  return savedQuery === query.trim()
    && saved.status === filters.status
    && saved.minPrice === filters.minPrice
    && saved.maxPrice === filters.maxPrice
    && saved.location === filters.location
    && saved.rooms === filters.rooms
    && saved.wcs === filters.wcs
    && saved.propertyType === filters.propertyType
    && saved.minSqft === filters.minSqft
    && saved.minYield === filters.minYield
    && saved.sort === filters.sort;
}

export function cityName(location: string) {
  return location.split(',')[0]?.trim() || location;
}

export function searchSuggestions(properties: Property[], query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) return { places: [] as string[], listings: [] as Property[] };
  const places = Array.from(new Set(properties.map((property) => cityName(property.location))))
    .filter((city) => city.toLowerCase().includes(needle))
    .slice(0, 4);
  const listings = properties.filter((property) => haystack(property).includes(needle)).slice(0, 5);
  return { places, listings };
}
