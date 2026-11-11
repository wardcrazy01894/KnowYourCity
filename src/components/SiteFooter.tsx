/**
 * The page footer: the dataset's attribution (with a fallback while it loads
 * or when the file carries none) and, as the last line, the studio credit.
 */
export function SiteFooter({ attribution }: { attribution: string }) {
  return (
    <footer
      style={{
        padding: '10px 16px 20px',
        fontSize: 11,
        opacity: 0.55,
        textAlign: 'center',
        lineHeight: 1.7,
      }}
    >
      <div>
        {attribution ||
          'Locations © OpenStreetMap contributors (ODbL). Imagery © Esri / Maxar.'}{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'inherit' }}
        >
          OSM
        </a>
      </div>
      <div>A Spicy Al Software Solution</div>
    </footer>
  )
}
