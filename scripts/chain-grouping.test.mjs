import { describe, it, expect } from 'vitest'
import {
  brandGroups,
  canonicalBase,
  isMultiLocation,
  distinctiveTokens,
  nameMatches,
} from './chain-grouping.mjs'

const row = (id, name, category, lat = 47.6, lng = -122.3) => ({
  id,
  name,
  category,
  lat,
  lng,
})

describe('brandGroups', () => {
  it('merges a prefix sibling into the same brand', () => {
    const rows = [
      row('serious-pie', 'Serious Pie', 'restaurant'),
      row('serious-pie-ballard', 'Serious Pie Ballard', 'restaurant'),
    ]
    expect(brandGroups(rows, [], 'seattle')).toHaveLength(1)
  })

  it('does NOT merge two businesses sharing only a street/word prefix', () => {
    // neither normalized name is a token-prefix of the other
    const rows = [
      row('allen-street-grill', 'Allen Street Grill', 'restaurant'),
      row('allen-street-pizza', 'Allen Street Pizza', 'restaurant'),
    ]
    expect(brandGroups(rows, [], 'statecollege')).toHaveLength(2)
  })
})

describe('isMultiLocation — guards prefix collisions', () => {
  const osm = new Map() // empty: no OSM branches

  it('rejects "LTD" + "LTD Edition Sushi" (prefix collision, different category)', () => {
    const members = [
      row('ltd', 'LTD', 'bar', 47.652, -122.34),
      row(
        'ltd-edition-sushi',
        'LTD Edition Sushi',
        'restaurant',
        47.616,
        -122.35,
      ),
    ]
    // grouped by prefix, but NOT a real chain
    expect(brandGroups(members, [], 'seattle')).toHaveLength(1)
    expect(isMultiLocation(members, 'ltd', osm, 'seattle')).toBe(false)
  })

  it('rejects "The George" + "The George & Dragon Pub" (different category)', () => {
    const members = [
      row('the-george', 'The George', 'restaurant', 47.608, -122.32),
      row(
        'the-george-dragon-pub',
        'The George & Dragon Pub',
        'bar',
        47.653,
        -122.35,
      ),
    ]
    expect(isMultiLocation(members, 'the george', osm, 'seattle')).toBe(false)
  })

  it('accepts two same-category branches >300m apart', () => {
    const members = [
      row('a', 'Spud Fish & Chips - Alki', 'restaurant', 47.5795, -122.4088),
      row(
        'b',
        'Spud Fish & Chips - Green Lake',
        'restaurant',
        47.6784,
        -122.3269,
      ),
    ]
    expect(
      isMultiLocation(members, 'spud fish and chips', osm, 'seattle'),
    ).toBe(true)
  })

  it('rejects two same-category branches that are co-located (<300m)', () => {
    const members = [
      row('a', 'Cassis', 'restaurant', 47.61, -122.34),
      row('b', 'Cassis American Brasserie', 'restaurant', 47.6101, -122.3401),
    ]
    expect(isMultiLocation(members, 'cassis', new Map(), 'seattle')).toBe(false)
  })

  it('accepts a single dataset entry whose name has 2+ OSM branches', () => {
    const members = [row('top-pot', 'Top Pot Doughnuts', 'cafe')]
    const osm2 = new Map([['top pot doughnuts', { count: 8 }]])
    expect(isMultiLocation(members, 'top pot doughnuts', osm2, 'seattle')).toBe(
      true,
    )
  })
})

describe('distinctiveTokens / nameMatches', () => {
  it('falls back to the full token set when a name is all-generic', () => {
    expect(distinctiveTokens('Pizza House', [])).toEqual(['pizza', 'house'])
    expect(distinctiveTokens('Top Pot Doughnuts', [])).toEqual(['top', 'pot'])
  })

  it('an all-generic brand still requires its full name, never matching everything', () => {
    expect(nameMatches('Pizza House Ann Arbor', 'Pizza House', [])).toBe(true)
    expect(nameMatches('Red Mesa', 'Pizza House', [])).toBe(false)
  })

  it('rejects a co-located different concept of the same brand', () => {
    // Ivar's Fish Bar pin should NOT match Ivar's Salmon House
    expect(nameMatches("Ivar's Salmon House", "Ivar's Fish Bar", [])).toBe(
      false,
    )
    expect(nameMatches("Ivar's Pier 54 Fish Bar", "Ivar's Fish Bar", [])).toBe(
      true,
    )
  })

  it('rejects a replaced business at a stale OSM pin', () => {
    expect(nameMatches('Red Mesa', 'Mr. Empanada', [])).toBe(false)
    expect(
      nameMatches('Mr Empanada - St. Petersburg', 'Mr. Empanada', []),
    ).toBe(true)
  })
})

describe('canonicalBase', () => {
  it('picks the fewest-token base', () => {
    const members = [
      { name: 'Kahwa Coffee - Downtown' },
      { name: 'Kahwa Coffee North' },
    ]
    expect(canonicalBase(members)).toBe('Kahwa Coffee')
  })
})
