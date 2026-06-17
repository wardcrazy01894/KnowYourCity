/**
 * Score feedback sounds, synthesized with the Web Audio API (no audio files, so
 * nothing to license or bundle). Played when a round is revealed:
 *   perfect (100)      → bright triumphant arpeggio
 *   good    (green 80+)→ pleasant rising chime
 *   mid     (yellow 50+)→ single neutral note
 *   womp    (< 50)     → descending "womp-womp"
 *
 * `scoreTier` is pure (unit-tested). Playback is a no-op without a browser
 * AudioContext (e.g. in tests) and respects the user's mute setting.
 */

import { log } from './log'

export type ScoreTier = 'perfect' | 'good' | 'mid' | 'womp'

/** Map a 0–100 round score to a feedback tier (mirrors the share emoji tiers). */
export function scoreTier(score: number): ScoreTier {
  if (score >= 100) return 'perfect'
  if (score >= 80) return 'good'
  if (score >= 50) return 'mid'
  return 'womp'
}

const MUTE_KEY = 'kyc:muted'

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* ignore */
  }
}

type AudioCtor = typeof AudioContext
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  // Browsers start the context suspended until a user gesture; a guess submit
  // (a click) is one, so resume() here is allowed.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Play one note. */
function note(
  ac: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  // Quick attack, smooth decay — avoids clicks.
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Play the feedback sound for a round score (no-op if muted/unsupported). */
export function playScoreSound(score: number): void {
  if (isMuted()) return
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  const tier = scoreTier(score)
  try {
    switch (tier) {
      case 'perfect': {
        // C5 E5 G5 C6 ascending — bright.
        ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          note(ac, f, t + i * 0.09, 0.18, 'triangle', 0.25),
        )
        break
      }
      case 'good': {
        // G4 → C5 quick up-chime.
        note(ac, 392.0, t, 0.12, 'triangle', 0.22)
        note(ac, 523.25, t + 0.1, 0.16, 'triangle', 0.22)
        break
      }
      case 'mid': {
        // Single neutral A4.
        note(ac, 440.0, t, 0.18, 'sine', 0.2)
        break
      }
      case 'womp': {
        // Descending low "womp-womp".
        note(ac, 196.0, t, 0.18, 'sawtooth', 0.18)
        note(ac, 146.83, t + 0.16, 0.28, 'sawtooth', 0.18)
        break
      }
    }
  } catch (e) {
    log.warn('sound', 'playback failed', { error: String(e) })
  }
}

/**
 * Crowd applause for a strong finish — a swell of filtered noise "claps" plus a
 * short triumphant fanfare on top. Synthesized (no audio file to license/bundle),
 * a no-op if muted or without an AudioContext (tests). Played once on the results
 * screen when the day earns it (see lib/celebrate.ts).
 */
export function playApplause(): void {
  if (isMuted()) return
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  try {
    // --- Crowd: a ~2.2s bed of band-passed white noise that swells then fades,
    // so it reads as a room of people clapping rather than static. White noise is
    // broadband, so the bandpass actually has signal to shape (a hand-rolled
    // tonal oscillator would sit outside the passband and be inaudible). ---
    const dur = 2.2
    const frames = Math.floor(ac.sampleRate * dur)
    const buffer = ac.createBuffer(1, frames, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1
    }
    const src = ac.createBufferSource()
    src.buffer = buffer

    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = 1500 // claps cluster in the low-mids
    band.Q.value = 0.6

    const crowd = ac.createGain()
    crowd.gain.setValueAtTime(0.0001, t)
    crowd.gain.exponentialRampToValueAtTime(0.18, t + 0.25) // quick swell in
    crowd.gain.setValueAtTime(0.18, t + 1.2)
    crowd.gain.exponentialRampToValueAtTime(0.0001, t + dur) // fade out

    src.connect(band).connect(crowd).connect(ac.destination)
    src.start(t)
    src.stop(t + dur)

    // --- Fanfare: a bright C-major arpeggio over the cheer for a "you nailed it"
    // accent (reuses the same note() voice as the per-round sounds). ---
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      note(ac, f, t + 0.08 + i * 0.12, 0.3, 'triangle', 0.22),
    )
  } catch (e) {
    log.warn('sound', 'applause playback failed', { error: String(e) })
  }
}
