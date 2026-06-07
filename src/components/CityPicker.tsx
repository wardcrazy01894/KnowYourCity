/**
 * CityPicker — the landing screen. Pick which city to play; the choice is saved
 * (localStorage + ?city= in the URL) so you go straight into it next time.
 */

import { CITIES } from '../lib/cities'

export function CityPicker({ onPick }: { onPick: (id: string) => void }) {
  return (
    <main
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 32, margin: '0 0 4px' }}>🗺️ Know Your Locals</h1>
      <p style={{ opacity: 0.75, marginTop: 0 }}>
        A daily map-guessing game for local spots. Pick your city:
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          width: '100%',
          maxWidth: 560,
          marginTop: 16,
        }}
      >
        {CITIES.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            style={{
              padding: '18px 14px',
              borderRadius: 12,
              border: '1px solid #2a3543',
              background: '#172230',
              color: 'var(--fg)',
              cursor: 'pointer',
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            {c.short}
            <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.6 }}>
              {c.name}
            </div>
          </button>
        ))}
      </div>
    </main>
  )
}
