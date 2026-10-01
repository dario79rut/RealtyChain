const crypto = require('crypto');
const persistence = require('../mock/persistence');

const STATUSES = new Set(['all', 'Available', 'Sold Out', 'Coming Soon']);
const COUNTS = new Set(['all', '1', '2', '3', '4', '5']);
const TYPES = new Set(['all', 'home', 'apartment', 'villa', 'cabin', 'commercial']);
const SORTS = new Set(['featured', 'price-asc', 'price-desc', 'yield', 'size']);
const MAX_SAVED = 5;

function fail(message, status) {
  throw Object.assign(new Error(message), { status });
}

function findUser(userId) {
  const user = persistence.data.users.find((u) => String(u.id) === String(userId));
  if (!user) fail('Unauthorized', 401);
  if (!Array.isArray(user.savedSearches)) user.savedSearches = [];
  return user;
}

function asText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function asPrice(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d+(\.\d+)?$/.test(text)) fail(`${label} must be a number.`, 400);
  return text;
}

function normalizeFilters(input) {
  const source = input && typeof input === 'object' ? input : {};
  const status = asText(source.status || 'all', 20) || 'all';
  const rooms = asText(source.rooms || 'all', 8) || 'all';
  const wcs = asText(source.wcs || 'all', 8) || 'all';
  const location = asText(source.location || 'all', 80) || 'all';
  const propertyType = asText(source.propertyType || 'all', 20) || 'all';
  const sort = asText(source.sort || 'featured', 20) || 'featured';
  if (!STATUSES.has(status)) fail('Status is not a valid filter.', 400);
  if (!COUNTS.has(rooms)) fail('Rooms must be Any or 1+ through 5+.', 400);
  if (!COUNTS.has(wcs)) fail('WCs must be Any or 1+ through 5+.', 400);
  if (!TYPES.has(propertyType)) fail('Home type is not a valid filter.', 400);
  if (!SORTS.has(sort)) fail('Sort is not a valid filter.', 400);
  const minPrice = asPrice(source.minPrice, 'Min price');
  const maxPrice = asPrice(source.maxPrice, 'Max price');
  const minSqft = asPrice(source.minSqft, 'Min size');
  const minYield = asPrice(source.minYield, 'Min yield');
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
    fail('Min price cannot be higher than max price.', 400);
  }
  return {
    status, minPrice, maxPrice, location, rooms, wcs, propertyType, minSqft, minYield, sort,
  };
}

function isNarrowed(query, filters) {
  return Boolean(
    query
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

function defaultName(query, filters) {
  const parts = [];
  if (query) parts.push(query);
  if (filters.location !== 'all') parts.push(filters.location);
  if (filters.status !== 'all') parts.push(filters.status);
  if (filters.minPrice || filters.maxPrice) {
    parts.push(`$${filters.minPrice || '0'}–${filters.maxPrice ? `$${filters.maxPrice}` : 'any'}`);
  }
  if (filters.propertyType !== 'all') parts.push(filters.propertyType);
  if (filters.rooms !== 'all') parts.push(`${filters.rooms}+ rooms`);
  if (filters.wcs !== 'all') parts.push(`${filters.wcs}+ WCs`);
  if (filters.minSqft) parts.push(`${filters.minSqft}+ sq ft`);
  if (filters.minYield) parts.push(`${filters.minYield}%+ yield`);
  return (parts.join(' · ') || 'All properties').slice(0, 80);
}

function signature(query, filters) {
  return JSON.stringify({ query: query.toLowerCase(), filters });
}

function publicSearch(row) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    filters: row.filters,
    createdAt: row.createdAt,
  };
}

function list(userId) {
  const user = findUser(userId);
  if (user.savedSearches.length > MAX_SAVED) {
    user.savedSearches = user.savedSearches.slice(0, MAX_SAVED);
    persistence.save();
  }
  return user.savedSearches.map(publicSearch);
}

function create(userId, payload) {
  const user = findUser(userId);
  const query = asText(payload.query, 120);
  const filters = normalizeFilters(payload.filters);
  if (!isNarrowed(query, filters)) {
    fail('Set a search term or a filter before saving.', 400);
  }
  const existing = user.savedSearches.find((row) => signature(row.query, row.filters) === signature(query, filters));
  if (existing) fail('That search is already saved.', 409);
  if (user.savedSearches.length >= MAX_SAVED) {
    fail(`You can save up to ${MAX_SAVED} filters.`, 400);
  }
  const named = asText(payload.name, 80);
  const search = {
    id: crypto.randomUUID(),
    name: named || defaultName(query, filters),
    query,
    filters,
    createdAt: new Date().toISOString(),
  };
  user.savedSearches.unshift(search);
  persistence.save();
  return { search: publicSearch(search), searches: user.savedSearches.map(publicSearch) };
}

function remove(userId, searchId) {
  const user = findUser(userId);
  const index = user.savedSearches.findIndex((row) => row.id === String(searchId));
  if (index < 0) fail('Saved search not found.', 404);
  user.savedSearches.splice(index, 1);
  persistence.save();
  return { searches: user.savedSearches.map(publicSearch) };
}

module.exports = {
  list,
  create,
  remove,
  defaultName,
};
