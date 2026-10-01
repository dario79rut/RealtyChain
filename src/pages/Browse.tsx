import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon, FilterIcon, MapIcon, MapPinIcon, SearchIcon, XIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PropertyCard } from '../components/ui/PropertyCard';
import { useProperties } from '../hooks/useProperties';
import { Button } from '../components/ui/Button';
import { deleteSavedSearch, fetchSavedSearches, mediaUrl, saveSearch, SavedSearch } from '../utils/api';
import { hasCoords, osmBrowseUrl, osmEmbedSrc } from '../utils/geo';
import {
  activeChips,
  bedsMenuLabel,
  cityName,
  COUNT_OPTIONS,
  EMPTY_FILTERS,
  filterProperties,
  filterSetLabels,
  HOME_TYPES,
  isNarrowed,
  kindLabel,
  priceMenuLabel,
  PRICE_PRESETS,
  propertyKind,
  SearchFilters,
  searchSuggestions,
  sameSearch,
  SORTS,
  withFilterDefaults,
} from '../utils/propertySearch';

const MAX_SAVED_FILTERS = 5;

const fieldClass =
  'w-full bg-void-700 border border-void-600 rounded-xl px-4 py-2.5 text-cream-100 placeholder-cream-400/50 focus:outline-none focus:ring-2 focus:ring-accent/40';

function ChoiceRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-cream-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selected
                  ? 'bg-accent text-void-950 border-accent font-semibold'
                  : 'bg-void-900 text-cream-100 border-void-600 hover:border-cream-400'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Menu({
  label,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          active || open
            ? 'border-accent bg-accent/15 text-cream-100'
            : 'border-void-600 bg-void-800 text-cream-100 hover:border-cream-400'
        }`}
      >
        {label}
        <ChevronDownIcon size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="absolute z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-void-600 bg-void-800 p-4 shadow-glow">
          {children}
        </div>
      )}
    </div>
  );
}

export default function Browse() {
  const { data: properties = [], isLoading, isError } = useProperties();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [openMenu, setOpenMenu] = useState<'price' | 'beds' | 'type' | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ ...EMPTY_FILTERS });
  const [applied, setApplied] = useState<{ query: string; filters: SearchFilters }>({
    query: '',
    filters: { ...EMPTY_FILTERS },
  });
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchError, setSearchError] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const menusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSavedSearches()
      .then((res) => setSavedSearches(res.searches))
      .catch(() => setSavedSearches([]));
  }, []);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) setShowSuggestions(false);
      if (menusRef.current && !menusRef.current.contains(target)) setOpenMenu(null);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, []);

  const locations = Array.from(new Set(properties.map((property) => cityName(property.location)).filter(Boolean)));
  const filteredProperties = filterProperties(properties, applied.query, applied.filters);
  const suggestions = searchSuggestions(properties, searchQuery);
  const chips = activeChips(applied.query, applied.filters);
  const selected = filteredProperties.find((property) => property.id === selectedId) || filteredProperties[0];

  const commit = (nextFilters: SearchFilters, nextQuery = searchQuery) => {
    const query = nextQuery.trim();
    setSearchQuery(query);
    setFilters(nextFilters);
    setApplied({ query, filters: nextFilters });
    setSearchError('');
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setShowSuggestions(false);
    commit(filters, searchQuery);
  };

  const resetFilters = () => {
    const cleared = { ...EMPTY_FILTERS };
    setFilters(cleared);
    setSearchQuery('');
    setApplied({ query: '', filters: cleared });
    setSearchError('');
    setOpenMenu(null);
  };

  const applySaved = (search: SavedSearch) => {
    const next = withFilterDefaults(search.filters);
    setSearchQuery(search.query);
    setFilters(next);
    setApplied({ query: search.query, filters: next });
    setShowFilters(true);
    setSearchError('');
  };

  const handleSaveSearch = async () => {
    setSearchError('');
    if (!isNarrowed(searchQuery, filters)) {
      setSearchError('Set a search term or a filter before saving.');
      return;
    }
    if (savedSearches.length >= MAX_SAVED_FILTERS) {
      setSearchError('You can save up to 5 filters.');
      return;
    }
    const query = searchQuery.trim();
    setSavingSearch(true);
    try {
      const res = await saveSearch({ query, filters });
      setSavedSearches(res.searches.slice(0, MAX_SAVED_FILTERS));
      setShowFilters(true);
      commit(filters, query);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Could not save this search.');
    } finally {
      setSavingSearch(false);
    }
  };

  const handleDeleteSearch = async (id: string) => {
    setSearchError('');
    try {
      const res = await deleteSavedSearch(id);
      setSavedSearches(res.searches);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Could not delete that search.');
    }
  };

  const pickPlace = (place: string) => {
    const next = { ...filters, location: place };
    setShowSuggestions(false);
    commit(next, place);
  };

  return (
    <div className="min-h-screen w-full">
      <div className="max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <div className="mb-6">
          <p className="font-display text-accent text-sm uppercase tracking-widest mb-1">Marketplace</p>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-cream-100">Search properties</h1>
        </div>

        <div ref={searchRef} className="relative mb-4">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <SearchIcon
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-cream-400 pointer-events-none"
              />
              <input
                type="text"
                role="combobox"
                aria-expanded={showSuggestions}
                aria-autocomplete="list"
                placeholder="Address, city, or property name"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-void-800 border border-void-600 rounded-2xl pl-12 pr-28 py-4 text-cream-100 placeholder-cream-400/70 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40"
              />
              <Button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2">
                Search
              </Button>
            </div>
          </form>
          {showSuggestions && (suggestions.places.length > 0 || suggestions.listings.length > 0) && (
            <div className="absolute z-40 mt-2 w-full rounded-2xl border border-void-600 bg-void-800 shadow-glow overflow-hidden">
              {suggestions.places.length > 0 && (
                <div className="p-2 border-b border-void-700">
                  <p className="px-3 py-1 text-xs uppercase tracking-wide text-cream-400">Places</p>
                  {suggestions.places.map((place) => (
                    <button
                      key={place}
                      type="button"
                      onClick={() => pickPlace(place)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-cream-100 hover:bg-void-700"
                    >
                      <MapPinIcon size={16} className="text-accent shrink-0" />
                      <span>{place}</span>
                    </button>
                  ))}
                </div>
              )}
              {suggestions.listings.length > 0 && (
                <div className="p-2">
                  <p className="px-3 py-1 text-xs uppercase tracking-wide text-cream-400">Listings</p>
                  {suggestions.listings.map((property) => (
                    <Link
                      key={property.id}
                      to={`/property/${property.id}`}
                      onClick={() => setShowSuggestions(false)}
                      className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-void-700"
                    >
                      <img
                        src={mediaUrl(property.imageUrl)}
                        alt=""
                        className="w-12 h-12 rounded-lg object-cover shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-cream-100 font-medium truncate">{property.title}</span>
                        <span className="block text-cream-400 text-sm truncate">
                          {property.location} · {kindLabel(propertyKind(property))} · ${property.price.toLocaleString()}
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div ref={menusRef} className="flex flex-wrap items-center gap-2 mb-4">
          <Menu
            label={priceMenuLabel(filters)}
            active={Boolean(filters.minPrice || filters.maxPrice)}
            open={openMenu === 'price'}
            onToggle={() => setOpenMenu(openMenu === 'price' ? null : 'price')}
          >
            <div className="space-y-2">
              {PRICE_PRESETS.map((preset) => {
                const selected = filters.minPrice === preset.min && filters.maxPrice === preset.max;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      commit({ ...filters, minPrice: preset.min, maxPrice: preset.max });
                      setOpenMenu(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm ${
                      selected ? 'bg-accent text-void-950 font-semibold' : 'text-cream-100 hover:bg-void-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-void-700">
              <input
                type="number"
                inputMode="numeric"
                placeholder="Min"
                aria-label="Minimum price"
                value={filters.minPrice}
                onChange={(event) => commit({ ...filters, minPrice: event.target.value })}
                className={fieldClass}
              />
              <input
                type="number"
                inputMode="numeric"
                placeholder="Max"
                aria-label="Maximum price"
                value={filters.maxPrice}
                onChange={(event) => commit({ ...filters, maxPrice: event.target.value })}
                className={fieldClass}
              />
            </div>
          </Menu>
          <Menu
            label={bedsMenuLabel(filters)}
            active={filters.rooms !== 'all' || filters.wcs !== 'all'}
            open={openMenu === 'beds'}
            onToggle={() => setOpenMenu(openMenu === 'beds' ? null : 'beds')}
          >
            <div className="space-y-4">
              <ChoiceRow
                label="Bedrooms"
                value={filters.rooms}
                options={COUNT_OPTIONS}
                onChange={(rooms) => commit({ ...filters, rooms })}
              />
              <ChoiceRow
                label="Bathrooms"
                value={filters.wcs}
                options={COUNT_OPTIONS}
                onChange={(wcs) => commit({ ...filters, wcs })}
              />
            </div>
          </Menu>
          <Menu
            label={filters.propertyType === 'all' ? 'Home type' : kindLabel(filters.propertyType)}
            active={filters.propertyType !== 'all'}
            open={openMenu === 'type'}
            onToggle={() => setOpenMenu(openMenu === 'type' ? null : 'type')}
          >
            <ChoiceRow
              label="Home type"
              value={filters.propertyType}
              options={HOME_TYPES}
              onChange={(propertyType) => {
                commit({ ...filters, propertyType });
                setOpenMenu(null);
              }}
            />
          </Menu>
          <button
            type="button"
            onClick={() => {
              setShowFilters((open) => !open);
              setOpenMenu(null);
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
              showFilters ? 'border-accent bg-accent/15 text-cream-100' : 'border-void-600 bg-void-800 text-cream-100 hover:border-cream-400'
            }`}
          >
            <FilterIcon size={14} />
            More filters
          </button>
          <button
            type="button"
            onClick={() => setShowMap((open) => !open)}
            className="lg:hidden inline-flex items-center gap-2 rounded-full border border-void-600 bg-void-800 px-4 py-2 text-sm font-medium text-cream-100"
          >
            <MapIcon size={14} />
            {showMap ? 'Hide map' : 'Map'}
          </button>
          {isNarrowed(applied.query, applied.filters) && (
            <button type="button" onClick={resetFilters} className="text-sm text-accent hover:underline px-2">
              Clear all
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => commit(chip.filters, chip.query)}
                className="inline-flex items-center gap-1.5 rounded-full bg-void-700 border border-void-600 px-3 py-1 text-sm text-cream-100 hover:border-cream-400"
              >
                {chip.label}
                <XIcon size={12} />
              </button>
            ))}
          </div>
        )}

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="rounded-3xl border border-void-700 bg-void-800/60 p-6 mb-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-display font-semibold text-cream-100 text-lg">More filters</h2>
                <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <label className="block text-sm font-medium text-cream-400 mb-2">Status</label>
                  <select
                    value={filters.status}
                    onChange={(event) => commit({ ...filters, status: event.target.value })}
                    className={fieldClass}
                  >
                    <option value="all">All</option>
                    <option value="Available">For sale</option>
                    <option value="Coming Soon">Coming soon</option>
                    <option value="Sold Out">Sold</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream-400 mb-2">City</label>
                  <select
                    value={filters.location}
                    onChange={(event) => commit({ ...filters, location: event.target.value })}
                    className={fieldClass}
                  >
                    <option value="all">All cities</option>
                    {locations.map((location) => (
                      <option key={location} value={location}>{location}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream-400 mb-2">Min size (sq ft)</label>
                  <input
                    type="number"
                    placeholder="Any"
                    aria-label="Minimum size"
                    value={filters.minSqft}
                    onChange={(event) => commit({ ...filters, minSqft: event.target.value })}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream-400 mb-2">Min yield (%)</label>
                  <input
                    type="number"
                    placeholder="Any"
                    aria-label="Minimum yield"
                    value={filters.minYield}
                    onChange={(event) => commit({ ...filters, minYield: event.target.value })}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="mt-8 pt-6 border-t border-void-700">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-display font-semibold text-cream-100">Saved filters</h3>
                  <span className="text-cream-400 text-sm">{savedSearches.length} / {MAX_SAVED_FILTERS}</span>
                </div>
                {savedSearches.length === 0 ? (
                  <p className="text-cream-400 text-sm">Save the current filter set to reuse it. Up to 5.</p>
                ) : (
                  <div className="space-y-2">
                    {savedSearches.map((search) => {
                      const labels = filterSetLabels(search.query, withFilterDefaults(search.filters));
                      const active = sameSearch(search.query, search.filters, applied.query, applied.filters);
                      return (
                        <div
                          key={search.id}
                          className={`flex items-start gap-3 rounded-xl border p-3 ${
                            active ? 'border-accent bg-void-700' : 'border-void-600 bg-void-800/60'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => applySaved(search)}
                            className="flex-1 flex flex-wrap gap-2 text-left"
                          >
                            {labels.map((label) => (
                              <span
                                key={label}
                                className="inline-flex items-center rounded-full bg-void-900 border border-void-600 px-2.5 py-1 text-xs text-cream-100"
                              >
                                {label}
                              </span>
                            ))}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete saved filter ${labels.join(', ')}`}
                            onClick={() => handleDeleteSearch(search.id)}
                            className="text-cream-400 hover:text-cream-100 mt-1"
                          >
                            <XIcon size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-5 flex flex-col sm:flex-row sm:justify-end gap-3">
                {searchError && <p className="text-red-400 text-sm sm:mr-auto sm:self-center">{searchError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveSearch}
                  disabled={savingSearch || savedSearches.length >= MAX_SAVED_FILTERS}
                >
                  {savingSearch ? 'Saving…' : 'Save filters'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <p className="text-cream-100 font-medium">
            {isLoading ? 'Loading properties…' : `${filteredProperties.length} ${filteredProperties.length === 1 ? 'property' : 'properties'}`}
          </p>
          <label className="flex items-center gap-2 text-sm text-cream-400">
            Sort
            <select
              aria-label="Sort properties"
              value={filters.sort}
              onChange={(event) => commit({ ...filters, sort: event.target.value })}
              className="bg-void-800 border border-void-600 rounded-xl px-3 py-2 text-cream-100 focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              {SORTS.map((sort) => (
                <option key={sort.value} value={sort.value}>{sort.label}</option>
              ))}
            </select>
          </label>
        </div>

        {isError ? (
          <div className="rounded-2xl border border-void-700 bg-void-800/40 p-16 text-center">
            <h2 className="font-display font-semibold text-cream-100 text-xl mb-2">Could not load properties</h2>
            <p className="text-cream-400">Check that the API server is running and that you are signed in.</p>
          </div>
        ) : filteredProperties.length === 0 && !isLoading ? (
          <div className="rounded-2xl border border-void-700 bg-void-800/40 p-16 text-center">
            <h2 className="font-display font-semibold text-cream-100 text-xl mb-2">No properties found</h2>
            <p className="text-cream-400 mb-6">Try a different city, price, or home type.</p>
            <Button variant="outline" onClick={resetFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
            <div className={showMap ? 'hidden lg:block space-y-4' : 'space-y-4'}>
              {filteredProperties.map((property) => (
                <div
                  key={property.id}
                  onMouseEnter={() => setSelectedId(property.id)}
                  className={selected?.id === property.id ? 'rounded-2xl ring-1 ring-accent/60' : ''}
                >
                  <PropertyCard property={property} layout="row" />
                </div>
              ))}
            </div>
            <aside className={`${showMap ? 'block' : 'hidden'} lg:block lg:sticky lg:top-6`}>
              <div className="rounded-2xl border border-void-700 bg-void-800 overflow-hidden">
                {selected && hasCoords(selected) ? (
                  <iframe
                    title={`Map of ${selected.title}`}
                    src={osmEmbedSrc(selected.lat as number, selected.lng as number, 0.05)}
                    className="w-full h-72 lg:h-80 border-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-72 lg:h-80 flex items-center justify-center text-cream-400 text-sm">
                    Map appears when a listing has a location pin.
                  </div>
                )}
                {selected && (
                  <div className="p-4 border-t border-void-700">
                    <p className="font-display font-semibold text-cream-100">{selected.title}</p>
                    <p className="text-cream-400 text-sm mt-1">{selected.location}</p>
                    <p className="text-cream-100 mt-2">${selected.price.toLocaleString()} <span className="text-cream-400 text-sm">/ share</span></p>
                    {hasCoords(selected) && (
                      <a
                        href={osmBrowseUrl(selected.lat as number, selected.lng as number)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block mt-2 text-accent text-sm hover:underline"
                      >
                        Open full map
                      </a>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
