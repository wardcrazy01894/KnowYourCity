// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SiteFooter } from './SiteFooter'

/**
 * Structural test for the page footer: the dataset attribution (or its
 * fallback) with the OSM copyright link, and the studio credit as the LAST
 * line of the footer.
 */

afterEach(cleanup)

describe('SiteFooter', () => {
  it("renders the dataset's attribution and the OSM copyright link", () => {
    render(<SiteFooter attribution="Locations © test" />)
    expect(screen.getByText(/Locations © test/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'OSM' }).getAttribute('href')).toBe(
      'https://www.openstreetmap.org/copyright',
    )
  })

  it('falls back to the default attribution when the dataset has none', () => {
    render(<SiteFooter attribution="" />)
    expect(
      screen.getByText(/Locations © OpenStreetMap contributors \(ODbL\)/),
    ).toBeTruthy()
  })

  it('ends with the studio credit line', () => {
    render(<SiteFooter attribution="Locations © test" />)
    const credit = screen.getByText('A Spicy Al Software Solution')
    expect(credit.closest('footer')?.lastElementChild).toBe(credit)
  })
})
