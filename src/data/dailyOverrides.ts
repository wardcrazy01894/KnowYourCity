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
  // St. Pete — Jun 13–22 2026 (hand-curated for variety & spreadability)
  'stpete:2026-06-13': [
    'the-dali-museum',
    'bodega',
    'lake-maggiore',
    'angelos-grill-bar',
    'rec-dec',
  ],
  'stpete:2026-06-14': [
    'tropicana-field',
    'green-bench-brewing-co',
    'north-shore-kickball-fields',
    'elliott-aster',
    'buttermilk-eatery',
  ],
  'stpete:2026-06-15': [
    'museum-of-fine-arts',
    'the-chattaway',
    'twin-brooks-golf-course',
    'fresh-kitchen',
    'mcauleys-pub',
  ],
  'stpete:2026-06-16': [
    'the-don-cesar',
    'parkshore-grill',
    'lake-vista-park',
    'hi-5',
    'sams-sushi',
  ],
  'stpete:2026-06-17': [
    'jannus-live',
    'cassis-american-brasserie',
    'paradeco-coffee-roasters',
    'the-floridian',
    'enigma',
  ],
  'stpete:2026-06-18': [
    'sunken-gardens',
    'ceviche-tapas-bar',
    'bartlett-park',
    'draculas-legacy-wine-bar',
    'dickeys-barbecue-pit',
  ],
  'stpete:2026-06-19': [
    'vinoy-park',
    'hawkers-asian-street-food',
    'wheres-jubes',
    'allelo',
    'the-garage-on-central',
  ],
  'stpete:2026-06-20': [
    'st-pete-pier',
    'fergs-sports-bar-grill',
    'burger-monger',
    'trophy-fish',
    'special-pho',
  ],
  'stpete:2026-06-21': [
    'al-lang-stadium',
    'engine-no-9',
    'rum-runners',
    'baba',
    'pee-pas-garage-craft-brewery',
  ],
  'stpete:2026-06-22': [
    'the-james-museum',
    '3-daughters-brewing',
    'sunset-grille',
    'the-toasted-monkey',
    'mr-empanada',
  ],
}
