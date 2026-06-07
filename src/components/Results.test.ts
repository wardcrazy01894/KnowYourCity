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
  it('maps scores to tiers (0-100 scale)', () => {
    expect(scoreEmoji(100)).toBe('🟩')
    expect(scoreEmoji(80)).toBe('🟩')
    expect(scoreEmoji(79)).toBe('🟨')
    expect(scoreEmoji(50)).toBe('🟨')
    expect(scoreEmoji(49)).toBe('🟧')
    expect(scoreEmoji(20)).toBe('🟧')
    expect(scoreEmoji(19)).toBe('⬛')
    expect(scoreEmoji(0)).toBe('⬛')
  })
})

describe('buildShareString', () => {
  const results = [
    result(100, 'A'),
    result(85, 'B'),
    result(60, 'C'),
    result(30, 'D'),
    result(10, 'E'),
  ]

  it('has the title (with city), scored line, and an emoji bar', () => {
    const s = buildShareString('Seattle', '2026-06-06', results, 285)
    const lines = s.split('\n')
    expect(lines[0]).toBe('Know Your Locals — Seattle')
    expect(lines[1]).toBe('2026-06-06 · 285/500')
    expect(lines[2]).toBe('🟩🟩🟨🟧⬛')
  })

  it('has one emoji per round', () => {
    const s = buildShareString('St. Pete', '2026-06-06', results, 285)
    expect([...s.split('\n')[2]].length).toBe(results.length)
  })
})
