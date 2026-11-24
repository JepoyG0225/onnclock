/** Percentage coordinates keep resizing independent of preview zoom. */
export function resizeCertificateField(x: number, width: number, edge: 'left' | 'right', delta: number) {
  const right = Math.min(100, x + width)
  if (edge === 'left') {
    const left = Math.max(0, Math.min(right - 1, x + delta))
    return { x: left, width: right - left }
  }
  return { x, width: Math.max(1, Math.min(100 - x, width + delta)) }
}
