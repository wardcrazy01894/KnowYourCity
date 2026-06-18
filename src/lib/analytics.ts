/**
 * Cloudflare Web Analytics (free, cookieless page-view tracking).
 *
 * The beacon is a single external script tagged with a PUBLIC site token
 * (set `VITE_CF_BEACON_TOKEN`; see .env.example). No token → no script, so
 * local dev and forks stay untracked. The dashboard lives under
 * Cloudflare → Web Analytics.
 */

interface BeaconAttrs {
  src: string
  'data-cf-beacon': string
}

/** Script-tag attributes for the beacon, or null when no token is set. */
export function cfBeaconAttrs(token: string | undefined): BeaconAttrs | null {
  const t = token?.trim()
  if (!t) return null
  return {
    src: 'https://static.cloudflareinsights.com/beacon.min.js',
    // JSON.stringify so quotes/backslashes in a malformed token can't break
    // out of the attribute value.
    'data-cf-beacon': JSON.stringify({ token: t }),
  }
}

/** Thin DOM shell (verified manually): appends the beacon script tag. */
export function installAnalytics(token: string | undefined): void {
  const attrs = cfBeaconAttrs(token)
  if (!attrs) return
  const script = document.createElement('script')
  script.defer = true
  script.src = attrs.src
  script.setAttribute('data-cf-beacon', attrs['data-cf-beacon'])
  document.head.appendChild(script)
}
