/**
 * Hand-curated daily overrides — keyed by selectionSeed ("cityId:YYYY-MM-DD").
 * When a key matches, selectDailyLocations returns these IDs verbatim and in
 * the listed order instead of running the PRNG selection.
 *
 * Order is whatever the curator chooses — it is NOT required to follow the
 * easy/easy/medium/medium/hard ramp. Most entries do (it makes a nicer day),
 * but a block may intentionally deviate (e.g. the Seattle Jun 17–23 run below
 * is all-easy). Do not assume difficulty from slot position.
 *
 * To add more overrides: append entries in the same format and re-deploy.
 * To expire old ones: leave them in place (they never match after the date
 * passes) or delete them during a future cleanup pass.
 */
export const DAILY_OVERRIDES: Record<string, readonly string[]> = {
  // St. Pete — Jun 14–23 2026 (hand-curated for variety & spreadability)
  'stpete:2026-06-14': [
    'the-dali-museum',
    'bodega',
    'lake-maggiore',
    'angelos-grill-bar',
    'rec-dec',
  ],
  'stpete:2026-06-15': [
    'tropicana-field',
    'green-bench-brewing-co',
    'north-shore-kickball-fields',
    'elliott-aster',
    'buttermilk-eatery',
  ],
  'stpete:2026-06-16': [
    'museum-of-fine-arts',
    'the-chattaway',
    'twin-brooks-golf-course',
    'fresh-kitchen',
    'world-vegan-cuisine',
  ],
  'stpete:2026-06-17': [
    'the-don-cesar',
    'parkshore-grill',
    'lake-vista-park',
    'hi-5',
    'sams-sushi',
  ],
  'stpete:2026-06-18': [
    'jannus-live',
    'cassis-american-brasserie',
    'paradeco-coffee-roasters',
    'the-floridian-cuban-sandwiches',
    'enigma',
  ],
  'stpete:2026-06-19': [
    'sunken-gardens',
    'ceviche-tapas-bar',
    'bartlett-park',
    'draculas-legacy-wine-bar',
    'astra-pizza',
  ],
  'stpete:2026-06-20': [
    'vinoy-park',
    'hawkers-asian-street-food',
    'wheres-jubes',
    'allelo',
    'the-garage-on-central',
  ],
  'stpete:2026-06-21': [
    'st-pete-pier',
    'fergs-sports-bar-grill',
    'burger-monger',
    'trophy-fish',
    'special-pho',
  ],
  'stpete:2026-06-22': [
    'al-lang-stadium',
    'engine-no-9',
    'rum-runners',
    'baba',
    'pee-pas-garage-craft-brewery',
  ],
  'stpete:2026-06-23': [
    'the-james-museum',
    '3-daughters-brewing',
    'sunset-grille',
    'the-toasted-monkey',
    'mr-empanada',
  ],

  // Seattle — Jun 17–23 2026 (Wed→Tue). Short-term, hand-picked exception:
  // every pick is an EASY (owner request), so these intentionally skip the
  // usual easy/easy/medium/medium/hard ramp. An override plays its 5 IDs in
  // order, so the difficulty plan is bypassed by design.
  'seattle:2026-06-17': [
    'pacific-science-center',
    'argosy-cruises',
    'biscuit-bitch',
    'saigon-deli',
    'monsoon',
  ],
  'seattle:2026-06-18': [
    'sky-view-observatory',
    'mikes-chili-parlor',
    'macrina-bakery-belltown',
    'cafe-campagne',
    'caffe-vita',
  ],
  'seattle:2026-06-19': [
    'lumen-field',
    'canlis',
    'top-pot-doughnuts',
    'piroshky-piroshky',
    'rhein-haus-seattle',
  ],
  'seattle:2026-06-20': [
    'cal-anderson-park',
    'wild-ginger-seattle',
    'fremont-brewing-company',
    'saltys',
    'portage-bay-cafe',
  ],
  'seattle:2026-06-21': [
    'kerry-park',
    'the-5-point',
    'daniels-broiler',
    'mopop-museum-of-pop-culture',
    'ivars-fish-bar',
  ],
  'seattle:2026-06-22': [
    'space-needle',
    'dicks-drive-in-broadway',
    'ezells-chicken',
    'lowells',
    'spud-fish-chips',
  ],
  'seattle:2026-06-23': [
    'gas-works-park',
    'pike-place-market',
    'international-fountain',
    'paseo',
    'the-walrus-and-the-carpenter',
  ],

  // St. Pete — Jun 24–Jul 2 2026. All-easy run (owner request); every pick is
  // EASY and distinct from the Jun 14–23 block above. Plays its 5 IDs in order,
  // so the easy/medium/hard ramp is bypassed by design.
  'stpete:2026-06-24': [
    'fort-de-soto-county-park',
    'ted-peters-smoked-fish',
    'florida-holocaust-museum',
    'kahwa-coffee',
    'casita-taqueria',
  ],
  'stpete:2026-06-25': [
    'chihuly-collection',
    'fourth-street-shrimp-store',
    'boyd-hill-nature-preserve',
    'bella-brava',
    'bandit-coffee',
  ],
  'stpete:2026-06-26': [
    'the-palladium-theater',
    'hurricane-seafood-restaurant',
    'demens-landing-park',
    'nueva-cantina',
    'oak-and-stone',
  ],
  'stpete:2026-06-27': [
    'great-explorations-childrens-museum',
    'crabby-bills',
    'crescent-lake-park',
    'stillwaters-tavern',
    'intermezzo-coffee-cocktails',
  ],
  'stpete:2026-06-28': [
    'morean-arts-center',
    'skyway-jacks',
    'north-straub-park',
    'the-canopy',
    'pacific-counter',
  ],
  'stpete:2026-06-29': [
    'imagine-museum',
    'el-cap',
    'hubbards-marina',
    'frescos-waterfront-bistro',
    'maple-street-biscuit-company',
  ],
  'stpete:2026-06-30': [
    'snell-arcade',
    'nitallys',
    'north-shore-volleyball-courts',
    'jimmy-bs-beach-bar',
    'la-v-vietnamese-fusion',
  ],
  'stpete:2026-07-01': [
    'woodson-african-american-museum',
    'caddys-on-the-beach',
    'duncan-mcclellan-gallery',
    'brick-mortar',
    'pipos',
  ],
  'stpete:2026-07-02': [
    'floridian-social-club',
    'paradise-grille-pass-a-grille',
    'kress-building',
    'snappers-sea-grill',
    'mandarin-hide',
  ],

  // Seattle — Jun 24–Jul 2 2026. All-easy run (owner request); every pick is
  // EASY and distinct from the Jun 17–23 block above. Plays its 5 IDs in order.
  'seattle:2026-06-24': [
    't-mobile-park',
    'dicks-drive-in-wallingford',
    'seattle-aquarium',
    'pike-place-chowder',
    'thai-tom',
  ],
  'seattle:2026-06-25': [
    'chihuly-garden-and-glass',
    'sushi-kashiba',
    'green-lake-park',
    'pagliacci-pizza',
    'monorail-espresso',
  ],
  'seattle:2026-06-26': [
    'woodland-park-zoo',
    'the-pink-door',
    'discovery-park',
    'georgetown-brewing-company',
    'pho-bac',
  ],
  'seattle:2026-06-27': [
    'seattle-art-museum',
    'ivars-acres-of-clams',
    'volunteer-park',
    'la-carta-de-oaxaca',
    '13-coins',
  ],
  'seattle:2026-06-28': [
    'smith-tower-observatory',
    'rays-boathouse-and-cafe',
    'olympic-sculpture-park',
    'maneki',
    'el-gaucho',
  ],
  'seattle:2026-06-29': [
    'the-seattle-public-library-central-library',
    'glos',
    'alki-beach-park',
    'merchants-cafe-and-saloon',
    'musang',
  ],
  'seattle:2026-06-30': [
    'museum-of-history-and-industry',
    'underground-tour',
    'shiros-sushi',
    'taylor-shellfish-farms',
    'zig-zag-cafe',
  ],
  'seattle:2026-07-01': [
    'washington-park-arboretum',
    'pioneer-square',
    'the-athenian-seafood-restaurant-and-bar',
    'cafe-flora',
    'metropolitan-grill',
  ],
  'seattle:2026-07-02': [
    'husky-stadium',
    'climate-pledge-arena',
    'matts-in-the-market',
    'emmett-watsons-oyster-bar',
    'the-crumpet-shop',
  ],

  // Ann Arbor — Jun 24–Jul 2 2026. First overrides for this city; all-easy run
  // (owner request). Plays its 5 IDs in order.
  'annarbor:2026-06-24': [
    'the-ark',
    'kelsey-museum-of-archaeology',
    'casa-dominicks',
    'grizzly-peak-brewing-company',
    'cafe-zola',
  ],
  'annarbor:2026-06-25': [
    'palmer-house',
    'ray-fisher-stadium',
    'the-blind-pig-8-ball-saloon',
    'tios-mexican-cafe',
    'seva',
  ],
  'annarbor:2026-06-26': [
    'michigan-stadium',
    'zingermans-deli',
    'nichols-arboretum',
    'krazy-jims-blimpy-burger',
    'roosroast-coffee',
  ],
  'annarbor:2026-06-27': [
    'the-diag',
    'frita-batidos',
    'michigan-theater',
    'jerusalem-garden',
    'totoro-sushi',
  ],
  'annarbor:2026-06-28': [
    'yost-ice-arena',
    'miss-kim',
    'peony-garden',
    'cottage-inn-pizza',
    'the-brown-jug',
  ],
  'annarbor:2026-06-29': [
    'university-of-michigan-museum-of-art',
    'zingermans-roadhouse',
    'argo-nature-area',
    'fleetwood-diner',
    'mani-osteria-and-bar',
  ],
  'annarbor:2026-06-30': [
    'crisler-center',
    'blue-nile-ethiopian',
    'nickels-arcade',
    'ricks-american-cafe',
    'savas',
  ],
  'annarbor:2026-07-01': [
    'ann-arbor-hands-on-museum',
    'detroit-observatory',
    'pizza-house',
    'the-earle',
    'mister-spots',
  ],
  'annarbor:2026-07-02': [
    'michigan-league',
    'university-of-michigan-museum-of-natural-history',
    'jolly-pumpkin',
    'madras-masala',
    'heidelberg-restaurant',
  ],
}
