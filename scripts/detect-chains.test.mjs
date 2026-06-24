import { describe, it, expect } from 'vitest'
import { brandPrefix, countOsmBranches } from './detect-chains.mjs'

describe('brandPrefix', () => {
  it('takes the first two significant tokens', () => {
    expect(brandPrefix('top pot doughnuts')).toBe('top pot')
    expect(brandPrefix('kahwa coffee north')).toBe('kahwa coffee')
  })
  it('drops a leading the/original so variants group together', () => {
    expect(brandPrefix('the waffle shop')).toBe('waffle shop')
    expect(brandPrefix('the original waffle shop west')).toBe('waffle shop')
    expect(brandPrefix('original waffle shop')).toBe('waffle shop')
  })
  it('keeps a one- or two-token name intact', () => {
    expect(brandPrefix('paseo')).toBe('paseo')
    expect(brandPrefix('big star')).toBe('big star')
  })
})

describe('countOsmBranches', () => {
  const pin = (name, lat, lng) => ({ name, lat, lng })

  it('counts two same-name pins far apart as two branches', () => {
    const pois = [
      pin('Top Pot Doughnuts', 47.6246, -122.3255),
      pin('Top Pot Doughnuts', 47.6792, -122.2907),
    ]
    expect(countOsmBranches(pois, []).get('top pot doughnuts').count).toBe(2)
  })

  it('collapses a same-name pin double-tagged at the same place (<80m)', () => {
    const pois = [
      pin("Ivar's Fish Bar", 47.604, -122.3389),
      pin("Ivar's Fish Bar", 47.6041, -122.339), // ~15m away — same place
    ]
    expect(countOsmBranches(pois, []).get('ivars fish bar').count).toBe(1)
  })

  it('normalizes & vs and so spelling variants share a count', () => {
    const pois = [
      pin('Spud Fish and Chips', 47.5795, -122.4088),
      pin('Spud Fish & Chips', 47.6784, -122.3269),
    ]
    expect(countOsmBranches(pois, []).get('spud fish and chips').count).toBe(2)
  })

  it('strips a trailing city token before grouping', () => {
    const pois = [
      pin('Moore Coffee Seattle', 47.61, -122.33),
      pin('Moore Coffee', 47.62, -122.35),
    ]
    expect(countOsmBranches(pois, ['seattle']).get('moore coffee').count).toBe(
      2,
    )
  })
})
