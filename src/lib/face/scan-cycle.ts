/** A shared terminal must see an empty camera, not merely a second face. */
export class FaceScanRearm {
  private completedAt: number | null = null
  private emptySince: number | null = null
  finish(now: number) { this.completedAt = now; this.emptySince = null }
  observe(faceCount: number, now: number): boolean {
    if (this.completedAt === null) return false
    if (faceCount !== 0) { this.emptySince = null; return false }
    this.emptySince ??= now
    if (now - this.completedAt < 6000 || now - this.emptySince < 2000) return false
    this.completedAt = null; this.emptySince = null
    return true
  }
}
