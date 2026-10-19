/** Paper-trading fill math (pure, no I/O). Fill prices come from the
 * server re-read (Yahoo / stock_boards) — never from the client. */

export const START_CASH = 100000;

export const EOD_STALE_MS = 36 * 3600 * 1000;

/** True when an EOD `fetched_at` is too old (or unparseable) to fill against. */
export function isStaleEod(
  fetchedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > EOD_STALE_MS;
}

export interface Position {
  qty: number;
  avg: number;
}

export function applyBuy(
  pos: Position | null,
  qty: number,
  price: number,
): { qty: number; avg: number; cost: number } {
  const q = pos?.qty ?? 0;
  const a = pos?.avg ?? 0;
  const cost = qty * price;
  const nq = q + qty;
  return { qty: nq, avg: nq === 0 ? 0 : (q * a + cost) / nq, cost };
}

export function applySell(
  pos: Position,
  qty: number,
): { qty: number; avg: number } | { error: "invalid_qty" | "insufficient_shares" } {
  if (!Number.isFinite(qty) || qty <= 0) return { error: "invalid_qty" };
  if (qty > pos.qty) return { error: "insufficient_shares" };
  return { qty: pos.qty - qty, avg: pos.avg };
}
