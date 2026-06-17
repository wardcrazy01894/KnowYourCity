/**
 * Hand-curated daily overrides — keyed by selectionSeed ("cityId:YYYY-MM-DD").
 * When a key matches, selectDailyLocations returns these IDs in round order
 * (easy, easy, medium, medium, hard) instead of the PRNG selection.
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
}
