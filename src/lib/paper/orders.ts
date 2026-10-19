/** Paper-order input validation (pure). v1 is market-only: side, whole
 * shares, and an idempotency key with enough entropy to dedupe retries. */

export type OrderSide = "BUY" | "SELL";

export interface OrderInput {
  ticker: string;
  side: OrderSide;
  qty: number;
  idempotencyKey: string;
}

export type OrderInputError =
  | "invalid_ticker"
  | "invalid_side"
  | "invalid_qty"
  | "invalid_idempotency_key";

export function parseOrderInput(body: unknown): OrderInput | { error: OrderInputError } {
  const b = (body ?? {}) as Record<string, unknown>;
  const ticker = typeof b.ticker === "string" ? b.ticker.trim().toUpperCase() : "";
  if (!ticker || ticker.length > 20) return { error: "invalid_ticker" };
  if (b.side !== "BUY" && b.side !== "SELL") return { error: "invalid_side" };
  const qty = b.qty;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0 || qty > 1_000_000) {
    return { error: "invalid_qty" };
  }
  const key = typeof b.idempotencyKey === "string" ? b.idempotencyKey : "";
  if (key.length < 8 || key.length > 100) return { error: "invalid_idempotency_key" };
  return { ticker, side: b.side, qty, idempotencyKey: key };
}
