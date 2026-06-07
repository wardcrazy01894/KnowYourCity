import { describe, it, expect } from 'vitest'
import { buildShareString, scoreEmoji } from './Results'
import type { RoundResult, Location } from '../types'

function result(score: number, name: string): RoundResult {
  const location: Location = {
    id: name.toLowerCase(),
    name,
    lat: 27.77,
    lng: -82.63,
    category: 'attraction',
    source: 'manual',
    attribution: 't',
  }
  return { location, guess: { lat: 0, lng: 0 }, distanceMeters: 0, score }
}

describe('scoreEmoji', () => {
  it('maps scores to tiers', () => {
    expect(scoreEmoji(5000)).toBe('🟩')
    expect(scoreEmoji(4000)).toBe('🟩')
    expect(scoreEmoji(3999)).toBe('🟨')
    expect(scoreEmoji(2000)).toBe('🟨')
    expect(scoreEmoji(1999)).toBe('🟧')
    expect(scoreEmoji(500)).toBe('🟧')
    expect(scoreEmoji(499)).toBe('⬛')
    expect(scoreEmoji(0)).toBe('⬛')
  })
})

describe('buildShareString', () => {
  const results = [
    result(5000, 'A'),
    result(4200, 'B'),
    result(2500, 'C'),
    result(800, 'D'),
    result(100, 'E'),
  ]

  it('has the title, scored line, and an emoji bar', () => {
    const s = buildShareString('2026-06-06', results, 12600)
    const lines = s.split('\n')
    expect(lines[0]).toBe('Know Your Locals — St. Pete')
    expect(lines[1]).toBe('2026-06-06 · 12,600/25,000')
    expect(lines[2]).toBe('🟩🟩🟨🟧⬛')
  })

  it('has one emoji per round', () => {
    const s = buildShareString('2026-06-06', results, 12600)
    expect([...s.split('\n')[2]].length).toBe(results.length)
  })
})
