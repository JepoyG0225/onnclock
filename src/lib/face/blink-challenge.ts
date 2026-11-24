/** Guided open/closed/open challenge. A static face cannot complete it. */
export class BlinkChallenge {
  private baseline = 0
  private openingSamples: number[] = []
  private closedAt: number | null = null
  done = false
  reset() { this.baseline = 0; this.openingSamples = []; this.closedAt = null; this.done = false }
  observe(openness: number, capturedAt: number): 'open' | 'close' | 'reopen' | 'done' {
    if (this.done) return 'done'
    if (!Number.isFinite(openness) || openness <= 0) return 'open'
    if (this.openingSamples.length < 3) {
      this.openingSamples.push(openness)
      if (this.openingSamples.length < 3) return 'open'
      // A noisy landmark frame must not set an unreachable reopening target.
      this.baseline = [...this.openingSamples].sort((a, b) => a - b)[1]
      if (this.baseline < 0.12) { this.reset(); return 'open' }
      return 'close'
    }
    if (this.closedAt !== null) {
      // Guided eye closure can span several slow inference frames on Android.
      if (capturedAt - this.closedAt > 5000) { this.reset(); return 'open' }
      if (openness >= this.baseline * 0.85) { this.done = true; return 'done' }
      return 'reopen'
    }
    if (openness < this.baseline * 0.68) { this.closedAt = capturedAt; return 'reopen' }
    return 'close'
  }
}
