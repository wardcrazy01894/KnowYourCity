import { describe, it, expect } from 'vitest'
import { scoreTier } from './sound'

describe('scoreTier', () => {
  it('100 is a perfect', () => {
    expect(scoreTier(100)).toBe('perfect')
  })

  it('green range (80-99) is good', () => {
    expect(scoreTier(99)).toBe('good')
    expect(scoreTier(80)).toBe('good')
  })

  it('yellow range (50-79) is mid', () => {
    expect(scoreTier(79)).toBe('mid')
    expect(scoreTier(50)).toBe('mid')
  })

  it('below 50 is womp', () => {
    expect(scoreTier(49)).toBe('womp')
    expect(scoreTier(0)).toBe('womp')
  })
})
