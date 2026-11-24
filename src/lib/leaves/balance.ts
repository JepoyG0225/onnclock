type Numeric = number | string | { toString(): string }
export function availableLeave(balance: { entitled: Numeric; carriedOver: Numeric; used: Numeric; pending: Numeric; encashed: Numeric }) {
  return Math.max(0, Number(balance.entitled) + Number(balance.carriedOver) - Number(balance.used) - Number(balance.pending) - Number(balance.encashed))
}
