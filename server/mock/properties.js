/** Seed listings for the RealtyChain catalog. Source of truth until admin origination exists. */
const properties = [
  {
    id: '1',
    title: 'Luxury Downtown Apartment',
    description:
      'A stunning luxury apartment in the heart of the city. This property features floor-to-ceiling windows, premium finishes, and access to exclusive amenities including a rooftop pool, fitness center, and 24/7 concierge service.',
    imageUrl:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    location: 'New York, NY',
    price: 450000,
    tokenPrice: 0.5,
    totalTokens: 1000,
    tokensSold: 650,
    status: 'Available',
    features: ['3 Bedrooms', '2 Bathrooms', '1,800 sq ft', 'Built in 2020', 'Doorman', 'Gym'],
    bedrooms: 3,
    bathrooms: 2,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Financial Projections', url: '#' },
      { name: 'Inspection Report', url: '#' },
    ],
    returnRate: 8.2,
  },
  {
    id: '2',
    title: 'Beachfront Villa',
    description:
      'Luxurious beachfront property with direct access to pristine white sand beaches. This villa offers panoramic ocean views, a private infinity pool, and meticulously landscaped gardens.',
    imageUrl:
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    location: 'Miami, FL',
    price: 1200000,
    tokenPrice: 1.2,
    totalTokens: 1000,
    tokensSold: 1000,
    status: 'Sold Out',
    features: ['5 Bedrooms', '6 Bathrooms', '4,500 sq ft', 'Private Pool', 'Beach Access', 'Smart Home'],
    bedrooms: 5,
    bathrooms: 6,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Financial Projections', url: '#' },
      { name: 'Inspection Report', url: '#' },
    ],
    returnRate: 10.5,
  },
  {
    id: '3',
    title: 'Modern Office Building',
    description:
      'Prime commercial real estate in the central business district. This modern office building features state-of-the-art facilities, energy-efficient design, and is fully leased to AAA-rated corporate tenants on long-term contracts.',
    imageUrl:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    location: 'Chicago, IL',
    price: 3500000,
    tokenPrice: 3.5,
    totalTokens: 1000,
    tokensSold: 300,
    status: 'Available',
    features: ['25,000 sq ft', '10 Floors', 'Parking Garage', 'LEED Certified', 'Conference Center', '24/7 Security'],
    bedrooms: null,
    bathrooms: null,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Tenant Agreements', url: '#' },
      { name: 'Financial Projections', url: '#' },
    ],
    returnRate: 7.8,
  },
  {
    id: '4',
    title: 'Mountain Retreat',
    description:
      'Secluded luxury cabin nestled in the mountains with breathtaking views. This property combines rustic charm with modern amenities, featuring exposed wooden beams, a stone fireplace, and a private hot tub.',
    imageUrl:
      'https://images.unsplash.com/photo-1518780664697-55e3ad937233?ixlib=rb-4.0.3&auto=format&fit=crop&w=1530&q=80',
    location: 'Aspen, CO',
    price: 875000,
    tokenPrice: 0.875,
    totalTokens: 1000,
    tokensSold: 0,
    status: 'Coming Soon',
    features: ['4 Bedrooms', '3 Bathrooms', '2,800 sq ft', 'Hot Tub', 'Fireplace', '2-Car Garage'],
    bedrooms: 4,
    bathrooms: 3,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Financial Projections', url: '#' },
      { name: 'Inspection Report', url: '#' },
    ],
    returnRate: 9.1,
  },
  {
    id: '5',
    title: 'Urban Retail Space',
    description:
      'High-traffic retail location in a trendy urban neighborhood. This corner unit features large display windows, modern interior, and is surrounded by complementary businesses that drive consistent foot traffic.',
    imageUrl:
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1374&q=80',
    location: 'Austin, TX',
    price: 680000,
    tokenPrice: 0.68,
    totalTokens: 1000,
    tokensSold: 520,
    status: 'Available',
    features: ['2,000 sq ft', 'Corner Location', 'High Foot Traffic', 'Recently Renovated', 'Storage Space', 'Outdoor Seating'],
    bedrooms: null,
    bathrooms: null,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Market Analysis', url: '#' },
      { name: 'Financial Projections', url: '#' },
    ],
    returnRate: 8.7,
  },
  {
    id: '6',
    title: 'Historic Brownstone',
    description:
      'Beautifully restored historic brownstone in a prestigious neighborhood. This property combines classic architectural details with modern updates in one of the most sought-after locations.',
    imageUrl:
      'https://images.unsplash.com/photo-1448630360428-65456885c650?ixlib=rb-4.0.3&auto=format&fit=crop&w=1467&q=80',
    location: 'Boston, MA',
    price: 1850000,
    tokenPrice: 1.85,
    totalTokens: 1000,
    tokensSold: 780,
    status: 'Available',
    features: ['4 Bedrooms', '3.5 Bathrooms', '3,200 sq ft', 'Original Hardwood Floors', 'Garden', 'Finished Basement'],
    bedrooms: 4,
    bathrooms: 3.5,
    documents: [
      { name: 'Property Deed', url: '#' },
      { name: 'Historic Designation', url: '#' },
      { name: 'Renovation Permits', url: '#' },
    ],
    returnRate: 6.9,
  },
];

const OPS = {
  1: {
    occupancyPercent: 96,
    capRate: 5.8,
    grossRentMonthly: 3200,
    opexMonthly: 900,
    reservesMonthly: 200,
    nextAppraisalAt: '2026-12-01',
    appraisals: [{ date: '2026-06-01', valueUsd: 465000, note: 'Mid-year desktop appraisal' }],
  },
  2: {
    occupancyPercent: 88,
    capRate: 6.1,
    grossRentMonthly: 8500,
    opexMonthly: 2800,
    reservesMonthly: 400,
    nextAppraisalAt: '2026-11-15',
    appraisals: [{ date: '2026-05-20', valueUsd: 1250000, note: 'Seasonal rental appraisal' }],
  },
  3: {
    occupancyPercent: 100,
    capRate: 6.4,
    grossRentMonthly: 22000,
    opexMonthly: 7000,
    reservesMonthly: 1500,
    nextAppraisalAt: '2027-01-10',
    appraisals: [{ date: '2026-01-15', valueUsd: 3600000, note: 'Year-end MAI appraisal' }],
  },
  4: {
    occupancyPercent: 0,
    capRate: 5.5,
    grossRentMonthly: 0,
    opexMonthly: 0,
    reservesMonthly: 0,
    nextAppraisalAt: '2026-10-15',
    appraisals: [],
  },
  5: {
    occupancyPercent: 94,
    capRate: 6.8,
    grossRentMonthly: 4800,
    opexMonthly: 1400,
    reservesMonthly: 300,
    nextAppraisalAt: '2026-09-30',
    appraisals: [{ date: '2026-03-01', valueUsd: 700000, note: 'Retail corridor update' }],
  },
  6: {
    occupancyPercent: 97,
    capRate: 5.2,
    grossRentMonthly: 11000,
    opexMonthly: 3600,
    reservesMonthly: 500,
    nextAppraisalAt: '2026-12-20',
    appraisals: [{ date: '2026-04-12', valueUsd: 1900000, note: 'Historic district comps' }],
  },
};

const CMS = {
  1: {
    lat: 40.758,
    lng: -73.9855,
    unitMix: '1× 3BR / 2BA condo, 1,800 sq ft',
    galleryUrls: [
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1470&q=80',
    ],
    interiors: [
      {
        name: 'Living room',
        detail: 'The living room runs 22 feet along a floor-to-ceiling glass wall facing Midtown. White oak floors continue in from the entry, and the ceiling is about 10 feet. A low sofa faces the glass, with a walnut coffee table and one lounge chair in the corner. A wide pass-through on the west wall opens into the kitchen, so the two rooms read as one.',
        imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Kitchen',
        detail: 'A galley kitchen, about 8 by 14 feet, with honed stone counters and flat-panel cabinets in a warm gray. The range, dishwasher, and refrigerator are panel-front. Upper cabinets stop short of the ceiling and leave a shelf for glassware. The pass-through is the main opening to the living room; a door at the far end reaches the service hall.',
        imageUrl: 'https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bedroom',
        detail: 'The primary bedroom is at the east end of the apartment. A king bed faces the window, and blackout shades sit inside the frame. Closet doors run the full east wall, about 10 feet of hanging space and shelves. The ensuite bath opens at the foot of the bed. The floor is the same white oak as the living room.',
        imageUrl: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Second bedroom',
        detail: 'The second bedroom is dressed as a guest room. A queen bed sits against the interior wall, and a desk fits under the window without covering the radiator. There is floor space for a crib that still leaves a path to the closet. The hall bath — a shower and a single vanity — is shared from this room.',
        imageUrl: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bath',
        detail: 'The primary bath is large-format stone tile. The walk-in shower has a fixed rain head and a handheld, with a niche for bottles cut into the wall. A double vanity holds two sinks and a bank of drawers under each. The hall bath, used by the guest bedroom, is a separate shower and a single vanity.',
        imageUrl: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '210 W 55th St, New York, NY', soldDate: '2026-03-12', priceUsd: 465000, sqft: 1750, note: 'Same tower, lower floor' },
      { address: '45 W 54th St, New York, NY', soldDate: '2026-01-08', priceUsd: 438000, sqft: 1680, note: 'Illustrative nearby sale' },
      { address: '15 Columbus Cir, New York, NY', soldDate: '2025-11-20', priceUsd: 510000, sqft: 1920, note: 'Newer finish package' },
    ],
  },
  2: {
    lat: 25.7617,
    lng: -80.1918,
    unitMix: '1× 5BR / 6BA villa, 4,500 sq ft',
    galleryUrls: [
      'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    ],
    interiors: [
      {
        name: 'Great room',
        detail: 'The great room is one open volume from the entry to the pool sliders. Seating faces the ocean, not a television wall, and the sofa group sits on a rug that stops short of the slider track. The ceiling stays high enough that the terrace and the water stay in view from the kitchen island. Floors are wide-plank stone that continues onto the covered terrace.',
        imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Kitchen',
        detail: 'The kitchen is built around a white-stone island with seating for four on the great-room side. The range wall holds a cooktop and a tall fridge, and the pantry is a door behind that wall rather than open shelves. Counters are the same stone as the island. A second sink faces the pool so dishes can be passed outside without crossing the great room.',
        imageUrl: 'https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary suite',
        detail: 'The primary suite is on the ocean side, separated from the guest wing by a short hall. A sitting area with two chairs sits between the king bed and the balcony doors. The closet is a walk-in off the bath, not along the bedroom wall, so the ocean windows stay clear. Blackout drapes stack at the sides of the slider.',
        imageUrl: 'https://images.unsplash.com/photo-1617325247661-675ab4b64ae2?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Guest bedroom',
        detail: 'This is one of four guest rooms on the garden side of the villa. Each has a queen bed, blackout drapes, a small desk, and a closet deep enough for hanging luggage. The bath is ensuite: a shower, a single vanity, and a door that does not open through the bedroom. The four rooms share a linen closet in the hall.',
        imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bath',
        detail: 'The primary bath opens from the suite, not from the hall. A freestanding tub sits at the window, and the shower is a separate glass enclosure with a bench. The vanity is one long stone slab with two sinks and drawers between them. The walk-in closet is through a door beside the vanity.',
        imageUrl: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '88 Ocean Dr, Miami Beach, FL', soldDate: '2026-02-02', priceUsd: 1180000, sqft: 4300, note: 'Waterfront comparable' },
      { address: '12 Palm Isle, Miami, FL', soldDate: '2025-10-15', priceUsd: 1095000, sqft: 4100, note: 'Illustrative sale' },
    ],
  },
  3: {
    lat: 41.8781,
    lng: -87.6298,
    unitMix: '10 floors, 25,000 sq ft office',
    galleryUrls: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
    ],
    interiors: [
      {
        name: 'Lobby',
        detail: 'The lobby is double-height, with a stone floor and a reception desk set off the entry so the elevator core stays visible. Visitor seating is a short run of chairs along the glass. Turnstiles sit between the desk and the elevators. The ceiling drops to a single story only at the mail room on the right.',
        imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Typical floor',
        detail: 'A typical floor is an open plate around a central core of elevators, stairs, and restrooms. Perimeter glass runs the full edge, with shades in the ceiling pocket. Columns land on a grid that can be demised into suites of about 2,500 sq ft without crossing the core. Raised floor is not used; power comes from the ceiling.',
        imageUrl: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Conference center',
        detail: 'The second-floor conference center is shared by the building, not leased with a single floor. A boardroom seats about fourteen at one table. Two smaller huddle rooms open off the same pre-function hall, with a pantry counter between them. The hall has a coat closet and a door back to the elevator lobby.',
        imageUrl: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '200 S Wacker Dr, Chicago, IL', soldDate: '2026-04-01', priceUsd: 3400000, sqft: 24000, note: 'CBD office trade' },
      { address: '111 W Monroe St, Chicago, IL', soldDate: '2025-09-18', priceUsd: 3650000, sqft: 26000, note: 'Illustrative nearby' },
    ],
  },
  4: {
    lat: 39.1911,
    lng: -106.8175,
    unitMix: '1× 4BR / 3BA cabin, 2,800 sq ft',
    galleryUrls: [
      'https://images.unsplash.com/photo-1518780664697-55e3ad937233?ixlib=rb-4.0.3&auto=format&fit=crop&w=1530&q=80',
    ],
    interiors: [
      {
        name: 'Great room',
        detail: 'The great room sits under exposed timber beams. A stone fireplace is the center of the long wall, with seating pulled toward it and the glass that faces the slope. The floor is wide pine. A dining table for eight is at the kitchen end, still in the same volume, so the fireplace stays in view from the table.',
        imageUrl: 'https://images.unsplash.com/photo-1542718610-a1d656d1884c?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Kitchen',
        detail: 'The kitchen is open to the great room, finished in warm wood cabinets and a stone counter. A farmhouse sink sits under the window that looks at the trees, not at the slope. The range is on the interior wall so the window stays clear. Open shelves above the counter hold everyday dishes; the pantry is a door beside the fridge.',
        imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bedroom',
        detail: 'The primary bedroom is on the main level, off a short hall from the great room. A king bed faces the glass, with linen drapes on a wood rod. A door at the side of the room opens onto the hot-tub deck without passing back through the great room. The closet is a reach-in along the hall wall. The bath is ensuite.',
        imageUrl: 'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Loft bedroom',
        detail: 'The loft bedroom sits under the roof pitch and is used as a bunk room: two sets of bunks and a chest at the stair. Headroom is full at the stair and lower at the eaves. Two more bedrooms are on the lower hall, each with a queen bed, a closet, and a window to the slope. They share a bath at the end of that hall.',
        imageUrl: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '412 Hunter Creek Rd, Aspen, CO', soldDate: '2026-01-22', priceUsd: 890000, sqft: 2700, note: 'Mountain comparable' },
    ],
  },
  5: {
    lat: 30.2672,
    lng: -97.7431,
    unitMix: '1× 2,000 sq ft corner retail',
    galleryUrls: [
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1374&q=80',
    ],
    interiors: [
      {
        name: 'Sales floor',
        detail: 'The sales floor is about 1,600 sq ft of open space. The path from the corner entrance runs straight to the back counter, with display tables on both sides rather than a maze of racks. The floor is polished concrete. Track lighting hangs on the ceiling grid. A fitting room is a single door on the left wall, not a bank of stalls.',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Window display',
        detail: 'The corner has display windows on two streets. The sill is deep enough for a mannequin run and a low seating ledge inside the glass. Shades are a simple roller at the head of each window. The entry door is on the long side, so the corner itself stays a display, not a vestibule.',
        imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Back room',
        detail: 'The back room is storage and a small staff area, about 400 sq ft. Shelving runs one wall from floor to ceiling. A desk and a locker sit opposite. The alley door is at the rear, wide enough for a hand truck, with a step down to the pavement. A single restroom opens off this room, not off the sales floor.',
        imageUrl: 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '1400 S Congress Ave, Austin, TX', soldDate: '2026-03-04', priceUsd: 695000, sqft: 1900, note: 'South Congress retail' },
      { address: '501 Barton Springs Rd, Austin, TX', soldDate: '2025-12-09', priceUsd: 640000, sqft: 1850, note: 'Illustrative sale' },
    ],
  },
  6: {
    lat: 42.3601,
    lng: -71.0589,
    unitMix: '1× 4BR / 3.5BA brownstone, 3,200 sq ft',
    galleryUrls: [
      'https://images.unsplash.com/photo-1448630360428-65456885c650?ixlib=rb-4.0.3&auto=format&fit=crop&w=1467&q=80',
    ],
    interiors: [
      {
        name: 'Parlor',
        detail: 'The front parlor keeps the original mantel and the tall windows onto the street. Restored hardwood runs wall to wall, with a rug sized to the seating group and not to the whole room. The ceiling medallion and the window casings are intact. Pocket doors, when open, connect this room to the kitchen behind it.',
        imageUrl: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Kitchen',
        detail: 'The kitchen is the updated room behind the parlor, still on the original brownstone plan rather than an open great room. A long counter runs one wall, with the range at the center and cabinets above and below. A door at the back opens to the garden. The floor is tile, a step down from the parlor hardwood.',
        imageUrl: 'https://images.unsplash.com/photo-1556909172-54557c7e4fb7?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bedroom',
        detail: 'The primary bedroom is on the second floor, at the front of the house. Original trim frames two street-facing windows, and a king bed sits between them on the interior wall so both windows stay usable. The closet was built into a former dressing alcove and does not cut the windows. The bath is through a door at the back of the room.',
        imageUrl: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Primary bath',
        detail: 'The primary bath was carved from a former dressing room, so it keeps the original window. A walk-in shower occupies the wall without the window. The vanity is a single sink with drawers, not a double, because the room is narrow. The floor is small hexagonal tile. A linen cupboard is the old closet, left in place.',
        imageUrl: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=1600&q=80',
      },
      {
        name: 'Garden level',
        detail: 'The garden level is finished as a family room rather than raw basement. The ceiling is lower than the parlor, with the beams left exposed. A half bath is under the stair. A door at the back goes up a short run of steps to the rear garden. Two small bedrooms open off this level, each with a window at grade and a closet.',
        imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1600&q=80',
      },
    ],
    comps: [
      { address: '22 Beacon St, Boston, MA', soldDate: '2026-02-14', priceUsd: 1790000, sqft: 3100, note: 'Historic district sale' },
      { address: '8 Pinckney St, Boston, MA', soldDate: '2025-08-30', priceUsd: 1920000, sqft: 3300, note: 'Illustrative nearby' },
    ],
  },
};

for (const property of properties) {
  Object.assign(property, OPS[property.id] || {}, CMS[property.id] || {});
}

module.exports = { properties };
